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

<TokenGallery />
