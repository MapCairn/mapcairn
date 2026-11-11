# Plan 0004: first-visit tour

Status: in progress. The setting, the card, the slot, the Help restart, the privacy text, the end-to-end tests (desktop Chromium and Pixel 7) and axe on the cards are built; the collision additions and the landscape and tablet screenshots are not yet done. Written 2026-11-10 and rewritten on 2026-11-11 to the smaller scope the maintainer decided on the tracking issue. The work it was queued behind (#222, #204) is closed.

Tracking issue: [#179](https://github.com/MapCairn/mapcairn/issues/179).

## Goal and ground rules

A first visit often ends in the same confusion: the map shows a basemap and nothing else, because every data layer is off until it is turned on. A short tour fixes that by having the person do it, once.

- Three steps, one welcome card and one ending. No steps for Directions, Draw shapes or Measure; Help covers the rest.
- Learn by doing: a step advances when the person does the thing it asks. A Next button does the same for anyone who prefers it, and for keyboard and screen-reader use.
- Skippable at every point in one press, remembered afterwards, and restartable from Help.
- A small non-modal card with no dimming and no focus trap. It never takes focus from someone already using the map.
- Not offered when the address carries a shared view, layers or shapes.
- One implementation, with steps as data. No port and no way to bring another tour; an interface is added only if a second host needs one.
- The tour keeps one number in the existing settings store and sends nothing. No new dependency, no new token and no new z layer.

## Steps and copy

The draft in the decision had three items: layers, map shape, and "find Search and Help". Help has no button or signal of its own; it is the second section of the Settings sheet (`SheetContent.tsx`). It is therefore named in step 2, where the person is already looking at that sheet. Search gets a step of its own because focusing the search field is a real action the tour can see.

| Card | Heading | Text | Advances when | Target ringed |
| --- | --- | --- | --- | --- |
| Welcome | New to MapCairn? | Data such as earthquakes and fires is drawn only once you turn its layer on. This three-step tour shows how. | The person presses "Take the tour" or "Skip" | none |
| 1 of 3 | Turn on a layer | Open Map options and turn on any layer under Layers. | More layers are on than when the step began | Map options button |
| 2 of 3 | Try the globe | Open Settings and switch Map shape between Flat and Globe. Help, just below it, lists the keys and can start this tour again. | `Settings.projection` differs from its value when the step began | Settings button |
| 3 of 3 | Find a place | Type a place name in Search and press Enter. | The search field takes focus (`surface` becomes `"search"`) | Search field |
| Ending | Tour finished | Help, in Settings, can start it again. | "Close" | none |

Every numbered card has a heading, "Step N of 3", its text, and two buttons: "Next" (on step 3, "Finish") and "Skip tour". There is no Back: the steps are independent and Help restarts the tour. The ending has one button, "Close". No card closes itself on a timer.

### Doing something else

- **Another surface opens** (Measure, Draw shapes, Directions, the pin card, search). The card stays on its step and in its place. The step can still be completed later. Nothing the tour shows is in the bottom slots, so it never meets the measure or draw toolbars.
- **Step 1 and Map options.** While step 1 is current, Map options opens on the Layers section (`openSheet("layers")`) instead of on Basemap. `SheetContent` already scrolls a newly chosen section to the top and focuses its heading. On a phone at half height the Layers section would otherwise sit below Basemap and Pin, behind a scroll.
- **The person opens Settings during step 1, or Map options during step 2.** Nothing changes. The ring stays on the step's own button.
- **The sheet is closed without doing the step.** The step stays, and the ring is on its button again.
- **The sheet goes to the full detent.** The sheet is then modal and `MapChrome` makes every slot `inert`, so the card is hidden. The step still advances if the person does the action inside the sheet, and the next step is announced. The card shows again when the sheet comes down.
- **The phone is rotated.** 844 by 390 is shorter than 500 px, so `chooseLayout` (`packages/core/src/layout/layout.ts`) switches to the side panel. The card moves to its panel-layout cell (below), and the step is kept.
- **A layer is already on when step 1 starts.** The step waits for one more, or for Next.

### Skip, finish and restart

- "Skip" on the welcome card, "Skip tour" on any step, or Escape while focus is inside the card ends the tour and stores the version. Escape is handled on the card, which calls `preventDefault`, so the document listener in `AppChrome.tsx` does not also close the open surface. Escape anywhere else keeps its meaning: it closes the sheet, the search list or the tool, and the tour stays on its step. This means one Escape never does two things.
- "Take the tour" stores the version too, so a person who starts and then leaves is not asked again.
- "Finish" on step 3, or completing step 3, shows the ending card.
- Help gets a "Take the tour" button (a secondary `Button`). It closes the sheet, starts at step 1 (no welcome card) and moves focus to the card's heading. It works whether or not the tour was seen, and while it is running (it restarts).

## Layout

The card goes in a new `MapChrome` slot, `tour`, so `MapChrome` stays the one owner of every position (`DESIGN.md`, principle 2). The slot is in flow in a grid cell that is empty today. That means no measuring, no `position: absolute` (so the harmony list of positioned components is unchanged) and no CSSOM writes. In DOM order it comes straight after `top-start`, so Tab goes from Search to the card, and then to the end stack. The skeleton has no card, so `skeleton.spec.ts` is unaffected.

- **Sheet layout** (`grid-template-areas` `"top top" ". end" "start end-bottom"` in `MapChrome.css.ts`): row 2, column 1, aligned to the top. That is under the search pill and left of the end stack.
- **Panel layout** (`"top . end" ". . end" "start . end-bottom"`): column 2, rows 1 to 2, aligned to the top. That is the free space between the search column, which is as wide as the panel, and the end stack. The slot carries `data-side`. With `end` the card sits against the end stack, next to Map options and Settings. With `start` it sits against the panel or search, for a step whose action is in the open panel or the search field. The welcome and ending cards use `start`.
- **Width**: at most 320 px (`calc(space.xl * 10)`), never wider than its cell.
- **Hidden** with the bottom slots while the sheet is at full (`data-hide-bottom="true"`), using the same transition.

| Viewport | Layout | Where the card sits | Against the sheet or panel |
| --- | --- | --- | --- |
| Phone portrait 390 by 844 | sheet | Under search, left of the end stack, about 310 px wide, from about 68 px down | Peek top is about 633 px and half top 422 px (`computeDetentHeights`), so a card of about 190 px is clear at both. At full the card is hidden. |
| Phone landscape 844 by 390 | panel | Column 2 from the top, up to 320 px wide | Right of the panel when open. The scale and credits stay in the bottom row below it. |
| Tablet 768 by 1024 | panel | Column 2, about 310 px wide | As above |
| Desktop 1280 by 720 | panel | Column 2, 320 px | As above, with `end` placing it beside the end stack |

The end stack and attribution have their own cells, so the card cannot overlap them. The credits popover shows by itself for five seconds after the map starts, which is when the welcome card appears. At 844 by 390 it can be placed beside the end stack and rise into the card's cell, on the popover layer above it. That overlap is accepted for those five seconds, because the credits must be shown first, and the 844 by 390 screenshot must show it.

At 390 by 844 with the sheet at half, the bottom row rides above the sheet and `computeEndStackMaxHeight` leaves the end stack slightly shorter than its six buttons. The stack then scrolls, and Settings, the last button, can be partly hidden when step 2 begins. When a step starts, the tour therefore scrolls its ringed control into view (`scrollIntoView` with `block: "nearest"`, instant under reduced motion).

**Ring.** Steps ring a chrome control only: the Map options button, the Settings button or the search field. These are already registered in the focus registry (`packages/map/src/chrome/focusRegistry.tsx`, names `map-options`, `settings`, `search`). The registry gains a read-only `element(name)`. The tour sets `data-tour-highlight` on that element while its step is current, and one `globalStyle` in the card's stylesheet draws `focusRing` from `@mapcairn/theme` for it. There is no scrim. Targets inside the sheet are not ringed: the sheet already scrolls to and focuses the relevant section, and a ring inside its scroll container would be clipped. The ring looks the same as a focus ring, because the end stack's padding (`EndStack.css.ts`) gives a ring exactly 4 px of room and a larger one would be clipped. The card names the control in words, so the ring is a supplement, never the only cue.

## State and data

- **Setting.** `Settings.tourSeen: number | null` in `packages/core/src/ports/settings.ts`. It is the tour version the person has answered (Take the tour, Skip, or Escape on the card), or `null` for a new visitor. Defaults go in `MemorySettingsStore` and in `LocalStorageSettingsStore` (`DEFAULTS`, `SETTING_NAMES`, a `parseSetting` case that accepts only a positive integer). It is stored under `mapcairn:tourSeen`. Bumping `TOUR_VERSION` in the host offers a rewritten tour once more, and nothing else does.
- **Storage that is not persistent** (`SettingsStore.persistent` false). The tour is not offered automatically, or it would appear on every load. Help still starts it.
- **When to offer.** `shouldOfferTour({ seen, version, link, persistent })` is true only when `seen` is below `version`, storage is persistent, and the link has no `view`, `layers` or `shapes`. `link` is the `UrlStateValue` that `useMapApp` reads once at start (`useState(() => url.read())`), before the app writes its own view. The card appears once the map has loaded (`MapContext.loading` false, no `error`), so it never shows over `MapUnavailable`.

**Core** (`packages/core/src/tour/tour.ts`, pure, about 90 lines):

- `TourAdvance`: `{ kind: "layer-on" } | { kind: "projection-changed" } | { kind: "surface"; surface: SurfaceKind }`.
- `TourSnapshot`: `{ layersOn: number; projection: MapProjection; surface: SurfaceKind }`.
- `stepDone(advance, atStart, now)`: compares the snapshot taken when the step began with the current one.
- `tourReducer` over `{ status: "off" | "welcome" | "running" | "ended"; step: number }`, with `offer`, `start`, `next`, `skip` and `close`. `next` past the last step goes to `ended`.
- `shouldOfferTour` as above.

**Map** (`packages/map/src/tools/Tour/`):

- `useTour({ steps, version, offer, snapshot })` runs the reducer, keeps the start snapshot, advances on `stepDone`, writes `tourSeen` through `useSettings().update`, sets and clears the ring, and announces.
- `TourCard` renders the current card from `steps`: `{ id, heading, text, advance, target }`. `target` is a focus-registry name or none.
- `MapChrome` gains the `tour` prop and slot. `HelpSection` and `SheetContent` gain an optional `onStartTour`, and Help shows its button only when that is given.

**Web**: `packages/web/src/app/AppTour.tsx` holds `TOUR_VERSION = 1` and the steps with their copy inline. `useMapApp` calls `useTour` and builds the snapshot from signals that already exist:

| Signal | Source |
| --- | --- |
| Layers on | `app.layers.layers` (`DataLayerState.enabled`) |
| Map shape | `useSettings().settings.projection` |
| Search focused | `state.surface === "search"`, dispatched by `onSearchFocus` |
| Sheet and section | `state.surface`, `state.sheetSection`, `state.sheetDetent` |

`toggleMapOptions` opens on `"layers"` while step 1 is current. No new signal is needed. The only new hook into existing code is `element(name)` on the focus registry.

## Accessibility

- **The card.** A `section` named by its heading (an `h2`, after the page's `h1`), so it is a region landmark. It is not a dialog: nothing is modal. Buttons are the `Button` primitive at 48 px, with at least 8 px between them.
- **Focus.** The welcome card takes no focus. "Take the tour", Next and Help's button move focus to the new card's heading (`tabindex="-1"`). A step completed by the person's own action leaves focus where it is (for example on the layer switch they just pressed) and announces the next step instead. Closing the card by Skip, Escape, Finish's Close or "Skip tour" moves focus to the map region (`useFocusReturn` with `null`) if focus was in the card, and otherwise leaves it alone.
- **Announcements**, all polite and all through `useAnnounce` (no new live region):
  - On first offer: "New to MapCairn? A three-step tour is after the search box."
  - A step reached by doing: "Step 2 of 3, Try the globe. " followed by its text.
  - Skip: "Tour skipped. Help, in Settings, can start it again."
  - Finish: "Tour finished."
  - The existing projection and layer announcements still come first. `LiveRegion` throttles and de-duplicates them.
- **Keyboard.** Every step's action is already a button, switch or segmented control. Next stands in for any of them. Escape in the card skips. The tour adds no shortcut and leaves the arrow keys to the map.
- **Gestures.** The tour introduces none. The one gesture it would have needed, scrolling the sheet to Layers, is replaced by opening on Layers.
- **Motion.** The card fades in with `motion.duration.base` (opacity only), and reduced motion removes the fade. The ring does not animate.
- **Contrast.** The card uses `Surface` and the existing text roles, and the ring uses `focusRing` and `focusRingInner`. Both are already covered by `packages/theme/src/contrast.test.ts` in both themes over the worst-case backdrops, so no new colour is introduced.

## Privacy

`PRIVACY.md` and `PrivacyPage.tsx` change together. The mirror test (`PrivacyPolicyFile.test.ts`) today checks the date and the tile providers, so it gains a case requiring `mapcairn:tourSeen` in both. The local storage paragraph adds: "whether you have answered the first-visit tour (a version number under `mapcairn:tourSeen`)". The tour itself sends nothing. A layer turned on during the tour loads from its provider, as the policy already describes.

## Tests

- **Core.** `tourReducer` covers every transition, including `next` past the end and `start` while running. `stepDone` covers each `TourAdvance`, including a layer already on and a projection changed and changed back. `shouldOfferTour` covers new, seen and bumped versions, not persistent, and a link with a view, layers or shapes (each alone), or a basemap only, which is still offered.
- **Settings.** `LocalStorageSettingsStore` reads `tourSeen` and turns a bad value (string, negative, fraction) into `null`. `MemorySettingsStore` defaults to `null`. The shared settings contract covers the new field.
- **Components.** `TourCard` names, its heading and its buttons. The welcome card does not take focus. Next moves focus to the next heading. An action-driven advance keeps focus and announces. Escape in the card skips and calls `preventDefault`. The ring attribute is set and cleared. Help's button appears only with `onStartTour`. The `MapChrome` slot is in DOM order after `top-start`, is inert while modal, and is hidden at full.
- **Playwright** (`e2e/tour.spec.ts`, desktop Chromium and Pixel 7):
  - A first visit shows the welcome card without moving focus.
  - Skip, then `page.goto("/")` at the bare path, shows no card. A reload would carry the app's own hash and pass for the wrong reason.
  - The whole tour by keyboard only, both by doing each action and by Next.
  - Escape with focus in the card at each step skips. Escape with focus in the open sheet closes the sheet and keeps the step.
  - Restart from Help after a skip.
  - Shared links with `#map=`, `#layers=` or `shapes=` show no card.
  - At the full detent on the phone the card is hidden, and it returns at half.
  - Existing suites start as seen: the fixture writes `mapcairn:tourSeen` before boot unless a spec sets the new `firstVisit` option. `ScriptedSettings` and the `scriptMemorySettings` seed in `e2e/support/services.ts` gain `tourSeen` set to the current version, because that seed lists its fields explicitly.
  - `collision.spec.ts` adds the card in each viewport and detent.
- **Accessibility.** axe on each card in light and dark (`@a11y`).
- **By eye.** Screenshots at 390 by 844, 844 by 390, 768 by 1024 and 1280 by 720, in light and dark, over Liberty and one other basemap, with the sheet at peek and half, read and judged as `AGENTS.md` requires.

## Order of work

1. Core: `Settings.tourSeen` with both stores, `tour.ts`, and their tests. In the same change, add the e2e fixture option and the seed field. Unit-test helpers that build services with `createFakeServices` also seed `tourSeen` to the current version unless a test asks for a first visit. `MemorySettingsStore` reports `persistent: true` by default, so every App-level test would otherwise get the welcome card in its tree and Tab order.
2. Map: the `tour` slot in `MapChrome`, `element(name)` on the focus registry, `useTour` and `TourCard` with tests, and `onStartTour` through `SheetContent` and `HelpSection`.
3. Web: `AppTour.tsx` with the steps and copy, the wiring in `useMapApp` and `AppChrome` (including Map options opening on Layers during step 1), the privacy text in both files, and the `DESIGN.md` rows (the `tour` slot in the slot table and a `TourCard` contract).
4. `tour.spec.ts`, the collision and a11y additions, the screenshots, then status "done" here and in the index.

**Cost.** It adds about eight new files: `tour.ts` and its test, `useTour`, `TourCard` with its stylesheet and test, `AppTour.tsx` and `tour.spec.ts`. It adds five concepts: one setting, one slot, one reducer, one card and one hook. Production code is roughly 450 to 550 lines, and tests about the same again. Existing files change in small, local ways: the settings port and both stores, the unit-test service helpers, `MapChrome` and its stylesheet, the focus registry, `HelpSection`, `SheetContent`, `useMapApp`, `AppChrome`, the two privacy texts, `DESIGN.md` and two e2e support files.

## Out of scope

Videos; animation that plays by itself; hints that appear later for single features; steps for Directions, Draw shapes or Measure; analytics of any kind; translated copy; any third-party tour library or service; a pluggable tour port or a guide for bringing another tour.

## Open questions

1. **A reload counts as a shared link.** The app writes the view into the address on every settled move (`useViewPersistence.ts`). A first visitor who pans and then reloads without answering the welcome card is therefore treated as following a link, and gets no card on that load. Recommendation: accept it. The card returns on the next visit to the bare address, and telling a reload from a shared link would need more state than this is worth.
2. **A welcome card that is ignored.** Should turning on a layer without the tour also store the version? That person has already solved the problem the tour is for. Recommendation: yes. It costs one line in `useTour`, using a signal that is already read.
3. **A ring that looks like focus.** Is a ring identical to the focus ring acceptable, given that the end stack has room for exactly that ring and the card names the control in words? Recommendation: yes. A distinct ring would need the end stack's padding, and so its layout, to change.
