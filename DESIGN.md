# Design system

The map is the hero and the chrome recedes. Karta is calm, neutral and precise, with grouped controls, a floating search pill and a bottom sheet, in the way people already expect from a good maps app. Light and dark are equally polished. The target is WCAG 2.2 AA, built in from the first component.

Tokens live in `packages/theme/src/tokens.css.ts`. Components may only use tokens, so an off-scale value fails typecheck, and a lint test is the backstop for raw literals.

## Principles

1. One of everything: one family, one accent, one icon set, one stroke, one radius per role.
2. Every control has one owner of its position (`MapChrome`) and one layer (a named z-index).
3. Nothing is conveyed by colour alone.
4. Nothing needs a gesture, a hover or a mouse. Every gesture has a keyboard or single-tap equivalent.

## Tokens

- **Colour roles:** surface, surface-raised, text, text-muted, accent, accent-tint, hairline, danger, scrim, focus-ring, map-background. The neutral ramp is OKLCH with a faint cool tint. The accent is one clear blue.
- **Surfaces:** translucent with backdrop blur, with an opaque fallback and the `-webkit-` prefix. `prefers-contrast: more` and `prefers-reduced-transparency` make them opaque and remove blur. Contrast is computed over the worst-case backdrops (pure white and pure black map).
- **Spacing:** 4, 8, 12, 16, 24, 32. Screen inset is 12.
- **Radii:** pill 24, sheet 20, control and card 14, inner 10. Fully circular elements use 50%.
- **Elevation:** two shadows, floating and sheet, each with light and dark values. No borders on floating elements. Hairlines only inside lists and between grouped controls.
- **Type:** IBM Plex Sans only, self-hosted through Fontsource (variable, Latin and Latin Extended), weights 400 and 600. Sizes 13, 15, 17 and 22, defined in rem with a line height and tracking each. Nothing below 13px. Numbers use `tabular-nums`. Inputs are 17px, never below 16px. The fallback stack is `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, which also covers non-Latin place names.
- **Size:** controls are 48px minimum, targets never below 44px, with at least 8px between neighbours.
- **Icons:** `lucide-react` only, imported by name, 24px, one stroke-width token, through the `Icon` component.
- **Focus ring:** two tones (an inner surface ring and an outer ring, 2px each) so it shows on any basemap. Every interactive element and the focused map use it.
- **Motion:** 120, 200 and 320ms, one easing curve, one spring for the sheet. Only transform and opacity animate. `prefers-reduced-motion` turns motion off, including MapLibre's own animation.
- **Z layers, bottom to top:** map, mapOverlay, chrome, chromeRaised, sheet, toolbar, popover, toast. Components name a layer and never write a number. The tokens file and the map engine style file are the only places raw z-index values may appear.

## Layout and slots

`MapChrome` owns the position of everything floating over the map. It is `pointer-events: none`, and each slot's contents are `pointer-events: auto`.

| Slot | Contents |
| --- | --- |
| top-start | search pill |
| end-stack | compass (when the map is rotated), main control group (Map options, Measure, Locate me), zoom control group (when shown) |
| bottom-start | scale readout, cursor coordinates (desktop) |
| bottom-end | attribution |
| bottom-centre | measure toolbar, toasts, tile-error banner |
| sheet or side panel | basemap, pin, settings, help |

Slots use flow layout with gaps from the spacing scale, so neighbours push apart instead of overlapping. On narrow screens the sheet is a bottom sheet with peek, half and full detents. From 768px wide, and on any screen shorter than about 500px, it is a floating side panel on the left. The bottom slots ride above the sheet and hide at the full detent. A layout collision test checks every viewport and state.

## Components and accessibility contracts

Native elements first. No tabindex above 0. Every interactive component has an accessible name and a stable `data-testid`, and every floating element has `data-chrome`.

| Component | Contract |
| --- | --- |
| `IconButton` | A `button` named for the action ("Zoom in"). Visible labels are contained in the name. |
| `ControlGroup` | Stacked icon buttons with hairline dividers. A group, not a toolbar. |
| `SearchPill` | `role="search"` with an ARIA 1.2 combobox: `aria-expanded`, `aria-controls`, `aria-activedescendant`. Results never take focus. |
| `Sheet` | A labelled dialog. Non-modal at peek and half. At full it is modal, the background is `inert` and Escape closes it. The handle is a button that cycles detents with Enter or Space and moves with the arrow keys. On desktop it is a labelled complementary region. |
| `Attribution` | A "Map credits" button with `aria-expanded` and `aria-controls`. The popover is a labelled region with real links and returns focus on close. |
| `Switch`, `Slider`, `SegmentedControl` | Radix primitives wrapped in our own components, with visible labels and values. |
| `Tooltip` | Supplements a name, never replaces one. Opens on focus and hover, closes on Escape, absent on touch. |
| `LiveRegion` | The one announcer: a polite and an assertive region mounted once, throttled and de-duplicated. Nothing else creates live regions. |
| `SkipLink` | First focusable element. Moves focus to the map region. |
| `VisuallyHidden` | The one way to provide screen-reader-only text. |

Map region: a focusable region named "Map", described by hidden keyboard instructions. Arrow keys pan, plus and minus zoom, Shift with left and right arrows rotates, Home or 0 resets north, P drops a pin, Escape closes the active surface.

Gesture equivalents: long-press pin has "Drop pin at map centre" and the P key. Pinch and double-tap have the zoom buttons and +/-. Rotation has Shift with left and right arrows and the compass. Sheet drag has the handle button. Measure taps have "Add point at map centre".

## Exempt surfaces

These surfaces hold raw values on purpose and are exempt from the harmony lint (`npm run lint:harmony`, `scripts/harmony`):

- the tokens file (`packages/theme/src/tokens.css.ts`, `tokenValues.ts` and the contrast code and tests)
- the map engine style file (`packages/web/src/adapters/mapEngine.css.ts`), the only place MapLibre selectors (`.maplibregl-*`) and raw engine z-index values may appear
- committed basemap assets and map style definitions (`packages/core/src/basemaps`)
- tests, fixtures and test support
- `node_modules` and build output

Text baked into basemap tiles comes from the tile source and keeps its own typeface. The inline theme script in `packages/web/src/root.tsx` is a string, so no rule reads it. The scanner's header and `scripts/harmony/config.mjs` list the same surfaces.

Two other lists exist, and each has one home. `scripts/harmony/allowlist.mjs` holds one-off, justified exceptions (rule, file, snippet and reason), and a stale entry fails the lint. `scripts/harmony/legacyPaths.json` holds the old code that the app rebuild deletes. It is the only exemption for legacy code, and `biome.jsonc` mirrors it, checked by a test. Empty it when the old code is gone.

## What the lint checks, and where

| Rule | Enforced by |
| --- | --- |
| Colour literals, off-scale radius, spacing, font size and weight, font family, raw z-index, literal motion durations, `outline: none` without `focusRing`, `position: absolute` and `fixed` outside floating surfaces, inline styles, MapLibre selectors, `tabindex` above 0, pinch-zoom blocking, live regions outside `LiveRegion` and `StatusMessage`, icon sizing, icon-only buttons without a name, MapLibre controls, module-level services | harmony scanner (`scripts/harmony`) |
| Icon packages, namespace and default imports of `lucide-react`, accessibility rules, browser globals outside adapters, core purity, inline style attributes on DOM elements, `!important` in CSS | Biome (`biome.jsonc`) |
| `maplibre-gl` imports outside `packages/web/src/adapters/maplibre`, Radix outside four primitives, adapters outside the composition root, ports as types only, core limited to pure packages | dependency-cruiser (`.dependency-cruiser.cjs`) |
