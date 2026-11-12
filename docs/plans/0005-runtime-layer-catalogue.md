# 0005: Runtime layer catalogue

Status: proposed. Tracking issue: [#46](https://github.com/MapCairn/mapcairn/issues/46).

## Goal

A host can supply its layers when the page runs, and differently for each person, instead of as files collected at build time. The Layers section says when the list is loading, empty, failed or refreshed, a link that names a layer waits for the list instead of losing it, one bad definition costs one layer and not the list, and a host that serves its own data has a guide to what to serve. The reference site keeps its static definitions and shows no change.

## Ground rules

- The SDK stays host-agnostic. It never fetches the catalogue: the host writes a `load` function (so it also owns credentials, which is #45) and the SDK owns the state, the validation and the ui.
- No timer and no polling. `ROADMAP.md` rules out live refresh. A refresh happens only when the host or a person asks for one.
- Definitions stay plain JSON-shaped data with no functions, so they can cross the network. Nothing branches on a layer id.
- Every definition is validated when it arrives, with the checks that exist now (https only, template variables, decoders and formatters registered, colour never the only signal).
- Server rendering stays correct: the static catalogue is ready on the first render on the server and the client, so the reference site has no loading flash and no hydration mismatch.
- Every step that touches `useDataLayers` (1, 3, 4 and 5) comes after PR #88 merges. It splits the load effect into `loadRequests`, `loadOutcome` and `loadReport`, and this plan builds on them. The plan changes no `MapAdapter` method, so it does not wait for the adapter split (#24, #90).
- Every state is announced once through `LiveRegion`, keyboard reachable, and confirmed by eye with screenshots at three sizes in both themes.

## Design

### The port (`packages/core`)

`LayerRegistry` (`list()`) becomes `LayerCatalogue`, a small store that `useSyncExternalStore` can read:

```ts
interface LayerCatalogue {
  getState(): CatalogueState;          // same object until something changes
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;            // never rejects; the outcome is in the state
}
type CatalogueState =
  | { status: "loading" }
  | { status: "failed"; reason: CatalogueFailure }
  | { status: "ready"; layers: readonly CatalogueLayer[];
      skipped: readonly SkippedDefinition[];
      refresh: "idle" | "loading" | "failed" };
interface CatalogueLayer { definition: LayerDefinition; revision?: string }
interface SkippedDefinition { id?: string; problems: readonly string[] }
```

- Empty is `ready` with no layers. `failed` carries a reason of `network` or `invalid` (the payload was not a list); #45 adds `unauthorised`. A refresh that fails keeps the last list and sets `refresh: "failed"`; the list is never blanked by a refresh.
- **Three implementations.** `createStaticLayerCatalogue(definitions, options)` is today's `createLayerRegistry`: it throws at start-up on any problem, which is right for definitions that ship in the build, and is `ready` from the first call. `createRuntimeLayerCatalogue({ load, options, onSkipped })` takes the host's `load(signal)`, which resolves to `{ definition: unknown; revision?: string }[]`; it starts in `loading`, calls `load` on the first subscription (never at construction, so never on the server), keeps one request in flight and returns the pending promise to a second `refresh()`. `FakeLayerCatalogue` is scripted: set a state, push a change. All three pass one contract suite (state identity, subscribe and unsubscribe, listener on each change, `refresh` never rejects, unique ids, `getState` stable between changes). `emptyLayerRegistry` stays, as a static catalogue of nothing.
- **Partitioned validation.** `partitionDefinitions(raw, options)` in core returns the valid definitions and a `SkippedDefinition` for each of the others, using `validateLayerDefinition` as it is. A duplicate id keeps the first and skips the later ones. A value that is not an object is skipped with no id. Only the static path calls `assertValidDefinitions`, so the loop test in `packages/web/src/layers/layers.test.ts` and failing at start-up are unchanged. `onSkipped` is how the host reports problems (its own error log); the SDK shows a person only the count.
- **Change signal.** A definition that changes is replaced under its id. A `revision` on the entry, which the host sets to anything that changes when its data does, reaches the layer as the built-in template variable `{revision}` (reserved, empty when unset, refused as a control or variable id). A host puts it in a tile URL, so the template string changes and `setTileLayer` already draws a new source; a feed's request key includes it, so an enabled feed loads again. The adapter and its contract suite are untouched. Rejected: a `MapAdapter.invalidateTiles(id)` method, which would cost an adapter method, a fake and a contract case to say what a changed URL already says.
- **Ripple.** `Services.layers` keeps its key and takes a `LayerCatalogue`. This breaks an SDK consumer that built a registry by hand, which is acceptable before the packages are published (#1). It touches `PORT_NAMES`, `PORT_REGISTRY`, `createFakeServices`, `useLayers()`, `createServices()`, the example app and several tests, all in step 1. A `LayerRegistry` adapter shim is not kept: it would be a second path for nothing.

### The hook (`packages/map`)

- `useDataLayers` reads the catalogue with `useSyncExternalStore` and keeps three things apart: the permalink as given (`pending`: ids and raw control strings), the layers that are on (`enabled`, resolved against a definition) and the catalogue state. A pure `reconcile` function in `catalogueReconcile.ts` beside `loadRequests.ts` turns "state, previous layers, next layers" into the new state plus the notes to say.
- **Permalink.** Today `initialState` drops any id not known at mount, and controls are resolved only for known layers. Now ids from the link wait in `pending`. When the catalogue is `ready`, a pending id found in it is turned on and its controls resolved by `resolveControlValues`; an id not found, or not allowed to this person (the catalogue is already per person, so the two look the same and are worded the same) is dropped and named once: "2 layers in the link are not available." While `loading` or `failed` the ids stay, and `urlValue` keeps them, because `useViewPersistence` writes the address on the first render and would otherwise erase them. A later refresh does not bring a dropped id back.
- **A layer that goes.** A refresh that removes an enabled layer turns it off as `setEnabled(id, false)` does (aborts its request, clears its features, selection, choices and affected area) and announces once, politely, with its name from the previous list: "Rainfall is no longer available and was turned off." Several in one refresh are one announcement. A layer whose definition changed keeps its controls where they are still valid and falls back to the default where not, then loads if its request key changed. A load that a refresh replaced is not announced; that is the bug in #81 and is fixed there or here, whichever lands first.
- **Section states.** `DataLayers` gains `catalogue` (status, skipped count, refresh state) and `reloadCatalogue()`. `LayersSection` renders: loading ("Loading layers", `aria-busy`), failed (an icon, "Layers could not be loaded." and Try again, which is `refresh()`), empty ("No layers are available."), a plain "N layers could not be shown" line when any were skipped, and "Updating layers" while a refresh runs. The section stays hidden for a catalogue whose first state was `ready` and empty (a host with no layers, as now). Announcements, each once per entry into the state: failed (assertive), empty, refreshed with a change ("Layers updated: 1 added, 1 removed"), skipped, link notes (polite), and "Loading layers" only when a layer from the link is waiting, so a host whose list always loads is not noisy on every page. The section's intro line says "Open data from public providers", which is wrong for a host behind a login, so it becomes an optional `intro` prop with today's text as the default, as the privacy note is.

### Mapping host metadata

Most of the route exists: a `steps` or `intervals` colour rule takes class breaks, the legend is derived from the style, `FieldMap` and the card and list templates take fields by dotted path, and `filter` splits a feed by one field. What is missing is the documented path and a worked sample, so step 6 writes the sample first (`examples/embed/src/serverLayers.ts`, through the public entry points, on the fakes, with a scripted `load` that answers after a delay) and moves into core only the logic the sample would repeat. Host code stays host code. The mapper's output goes through `partitionDefinitions`, so a field list it cannot map becomes a skipped definition with a reason.

### The serving guide (`docs/guides/serving-layers.md`)

"Serving layers to MapCairn", with the cost to the server of each:

- **Raster tiles** (XYZ, 256 px, `{z}/{x}/{y}`) for dense drawings: cheap to serve once cached, nothing per feature reaches the browser, no tap results unless #47 lands, and a change shows when `{revision}` changes.
- **Vector tiles** (MVT) where a tile generator exists: smaller than raster and styled in the browser, but features are not tappable and a generator and its cache must run.
- **GeoJSON by bounding box** (a query layer with `{west}`, `{south}`, `{east}` and `{north}`, `{limit}` and a `maxFeatures` cap) for layers small enough to send as features: the simplest to serve and the only kind with cards, a list and selection, but each pan is a request, so it needs a spatial index and a cap.
- The catalogue endpoint: what it returns, per person; that its origins must be allowed by the host page's content security policy; that every URL must be `https`; and that the definition loop test and the credits check in `packages/web` cover only static definitions, so a catalogue host checks its own.

## Tests

Each group is written first and shown failing, then made to pass, in the step in brackets.

1. (1) Contract suite for the static, runtime and fake catalogues. Runtime: loading, ready, empty, failed and refresh; one request in flight; no `load` before a subscriber and none on the server; a failed refresh keeps the list. `createStaticLayerCatalogue` still throws on a bad definition. `createFakeServices`, `PORT_REGISTRY` and the coverage test list the port. The reference site's tests and e2e are unchanged and pass.
2. (2) `partitionDefinitions`: one bad definition among several is skipped with its path and message, a duplicate id, a non-object, an empty list, and property tests that it never throws on any JSON. `{revision}` is accepted in templates and refused as an id.
3. (3) `reconcile` and the hook: a link layer waits while loading and is on after ready, controls resolved and clamped; `urlValue` keeps pending ids while loading and failed and the address is not rewritten (a test on `useViewPersistence`); a missing id is dropped and named once; a removed enabled layer is aborted, cleared and announced once, several as one; a changed definition keeps valid controls; a refresh never announces a load it replaced.
4. (4) `LayersSection` in each state, with accessible names, focus after Try again, the live-region text once per entry, and axe in both themes. Playwright with a scripted `load` (through the test seam): loading, then ready; failed then Try again; empty; a link with a layer that waits; a refresh that removes a layer. Screenshots at phone, tablet and desktop in both themes.
5. (5) `{revision}` changes a tile layer's source and a feed's request key; a changed revision reloads an enabled feed once; `refresh()` from the failed state resolves waiting link layers.
6. (6) The example app's mapper: a sample server payload becomes the expected definitions; a bad field list is skipped; `ExampleApp.test.tsx` shows the layer, and the manifest check still passes.
7. (7) Documentation only: a link check, and `README.md` and the guides link to it.

## Order of work

1. The port, the static, runtime and fake implementations, the contract suite and the ripple through `Services`, with the reference site unchanged. The hook changes only where it reads the list.
2. `partitionDefinitions`, the `{revision}` variable and the reserved id.
3. Pending permalink resolution and disappearing layers in `useDataLayers` (after #88).
4. Section states and announcements.
5. Refresh from the ui and `{revision}` reaching tiles and feeds.
6. The example app's sample mapper, and any helper it proves worth moving into core.
7. The serving guide.

Each step is one pull request with a green build. Steps 2, 6 and 7 do not depend on each other.

## Documents to update

- `ARCHITECTURE.md`: the Ports table (`LayerCatalogue`, its three implementations) and "Data layers" (states, permalink, disappearing layers, `{revision}`), in steps 1 to 5.
- `DESIGN.md`: the `LayersSection` row and a catalogue status row, in step 4.
- `docs/guides/extending.md`: supplying layers at runtime, in step 6; `docs/guides/serving-layers.md` is new, in step 7; `README.md` and the package READMEs for `core` and `map`, with the first step that changes what they offer.
- `ROADMAP.md`: the refresh line stays, and says refresh is on request.
- `PRIVACY.md`: none. The reference site makes no new request.

## Risks

- **Link layers lost.** The address is written on the first render. Contained by keeping pending ids in `urlValue`, with a test that fails first.
- **Announcement noise.** Loading is announced only when a link layer waits; every state once per entry.
- **Untrusted URLs.** Definitions from a server name URLs the browser fetches. Validation requires https and declared detail origins, and the host's content security policy is the backstop; the guide says so.
- **Stale tiles.** A host that never changes `{revision}` or the URL gets cached tiles. The guide says what to change.
- **The `Services.layers` type change** breaks hand-built registries: cheap now, dearer after publishing.

## Decided and open

Decided on 2026-11-12 for this plan:

- One port, `LayerCatalogue`, with the static registry as an implementation, not a second optional port: one path in the hook is cheaper to keep than two.
- Validation and skipping live in core; fetching lives in the host.
- A change signal is a `{revision}` variable, not a new adapter method.
- No timer. Refresh is on request.

Open, each with a recommendation:

1. **Name and breaking change.** Rename `LayerRegistry` to `LayerCatalogue` and break hand-built registries before publication (recommended, a `!` commit), or keep the name and add the async members. Keeping the name is less churn now and a worse name for good.
2. **Core mapping helpers.** Write none until the sample mapper shows repeated logic (recommended); the alternative is a documented set of helpers up front, which risks building the wrong ones.
3. **Skipped layers shown to a person.** Show "N layers could not be shown" (recommended: a person with a short list should know it is short); the alternative is silence, with the reasons to the host only.
4. **Dropped link layers after a refresh.** A dropped id stays dropped (recommended, predictable); the alternative keeps a list of them for the session so a later refresh can restore them, at the cost of a hidden state.
5. **Related work.** #62 adds options loaded at runtime and dependent options, which would extend this port with a call per control, and is not designed here. #45 adds the `unauthorised` failure and its wording. #47 adds an `identify` source that `partitionDefinitions` validates with the rest, and #49 drops a selection on a layer that disappears through the same path as step 3. Each plan should say how it meets these.
