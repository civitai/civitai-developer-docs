---
title: Tools
---

# Tools

The MCP server advertises live schemas via `tools/list` on connect, so your client always sees authoritative parameter shapes. The tables below summarize what's exposed so you know what to reach for. Every tool returns both human-readable text and a structured JSON payload (`structuredContent`); errors come back normalized as `{ ok: false, error, details? }` rather than thrown.

The server exposes **tools only** — no MCP prompts or resources.

## Auth, scopes, and flags

- **Browse tools are anonymous.** Everything else acts *as the user that owns the API key*.
- Write tools require an **onboarded, non-muted** account. New accounts call `complete_onboarding_step` (TOS, RedTOS, Profile, BrowsingLevels, Buzz) first, or guarded writes are rejected. Use `whoami` to check onboarding state.
- Some tool families are gated behind **API scopes** (`MediaWrite` for posts, `BountiesWrite` for bounties) and **feature flags** (`collections`, `bounties`, `changelogEdit`). If a tool returns a permission error, the account lacks the scope or flag.
- **Moderation tools** require a moderator account.

## Browse

*No authentication required.*

| Tool | Purpose |
|---|---|
| `search_models` | Search models (checkpoints, LoRAs, embeddings) by `query`, `type`, `baseModel`, `tag`, `creator`, generation capability. Returns [AIR](/site/guide/air) URNs and a `nextCursor`. |
| `get_model` | Batch-fetch full model details by ID (up to 20, concurrency 3): versions, files, trigger words, AIR URNs. |
| `get_model_version` | Batch-fetch version details (concurrency 3): files, hashes, trigger words, AIR URN. |
| `search_images` | Search images with full generation metadata (prompt, negative, sampler, steps, CFG, seed, resources). Filter by `query`, `model`, `version`, `baseModel`, `creator`, `type`. |
| `get_image` | Batch-fetch image details with generation metadata. |
| `search_creators` | Search users / creators by name. |
| `list_enums` | Valid filter enum values: model types, sorts, base models, timeframes. |

These mirror the [Site API reference](/site/reference/) — see [Models](/site/reference/models), [Model Versions](/site/reference/model-versions), [Images](/site/reference/images), and [Creators](/site/reference/creators).

## Posts

| Tool | Purpose |
|---|---|
| `create_post` | Create and (optionally) publish an image post in one **atomic** call. Images by UUID or URL — URLs are auto-uploaded, attachment order preserved, cleanup on failure. Needs `MediaWrite`. |
| `get_post` | Fetch a post by ID. |
| `publish_post` | Publish a draft (sets `publishedAt` to now). Idempotent. |
| `delete_post` | Delete a post you own (or any, as moderator). |

## Articles

| Tool | Purpose |
|---|---|
| `upsert_article` | Create (omit `id`) or update an article. Markdown body → sanitized HTML server-side; cover by `coverImageUuid` or `coverImageUrl`. |
| `publish_article` | Publish a draft. Rebuilds the payload from current state to avoid regression; handles unpublished-for-violation. Idempotent. |
| `unpublish_article` | Unpublish a published article. |
| `get_article` | Fetch an article by ID. |

## Comments

| Tool | Purpose |
|---|---|
| `list_comments` | List comments on an entity with pagination and configurable reply depth. Aggregates reactions, shows pin/hidden flags. Capped at **500 total** per call (truncates on ceiling). |
| `get_comment` | A single comment with full, uncapped body. |
| `post_comment` | Post a comment or reply (`parentCommentId`). Markdown. |
| `edit_comment` | Edit a comment you own. |
| `delete_comment` | Delete a comment you own (or any, as moderator). |
| `react_to_comment` | Toggle a reaction on a comment. |
| `pin_comment` | Toggle pin state. Moderator-gated upstream. |
| `lock_thread` | Toggle an entity's comment thread lock. Moderator-gated upstream. |

Supported comment entity types include `article`, `image`, `post`, `model`, `review`, `question`, `answer`, `comment`, `bounty`, `bountyEntry`, `clubPost`, `challenge`, `comicChapter`.

## Engagement

