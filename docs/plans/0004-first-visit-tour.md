# Plan 0004: first-visit tour

Status: proposed. Written 2026-11-10.

Tracking issue: [#179](https://github.com/mooship/karta/issues/179).

## Goal

Help a new visitor find the main controls in under a minute, without getting in the way of anyone who does not want help. The tour must be:

1. **Skippable** at every point, with one press, by keyboard or touch.
2. **Remembered**, so a person who has seen or skipped it is not shown it again.
3. **Easy to start again**, from the Help section, at any time.
4. **Well made**: calm to look at, correct on phones and desktops in both themes, usable with a keyboard and a screen reader, and quiet about motion.

## Ground rules

- The first paint stays the map. A first visit gets a small welcome card with "Take the tour" and "Skip", not a full-screen overlay, and the card never takes focus from a person who is already using the map.
- No accounts, no tracking and no network. The only thing kept is one number in the existing settings store, and the privacy text says so.
- Everything follows the existing rules: tokens only, ports and adapters, test first, a keyboard equivalent for every gesture, WCAG 2.2 AA, and confirmation by eye with screenshots at phone and desktop sizes in both themes.
- No new dependency. A tour library would bring its own focus handling, styles and positioning, and none of it uses our tokens. The pieces are small and are written here.
- The SDK stays domain-agnostic. `packages/map` holds a generic tour interface that takes steps as data. The steps and their words belong to the host, in `packages/web`.

## Design

### Pure logic (`packages/core`)

- **Tour state machine.** A pure reducer over a list of steps: `start`, `next`, `back`, `skip` and `finish`, with the current index and a status of `idle`, `running`, `skipped` or `finished`. A step whose target is not on the page (Directions on a host with no routing service, the zoom buttons on a touch device) is left out when the tour starts, so the progress count is always true. No clock, no DOM.
- **Card placement.** A pure function from the target's rectangle, the card's size, the viewport and the insets taken up by the sheet or side panel to a position and a side (above, below, start, end). It prefers the step's side, flips when there is no room, clamps to the viewport with the screen inset, and falls back to a bottom-centre dock on narrow screens. Tested across phone, tablet and desktop sizes.

### Remembering

- `Settings` gains `tourSeen`, the version of the tour the person has finished or skipped (a number, absent for a new visitor). Skipping counts as seen. Bumping the version in code offers a rewritten tour once more, and nothing else does.
- Where storage is not persistent (a private window), the card shows once per page load and never twice in a session. Nothing else changes.
- The welcome card is not offered when the address carries a shared view, layers or shapes, because a person following a link wants the map they were sent. It stays available from Help.

### Interface (`packages/map`)

- `TourProvider` and `useTour` hold the reducer, read and write `tourSeen` through the settings store and expose `start`, `skip` and the current step.
- `TourCard` is a labelled, non-modal dialog: the step's heading, one or two sentences, the control's own icon, "Step 2 of 6", Back, Next (Done on the last step) and "Skip tour". Focus moves to its heading on each step and returns to the control that started the tour, or to the map, when it closes.
- `TourHighlight` draws a ring around the target using the focus-ring tokens, with no dimming scrim, so the map stays visible and the controls stay usable. It follows resize, rotation, the sheet moving and fonts loading through a `ResizeObserver`.
- A named z layer (`tour`, between `popover` and `toast`) is added to the tokens and to `DESIGN.md`. Only transform and opacity animate, and reduced motion turns the movement off.
- Keys: Enter or Space presses the focused button, Escape skips, and the arrow keys do nothing special, so they cannot clash with the map's own. The card is a dialog with `aria-labelledby` and `aria-describedby`, announced by moving focus to it, so no new live region is created.

### Host (`packages/web`)

- Steps are data in the host, with the words written inline in the components, in British English. The draft order is: welcome; search; Map options (basemap, layers, settings); open data layers ("every layer is off until you turn it on"); the tools (Measure, Draw shapes, Directions when present); Locate me; and where Help and the keyboard keys live. Six steps at most, each with a single sentence of advice.
- On a phone the sheet starts at peek during the tour, and a step that points into the sheet opens it to half and closes it again after.
- Help gains a "Take the tour" button, which starts the tour from step one whether or not it was seen.

### Privacy and documents

- `PRIVACY.md` and `PrivacyPage.tsx` change together to say that one number is kept in the browser to remember the tour and is never sent.
- `DESIGN.md` gets the new components, their contracts and the z layer. `ARCHITECTURE.md` gets a short section on the tour.

## Tests

- Reducer: every transition, skipping absent targets, finishing and restarting, and the version rule.
- Placement: flipping, clamping and docking on a table of viewports, including a target hidden behind the sheet.
- Components: the card's accessible names and focus order, Escape, the last step, a changed step list while running, and reduced motion.
- Playwright: a first visit shows the welcome card; Skip survives a reload; the whole tour by keyboard only; Escape at each step; "Take the tour" from Help after a skip; a shared link shows no card; a host with no routing service has one step fewer. Phone (Pixel 7) and desktop projects, with the existing suites starting as "seen" through the test seam so they are not disturbed.
- Accessibility: axe on the card at every step in both themes, and contrast of the ring over Liberty and Positron.
- By eye: screenshots at 390 by 844 and 1280 by 720, light and dark, read and judged, as `AGENTS.md` requires.

## Order of work

1. Reducer and placement in `core`, test first.
2. `Settings.tourSeen` and the provider in `map`.
3. Card and highlight, with the token and z layer.
4. Host steps, copy and the Help button.
5. Privacy text, design and architecture notes.
6. End-to-end and accessibility tests, then the visual check, then merge.

Starts after the rename to MapCairn (#170) so the copy carries the new name, and after the on-map name and mark (#176), since both use the chrome slots.

## Out of scope

Videos, animations that run on their own, per-feature hints that appear later, analytics of any kind, and translated copy.
