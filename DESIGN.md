# Design system

The map is the hero and the chrome recedes. Karta is calm, neutral and precise, with grouped controls, a floating search pill and a bottom sheet, in the way people already expect from a good maps app. Light and dark are equally polished. The target is WCAG 2.2 AA, built in from the first component.

Tokens live in `packages/theme/src/tokens.css.ts`. Components may only use tokens, so an off-scale value fails typecheck, and a lint test is the backstop for raw literals.

## Living style guide

`/design` renders every token and every primitive from the real code: colour roles with light and dark hex values and their contrast pairs, the type scale, spacing, radii, elevation, motion, z layers, the Lucide icons the app imports, each component in each state, and a font check that proves IBM Plex Sans is rendering. Open http://localhost:5173/design with `npm run dev`, or http://localhost:4173/design with `npm start` (the e2e build). The route exists only in development and in the `--mode e2e` build (`packages/web/src/designGuideRoutes.ts`); `npm run build` fails if the page's marker reaches the production bundle, and `e2e/design.spec.ts` covers it in the browser.

## Principles

1. One of everything: one family, one accent, one icon set, one stroke, one radius per role.
2. Every control has one owner of its position (`MapChrome`) and one layer (a named z-index).
3. Nothing is conveyed by colour alone.
4. Nothing needs a gesture, a hover or a mouse. Every gesture has a keyboard or single-tap equivalent.

## Tokens

