# 0007: Multi-feature selection

Status: proposed. Tracking issue: [#49](https://github.com/MapCairn/mapcairn/issues/49).

## Goal

A person can pick several features, see them marked on the map, count them and act on them: list them, remove one, clear all, zoom to them, and select what lies inside a shape they drew. A host can keep the set wherever it likes, such as on a server, by supplying its own store. The reference site shows no change.

## Ground rules

- **A selected set is not the open card.** `useDataLayers` already has `selection`, the feature whose card is open, and `ARCHITECTURE.md` "Data layers" calls it "Selection". That behaviour is unchanged and the bullet becomes "Open card". The new concept is the selected set: port `FeatureSelection`, hook `useFeatureSelection`.
- **SDK only.** `ROADMAP.md` says SDK items do not change the reference site without a maintainer decision made with a plan. `createServices()` supplies nothing, so the site has no selection ui and `PRIVACY.md` is unchanged. The example app shows it and e2e reaches it through the test seam.
- The port is optional: without `Services.selection` the ui offers none of it. The set is never written to the permalink and never stored by the SDK.
- Every gesture has a keyboard or single-tap equivalent. Highlights use tokens and a second signal beside colour, in both themes and over every offered basemap. No new dependency.

## Design

### The port (`packages/core`)

```ts
interface FeatureRef { layerId: string; featureId: string }  // the shape of MapFeatureHit
interface FeatureSelection {
  readonly limit: number;
  getState(): readonly FeatureRef[];  // same array until a change, in selection order
  subscribe(listener: () => void): () => void;
  add(refs: readonly FeatureRef[]): void;
  remove(refs: readonly FeatureRef[]): void;
  replace(refs: readonly FeatureRef[]): void;
  clear(): void;
}
```

- **Synchronous.** `useSyncExternalStore` needs a synchronous snapshot with a stable identity, so the state has no loading or failed status. A host that persists asynchronously keeps a local copy, writes behind it and notifies when it changes or hydrates; if a save fails it restores the copy and notifies, and the ui shows what the store says. An async port was rejected: every tap would wait on input and output, and concurrent taps would need ordering rules the host knows better. As in plan 0005, `getState()` is the server snapshot, so a store starts empty and hydrates after the first subscription, and hydration matches.
- **Rules for every implementation.** Duplicates are ignored. Each call notifies once and a no-op not at all. A call that would pass `limit` changes nothing, so a batch is refused whole, as an import past `MAX_DRAWING_SHAPES` is.
- **Implementations.** `createMemorySelection({ limit })` in core (default `DEFAULT_SELECTION_LIMIT`, 200) and `FakeFeatureSelection`, which scripts what the memory store cannot: a change from outside and a failed save. One contract suite runs against both.
- **Ripple, all in step 1.** `Services.selection?`, `PORT_NAMES`, `OPTIONAL_PORT_NAMES`, `PortContractRunners`, `PORT_REGISTRY`, `SERVICE_KEYS` in `testSeam.ts`, `createFakeServices`, a hook in `services/hooks.ts` and the Ports row.

### What can be selected

A feature is selectable when its layer loads features and its definition maps an `id` field (`isSelectable(definition)`, core). Without one the decoder falls back to list position, which changes between loads and cannot be a reference. Vector, heatmap and raster layers are not selectable until #47 gives raster layers features, whose ids must be stable too. The guide tells hosts that ids must be stable.

### The hook (`packages/map/src/selection`)

`useFeatureSelection(layers)` reads the store and the `DataLayers` value and returns the resolved items, the count, `toggle`, `add`, `remove`, `clear`, `zoomTo` and the select mode.

- **Resolving.** A reference shows the layer's current feature when loaded, else a snapshot kept this session (taken when it was selected, refreshed when the layer next lists it), as the open card does for a query layer. Otherwise it is unresolved: it stays in the store and counts, and the panel says "2 selected features are not shown because their layers are off or still loading". Zoom uses the geometry it has.
- **Dropping.** References are dropped only on a transition seen after mount: a layer that was on and is now off (one switch, or #103's batch turn-off), or that was listed and is now gone from a ready catalogue (plan 0005 step 2). Never at mount or while a catalogue loads, or a persisted set would be wiped by every page load. Undo from #103 turns layers back on without their selected features.
- **Titles.** The card title template moves out of `FeatureChoices` into a `featureTitle` helper the panel shares.

### Ways to select

- **Select mode, not a surface.** A switch in the panel makes a tap on the map toggle the topmost feature instead of opening its card. A tap with several hits opens `FeatureChoices` as now, and while the mode is on its rows and the feature list rows toggle (`aria-pressed`) instead of opening cards. The `I` key runs the same route from the map centre. Outside the mode, each `FeatureCard` has a "Select" toggle, the single-tap equivalent. The mode ends when the switch goes off or measure, draw or directions opens, the conditions that already set `ignoreTaps`; the cursor is a crosshair meanwhile. A surface in `core/surface` was rejected: no toolbar, keys or resume rule belong to it, and it costs the state machine, its tests and a layout slot.
- **A drawn shape.** `ShapesSection` gains "Select features inside" for the selected polygon or circle (`shapeGeometry` gives a circle's ring); a point or line has no inside and the button says so. It calls an optional host function, a port of its own so the store stays synchronous:

```ts
interface FeatureQuery {
  within(request: { area: Polygon; layerIds: readonly string[]; limit: number;
                    signal?: AbortSignal }): Promise<readonly SelectionHit[]>;
}
interface SelectionHit { layerId: string; feature: LayerFeature }  // doubles as the snapshot
```

  `Services.featureQuery?` rejects only with a typed `FeatureQueryError` (`network`, `invalid`, `aborted`). `layerIds` are the selectable layers that are on, and `limit` is the room left plus one, so the host stops early and the ui can say more exist, as a query layer does with `{limit}`. One request is in flight, with Cancel, and a failure offers Try again. A fake and an exported contract cover it. The SDK sends nothing itself.

### Highlight

`SelectionHighlights` draws in the existing overlay beside `SelectionMarker`, placed with `adapter.project` and hidden by `adapter.isVisible`. It survives basemap swaps and needs no `MapAdapter` change, so it does not wait on #24. Points get a ring and a check badge; lines and polygons get their outline, halo-backed, and the badge at `featurePosition`. Ring and badge are shapes, so colour is never the only signal, and the card's ring keeps its own size. Colours are the existing `mapOverlayTokens`, with a new role only if a contrast test needs one: 3:1 over every offered basemap, Satellite and Dark included, in both themes. A saved image omits it, as it omits the card's ring.

### The panel and announcements

`SelectionSection`, a region named "Selection", is a new `SheetSection` in the Map options sheet after Layers. It adds no floating element, so `DESIGN.md` "Layout and slots" has nothing to collide with. It holds the select-mode switch, the count against the limit, a list of buttons that centre each feature with a Remove button each, "Zoom to selection", "Clear selection" and the not-shown line. Zoom uses `fitBounds` with `fitPadding` and `FIT_MAX_ZOOM`, as import does.

One message per transition, built from the store after the call and sent through `LiveRegion`: "Added Gauge 4. 5 selected.", "12 features inside Polygon 1 added. 17 selected.", "Selection cleared.", "The selection holds 200 at most. Nothing was added." Each carries the total, so when the announcer's 600 ms throttle replaces a message the next one is still true. Dropping on turn-off is one message per commit, heard after the layer's own.

## Tests

Listed under each step, written first and seen failing.

## Order of work

Steps 1 to 3 touch none of `useDataLayers`, `MapDataLayers`, `LayersSection` or `SheetContent`, and can start now. Steps 4 and 5 edit files that PR #103 and PR #100 also change, so they wait for both. Each step is one pull request with a green build.

1. **Port, memory store, fake, contract, ripple.** Tests: the contract on both (identity, one notification and none for a no-op, order, duplicates, past-limit refusal, `replace`, unsubscribe); `isSelectable`; the exhaustive lists compile.
2. **`useFeatureSelection` and messages.** Tests: fresh, snapshot and unresolved; toggle, add, remove, clear, limit refusal; nothing dropped at mount, dropped on an on-to-off transition and on removal; each message through the real `createAnnouncer` with a clock, including three quick toggles; `FeatureChoices` output unchanged.
3. **`SelectionHighlights`.** Tests: marks per geometry, none beyond a globe's horizon; contrast in both themes over every basemap; the card's ring unchanged.
4. **Panel**, after #103. Tests: each state, names, keyboard order and focus after Remove and Clear; the new `SheetSection`; axe in both themes.
5. **Select mode and toggles**, after #100 and #103. Tests: one hit toggles, several open choices, cards open when the mode is off or a tool is active; `aria-pressed` toggles; the `I` key; the mode ends when a tool opens.
6. **`FeatureQuery` port.** Tests: fake and contract (abort, limit plus one, named layers only); ripple as in step 1.
7. **Select inside a shape.** Tests: enabled for polygon and circle, disabled with a reason otherwise; Cancel, Try again, over-room refusal; one message.
8. **Example app, seam, guide.** Tests: `ExampleApp.test.tsx`; the seam builds a store and scripted query from plain data and is compiled out of production (the bundle check searches for it); Playwright for toggling, the mode, a shape, Remove, Clear, zoom and dropping on turn-off; `a11y`; screenshots at phone, tablet and desktop in both themes over Bright, Satellite and Dark.

## Documents to update

- `ARCHITECTURE.md`: the Ports rows (steps 1, 6), "Data layers" (the rename and a selected-set bullet, step 2) and the highlight (step 3).
- `DESIGN.md`: a `SelectionSection` row, gesture equivalents and any new token (steps 3, 4, 5, 7).
- `docs/guides/extending.md` (step 8): a store, a query, stable ids, and that a host which persists a set or sends a shape to a server tells its visitors. The `core` and `map` READMEs, with the first step that changes what they offer. `ROADMAP.md`: in progress from step 1.
- `PRIVACY.md`: none.

## Risks

- **A forgotten select mode** after the sheet closes: the crosshair and the switch show it; promote it to a surface if the visual check shows people miss it.
- **Unstable host ids:** `isSelectable` and the guide.

## Decided and open

Decided in this plan, 2026-11-12: a synchronous store with a limit and a refused-whole rule, because the hook needs a stable snapshot; the shape query a separate optional port, so the store stays synchronous; a flag, not a surface, for the least machinery; overlay highlighting, so no adapter change; dropping only on transitions; SDK only.

Open, each with a recommendation:

1. **Does the reference site offer selection?** No: its public layers give nothing to act on, and `ROADMAP.md` requires a decision.
2. **References only, or with a label and position?** A persisted set shows no titles until its layers load. References only, as the issue says.
3. **A search over loaded features** for hosts with no query. Host-only now; add it when a host asks.
4. **Select mode as a surface with a bottom toolbar.** The flag now; review after step 8's visual check.
5. **The default limit of 200.** Keep it; a host sets its own through its store.
6. **Selection in a saved image.** Not yet, matching the card's ring.
