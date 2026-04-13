import { computed, ref, shallowRef } from 'vue';

const BASE_URL =
  (import.meta.env?.VITE_ORCHESTRATION_API_URL as string | undefined) ??
  'https://orchestration.civitai.com';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'expired', 'canceled']);
const POLL_INTERVALS = [5_000, 10_000, 20_000, 30_000, 30_000, 60_000];

/** Per-recipe endpoints (`/v2/consumer/recipes/{name}`). */
export function isRecipePath(path: string): boolean {
  return /^\/v2\/consumer\/recipes\//.test(path);
}

export type WorkflowStatus =
  | 'unassigned'
  | 'preparing'
  | 'scheduled'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'canceled';

export interface WorkflowStep {
  name: string;
  status: WorkflowStatus;
  estimatedProgressRate?: number | null;
  output?: any;
  jobs?: Array<{ status: WorkflowStatus; reason?: string | null; blockedReason?: string | null }>;
  $type?: string;
}

export interface Workflow {
  id: string;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  cost?: any;
  transactions?: any;
  [key: string]: any;
}

export interface SubmitOptions {
  method?: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE';
  path?: string;
  wait?: number;
}

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  errors?: Record<string, string[]>;
  [key: string]: any;
}

export interface RunError {
  status: number;
  problem?: ProblemDetails;
  message: string;
}

const isWorkflow = (v: any): v is Workflow =>
  v && typeof v === 'object' && typeof v.id === 'string' && Array.isArray(v.steps);

interface CallResult {
  body: any;
  response: Response;
}

/** Parse X-Civitai-Cost-By-Currency: "yellow=12000;blue=345" */
function parseByCurrency(header: string | null): Array<{ accountType: string; amount: number; type: string }> {
  if (!header) return [];
  const out: Array<{ accountType: string; amount: number; type: string }> = [];
  for (const part of header.split(';')) {
    const [k, v] = part.split('=');
    if (!k || !v) continue;
    const amount = Number(v);
    if (Number.isFinite(amount)) {
      out.push({ accountType: k.trim(), amount, type: 'charge' });
    }
  }
  return out;
}

/** Build a synthetic "preview" workflow from response headers, for the UI cost panel. */
function previewFromHeaders(response: Response): Workflow {
  const total = Number(response.headers.get('X-Civitai-Cost-Total')) || 0;
  return {
    id: 'preview',
    status: 'unassigned',
    steps: [],
    cost: { total },
    transactions: {
      list: parseByCurrency(response.headers.get('X-Civitai-Cost-By-Currency')),
      insufficientBuzz: response.headers.get('X-Civitai-Insufficient-Buzz') === 'true',
    },
  };
}

