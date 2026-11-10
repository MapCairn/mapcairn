# `@mapcairn/theme`

MapCairn's design tokens, built with [vanilla-extract](https://vanilla-extract.style/). It has no dependency on another MapCairn package, a map engine or React. [`DESIGN.md`](../../DESIGN.md) describes the system and the rules for using it.

## Exports

| Export | Purpose |
|---|---|
| `tokens` | The token contract: `tokens.color.*`, `shadow`, `effect`, `space`, `radius`, `type`, `size`, `focus`, `motion` and `z`. Each is a typed CSS variable reference, so a typo in a `.css.ts` file is a type error. The values and the light and dark switching are defined in `src/tokens.css.ts`. |
| `focusRing`, `blur`, `surfaceBlurStyle`, `surfaceBlurSupported` | Shared style fragments: the two-tone focus ring, and translucent surfaces with an opaque fallback. |
| `zLayer(name)` | The z-index variable for a named layer (map, mapOverlay, chrome, chromeRaised, sheet, toolbar, popover, toast). Components name a layer and never write a number. |
| `mapOverlayTokens` | Colours for everything drawn over the map: pin, measure line and fill, accuracy circle, scale bar and tile-error banner. |
| `tokenValues` | The raw values (colour roles for both themes, spacing, radii, type scale, motion, z layers). Used by tests and the contrast checks, not by components. |

The token set and the contrast checks live in `src/tokens.css.ts`, `src/tokenValues.ts` and `src/contrast.ts`. The contrast tests compute every text and boundary pairing over the worst-case map backdrops in both themes.

```ts
// Button.css.ts
import { focusRing, tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

export const button = style({
  backgroundColor: tokens.color.surfaceRaised,
  borderRadius: tokens.radius.control,
  ":focus-visible": focusRing,
});
```

## Using it in a host app

This package ships source with no build step. A host registers `vanillaExtractPlugin()` from `@vanilla-extract/vite-plugin` in its Vite config. The package is side-effect free, so its token stylesheet reaches the page only through an import that is used, as `packages/web/src/global.css.ts` does with `tokens` and `focusRing`.

## What doesn't belong here

- App-specific values, copy or storage keys.
- Raw colour, size or z-index literals outside `tokens.css.ts` and `tokenValues.ts`. The harmony scanner enforces this.
