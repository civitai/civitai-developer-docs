# Design tokens

The design system is built on a small set of **semantic design tokens** shipped
by [`@civitai/theme`](https://www.npmjs.com/package/@civitai/theme). Every
`--civitai-*` custom property, its light and dark value, and the value your
browser actually resolves are shown below — read **live** from the published
package, so this page can never drift from what a consumer installs.

## How tokens are consumed

Tokens ship in three interchangeable forms:

- **CSS custom properties** — link `@civitai/theme/styles.css` (or
  `injectTokens()` from JS). Every `--civitai-*` property is registered with
  `@property` and re-resolves under a `[data-theme="light|dark"]` scope.
- **Typed JS/TS export** — `tokens` (light values), `darkTokens` (dark
  overrides), and `tokenVars` (`var(--civitai-*)` reference strings) from
  `@civitai/theme`, with a `TokenName` union.
- **DTCG JSON** — `@civitai/theme/tokens.json` for design-tool import.

```ts
import { tokens, darkTokens, tokenVars, type TokenName } from '@civitai/theme';

// Resolved light value:            tokens.colorPrimary       // "#228BE6"
// Dark override:                   darkTokens.colorPrimary   // "#1971C2"
// CSS var reference (for styling): tokenVars.colorPrimary    // "var(--civitai-color-primary)"
const brand: TokenName = 'colorPrimary';
```

Theme a subtree by setting `data-theme` on any ancestor; all tokens re-resolve
from that scope:

```html
<div data-theme="dark">
  <!-- --civitai-* tokens here resolve to the dark palette -->
</div>
```

## Token gallery

<TokenGallery>
<!-- BEGIN GENERATED: tokens — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**Color**

| Token | CSS property | Light | Dark |
|---|---|---|---|
| `colorText` | `--civitai-color-text` | `#222` | `#C1C2C5` |
| `colorTextDimmed` | `--civitai-color-text-dimmed` | `#868e96` | `#8c8fa3` |
| `colorBody` | `--civitai-color-body` | `#fefefe` | `#1A1B1E` |
| `colorSurface` | `--civitai-color-surface` | `#fefefe` | `#1A1B1E` |
| `colorSurface2` | `--civitai-color-surface-2` | `#fefefe` | `#25262B` |
| `colorBorder` | `--civitai-color-border` | `#ced4da` | `#373A40` |
| `colorPrimary` | `--civitai-color-primary` | `#228BE6` | `#1971C2` |
| `colorPrimaryHover` | `--civitai-color-primary-hover` | `#1C7ED6` | `#1864AB` |
| `colorPrimaryFg` | `--civitai-color-primary-fg` | `#fefefe` | `#fefefe` |
| `colorPrimaryLight` | `--civitai-color-primary-light` | `rgba(34, 139, 230, 0.1)` | `rgba(34, 139, 230, 0.15)` |
| `colorError` | `--civitai-color-error` | `#fa5252` | `#e03131` |
| `colorSuccess` | `--civitai-color-success` | `#299C7A` | `#326D5C` |
| `colorWarning` | `--civitai-color-warning` | `#fd7e14` | `#e8590c` |
| `colorInfo` | `--civitai-color-info` | `#228BE6` | `#1971C2` |
| `colorGray0` | `--civitai-color-gray-0` | `#f8f9fa` | `#f8f9fa` |
| `colorGray1` | `--civitai-color-gray-1` | `#f1f3f5` | `#f1f3f5` |
| `colorGray2` | `--civitai-color-gray-2` | `#e9ecef` | `#e9ecef` |
| `colorGray3` | `--civitai-color-gray-3` | `#dee2e6` | `#dee2e6` |
| `colorGray4` | `--civitai-color-gray-4` | `#ced4da` | `#ced4da` |
| `colorGray5` | `--civitai-color-gray-5` | `#adb5bd` | `#adb5bd` |
| `colorGray6` | `--civitai-color-gray-6` | `#868e96` | `#868e96` |
| `colorGray7` | `--civitai-color-gray-7` | `#495057` | `#495057` |
| `colorGray8` | `--civitai-color-gray-8` | `#343a40` | `#343a40` |
| `colorGray9` | `--civitai-color-gray-9` | `#212529` | `#212529` |

**Typography**

| Token | CSS property | Light | Dark |
|---|---|---|---|
| `font` | `--civitai-font` | `-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji` | `-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji` |
| `fontMono` | `--civitai-font-mono` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace` |

**Shape**

| Token | CSS property | Light | Dark |
|---|---|---|---|
| `radius` | `--civitai-radius` | `0.25rem` | `0.25rem` |

<!-- END GENERATED: tokens -->
</TokenGallery>