export function useWorkflow() {
  const previewLoading = ref(false);
  const submitLoading = ref(false);
  const polling = ref(false);
  const error = shallowRef<RunError | null>(null);
  const preview = shallowRef<Workflow | null>(null);
  const workflow = shallowRef<Workflow | null>(null);

  let pollAbort = false;

  const aggregateStatus = computed<WorkflowStatus | null>(() => workflow.value?.status ?? null);
  const aggregateProgress = computed(() => {
    const steps = workflow.value?.steps;
    if (!steps?.length) return 0;
    const sum = steps.reduce((acc, s) => acc + (s.estimatedProgressRate ?? 0), 0);
    return Math.min(1, Math.max(0, sum / steps.length));
  });
  const isTerminal = computed(() => {
    const s = aggregateStatus.value;
    return s ? TERMINAL_STATUSES.has(s) : false;
  });

  function reset() {
    pollAbort = true;
    error.value = null;
    preview.value = null;
    workflow.value = null;
    polling.value = false;
    submitLoading.value = false;
    previewLoading.value = false;
  }

  async function callRaw(token: string, init: {
    method: string;
    path: string;
    query?: Record<string, string | number | boolean>;
    body?: any;
  }): Promise<CallResult> {
    const url = new URL(init.path, BASE_URL);
    for (const [k, v] of Object.entries(init.query ?? {})) {
      url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), {
      method: init.method,
      headers: {
        'Authorization': `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    const text = await res.text();
    let parsed: any = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }

    if (!res.ok) {
      const problem = (parsed && typeof parsed === 'object') ? parsed as ProblemDetails : undefined;
      const message = problem?.title || problem?.detail || `${res.status} ${res.statusText}`;
      const e: RunError = { status: res.status, problem, message };
      throw e;
    }
    return { body: parsed, response: res };
  }

  async function previewCost(token: string, body: any, opts: SubmitOptions = {}) {
    reset();
    if (!token) {
      error.value = { status: 0, message: 'No token set. Open the navbar token widget to add one.' };
      return;
    }
    const path = opts.path ?? '/v2/consumer/workflows';
    previewLoading.value = true;
    try {
      const { response } = await callRaw(token, {
        method: opts.method ?? 'POST',
        path,
        query: { whatif: 'true' },
        body,
      });
      preview.value = previewFromHeaders(response);
    } catch (e: any) {
      error.value = e;
    } finally {
      previewLoading.value = false;
    }
  }

  async function submit(token: string, body: any, opts: SubmitOptions = {}) {
    if (!token) {
      error.value = { status: 0, message: 'No token set.' };
      return;
    }
    pollAbort = false;
    error.value = null;
    workflow.value = null;
    submitLoading.value = true;

    const path = opts.path ?? '/v2/consumer/workflows';
    const recipe = isRecipePath(path);

    try {
      // Per-recipe endpoints don't accept `wait`; the base controller holds the
      // request until the workflow is terminal. The generic /v2/consumer/workflows
      // endpoint accepts `wait` and `whatif=false`.
      const query = recipe
        ? undefined
        : { whatif: 'false', wait: String(opts.wait ?? 90) };

      const { body: resultBody } = await callRaw(token, {
        method: opts.method ?? 'POST',
        path,
        query,
        body,
      });

      if (recipe) {
        // Recipe response body is the step's TOutput — no workflow wrapper. We
        // don't have a workflow id / status to poll; just display the output.
        workflow.value = {
          id: 'recipe',
          status: 'succeeded',
          steps: [{ name: '0', status: 'succeeded', output: resultBody } as WorkflowStep],
        };
        return;
      }

      if (!isWorkflow(resultBody)) {
        error.value = { status: 0, message: 'Unexpected response shape (no workflow returned).' };
        return;
      }
      workflow.value = resultBody;
    } catch (e: any) {
      error.value = e;
      return;
    } finally {
      submitLoading.value = false;
    }

    if (!isTerminal.value) {
      await pollUntilTerminal(token);
    }
  }

  async function pollUntilTerminal(token: string) {
    const wf = workflow.value;
    if (!wf) return;
    polling.value = true;
    let attempt = 0;
    try {
      while (!pollAbort && !TERMINAL_STATUSES.has(workflow.value!.status)) {
        const delay = POLL_INTERVALS[Math.min(attempt, POLL_INTERVALS.length - 1)];
        await sleep(delay);
        if (pollAbort) break;
        try {
          const { body: updated } = await callRaw(token, {
            method: 'GET',
            path: `/v2/consumer/workflows/${encodeURIComponent(wf.id)}`,
          });
          if (isWorkflow(updated)) workflow.value = updated;
        } catch (e: any) {
          if (e.status === 401 || e.status === 403 || e.status === 404) {
            error.value = e;
            break;
          }
        }
        attempt++;
      }
    } finally {
      polling.value = false;
    }
  }

  function cancelPoll() {
    pollAbort = true;
    polling.value = false;
  }

  return {
    preview,
    workflow,
    error,
    previewLoading,
    submitLoading,
    polling,
    aggregateStatus,
    aggregateProgress,
    isTerminal,
    previewCost,
    submit,
    cancelPoll,
    reset,
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
