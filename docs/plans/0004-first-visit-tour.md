# Plan 0004: first-visit tour

Status: proposed. Written 2026-11-10, reworked the same day so the tour is replaceable.

Tracking issue: [#179](https://github.com/mooship/karta/issues/179).

## Goal

Help a new visitor find the main controls in under a minute, without getting in the way of anyone who does not want help. The tour must be:

1. **Skippable** at every point, with one press, by keyboard or touch.
2. **Remembered**, so a person who has seen or skipped it is not shown it again.
3. **Easy to start again**, from the Help section, at any time.
4. **Well made**: calm to look at, correct on phones and desktops in both themes, usable with a keyboard and a screen reader, and quiet about motion.
5. **Replaceable**: the tour is a service the host provides, not a fixed feature. A host can use the built-in tour, bring its own, or connect a hosted product-tour service, and the map interface works the same with any of them or with none.

## Ground rules

- The first paint stays the map. A first visit gets a small welcome card with "Take the tour" and "Skip", not a full-screen overlay, and the card never takes focus from a person who is already using the map.
- The SDK ships no third-party tour and names none. What a third-party tour loads, sets or sends is the host's choice and the host's privacy text; the reference host ships only the built-in tour.
- The built-in tour needs no accounts, no tracking and no network. The only thing it keeps is one number in the existing settings store, and the privacy text says so.
- Everything follows the existing rules: tokens only, ports and adapters, test first, a keyboard equivalent for every gesture, WCAG 2.2 AA, and confirmation by eye with screenshots at phone and desktop sizes in both themes.
- No new dependency. A tour library would bring its own focus handling, styles and positioning, and none of it uses our tokens. The pieces are small and are written here.
- The SDK stays domain-agnostic. The steps and their words belong to the host, in `packages/web`.

## Design

### The port (`packages/core`)

`TourGuide` is an optional service, like `RoutingProvider`: `Services.tour` may be absent, and the map interface must work without it. It has two real implementations (the built-in tour and whatever a host brings) and a fake, with a shared contract suite.

- `shouldOffer(): boolean`. Whether to offer the tour to this visitor on a first visit. The built-in tour answers from its remembered flag; an external tour answers from its own rules, or always `false` if it starts itself.
- `start(request): void`. `request` carries the reason (`first-visit` or `requested`), the host's step list as data (target id, heading, text) and a `TourController`. An external tour may ignore the steps and run its own content.
- `stop(): void`, `active: boolean` and `subscribe(listener)`, so the interface can hide the welcome card and the Help button's state follows the tour.
- Rejects nothing: a tour that fails to load must not break the map, so `start` reports failure through a typed `TourError` event on `subscribe` and the interface carries on.

`TourController` is what a tour may do to the interface, and the only way it may: `openPanel(id)`, `closePanel()`, `focusTarget(id)` and `onUserAction(listener)` (a panel opened, a tool chosen), so an external tour can follow along or wait for the person to try a control. It never gives the tour the map engine.

### Stable targets

Every control a tour may point at carries a stable `data-tour-target` attribute, listed in one table in `DESIGN.md` (`search`, `map-options`, `measure`, `draw`, `directions`, `locate`, `zoom`, `layers`, `help`, `credits` and so on). Controls that do not exist on a page have no attribute. These ids are part of the SDK's public contract and change only with a major version. They are plain attributes, so any tour tool can find them.

### Pure logic (`packages/core`)

- **Tour state machine** for the built-in tour. A pure reducer over a list of steps: `start`, `next`, `back`, `skip` and `finish`, with the current index and a status of `idle`, `running`, `skipped` or `finished`. A step whose target is not on the page (Directions on a host with no routing service, the zoom buttons on a touch device) is left out when the tour starts, so the progress count is always true. No clock, no DOM.
- **Card placement** for the built-in tour. A pure function from the target's rectangle, the card's size, the viewport and the insets taken up by the sheet or side panel to a position and a side (above, below, start, end). It prefers the step's side, flips when there is no room, clamps to the viewport with the screen inset, and falls back to a bottom-centre dock on narrow screens. Tested across phone, tablet and desktop sizes.

### Built-in tour (`packages/map`)

It is the default `TourGuide`, written as ordinary React in the map package because it is user interface, not an adapter, and is chosen by the host.

- **Remembering.** `Settings` gains `tourSeen`, the version of the tour the person has finished or skipped (a number, absent for a new visitor). Skipping counts as seen. Bumping the version in code offers a rewritten tour once more, and nothing else does. Where storage is not persistent (a private window), the card shows once per page load and never twice in a session.
- **Card.** A labelled, non-modal dialog: the step's heading, one or two sentences, the control's own icon, "Step 2 of 6", Back, Next (Done on the last step) and "Skip tour". Focus moves to its heading on each step and returns to the control that started the tour, or to the map, when it closes.
- **Highlight.** A ring around the target using the focus-ring tokens, with no dimming scrim, so the map stays visible and the controls stay usable. It follows resize, rotation, the sheet moving and fonts loading through a `ResizeObserver`.
- **Layer and motion.** A named z layer (`tour`, between `popover` and `toast`) is added to the tokens and to `DESIGN.md`. Only transform and opacity animate, and reduced motion turns the movement off.
- **Keys.** Enter or Space presses the focused button, Escape skips, and the arrow keys do nothing special, so they cannot clash with the map's own. The card is a dialog with `aria-labelledby` and `aria-describedby`, announced by moving focus to it, so no new live region is created.

### Map interface (`packages/map`)

- A generic `TourLauncher` asks `services.tour?.shouldOffer()` once the map is ready, and calls `start` with the reason `first-visit`. It is not offered when the address carries a shared view, layers or shapes, because a person following a link wants the map they were sent.
- Help gets a "Take the tour" button, shown only when `services.tour` exists, which calls `start` with the reason `requested` whether or not the tour was seen.
- Nothing else in the interface knows which tour is registered.

### Host (`packages/web`)

- `createServices()` registers the built-in tour. A host that wants another registers its own `TourGuide` instead, or none. The reference host's steps are data, with the words written inline in the components, in British English. The draft order is: welcome; search; Map options (basemap, layers, settings); open data layers ("every layer is off until you turn it on"); the tools (Measure, Draw shapes, Directions when present); Locate me; and where Help and the keyboard keys live. Six steps at most, each with a single sentence of advice.
- On a phone the sheet starts at peek during the tour, and a step that points into the sheet opens it to half through `TourController` and closes it again after.
- A short guide, `docs/guides/bring-your-own-tour.md`, shows how to register a different tour, lists the target ids and the controller, and reminds the host that a third-party tour changes its CSP and its privacy text.

### Privacy and documents

- `PRIVACY.md` and `PrivacyPage.tsx` change together to say that the built-in tour keeps one number in the browser and sends nothing.
- `DESIGN.md` gets the new components, the target table, their contracts and the z layer. `ARCHITECTURE.md` gets the new port in the ports table and a short section on the tour.

## Tests

- Contract suite for `TourGuide`, run against the fake and the built-in tour: start, stop, subscribe, `shouldOffer`, a failing start that leaves the map working, and calling `start` twice.
- Reducer: every transition, skipping absent targets, finishing and restarting, and the version rule.
- Placement: flipping, clamping and docking on a table of viewports, including a target hidden behind the sheet.
- Components: the card's accessible names and focus order, Escape, the last step, a changed step list while running, reduced motion, and the Help button absent with no tour registered.
- A test host with a stub external tour proves the interface works with it, uses the controller and never touches the built-in code.
- Playwright: a first visit shows the welcome card; Skip survives a reload; the whole tour by keyboard only; Escape at each step; "Take the tour" from Help after a skip; a shared link shows no card; a host with no routing service has one step fewer. Phone (Pixel 7) and desktop projects, with the existing suites starting as "seen" through the test seam so they are not disturbed.
- Accessibility: axe on the card at every step in both themes, and contrast of the ring over Liberty and Positron.
- By eye: screenshots at 390 by 844 and 1280 by 720, light and dark, read and judged, as `AGENTS.md` requires.

## Order of work

1. The port, fake and contract suite, the reducer and placement in `core`, test first.
2. `Settings.tourSeen`, the stable target ids on the controls, and the launcher and Help button in `map`.
3. The built-in tour: card and highlight, with the token and z layer.
4. Host steps, copy and registration.
5. Privacy text, design and architecture notes, and the bring-your-own guide.
6. End-to-end and accessibility tests, then the visual check, then merge.

Starts after the rename to MapCairn (#170) so the copy carries the new name, and after the on-map name and mark (#176), since both use the chrome slots.

## Out of scope

Videos, animations that run on their own, per-feature hints that appear later, analytics of any kind, translated copy, and any adapter for a named third-party tour service in this repository.
