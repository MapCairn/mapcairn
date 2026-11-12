# 0005: Runtime layer catalogue

Status: proposed. Tracking issue: [#46](https://github.com/MapCairn/mapcairn/issues/46).

## Goal

A host can supply its layers when the page runs, and differently for each person, instead of as files collected at build time. The Layers section says when the list is loading, empty, failed or refreshed, a link that names a layer waits for the list instead of losing it, one bad definition costs one layer and not the list, and a host that serves its own data has a guide to what to serve. The reference site keeps its static definitions and shows no change.

## Ground rules

- The SDK stays host-agnostic. It never fetches the catalogue: the host writes a `load` function, so it also owns credentials (#45). The SDK owns the state, the validation and the ui.
- No timer and no polling (`ROADMAP.md`). A refresh happens only when the host calls `refresh()` or a person presses Try again after a failure.
- Definitions stay plain JSON-shaped data, so they can cross the network. Nothing branches on a layer id. Every definition passes the checks that exist now (https only, template variables, registered decoders and formatters, colour never the only signal).
- Server rendering stays correct: the static catalogue is ready on the first render on the server and the client.
- Steps that touch `useDataLayers` come after PR #88, which splits its load effect into `loadRequests`, `loadOutcome` and `loadReport`. No `MapAdapter` method changes, so the plan does not wait for the adapter split (#24, #90).

## Design

### The port (`packages/core`)

`LayerRegistry` is renamed `LayerCatalogue` and becomes a small store `useSyncExternalStore` can read:

```ts
interface LayerCatalogue {
  getState(): CatalogueState;   // the same object until something changes
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;     // never rejects; the outcome is in the state
}
type CatalogueState =
  | { status: "loading" }
  | { status: "failed"; reason: "network" | "invalid" }
  | { status: "ready"; layers: readonly LayerDefinition[];
      skipped: readonly SkippedDefinition[];
      refresh: "idle" | "loading" | "failed" };
interface SkippedDefinition { id?: string; problems: readonly string[] }
```

- Empty is `ready` with no layers. `invalid` means the payload was not a list; #45 adds `unauthorised`. A failed refresh keeps the last list and sets `refresh: "failed"`.
- **How it differs from `BasemapCatalogue`.** That one is plain data with `get` and `resolve`, one shape and no second implementation, so it is not a port. `LayerCatalogue` is a port: its state changes over time, it has a subscription and three implementations.
- **Implementations, under one contract suite.** `createStaticLayerCatalogue(definitions, options)` is today's `createLayerRegistry`. It throws at start-up on any problem, which is right for definitions in the build, and is `ready` from the first call. `emptyLayerRegistry` becomes `emptyLayerCatalogue`. `createRuntimeLayerCatalogue({ load, options, onSkipped })` takes the host's `load(signal)`, which resolves to `unknown[]`, and starts `loading`. `FakeLayerCatalogue` is scripted.
- **Runtime subscription rules.** The load starts on the first subscription, never at construction, so never on the server, and runs once: StrictMode's subscribe, unsubscribe, subscribe makes one request. The signal passed to `load` is aborted only by an explicit `dispose()` on host teardown, and an aborted load's result is ignored. A second `refresh()` returns the pending promise. `getState()` is also the server snapshot: the static catalogue renders its layers on the server and a runtime one renders `loading` there and before its first subscription, so hydration matches.
- **Partitioned validation.** `partitionDefinitions(raw, options)` returns the valid definitions and a `SkippedDefinition` for each other value, using `validateLayerDefinition` as it is. A duplicate id keeps the first. A non-object is skipped with no id. It reuses the previous definition object when a new one is deeply equal, so a refresh that changes nothing redraws nothing. The static path keeps `assertValidDefinitions`, so the loop test in `packages/web/src/layers/layers.test.ts` is unchanged. `onSkipped` is the host's way to log the reasons; a person sees only a count.
- **Refresh and change.** A refreshed definition replaces the old one under its id. The host already writes each tile or feed URL, so it puts a version in the URL when its data changes and the layer's request or tile source changes with it. No revision field, template variable, `LayerSource` change or contract change is needed. A `MapAdapter.invalidateTiles` method was rejected for the same reason.
- **Breaking change.** `Services.layers` keeps its key and takes a `LayerCatalogue`, so a hand-built registry stops compiling. This is accepted before publication (#1) and lands as `feat(core)!:` with a `BREAKING CHANGE:` note. The ripple (`PORT_REGISTRY`, `createFakeServices`, `useLayers()`, `createServices()`, the example app) is all in step 1. No shim is kept.

### The hook and the section (`packages/map`)

- `useDataLayers` keeps the link as given (`pending`: ids and raw control strings) apart from the layers that are on. A pure `reconcile` in `catalogueReconcile.ts`, beside `loadRequests.ts`, turns the state and the previous and next layers into the new state and one message.
- **Link.** Today `initialState` drops any id unknown at mount. Now the ids wait. Nothing can be turned on before the first `ready`, so pending never exceeds the link's own cap of 20 (`MAX_LAYERS`). On `ready`, a pending id found in the catalogue is turned on with its controls resolved by `resolveControlValues`. One not found, or not allowed to this person (worded the same), is dropped for good, and a later refresh does not bring it back. While `loading` or `failed` the ids stay and `urlValue` keeps them, because the address is written on the first render. Dropping rewrites the address at once, so a host must reject `load` (`failed`) when a session has expired, not resolve with an empty list.
- **The reference site.** It drops unknown link ids silently today. The link note is made only for an async catalogue, one whose first state was not `ready`, so the site is unchanged. The same rule keeps the section hidden for a host with no layers.
- **A layer that goes.** A refresh that removes an enabled layer turns it off as `setEnabled(id, false)` does: it aborts the request and clears features, selection, choices and affected area. A changed definition keeps the controls that are still valid and takes the default for the rest.
- **Section states.** Loading ("Loading layers", `aria-busy`); failed (icon, "Layers could not be loaded.", Try again); empty ("No layers are available."); a line "1 layer could not be shown" or "N layers could not be shown"; and, when a refresh failed, "Layers could not be updated. Showing the last list." with Try again. Only the host calls `refresh()` otherwise; there is no general refresh button. `DataLayers` gains `catalogue` (status, skipped count, refresh state) and `retryCatalogue()`. An optional `intro` prop replaces "Open data from public providers", which is wrong for a host behind a login; its default is today's text.
- **Announcements.** The announcer keeps one message per priority and coalesces a burst within 600 ms (`THROTTLE_MS`), so each catalogue transition produces one composed message, in this order: layers turned off ("Rainfall is no longer available and was turned off."), link note ("1 layer in the link is not available."), skipped count, then "Layers updated: 1 added, 1 removed." A failed load is its own assertive message. "Loading layers" is said only when a link layer is waiting.
- **Redraw.** `draw()` in `MapDataLayers.tsx` redraws a feed when its features change, a heatmap or vector layer when its controls change, and a raster layer when its URL changes. A replaced definition with the same URL and controls (a new style, vector tile URL or heatmap setting) would keep the old drawing. The `Drawn` record gains the definition, compared by identity for every kind, which `partitionDefinitions`' reuse makes cheap.

### Host metadata and the guide

The pieces exist: `steps` and `intervals` colour rules take class breaks, the legend comes from the style, and `FieldMap` and the templates read fields by dotted path. The sample mapper in `examples/embed` shows the route through public entry points only.

`docs/guides/serving-layers.md`, "Serving layers to MapCairn", names formats and what each costs the server: XYZ raster tiles for dense drawings (cheap once cached, no tap results without #47); vector tiles (MVT) where a generator exists (smaller, styled in the browser, not tappable, needs a generator and cache); GeoJSON by bounding box (a query layer with `{west}`, `{south}`, `{east}` and `{north}`, `{limit}` and `maxFeatures`) for small layers (simplest, the only kind with cards, list and selection, but each pan is a request, so it needs a spatial index and a cap). It also covers the per-person catalogue endpoint, a version in the URL when data changes, https URLs whose origins the host page's content security policy allows, and that the loop test covers only static definitions.

## Tests

Listed under each step below.

## Order of work

Step 1 comes first. Steps 2 to 4 follow it, after #88. Steps 5 and 6 need only step 1 and are independent of the rest. Each is one pull request with a green build; tests are written first and shown failing.

1. **Port, implementations, `partitionDefinitions`, ripple.** Tests: the contract suite for all three catalogues (state identity, subscribe, a listener per change, `refresh` never rejects, unique ids); runtime loading, ready, empty and failed; no `load` before a subscriber; one load under StrictMode; an aborted load ignored; one request in flight; `partitionDefinitions` with a bad definition among good ones, a duplicate id, a non-object, equal definitions reusing the old object, and a property test that it never throws; the static catalogue still throws; `renderToString` shows layers for static and loading for runtime, without a hydration mismatch; the reference site's tests and e2e pass unchanged. `ARCHITECTURE.md` gets the Ports row and the sentence on `BasemapCatalogue`.
2. **Link and disappearing layers.** Tests: a link layer waits while loading and is on after `ready`, controls clamped; `urlValue` keeps pending ids while loading and failed, and `useViewPersistence` does not rewrite the address; a missing id is dropped and stays dropped after a refresh; pending plus enabled stays within 20; a removed enabled layer is aborted and cleared; a changed definition keeps valid controls; a static catalogue drops unknown ids silently as now; Try again from `failed` resolves the waiting ids; and a load a refresh replaced is not announced (#81).
3. **Section states, refresh failure and announcements.** Tests: `LayersSection` in each state with its accessible names and focus after Try again; the composed message for each combination, run through the real announcer (`createAnnouncer`) with a clock, not a mock, asserting one message in the right order; singular and plural; a failed refresh keeps the list and shows its line; axe in both themes. Playwright reaches a scripted catalogue through the existing test seam (`ARCHITECTURE.md`, "How tests substitute services"), which takes plain data, a list of states and a delay, and builds a runtime catalogue from it. It is compiled out of production, and the production-bundle check searches for it. Cases: loading then ready, failed then Try again, empty, a waiting link layer, a refresh that removes a layer. Screenshots at phone, tablet and desktop in both themes.
4. **Replaced definitions redraw.** Tests: one `MapDataLayers` test for each kind (feed, heatmap, vector tiles, raster) where the definition is replaced with the same URL and controls and the adapter is called again, and one where nothing changed and it is not; a changed tile URL still redraws once.
5. **Sample mapper in the example app.** Tests: a sample server payload becomes the expected definitions; a field list it cannot map is skipped with a reason; `ExampleApp.test.tsx` shows the layer; the manifest check passes. A helper moves into core only if the sample repeats logic.
6. **The serving guide.** Docs only; links checked from `README.md` and `docs/guides/extending.md`.

## Documents to update

- `ARCHITECTURE.md`: the Ports table, "Data layers" (states, link, disappearing layers) and the test seam, in steps 1 to 3.
- `DESIGN.md`: the `LayersSection` row and a catalogue status row, in step 3.
- `docs/guides/extending.md` (supplying layers at runtime, step 5), `docs/guides/serving-layers.md` (step 6), and `README.md` and the `core` and `map` READMEs with the first step that changes what they offer.
- `PRIVACY.md`: none; the reference site makes no new request.

## Risks

- **Untrusted URLs.** A server's definitions name URLs the browser fetches. Validation requires https and declared detail origins, and the host's content security policy is the backstop.
- **Link layers lost** on the first address write: covered by step 2's first failing test.

## Decided and open

Decided on 2026-11-12 by the maintainer:

1. Rename `LayerRegistry` to `LayerCatalogue` and `emptyLayerRegistry` to `emptyLayerCatalogue`, and break hand-built registries now.
2. No core mapping helpers until the sample mapper shows repeated logic.
3. Show "N layers could not be shown", singular included, in the one composed announcement.
4. A link layer dropped after load stays dropped on later refreshes.

Decided in this plan: one port with the static catalogue as an implementation; validation in core, fetching in the host; refresh is the host's call and a replaced definition is the change signal.

Open: none. Related work: #62 would extend this port with runtime and dependent options and is not designed here. #45 adds the `unauthorised` failure and its wording, and must reject `load` so link ids stay pending. #47 adds an `identify` source that `partitionDefinitions` validates with the rest. #49 drops a selection on a vanished layer through step 2's path.