- **Colour roles:** surface, surface-raised, text, text-muted, accent, accent-tint, hairline, danger, scrim, focus-ring, page-background, map-background. The neutral ramp is OKLCH with a faint cool tint. The accent is one clear blue. Page-background follows the theme and sits behind full pages such as the privacy policy. Map-background is the default basemap's land colour in both themes, so the map region before the map draws matches the map that follows.
- **Save data:** a switch in Settings, on by default when the browser reports a data saver or a `slow-2g` or `2g` connection (Chrome, Edge and Samsung Internet; iOS has no signal), and a stored choice always wins. While it is on, the picker shows names and a plain colour swatch (the map background token) instead of thumbnails, Streets carries the note "Uses more data", and a basemap leaves out the style layers it lists in `saveDataOmitLayers`. Liberty lists its shaded-relief raster layer (`natural_earth`), about a third of the first view's bytes. The adapter removes them as each style loads, so no code names a basemap and data layers are drawn again afterwards. Switching it redraws the map once, only for a basemap that lists layers to leave out.
- **Basemap:** Liberty is the default in both themes. The basemap never follows the light or dark theme. The picker offers Liberty, Positron and Streets; there is no dark basemap, and a saved or linked "dark" (or the old "auto") opens on Liberty.
- **Data palette:** the one set of colours data layers draw with, separate from the interface roles. Seven Okabe-Ito categorical colours (without black) and a five-step ordered ramp, light to dark, in `tokenValues.dataPalette`. Definitions name a slot (`vermillion`, `ordinal-3`), never a value; categories must use categorical slots and steps ordinal ones. Every marker has a dark edge inside a white halo (`tokenValues.dataMarker`), the same on the map and in the legend, so the pale steps show on a light map and the dark ones on a dark surface; contrast tests cover both. Validation refuses a colour rule with no shape, size or words beside it.
- **Surfaces:** translucent with backdrop blur, with an opaque fallback and the `-webkit-` prefix. `prefers-contrast: more` and `prefers-reduced-transparency` make them opaque and remove blur. Contrast is computed over the worst-case backdrops (pure white and pure black map) and over Liberty's land colour, because a dark theme no longer means a dark map.
- **Spacing:** 4, 8, 12, 16, 24, 32. Screen inset is 12.
- **Radii:** pill 24, sheet 20, control and card 14, inner 10. Fully circular elements use 50%.
- **Elevation:** two shadows, floating and sheet, each with light and dark values. No borders on floating elements. Hairlines only inside lists and between grouped controls.
- **Type:** IBM Plex Sans only, self-hosted through Fontsource (variable, Latin and Latin Extended), weights 400 and 600. Sizes 13, 15, 17 and 22, defined in rem with a line height and tracking each. Nothing below 13px. Numbers use `tabular-nums`. Inputs are 17px, never below 16px. The fallback stack is `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, which also covers non-Latin place names.
- **Size:** controls are 48px minimum, targets never below 44px, switches and slider thumbs included (their hit area is larger than what they draw), with at least 8px between neighbours.
- **Icons:** `lucide-react` only, imported by name, 24px, one stroke-width token, through the `Icon` component.
- **Focus ring:** two tones (an inner surface ring and an outer ring, 2px each) so it shows on any basemap. Every interactive element and the focused map use it.
- **Motion:** 120, 200 and 320ms, one easing curve, one spring for the sheet. Only transform and opacity animate. `prefers-reduced-motion` turns motion off, including MapLibre's own animation.
- **Z layers, bottom to top:** map, mapOverlay, chrome, chromeRaised, sheet, toolbar, popover, toast. Components name a layer and never write a number. The tokens file and the map engine style file are the only places raw z-index values may appear.

## Layout and slots

`MapChrome` owns the position of everything floating over the map. It is `pointer-events: none`, and each slot's contents are `pointer-events: auto`.

| Slot | Contents |
| --- | --- |
| top-start | search pill |
| end-stack | compass (when the map is rotated), main control group (Map options, Measure, Directions when the host has a routing service, Locate me), zoom control group (when shown) |
| bottom-start | scale readout, cursor coordinates (desktop) |
| bottom-end | attribution |
| bottom-centre | measure toolbar, toasts, tile-error banner |
| sheet or side panel | basemap, pin, layers (with the open feature card at the top), settings, help; or, while Directions is the open surface, the directions panel under the title "Directions" |

Before the app mounts, the server renders a decorative skeleton of this chrome (`ChromeSkeleton`) on the map's background colour: the search pill, the Map options, Measure, Directions (when the host has a routing service, which `ChromeSkeleton` is told with its `directions` prop) and Locate me group, the zoom group where the device has a fine pointer, and the credits button, in their final slots. It reuses the `MapChrome` grid and the real controls' own classes, so the live chrome replaces it in the same boxes with no layout shift (`e2e/skeleton.spec.ts` compares every control's box before and after at 390 by 844 and 1280 by 720). It is `aria-hidden` and `inert`, writes no `style` attribute and uses only tokens. Because the server cannot measure the container, its sheet or side panel layout follows a media query built from the same constants as `chooseLayout`, and its zoom group follows `(hover: hover) and (pointer: fine)`; a stored "show zoom buttons" choice is applied once the app mounts.

Slots use flow layout with gaps from the spacing scale, so neighbours push apart instead of overlapping. On narrow screens the sheet is a bottom sheet with peek, half and full detents. From 768px wide, and on any screen shorter than about 500px, it is a floating side panel on the left. The bottom slots ride above the sheet and hide at the full detent. A layout collision test checks every viewport and state.

## Components and accessibility contracts

Native elements first. No tabindex above 0. Every interactive component has an accessible name and a stable `data-testid`, and every floating element has `data-chrome`.

| Component | Contract |
| --- | --- |
| `IconButton` | A `button` named for the action ("Zoom in"). Visible labels are contained in the name. |
| `ControlGroup` | Stacked icon buttons with hairline dividers. A group, not a toolbar. |
| `SearchPill` | `role="search"` with an ARIA 1.2 combobox (`aria-expanded`, `aria-controls`, `aria-activedescendant`) and a "Search" button after it. Typing never searches (Nominatim's policy forbids autocomplete): Enter or the button submits, and the results listbox appears after a submit. Arrow keys move through the results, Enter on a highlighted result selects it, and Enter with none highlighted submits. Editing the text hides the old results. Results never take focus. The geocoder adapter starts at most one request a second. |
| `Sheet` | A labelled dialog. Non-modal at peek and half. At full it is modal, the background is `inert`, Tab wraps inside it (with a focus sentinel at each end for Safari, whose Tab skips links and buttons) and Escape closes it. The handle is a button that cycles detents with Enter or Space and moves with the arrow keys. On desktop it is a labelled complementary region. |
| `Attribution` | A "Map credits" button with `aria-expanded` and `aria-controls`. The popover is a labelled region with real links and returns focus on close. It shows by itself once the map has started, without taking focus, and collapses on the first map interaction or after five seconds (fading, unless reduced motion is on), because the OpenStreetMap attribution guidelines allow credits to collapse only after they have been shown. It opens above the button, or beside the end stack when the links would have to scroll there (a short landscape phone). |
| `Switch`, `Slider`, `SegmentedControl` | Radix primitives wrapped in our own components, with visible labels and values. |
| `Tooltip` | Supplements a name, never replaces one. Opens on focus and hover, closes on Escape, absent on touch. |
| `LayersSection` | A region named "Layers" with an h4 per group and a list of layers. Each layer is a `Switch` (name and description) with its data cost in words. While it is on: a status line (Loading, "Updated 14:05, 43 shown", the layer's empty text, or an error with an icon, words and Try again), its controls (segmented, switch, a native date input bounded by `min` and `max`, an opacity slider, a range slider), a legend list named "Key for ..." with the same glyphs as the map, the disclaimer with an icon, and a `details` list of what loaded. Controls whose condition is not met are disabled, not hidden. Loads, empty feeds and failures are announced once each through `LiveRegion`. |
| Feature list | Rows are full-width buttons named by the feature and ", show on map"; a row brings the sheet to half, centres the feature in the part of the map the sheet or side panel leaves free, rings it, scrolls its card into view and opens it (a tap on a point does the same, moving the map only if the point would be hidden), the keyboard and screen-reader equivalent of tapping the point. Sorts are a segmented control; long lists show 50 rows and "Show all". |
| `FeatureCard` | An article named by its heading, which takes focus when a tap on the map opened it. Shows the layer, the colour's words with its glyph, the template lines, an `https` provider link that says it opens in a new tab, the disclaimer, "Show on map" and, for layers with a detail source, "Show affected area" with its cost, "Hide affected area" once shown and Try again on failure. Close is an icon button named "Close card". |
| `MarkerGlyph` | The marker shape and colour as a decorative SVG (`aria-hidden`); words beside it carry the meaning. Its colour is a `fill` attribute, so it needs no inline style. |
| `DirectionsPanel` | Shown in the sheet or side panel while Directions is the open surface, which opens from the "Directions" button (`aria-pressed`) and is one of the one-at-a-time surfaces with Measure, search and the pin card; opening it closes Measure, and a long press or the P key records a pin without closing it. Groups under h3 headings: "Stops" (an ordered list; each row has a letter, a name or coordinates, and "Move stop A up", "Move stop A down" and "Remove stop A" buttons; "Add stop at map centre", "Add dropped pin" when a pin exists, and a search form for a place that adds a stop only when a result is chosen), "Route" (a "Travel mode" segmented control for Drive, Walk and Cycle, and "Get route"), and "Travel time area" (4 buttons for 5, 10, 15 and 30 minutes, with `aria-pressed` for the one shown, and a note under them saying what a request sends and to whom, supplied by the host). Taps on the map add stops while it is open, and data layers ignore taps. "Add stop at map centre" and the crosshair use the middle of the part of the map the sheet or side panel leaves free, never the hidden centre. Nothing is sent until "Get route" or an area button is pressed. A result card gives distance and time (a route, with a line for each leg beyond two stops) or the area's size, and a new result fits the map clear of the panel. States: loading with a Cancel button, no route found or nothing reachable (no retry), busy or unreachable service (Try again, worded as possibly offline), and a cancelled request, which says "Cancelled" and shows nothing. Changing a stop or the mode clears a result that no longer fits. Results are not stored and never go in the permalink. Stops are lettered discs on the map, so they never rely on colour. Every outcome is announced through `LiveRegion`; the panel has no live region of its own. Closing the panel keeps the stops and the drawn result, so the map can be seen; "Clear directions" removes them. The map credits add OpenStreetMap and the service's name while a result is drawn. |
| `ShapeGlyph` | A polygon or line as a decorative SVG: the fill over its hatching and ink outline, or the coloured line over a white casing, with the class's dash and width, the same cues the map draws. Colours and dashes are SVG attributes. A key lists a class's swatch and its words, so no class is told apart by colour alone. |
| Layer key | The "Key for ..." list draws each entry with `MarkerGlyph` or `ShapeGlyph`. A heatmap's key names each step of its ramp with a density word (such as Sparse, Moderate, Dense). A vector tile layer's key lists every source layer's classes. |
| Range control | A `Slider` with a visible label and value, such as "Radius 20 px". It changes how a layer is drawn and costs no data unless its value is in the URL. |
| Query status | A status line under a query layer: "Zoom in to load this layer." below its zoom, and "Showing the first N. Zoom in to see more." when capped. Both are announced once through `LiveRegion`. |
| `FeatureChoices` | A section named "N features here" (the heading takes focus when a tap or the `I` key opened it), a list of full-width buttons that each name a feature and its layer, and "Close list". A row opens that feature's card, which has "Back to list" while the list is open. |
| `ExportSection` | A region named "Save image" with a plain button. It saves a PNG of the map with its layers and credits, is busy while the image is made, and announces success politely and failure assertively. |
| `LiveRegion` | The one announcer: a polite and an assertive region mounted once, throttled and de-duplicated. Nothing else creates live regions. |
| `SkipLink` | First focusable element. Moves focus to the map region. |
| `VisuallyHidden` | The one way to provide screen-reader-only text. |

Map region: a focusable region named "Map", described by hidden keyboard instructions. Arrow keys pan, plus and minus zoom, Shift with left and right arrows rotates, Home or 0 resets north, P drops a pin, I lists the features at the centre of the map, Escape closes the active surface.

Gesture equivalents: tapping a data point, polygon or line has the layer's list and its "Show on map" rows, and a tap that finds several features has the I key. Saving an image is a button. Long-press pin has "Drop pin at map centre" and the P key. Pinch and double-tap have the zoom buttons and +/-. Rotation has Shift with left and right arrows and the compass. Sheet drag has the handle button. Measure taps have "Add point at map centre". Directions stop taps have "Add stop at map centre", "Add dropped pin" and a place search, and any drag of a stop has the Move and Remove buttons.

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
| Colour literals, off-scale radius, spacing, font size and weight, font family, raw z-index, literal motion durations, `outline: none` without `focusRing` (in the same rule, or on the visible part inside a larger hit area), `position: absolute` and `fixed` outside floating surfaces, inline styles, MapLibre selectors, `tabindex` above 0, pinch-zoom blocking, live regions outside `LiveRegion` and `StatusMessage`, icon sizing, icon-only buttons without a name, MapLibre controls, module-level services | harmony scanner (`scripts/harmony`) |
| Icon packages, namespace and default imports of `lucide-react`, accessibility rules, browser globals outside adapters, core purity, inline style attributes on DOM elements, `!important` in CSS | Biome (`biome.jsonc`) |
| `maplibre-gl` imports outside `packages/web/src/adapters/maplibre`, Radix outside four primitives, adapters outside the composition root, ports as types only, core limited to pure packages | dependency-cruiser (`.dependency-cruiser.cjs`) |