| Tool | Purpose |
|---|---|
| `react` | Toggle a reaction (`Like`, `Dislike`, `Laugh`, `Cry`, `Heart`) on an entity. Fire-and-forget — re-read the entity to confirm. |
| `upsert_resource_review` | Create / update a model-version review: rating 1–5, `recommend` flag, Markdown details. |
| `get_my_resource_review` | Fetch your existing review for a version (or null). |
| `toggle_follow_user` | Follow / unfollow a user by ID or username. |
| `toggle_favorite_model` | Bookmark a model with an explicit `setTo` flag. Distinct from notifications. |
| `notify_model` | Toggle new-version notifications for a model. Distinct from bookmarking. |
| `toggle_bookmark_article` | Bookmark / un-bookmark an article. |
| `complete_onboarding_step` | Complete an onboarding step (`TOS`, `RedTOS`, `Profile`, `BrowsingLevels`, `Buzz`). Prerequisite for guarded writes. |

## Collections

*Flag-gated: `collections`.*

| Tool | Purpose |
|---|---|
| `upsert_collection` | Create / update a collection (name, description, type, nsfw, read/write config). |
| `add_to_collection` | Save one item (`articleId` / `imageId` / `postId` / `modelId`) into one or more collections, with an optional note. |
| `follow_collection` | Follow / unfollow a collection. |

## Notifications

| Tool | Purpose |
|---|---|
| `list_notifications` | List notifications with unread / category filters and cursor pagination (ISO timestamp). |
| `mark_notifications_read` | Mark one (by `id`), `all`, or a whole category read. |
| `check_notifications` | Quick unread count. |

## Messaging & chat

| Tool | Purpose |
|---|---|
| `send_direct_message` | Send a new DM to a user by ID or username (looks up user → creates chat → sends). Markdown, sanitized. |
| `list_chats` | List conversation threads with participants. |
| `get_chat_messages` | Read messages in an existing chat, paginated newest-first; `nextCursor` for more. |
| `reply_to_chat` | Send into an existing chat. Markdown, ≤ 2000 chars, sanitized. |
| `mark_chat_read` | Mark one chat read. |
| `mark_all_chats_read` | Mark all chats read. |

## Bounties

*Flag-gated: `bounties`. Needs `BountiesWrite`.*

| Tool | Purpose |
|---|---|
| `create_bounty` | Create a bounty. `startsAt` / `expiresAt` ISO dates, ≥ 1 example image (UUID or URL), Buzz funding. |
| `update_bounty` | Update a bounty you own (dates and images still required). |
| `create_bounty_entry` | Submit an entry: ≥ 1 pre-uploaded file ref (`{url, name, sizeKB}`) + ≥ 1 example image. |
| `award_bounty` | Award a bounty to an entry (owner-only, distributes Buzz). |

## Moderation

*Moderator accounts only.*

| Tool | Purpose |
|---|---|
| `upsert_announcement` | Create / update a homepage banner. Fields merge on update; image by UUID or URL; `startsAt` defaults to now. |
| `delete_announcement` | Delete an announcement by ID. |
| `list_announcements` | List announcements — `scope: "current"` (live) or `"all"` (paginated). |
| `upsert_changelog` | Create / update a `/changelog` entry. Markdown → HTML; `effectiveAt` defaults to now. Requires the `changelogEdit` flag. |

## Utilities

| Tool | Purpose |
|---|---|
| `upload_image` | Upload from a URL or base64. Presigns, PUTs to a UUID, probes dimensions (PNG / JPEG / GIF / WebP). Returns the UUID for use in posts, articles, covers, etc. |
| `whoami` | Resolve the current user: id, username, onboarding state, muted flag, `isModerator`, subscription tier. Good smoke test and onboarding diagnostic. |

## Notes

- **Batch limits.** `get_model` / `get_model_version` / `get_image` fetch in batches at concurrency 3; `list_comments` walks to a 500-comment ceiling per call.
- **Markdown.** Articles, comments, announcements, changelog, DMs, and chat accept Markdown and sanitize it server-side.
- **Dates.** Date fields (`publishedAt`, `startsAt`, `expiresAt`, `effectiveAt`, cursors) are serialized with superjson hints — pass ISO strings; the server handles the rest.
- **Image uploads** are guarded by a size cap (10 MB default) and an SSRF host allowlist on URL fetches.

## Related

- [MCP Server overview](/site/mcp/) — endpoint, auth, and client setup
- [Site API reference](/site/reference/) — REST equivalents for the browse data
- [Orchestration MCP](/orchestration/mcp/) — the generation-focused MCP server
