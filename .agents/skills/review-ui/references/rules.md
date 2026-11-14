# Interface rules

Adapted from the Web Interface Guidelines by Vercel Labs (https://github.com/vercel-labs/web-interface-guidelines, commit `434b7f91364665f2f733b310ec54809bf8f37937`, MIT licence, Copyright (c) 2025 Vercel Labs; the licence text is at the end of this file). Rules were kept, reworded for React and vanilla-extract, changed to match `DESIGN.md`, or left out (see the end). Where this file and `DESIGN.md` differ, `DESIGN.md` wins.

A rule marked "(lint)" is enforced by the harmony scanner (`npm run lint:harmony`) or Biome, so a clean lint run means it holds. The others need a person or a model reading the code. Cite the id in a finding.

## Accessibility

- **A1** Native elements first. A `<button>` does an action, an `<a>` or React Router `<Link>` goes somewhere. No `<div>` or `<span>` with a click handler. No `tabindex` above 0 (lint).
- **A2** Every interactive component has an accessible name and a stable `data-testid`; every floating element has `data-chrome`. An icon-only button is named for the action ("Zoom in"; lint checks only that it has a name), and a visible label is contained in the name.
- **A3** A form control has a `<label>` or an accessible name, and the label is clickable.
- **A4** An image has `alt` (empty when decorative). A decorative SVG is `aria-hidden`, and the words beside a glyph carry the meaning (`MarkerGlyph`, `ShapeGlyph`).
- **A5** Nothing is conveyed by colour alone: a shape, an icon or words go with every colour.
- **A6** Announcements go through `LiveRegion`, and status text through `StatusMessage` (lint: no other live regions). A message that reports a running count carries the whole count. `keep` is for the outcome of something the person did, or a state they would otherwise miss, as `DESIGN.md` (the `LiveRegion` row) says.
- **A7** Screen-reader-only text is `VisuallyHidden`, nothing else.
- **A8** Headings are in order (h2, h3, h4 as the sheet nests them). A region has a name. The sheet or panel title is the dialog's name.
- **A9** Every gesture has a keyboard or single-tap equivalent, and nothing needs hover or a mouse (`DESIGN.md`, principles 3 and 4). Escape closes the active surface.
- **A10** Focus is visible through the `focusRing` token, which is two tones so it shows on any basemap, and uses `:focus-visible`. `outline: none` without `focusRing` is not allowed (lint). Focus moves into a panel, card or dialog when it opens and returns to the control that opened it when it closes, unless `DESIGN.md` says otherwise (the welcome tour card and the credits popover do not take focus). A sticky or floating element must not cover the focused control.
- **A11** A control that is not available is disabled with its reason in words, not hidden, unless `DESIGN.md` says otherwise.

## Forms

- **F1** An input has a meaningful `name`, the right `type` and `inputmode`, and `autocomplete` where it holds the person's own details. Prefer the native date input and `select`.
- **F2** Never block paste (`onPaste` with `preventDefault`).
- **F3** Inputs are 17px and never below 16px, so iOS does not zoom (tokens).
- **F4** An error sits next to its field, says what to do next, is announced through `LiveRegion`, and the first error takes focus on submit.
- **F5** A submit button stays enabled until the request starts. While it runs the control says so (`aria-busy`, a loader icon in place of its icon) and keeps focus.
- **F6** Turn spell check off for codes, usernames and coordinates.

## Motion

- **M1** Only `transform` and `opacity` animate. Durations and easing come from the motion tokens (120, 200 and 320 ms, one curve). A literal duration is refused by lint; a literal easing curve is not, so check it by reading. Never `transition: all`.
- **M2** `prefers-reduced-motion` turns motion off, including the map engine's own animation.
- **M3** An animation can be interrupted by the next input. SVG transforms go on a `<g>` with `transform-box: fill-box` and `transform-origin: center`.
- **M4** Nothing moves on its own for more than five seconds without a way to pause, stop or hide it.

## Type and content

- **T1** Type comes from the scale (13, 15, 17 and 22), IBM Plex Sans only, weights 400 and 600 (lint). Figures use `tabular-nums`.
- **T2** A container copes with long content: `overflowWrap: "anywhere"` or `textOverflow: "ellipsis"`, and `minWidth: 0` on a flex child that holds text. Place names can be very long and in any script.
- **T3** Empty, short, average and very long inputs all render properly. An empty list says so in words ("No layers are available.").
- **T4** Copy is British English, with sentence-case headings and button labels (not Title Case), no em dashes, active voice, numerals for counts, and specific button names ("Save image", not "Continue"). An error says what to try next. Match the wording `DESIGN.md` already uses ("Loading layers" has no ellipsis).

## Images

- **I1** An `<img>` has `width` and `height`. Images below the first view use `loading="lazy"`, and the one critical image uses `fetchPriority="high"`.
- **I2** A basemap preview that fails, or Save data mode, shows the plain swatch.

## Performance

- **P1** A long list is capped or windowed, as the feature list shows 50 rows and "Show all". No unbounded `.map()` over data a provider returns.
- **P2** No layout read (`getBoundingClientRect`, `offsetWidth`, `scrollTop`) during render. Read in an effect or with `ResizeObserver`, and batch reads before writes. `MapChrome`'s measurements are the deliberate exception.
- **P3** Prefer uncontrolled inputs where nothing else needs the value. A controlled input (the search combobox is one) must be cheap on every keystroke.
- **P4** Fonts and app CSS come in as module imports so the build applies fallback metrics, not as a hand-written preload. A new tile or geocoder origin is allowed in `packages/web/public/_headers` and `packages/web/src/constants/securityHeaders.ts`.

## State and navigation

- **N1** Links use `<a>` or `<Link>`, so a modified click and a middle click work.
- **N2** State that should survive a share is in the address fragment (view, basemap, layers, controls, shapes), validated when read. The selection and anything personal never go in it.
- **N3** A destructive action has Undo or a confirmation ("Turn off all layers" has Undo, 10 seconds).

## Touch

- **H1** Controls are 48 px or more and no target is under 44 px, with 8 px between neighbours. A switch's or slider thumb's hit area is larger than what it draws.
- **H2** `touch-action: manipulation` is set once, globally, in `packages/web/src/global.css.ts`, so it is not a per-control rule. A sheet or panel that scrolls uses `overscroll-behavior: contain`.
- **H3** While something is dragged, text selection is off. Every drag, swipe, pinch and long press has a button or key equivalent.
- **H4** `autoFocus` is rare. Move focus on purpose, as a card's heading takes it when a tap opens the card, and never on first load on a phone.

## Layout and surfaces

- **L1** `MapChrome` owns the position of everything floating over the map. `position: absolute` or `fixed` is only for floating surfaces (lint). Neighbours push apart in flow layout with gaps from the spacing scale (4, 8, 12, 16, 24, 32), and a z-index is a named layer (lint).
- **L2** Full-bleed layouts use `env(safe-area-inset-*)`. Prefer flex and grid over measuring in script.
- **L3** A surface is translucent with an opaque fallback and the `-webkit-` prefix, and becomes opaque with no blur under `prefers-contrast: more` and `prefers-reduced-transparency`.

## Theme and colour

- **D1** Light and dark are equally polished. Colour comes from the role tokens only (lint). Contrast is WCAG 2.2 AA in both themes, over the worst-case backdrops. A native `select` or date input sets its own `background-color` and `color`.
- **D2** Nothing branches on a basemap id, layer id or provider. Data colours are named slots of `dataPalette`: categories use categorical slots and steps use ordinal ones, each with a shape, size or words beside it.

## Rendering on the server

- **S1** The page is server-rendered on Workers. Browser globals belong in an adapter: lint denies storage, `fetch`, `matchMedia`, `location` and `history` outside one, and the rest (`window`, `document`) is checked by reading. A value that differs between server and client (time, locale, `matchMedia`, storage) is read after mount or with `useSyncExternalStore`. An input with `value` has `onChange`. `suppressHydrationWarning` only where it is truly needed.
- **S2** No inline `style` attribute (lint). A dynamic value is a custom property set through the CSSOM.

## Locale

- **O1** Dates, numbers, coordinates, units and zoom go through the core formatters or `Intl`, never a hand-written format. A time in UTC says UTC. The app is English only (`lang="en-GB"`).

## Components

- **C1** Use the primitives that exist: `IconButton`, `ControlGroup`, `Switch`, `Slider` and `SegmentedControl` (Radix wrapped in our own components), `Tooltip` (it supplements a name, never replaces one), `Sheet`, `Icon`. Icons are `lucide-react` imported by name, 24 px, through `Icon` (lint covers the import form and the size and stroke props). No second palette, icon set or font, and no Shadow DOM component library.
- **C2** A component matches its row in "Components and accessibility contracts" in `DESIGN.md`. If the behaviour changed, the row changed in the same pull request.

## Anti-patterns to flag

`user-scalable=no` or `maximum-scale=1` (lint); `onPaste` with `preventDefault`; `transition: all`; `outline: none` without `focusRing` (lint); a click handler on a `<div>` or `<span>`; an image without dimensions; an icon button without a name (lint); a hand-written date or number format; `autoFocus` with no reason; an action only a gesture can do; a second live region (lint); a raw colour, spacing, radius, font size or z-index (lint); an inline `style` (lint).

## Left out on purpose

These Web Interface Guidelines rules do not apply here, so do not flag their absence:

- Title Case headings and buttons, and "&" for "and" (the project uses sentence case).
- Ending loading text with "…", curly quotes and non-breaking spaces in copy (not decided here; follow `DESIGN.md` wording).
- Tailwind class names, `nuqs`, a Next.js `priority` image prop and `<Link>` from another router.
- Putting state in query parameters (the address fragment is used so nothing is sent to a server).
- Virtualising lists above 50 items (the project caps and pages them), and hand-written font preload links.
- Detecting language from `Accept-Language` and `translate="no"` (the app is English only).

## Licence of the source

MIT License

Copyright (c) 2025 Vercel Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
