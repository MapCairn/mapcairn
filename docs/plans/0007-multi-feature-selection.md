# 0007: Multi-feature selection

Status: proposed. Tracking issue: [#49](https://github.com/MapCairn/mapcairn/issues/49).

## Goal

A person can pick several features, see them marked on the map, count them and act on them: list them, remove one, clear all, zoom to them, and select what lies inside a shape they drew. A host can keep the set wherever it likes, such as on a server, by supplying its own store.

## Ground rules

- **A selected set is not the open card.** `useDataLayers` already has `selection`, the feature whose card is open, and `ARCHITECTURE.md` "Data layers" calls it "Selection". That is unchanged and the bullet becomes "Open card". The new concept is the selected set: port `FeatureSelection`, hook `useFeatureSelection`.
- **SDK first.** This assumes the reference site does not offer selection, pending open question 1 (`ROADMAP.md` reserves that decision to the maintainer). The example app shows it and e2e reaches it through the test seam. Behaviour on the site is unchanged, but the production bundle then carries the unused selection code (the host's hook, the highlights and the panel); step 3 measures its size and, if it matters, loads it lazily.
- The port is optional. The set is never written to the permalink and never stored by the SDK. Every gesture has a keyboard or single-tap equivalent, and highlights use tokens and a second signal beside colour. No new dependency.

## Design

### The port (`packages/core`)

```ts
type FeatureRef = MapFeatureHit;  // layerId and featureId; an alias, not a copy
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

- **Synchronous.** `useSyncExternalStore` needs a synchronous snapshot with a stable identity, so the state has no loading or failed status. A host that persists asynchronously keeps a local copy, writes behind it and notifies when it changes or hydrates; if a save fails it restores the copy and notifies. An async port was rejected: every tap would wait on input and output. As in plan 0005, `getState()` is the server snapshot, so a store starts empty and hydrates after the first subscription. The panel shows no loading state, so a late hydration never flashes "0 selected".
- **Rules for every implementation.** Duplicates are ignored; each call notifies once and a no-op not at all; a call that would take the total past `limit` changes nothing, so a batch is refused whole, as an import past `MAX_DRAWING_SHAPES` is. A store that hydrates with more than `limit` references is allowed: the count shows them all, only additions are refused, and removing is always allowed.
- **One class, `MemoryFeatureSelection({ limit })`** (default `DEFAULT_SELECTION_LIMIT`, 200), as `MemorySettingsStore` is both the SDK's store and its fake. It adds `replaceExternally(refs)` to script a change from outside, such as hydration or a failed save. A host's own store is the second implementation. One contract suite runs against the class.
- **Ripple, step 1.** `Services.selection?`, `PORT_NAMES`, `OPTIONAL_PORT_NAMES`, `PortContractRunners`, `PORT_REGISTRY`, `createFakeServices` and `FakeServiceHandles` (the fake is included by default, as routing's is; nothing renders until a host passes the hook), `SERVICE_KEYS` in `testSeam.ts`, a hook in `services/hooks.ts`, the `fakes/index.ts` and `contracts/index.ts` barrels and the `packages/map` README's "typed hook per service" line. `createServices()` builds none, so the reference root supplies no store. The smaller ripple is two edits: `ports.coverage.test.ts` and `createServices.test.ts` skip a new `HOST_SUPPLIED_PORT_NAMES` (`selection`, and later `featureQuery`), and the JSDoc of `OPTIONAL_PORT_NAMES` is corrected, since it says the root builds none of the optional ports, which is wrong today. An inert store in `createServices()` was rejected as dead code in production.

### What can be selected

A layer is selectable when `isFeedLayer` is true: it has cards, and `featureTap` hits (`MapFeatureHit`) are feed layers' features. Heatmap, vector tile and raster layers are not (#47 may change raster). The decoder gives a feature with no usable id its list position (`decoders.ts`), which is not stable across loads, so there is no check. The guide tells hosts to supply real ids.

### The hook, and who owns it

`useFeatureSelection(layers)` holds React state (the select-mode flag, session snapshots, announcements), and its consumers sit in places that unmount (the sheet's sections), so it is called once by the host beside `useDataLayers` (`useMapApp.ts` and `ExampleApp.tsx`), returns null when `Services.selection` is absent, and is handed down through a small `SelectionProvider`. Consumers call `useSelection()`, which is undefined without it, and render nothing then: `SheetContent` (the panel), `LayerItem` and `FeatureCard` and `FeatureChoices` (toggles), `MapDataLayers` (taps), `ShapesSection` (the shape button) and `SelectionHighlights`. No prop is added to any of them. The `I` key (`identifyAtCentre`) and `ignoreTaps` are web host code and change there.

- **Resolving.** A reference shows its layer's current feature when that layer is on and has it loaded, else a snapshot kept this session (taken when selected, refreshed when the layer next lists it), as the open card does for a query layer. Otherwise it is "not shown": it stays in the store and counts, and the panel says "2 selected features are not shown because their layers are off or still loading".
- **Turning a layer off drops nothing.** References to it become "not shown", as at page load, and #103's Undo brings them back. Dropping would write to a host store unasked and Undo could not restore it. A reference is dropped only when its layer is removed from a ready catalogue (step 9). That is open question 2.
- **Titles.** The card title template moves out of `FeatureChoices` into one `featureTitle` helper the panel shares.

### Ways to select

- **Select mode, not a surface.** A switch in the panel turns it on. While on, a tap that finds one feature toggles it and does not open the Layers sheet; a tap that finds several opens `FeatureChoices` and the sheet, as now, and its rows and the layer's list rows toggle (`aria-pressed`) instead of opening cards. `tapHits(hits)` on the hook returns whether it consumed the hits, and `MapDataLayers` and `identifyAtCentre` both call it, so the tap and the `I` key follow one route, and neither calls `onFeatureTap` after a toggle. Outside the mode, `FeatureCard` has a "Select" toggle, the single-tap equivalent. The mode ends when the switch goes off or measure, draw or directions opens. A touch screen has no cursor, so while the mode is on a status line, "Selecting on the map. 3 selected.", with a Done button, shows in the bottom-centre slot with the toasts and the tile-error banner, and the layout collision test gains that state. A surface in `core/surface` was rejected as costlier than a flag and a status line.
- **A drawn shape.** `ShapesSection` gains "Select features inside" for the selected polygon or circle (`shapeGeometry` gives a circle's ring); a point or line has no inside and the button says so. It calls an optional host function, a port of its own so the store stays synchronous:

```ts
interface FeatureQuery {
  within(request: { area: Polygon; layerIds: readonly string[]; limit: number;
                    signal?: AbortSignal }): Promise<readonly SelectionHit[]>;
}
interface SelectionHit { layerId: string; feature: LayerFeature }  // doubles as the snapshot
```

  `Services.featureQuery?` rejects only with a typed `FeatureQueryError` (`network`, `invalid`, `aborted`), has a fake and an exported contract, and is in `HOST_SUPPLIED_PORT_NAMES`. `layerIds` are the selectable layers that are on and `limit` is the room left plus one, so the host stops early and the ui can say more exist, as a query layer does with `{limit}`. One request is in flight, with Cancel; failure offers Try again. It is aborted when the shape is edited or deleted or the set or the layers change. The SDK sends nothing itself.

### Highlight

`SelectionHighlights`, a new module beside the hook, draws in the existing overlay and leaves `MapDataLayers.tsx` and its private `outlinePath` alone. It places marks with `usePlacement`, `placePoint` and `placePath`, as `DrawOverlay` does, so the nearest copy of the world, great-circle curves and the horizon cut all apply. This departs from the issue's "through the adapter and overlay": the adapter is used only for placement, so no port change, second adapter or contract is needed, and it does not wait on #24.

- **Cost.** Up to 200 features are drawn, each outline thinned to a lower cap than `MAX_OUTLINE_POINTS`, and only features whose bounds meet the view are drawn. A test with 200 polygons counts the nodes it renders.
- **Two signals.** A point gets a ring and a check badge. A line or polygon gets a dashed, halo-backed outline, where the open card's ring is solid, and a badge at the placed vertex nearest the view centre, so it is on screen whenever any vertex is; with none in view the outline alone is drawn. The shapes differ, so colour is never the only signal.
- **Contrast.** Existing `mapOverlayTokens`; a unit test checks ring against halo in both themes. It cannot check imagery, so the visual check does, over Bright, Satellite and Dark. A saved image omits the highlight, as it omits the card's ring.

### The panel and announcements

`SelectionSection`, a region named "Selection", is a new `SheetSection` in the Map options sheet after Layers, so it adds no floating element. It holds the select-mode switch, the count against the limit, a list of buttons that centre each feature with a Remove button each, "Zoom to selection" (`fitBounds`, `fitPadding`, `FIT_MAX_ZOOM`, as import does), "Clear selection" and the not-shown line.

One message per transition, built from the store after the call and sent through `LiveRegion`: "Added Gauge 4. 5 selected.", "12 features inside Polygon 1 added. 17 selected.", "Selection cleared.", "The selection holds 200 at most. Nothing was added." Each carries the total, so when the announcer's 600 ms throttle replaces a message the next is still true.

## Tests

Under each step, written first and seen failing. Each UI step also has its own Playwright spec, axe run and screenshots at three sizes, in both themes, over Bright, Satellite and Dark.

## Order of work

Steps 1 to 4 touch none of `useDataLayers`, `MapDataLayers`, `LayersSection` or `SheetContent`. Steps 5 and 6 edit files that PR #103 and PR #100 also change, so they wait for both. Step 9 waits for plan 0005 step 2. Plan 0005 and this plan both rewrite `PORT_REGISTRY`, `createFakeServices`, `useLayers()` and `SERVICE_KEYS`; the conflicts are textual and the plan that lands second resolves them.

1. **Port, memory class, ripple.** Tests: the contract (identity, one notification and none for a no-op, order, duplicates, past-limit refusal, hydration over the limit, `replace`, unsubscribe); the coverage tests with `HOST_SUPPLIED_PORT_NAMES`.
2. **Hook, provider, messages.** Tests: fresh, snapshot and not-shown references; toggle, add, remove, clear, limit; off drops nothing; every message through the real `createAnnouncer` with a clock, including three quick toggles and one arriving after #103's "3 layers turned off"; `featureTitle`, `FeatureChoices` unchanged.
3. **Host wiring and seam.** `useMapApp.ts`, `App.tsx` and `ExampleApp.tsx` call the hook and mount the provider only when a store exists; an in-page helper in `e2e/support/services.ts` scripts a store and a query through the seam. Tests: nothing visible changes without a store; the bundle check still passes; bundle size reported.
4. **`SelectionHighlights`.** Tests: marks per geometry, none beyond a globe's horizon, the 200 case, token contrast; e2e, axe, screenshots.
5. **Panel,** after #103. Tests: each state, names, keyboard order, focus after Remove and Clear, the new `SheetSection`; Playwright, axe, screenshots.
6. **Select mode and toggles,** after #100 and #103. Tests: one hit toggles without opening the sheet, several open choices, the `I` key, the mode ends when a tool opens, the status line and its layout collision case; Playwright, axe, screenshots.
7. **`FeatureQuery` port.** Tests: contract (abort, limit plus one, named layers only) and the ripple.
8. **Select inside a shape,** with the guide. Tests: enabled for polygon and circle, disabled with a reason otherwise, Cancel, Try again, abort on edit, over-room refusal, one message; Playwright, axe, screenshots.
9. **A layer removed from the catalogue,** after plan 0005 step 2. Tests: its references are dropped once, in one message, and never at mount or while loading.

## Documents to update

- `ARCHITECTURE.md`: the Ports rows (steps 1, 7), "Data layers" (the "Open card" rename and a selected-set bullet, step 2), the highlight (step 4).
- `DESIGN.md`: a `SelectionSection` row, the status line, gesture equivalents and any token (steps 4, 5, 6, 8).
- `docs/guides/extending.md` (step 8): a store, a query, real ids, and that a host which persists a set or sends a shape to a server tells its visitors. The `core` and `map` READMEs with the first step that changes what they offer. `ROADMAP.md`: in progress from step 1. `PRIVACY.md`: none.

## Risks

- **A forgotten select mode:** the status line with Done; promote it to a surface if the visual check shows people miss it.

## Decided and open

Decided in this plan, 2026-11-12: a synchronous store with a limit and a refused-whole rule, because the hook needs a stable snapshot; the shape query a separate optional port, so the store stays synchronous; one hook called by the host and provided by context, because its state outlives the sheet; a flag and a status line, not a surface; overlay highlighting with core's placement, with no adapter change; feed layers only.

Open, each with a recommendation:

1. **Does the reference site offer selection?** No: its public layers give nothing to act on, and `ROADMAP.md` requires a decision.
2. **Drop references when a layer is turned off?** No, keep them "not shown", for the reasons above.
3. **Should a stored reference carry a label and position?** No, references only, as the issue says; a persisted set shows no titles until its layers load.
4. **The default limit of 200.** Keep it; a host sets its own through its store.
5. **Not now:** a search over loaded features for hosts with no query, select mode as a surface with a toolbar, and the selection in a saved image.
