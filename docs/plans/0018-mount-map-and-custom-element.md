# 0018: A mount function, a prebuilt browser bundle and a custom element

Status: proposed. Tracking issues: [#44](https://github.com/MapCairn/mapcairn/issues/44) (the mount function and the bundle) and [#675](https://github.com/MapCairn/mapcairn/issues/675) (the custom element), both under [#51](https://github.com/MapCairn/mapcairn/issues/51). The aim is to ship them in the `0.3.0` SDK release.

## Goal

A page with no React and no build step adds one script tag and one link tag and gets a map: `mountMap(element, options)` returns a handle with `setView`, `on` and `destroy`. A page on Vue, Svelte, Solid, Angular or plain HTML gets the same thing as `<mapcairn-map>`, with services passed as properties and events as `CustomEvent`s. Neither needs React installed, several maps work on one page, and the code does nothing on a server. Everything here is added: no existing export, message key or stored value changes.

## Ground rules

- `AGENTS.md`: ports and adapters, no module-level services, no layer or provider id in a branch, tokens only, the SDK packages carry nothing that needs a licence agreement of their own, a new runtime dependency in an SDK package is the maintainer's call. This plan adds none: React, React DOM, MapLibre GL JS and the other bundled code are already production dependencies or required peers of the packages that are bundled, and `npm run licence:sdk` already judges them there.
- The accessibility contract in `DESIGN.md` ("Components and accessibility contracts") holds as it is: one announcer for each map, the landmarks named through `useLandmarkName`, 44 px targets, visible focus, both themes.
- #44 asks for several maps on one page, each with its own services, clean teardown, a strict Content Security Policy with no `unsafe-inline`, and a size budget checked in CI. #675 asks for the shadow or light DOM choice, React inside or outside, placement, typings and no per-framework wrapper packages.
- The consumer check, the pack check and the release workflow already exist and are extended, not replaced (`docs/guides/releasing.md`). Getting-started pages for each route are [#678](https://github.com/MapCairn/mapcairn/issues/678) and the framework checks are [#676](https://github.com/MapCairn/mapcairn/issues/676): this plan does not write or duplicate them.
- The release itself is [#679](https://github.com/MapCairn/mapcairn/issues/679).

## What exists

Read from `main`, so the design starts from facts.

- `examples/embed` composes the map by hand in about 300 lines (`ExampleApp.tsx`): `ServicesProvider`, `LiveRegionProvider`, `TooltipProvider`, `MapView` with a `chrome` render prop, `MapChrome` and its slots. The reference host does the same in `packages/web/src/app/AppChrome.tsx` and `App.tsx`. There is no composed, reusable map component in an SDK package.
- `Services` (`packages/core/src/ports/services.ts`) requires `createMapAdapter`, `search`, `location`, `settings`, `clipboard`, `fileSaver`, `url`, `theme`, `messages`, `preferences`, `layers` and `layerSource`. The real adapters for all but the MapLibre adapter live in `packages/web/src/adapters` and are not in any SDK package. `get-started.md` tells an outside app to use `createFakeServices` with the real map adapter.
- `createMapLibreMapAdapter` takes `loadWorkerUrl`. `engineLoader.ts` loads `maplibre-gl` and its stylesheet once per page, shared by every adapter, and uses the first caller's worker URL.
- `@mapcairn/sdk` re-exports and holds no code. `UNRELEASED_SDK_PACKAGES` in `scripts/sdkPackages.mjs` lets a package build, be cruised and get an API report while private; `0015` used it for the umbrella.
- `createThemeStylesheet` in `@mapcairn/theme` already makes a host theme as a file, scoped to a selector the host owns.

## Design

### Decision: a new package, `@mapcairn/browser`

Status: proposed, with the package name open.
Context: `mountMap` composes services, the interface and the adapter, so it cannot live in `map` (which never imports an adapter or an engine) and, as written, not in `sdk` (which holds no code of its own).
Options:

1. An entry point of `@mapcairn/sdk`. It changes the umbrella rule in `ARCHITECTURE.md`, `AGENTS.md` and dependency-cruiser from "no code of its own" to "no code of its own except this", and it has to choose between React as a required peer (a Vue user installs React for nothing) and a second, bundled artefact in the same tarball that every React user also downloads. It avoids a first publish by hand.
2. An entry point of `@mapcairn/map`. Refused: it would import the adapter and `react-dom/client`, which breaks the layer table.
3. A new package. It costs a first publish by hand (the umbrella and the adapter went through the same step), one more entry in `SDK_PACKAGES` and the lists that follow it, and one more API report. It keeps the umbrella as it is and gives non-React users a tarball with no dependencies.

Choice: option 3. Its one job is the prebuilt distribution: every file in `dist` is self-contained, `dependencies` and `peerDependencies` are empty, and the packages it bundles (`core`, `map`, `react`, `theme`, `adapter-maplibre`, React, React DOM, MapLibre GL JS) are `devDependencies`. The layer table gains a row: the package may import the other SDK packages' entry points and React, and nothing may import it. It is not re-exported by `@mapcairn/sdk`, and `sdk` does not depend on it.
Name: `@mapcairn/browser` is recommended, so the file is `@mapcairn/browser/dist/mapcairn.js`. `@mapcairn/embed` and `@mapcairn/mount` are the alternatives, and the registry had no package under any of the three names when this was written. The name is the maintainer's to confirm; the steps use `browser`.
Public surface: a new package and its API report. Nothing existing changes. Minor release.
Consequences: a package whose first publish is the maintainer's hand upload. It depends on nothing in the release set at run time, so the `npm` job skips nothing else (`releasing.md`, "A package that nothing in the release depends on"). Revisit when the SDK ships real browser adapters (see "Services"), which may belong beside it.

### Decision: light DOM, no shadow root

Status: proposed.
Context: #675 asks to choose against the accessibility contract and to check strict CSP.
Options:

1. Light DOM: the element, or the container `mountMap` is given, holds the interface directly.
2. Shadow DOM with `adoptedStyleSheets`.

Evidence. A scratch page under `style-src 'self'` was loaded in Chromium, Firefox and WebKit. A constructed stylesheet adopted into a shadow root applied in all three, a `<link>` inside the root applied, and a `<style>` element was blocked. So the policy does not decide it: both options keep the guide's rule of no inline style. What decides it is in the code:

- `document.activeElement` is the shadow host from inside a root (same page, all three engines). The interface reads it to decide where focus is in `StatusMessage.tsx:116`, `PinCard.tsx:116`, `TurnOffActions.tsx:56`, `CatalogueStatus.tsx:89`, `LanguageField.tsx:57` and `useMapEngine.ts:346`. Each would need `getRootNode()`, in six components whose focus rules the browser tests cover.
- `SkipLink.tsx:38` finds its target with `ownerDocument.getElementById`, which does not see into a root. `aria-labelledby`, `aria-describedby` and `aria-controls` inside the interface resolve within one root, so they would work, but a page that labels or skips to the map from outside could not.
- The token stylesheet selects `:root`, `:root, [data-theme="light"]`, `[data-theme="dark"]` and `:root:not([data-theme])` (`packages/theme/dist/tokens.css`). `:root` matches nothing in a shadow tree, and `@font-face` rules inside one are not applied, so the tokens and the font would need a second delivery path.
- `useReadingDirection.ts` reads `document.documentElement`, `engineLoader.ts` adds the engine stylesheet to the document, and `imageExport.ts` (lines 231 and 673) appends to and reads `document.body`.

Choice: option 1. The bundle's stylesheet is one file the page links, so strict CSP needs no `adoptedStyleSheets` and no nonce, and the existing browser checks and axe runs apply unchanged. The cost is that the page's CSS reaches the interface. The vanilla-extract class names are hashed, so only element selectors and inherited properties of the page leak, and a browser check mounts the map on a page with hostile global CSS (step 3).
Public surface: none beyond the element's own markup, which is not public.
Revisit when a measured conflict with page CSS cannot be fixed in the interface's own rules. The move then costs the six focus reads, the skip link, the token selectors and the font, and could be an opt-in.

### Decision: React and the engine are bundled, privately

Status: proposed.
Context: #675 asks for the gzipped cost of bundling React against taking it as a peer.
Measured with a throwaway build outside the repository, Vite 8 with Rolldown, minified, `react` 19.3.1, `maplibre-gl` 6.19.0. The entry mounted `MapView`, `MapChrome`, `EndStack`, `SearchPill`, the sheet and its content, the data layers, the measure tools and the MapLibre adapter. It also used `createFakeServices`, so it includes the fakes the real entry would not; the real figures are set from the real build and these are an upper estimate.

| Output                                                 | Raw     | Gzipped |
| ------------------------------------------------------ | ------- | ------- |
| ES module, React bundled, engine in its own lazy chunk | 1.36 MB | 318 KB  |
| The same with React and React DOM external             | 1.05 MB | 243 KB  |
| MapLibre chunk, loaded when the first map mounts       | 1.35 MB | 326 KB  |
| MapLibre worker (`maplibre-gl-worker.mjs`)             | 551 KB  | 157 KB  |
| Stylesheet, MapLibre's included                        | 71 KB   | 10 KB   |
| Classic script (IIFE), React and engine in one file    | 2.10 MB | 586 KB  |

So React and React DOM cost about 75 KB gzipped. The largest piece of the eager chunk is `@turf/jsts`, about 385 KB raw of 1.5 MB before minification, pulled in through `core` and `map`; lazy-loading it is a separate issue to file, and it lowers every figure here.
Options: (1) React as a peer, which needs React installed and is the wrong default for a Vue or server-rendered page, and gives a React host two ways to hold React for one saving; (2) React bundled.
Choice: bundled. The bundle's React runs only in its own roots and is never shared, so a React host cannot end up with two copies in one tree. A React app uses `@mapcairn/sdk` and its components, not this package.
Public surface: none. Consequences: the licence notices of what is bundled must travel with the files (see "Licences and the pack check").

### Decision: ES module first, the classic script only if kept

Status: open, the maintainer's call. #44 asks for a classic script as well.
The engine loads lazily in an ES module, which is why the first load is 328 KB gzipped (script and stylesheet) and the engine and worker, 483 KB, follow when a map mounts. A classic script cannot split: the IIFE inlines the engine (586 KB gzipped before any map is shown), and Rolldown replaces `import.meta` with `{}` in it, so the worker URL cannot come from `import.meta.url` and must come from `document.currentScript` or the `workerUrl` option.
Recommendation: ship only the ES module in the first release. Every browser the SDK supports loads `<script type="module">`, it is subject to the same `script-src`, and it needs no global. If the maintainer keeps the classic script, it is one more build output and one more browser leg, in an extra step between steps 6 and 7, and it exposes one global, `MapCairn`, with `mountMap` and `defineMapElement`.

### `mountMap`

```ts
function mountMap(element: HTMLElement, options?: MountMapOptions): MapHandle;

interface MountMapOptions {
  readonly view?: ViewState; // the starting view; a world view when left out
  readonly basemap?: string; // the id of a basemap in the catalogue
  readonly theme?: "light" | "dark" | "system"; // "system" when left out
  readonly language?: string; // a BCP 47 tag, picked from services.languages
  readonly label?: string; // the name of this map, for a page with more than one
  readonly tools?: readonly MapTool[]; // see below; none beyond the basics when left out
  readonly services?: Partial<Services>; // the pieces the page supplies
  readonly workerUrl?: string; // where the engine's worker is served
}

interface MapHandle {
  readonly ready: Promise<void>; // resolves when the engine is drawing, rejects with a MapEngineError
  getView(): ViewState;
  setView(view: Partial<ViewState>, options?: { readonly animate?: boolean }): void;
  update(options: { readonly basemap?: string; readonly theme?: "light" | "dark" | "system" }): void;
  on<K extends keyof MapEvents>(type: K, listener: (event: MapEvents[K]) => void): () => void;
  destroy(): void;
}
```

`MapEvents` has `viewchange` (a `ViewState`, at move end, as `MapView`'s `onViewChange` reports it), `click` (the position), `featuretap` (what `MapDataLayers`' `onFeatureTap` reports), `selectionchange` (only when `services.selection` is supplied) and `error` (a `MapEngineError`). Payloads are plain data, never React objects or DOM nodes. `MountMapError` is thrown, synchronously, for a call that cannot work: an element that already holds a map, a `tools` entry whose service is missing, a `basemap` id that is not in the catalogue.

Why one `services` property and not an option for each port: `Services` is already the documented, versioned way to say what a host supplies (`extending.md`, `capability-matrix.md`). A second vocabulary for the same thing would need its own names, docs and migration. The issue's list (basemaps, layer catalogue, search and routing providers) is `services.basemaps`, `services.layers`, `services.search` and `services.routing`.

**Services.** The SDK ships no real adapter for search, location, the clipboard, saving files or loading feed layers; they are the reference host's. Moving about a thousand lines of them into an SDK package is a boundary change and is not on this path. So the first slice composes only what works without them, and fails loudly where it cannot:

- The package builds the rest from what the SDK has: the MapLibre adapter with the worker URL, `createMessageCatalogue` over the SDK's English messages, an in-memory settings store and in-memory URL state, so a map reads and writes nothing on the device and never touches the page's address, and a theme source, device preferences and the file saver written in the package (small, and the only new browser code).
- The ports a composed tool never calls (clipboard, location, search and the layer source when their tools are off) are filled by the SDK's in-memory fakes, so the type is satisfied. A fake succeeds quietly, so unreachable is the only safe state, and the tests hold it: they replace each stand-in with an object that fails the test on any call, for every tool the plan composes.
- Two composed tools do reach a port. The layers section saves a layer's features through `fileSaver` (`SaveFeatures.tsx`, shown when a definition allows it), and `useDataLayers` loads feed layers through `layerSource`. The package therefore writes its own `fileSaver` (a `Blob`, an object URL and a download link, as the host's `BrowserFileSaver` does, which this repeats until the adapters move). A layer that needs a feed, query or heatmap source with no `services.layerSource` is reported when the catalogue is known: `MountMapError` for a static catalogue, and the `error` event for a runtime one that loads later.
- `tools` names the optional tools: `"search"`, `"basemaps"`, `"layers"`, `"measure"`, `"settings"` and, when the page supplies a `location` service, `"locate"`. A tool that needs a service the page did not supply (search without `services.search`) makes `mountMap` throw `MountMapError` at once, instead of showing a search box that never finds anything. Zoom, compass, attribution and the scale readout are always there: the credits are a legal requirement.
- Feed layers need a `LayerSource` from the page. Tile layers need none.

Revisit when a page needs Locate me, sharing or feed layers without writing an adapter. That is a plan of its own: where the adapters live, and the host importing them from there.

**Teardown.** `destroy()` is idempotent. It unmounts the React root (which runs `MapView`'s cleanup, so the adapter's `destroy()` removes the engine and its listeners), disposes the announcer, removes the `data-theme` attribute the mount set, unsubscribes the theme source and every listener the handle holds, and empties the element. After it, `setView` and `update` do nothing and `on` returns a no-op. What it does not promise: MapLibre keeps one worker pool and one loaded module for the page, shared by design (`engineLoader.ts`), so destroying the last map does not unload the engine. Whether the pool releases its workers when the last map is removed is checked in the browser, not assumed (step 2), and the guide says only what was seen.

**Theme.** The default `"system"` is resolved with `matchMedia` and written as `data-theme` on the container, not on `<html>`, so two maps can differ and a mount changes nothing outside its element. The token stylesheet's `[data-theme="dark"]` rule matches any element, which is why it works; the `:root:not([data-theme])` rule only matches the root, so the mount always sets the attribute. A host's own colours and font come from a stylesheet made with `createThemeStylesheet`, scoped to a class on the container (see `extending.md`). A page with no build cannot run that function; a file made at the site's build time or by hand is the route, and anything easier is a later issue.

**Language and direction.** `language` seeds the in-memory settings, so a `services.languages` catalogue works as on the reference site. In light DOM, CSS logical properties follow the container's `dir` through inheritance. The scripted direction reads `<html dir>` only (`useReadingDirection.ts`), so a `dir` set on an element below it fixes the layout but not the gestures that depend on it. That is recorded as a known limit in the guide, and the hook is an issue to file.

**The announcer.** `LiveRegionProvider` keeps a module-level count of mounted providers and warns in development when it is more than one (`LiveRegion.tsx`, `mountedProviders`). Each `mountMap` has its own React root and so its own provider, which would warn on every second map and contradicts "one announcer". Options: a page-shared announcer, which is a module-level singleton (refused by #44) and has to survive teardown of the map that created it; or one announcer for each map, where each map's messages go to its own region and nothing is read twice. Choice: one for each map. The warning becomes a check for a provider nested inside another, which is the case that does read a message twice, and `DESIGN.md` says "one announcer for each map". This is step 1, before any package exists.

### Decision: the build and the files

Status: proposed.
`packages/browser` is built by `buildPackage.mjs`, which `buildSdk.mjs` runs for every package (it does not run a package's own `build` script). `buildPackage.mjs` writes one module per source file and keeps every import external, and `entryPointsOf` refuses an export with no `@mapcairn/source` condition. Step 2 adds a bundle mode, chosen by the package's manifest, that bundles instead; the declarations still go through the existing roll-up, so the API report, the build order and the staleness stamp stay as they are. The output in `dist`:

- `mapcairn.js`: the ES module, with `mountMap`, `defineMapElement` and their types' runtime, React bundled, the engine in a lazy chunk beside it (`mapcairn-engine-<hash>.js`, named in the output so the pack check can read it).
- `mapcairn.css`: the token stylesheet, the interface's and the adapter's, with MapLibre's, in one file.
- `maplibre-gl-worker.js`: the engine's worker, a plain same-origin file, which the adapter is told about with `loadWorkerUrl` from `new URL("maplibre-gl-worker.js", import.meta.url)`, or from `options.workerUrl`. A worker must be same-origin, so the files are served from the page's own origin; a CDN needs the page to host the worker or allow `blob:` in `worker-src`, which the guide says.
- `index.d.ts` and the optional declaration files below.
- No source maps. The pack check requires each map's sources to sit under the package's own `src`, and a bundle's maps name other packages' files. The sources are public, so the minified files are enough, and the pack check is told this package ships none.
- A third-party notices file (see below).

The shipped `package.json` has an `exports` map to these files, `sideEffects: false` apart from the stylesheet, and no `dependencies`.

**Licences and the pack check.** The bundled code is already judged by `licence:sdk` through the packages that depend on it, and `@turf/jsts` is `EDL-1.0 OR EPL-1.0`, taken under the EDL side. Bundling still redistributes React, MapLibre (BSD-3-Clause), the Radix and Phosphor packages and the rest, so their notices travel with the files: the build writes `THIRD-PARTY-NOTICES.md` from the lockfile (name, version, licence, licence text of each bundled package) and the pack check's allowed file list gains that one file for this package (step 4). `SIZE_CEILINGS` gets an entry for `browser`, set at about one and a half times the packed size measured, as for the others.

### Decision: the custom element

Status: proposed.
`defineMapElement(name = "mapcairn-map")` registers the element and returns its class; it is idempotent (it checks `customElements.get`), so two copies of the bundle on one page do not throw. Importing the module registers nothing: a side effect on import cannot be tree-shaken and cannot be undone.

- Attributes: `latitude`, `longitude`, `zoom`, `bearing`, `basemap`, `theme`, `label`, `language` and `tools` (space separated). Changes to the four view attributes call `setView`; `basemap` and `theme` call `update`; `label`, `language` and `tools` are read when the element connects, and changing them means removing and inserting the element. That keeps `update` small, and it is written in the guide.
- Properties: `services` (an object, so it cannot be an attribute), `view`, and a read-only `map` for the handle. Setting `services` after connecting remounts the map once; set it before inserting the element to avoid that.
- Events, as bubbling, composed `CustomEvent`s with the handle's payload in `detail`: `mapcairn-view-change`, `mapcairn-click`, `mapcairn-feature-tap`, `mapcairn-selection-change` and `mapcairn-error`. They carry a prefix because a bare `click` is the browser's.
- `connectedCallback` mounts with the container as the element itself; children placed inside it (a fallback sentence) are replaced when the map mounts, so progressive enhancement works. `disconnectedCallback` calls `destroy()`, and reconnecting mounts a new map.
- The stylesheet gives `mapcairn-map` `display: block`, because an unknown element is inline. The page still has to give it a height, as for any map.
- Server rendering: the module guards `HTMLElement` and `customElements` behind `typeof`, so `class extends HTMLElement` is never evaluated in Node and an import does nothing. The consumer check's plain-Node import of every entry point (`entryPoints.test.ts`) already fails a read of `window` or `document` at load, so it covers this once the package is in the release set.

**Typings.** The `HTMLElementTagNameMap` entry for `mapcairn-map` ships in the main declarations, because it costs nothing where the types are not used. The JSX and Vue augmentations are separate files a project opts into (`@mapcairn/browser/react-jsx`, `@mapcairn/browser/vue`), because a project without `@types/react` or `vue` would fail to compile if the main file named them. Whether API Extractor reports a `declare global` block at all is not known (no package declares one today) and is the first thing step 5 settles, with a fallback of a hand-kept declaration file listed in the pack check.

**What is not in this plan:** a wrapper package for any framework (#675 rules them out), the framework checks (#676) and the guides for each route (#678).

### Public surface, in one place

Added: the package `@mapcairn/browser` and its API report (`mountMap`, `defineMapElement`, `MountMapOptions`, `MapHandle`, `MapEvents`, `MapTool`, `MountMapError`, the element class); the element name `mapcairn-map`, its attributes, its properties and its five event names; the global declarations; the files in `dist` and the `exports` map. Each is a contract from the first release, so the names above are final wording once the plan merges.
Changed: the development warning of `LiveRegionProvider` and one sentence of `DESIGN.md`. No export, type, message key or stored value changes.
Persisted or shared formats: none. A mount stores nothing and writes no address. Attribute values are plain text and are read with the same validation as `mountMap`'s options.
Not public, as today: the custom property names and `data-*` hooks.
Privacy and security: the map contacts only the origins of the basemap and layer definitions it is given, and the guide names what the built-in basemap contacts, because `PRIVACY.md` covers the reference site only. The bundle creates no `<style>` or `<script>` element and no `style` attribute (the components already render none, which their tests require), so `style-src 'self'` and `script-src 'self'` are enough and a nonce is only for the page's own inline script. A step proves it under the policy `buildContentSecurityPolicy` makes. Options and attributes are validated before use, and `workerUrl` must parse as an `https:` or same-origin URL.

## Tests

Each starts as a failing test (`design-tests`); the level is the cheapest that can prove it.

1. **`map`, unit.** Two sibling `LiveRegionProvider`s log no warning; a provider inside another does; a message announced inside one lands only in that one's region. Fails today on the first.
2. **`browser`, unit (happy-dom, `FakeMapAdapter` through `services.createMapAdapter`).** Two instances: a view change in one is not seen by the other, there are two status regions and each sits in its own container, and destroying one leaves the other working. Teardown: after `destroy()` the container is empty and has no `data-theme`, the adapter's `destroy` ran once, every `addEventListener` on `document` and `window` has a matching `removeEventListener` (spied), `vi.getTimerCount()` is zero, and a second `destroy()` does nothing. Events: each type fires with its payload and its unsubscribe stops it. A `tools` entry with no service throws `MountMapError`; a second `mountMap` on one element throws. `ready` rejects with a `MapEngineError` when the fake fails to mount. A test proves no composed tool reaches a stand-in for a missing service, and that the layers section's save action reaches the package's file saver.
3. **`browser`, server.** With `environment: "node"` the module imports, `defineMapElement()` returns without defining anything, and `mountMap` throws a clear `MountMapError` instead of reading `document`.
4. **Build output (script tests, no browser).** `dist` holds exactly the files above, `mapcairn.js` and its chunk import no bare specifier (nothing left external), the notices file names every bundled package with its licence, no source map is present and `package.json` has no dependencies. From step 4 the pack check and the size ceilings pass too.
5. **Element, unit.** `defineMapElement` twice defines once; each observed attribute reaches `setView` or `update`; `services` set as a property reaches `mountMap`; each event is a bubbling `CustomEvent` with the payload in `detail`; `disconnectedCallback` destroys and reconnecting mounts a fresh map; children are replaced on mount.
6. **Browser, Chromium through Playwright, against the real packed bundle.** A plain HTML page, no build, under `buildContentSecurityPolicy`: the map draws over the consumer check's fixture tiles, and there is no policy violation and no console error. Two maps on one page, one destroyed, the other still draws. After `destroy()` no `.maplibregl-canvas` and no live region of that map is in the page; how many `Worker`s exist before and after is recorded and the guide says what was seen. A page with hostile global CSS (element selectors on `button`, `*` margins, a global `box-sizing`) leaves the chrome's targets at 44 px with a visible focus ring. axe in light and dark, with the `<mapcairn-map>` page, in two sample languages, one left-to-right and one right-to-left, which the example builds from the English messages (pseudo-translated, with a `LanguageCatalogue` that marks the second `rtl`), because the SDK ships English only and an example may import public entry points only and with `dir="rtl"` on the element. Keyboard: Tab reaches search, the controls and the credits in order, arrows pan, Escape closes a sheet and focus returns to the control that opened it.
7. **Upgrade and existing checks.** The consumer check's plain-Node import, bundler resolution and upgrade legs pass with the package in the release set, which is what #676 builds on.

## Order of work

Each step is one pull request that leaves the build and `npm run check` green and ships on its own. They are issues once the plan merges (`split-plan`). Step 3 and later need the package from step 2.

1. **One announcer for each map.** Change `LiveRegionProvider` to warn only for a provider nested in another, with test 1, and `DESIGN.md` ("the one announcer" becomes one for each map). Files: `packages/map/src/ui/LiveRegion/LiveRegion.tsx` and its test, `DESIGN.md`. Part of #44.
2. **The private package and a first `mountMap`.** `packages/browser` in `UNRELEASED_SDK_PACKAGES` with its own build (the files above), the layer-table row in `ARCHITECTURE.md`, the dependency-cruiser rule, `AGENTS.md`'s package list, the API report, and the notices generator. `mountMap` renders `MapView` with zoom, compass, attribution and the scale readout (`MapChrome`, `EndStack`, `Attribution`, `MapReadout`), takes `view`, `basemap`, `theme`, `label`, `language`, `services` and `workerUrl`, returns the handle with `ready`, `getView`, `setView`, `update`, `on` and `destroy`, and has tests 2 (apart from `tools`), 3 and 4. The pack check and the consumer check read `SDK_PACKAGES`, so a private package is invisible to them until step 4. A real `npm install` for the workspace and `npm ci --ignore-scripts` in a clean clone, as `AGENTS.md` asks. Browser check of worker release on destroy, recorded for the guide. Files: `packages/browser/**`, `scripts/sdkPackages.mjs`, `scripts/buildPackage.mjs`, `.dependency-cruiser.cjs`, `scripts/depcruise.mjs`, `ARCHITECTURE.md`, `AGENTS.md`, `package-lock.json`. Closes the tasks "library build" and "`mountMap` with tests" of #44 in part.
3. **The tools.** The `tools` option: the sheet with the basemap and layer sections and settings (units, theme, language), search, measure, and locate when a `location` service is supplied, composed as `examples/embed` and the host compose them; `MountMapError` for a tool without its service; the `featuretap` and `selectionchange` events; test 2's `tools` cases and a happy-dom render of each tool. Files: `packages/browser/src/**`. The browser checks for this step are in step 4.
4. **A plain page, the consumer leg and the ceilings.** `examples/browser`: `index.html` using the packed script and stylesheet, with `<mapcairn-map>` added in step 5; a leg in `scripts/release/` that packs the package, serves a copy of the page under `buildContentSecurityPolicy` and runs test 6 up to the keyboard and hostile-CSS cases; `BUNDLE_CEILINGS` entries for the first load (script and stylesheet) and the engine chunk at about 1.15 times the measured size, and `SIZE_CEILINGS.browser`. `PACKAGES` in `packCheck.mjs` widens from `SDK_PACKAGES` to `BUILT_SDK_PACKAGES` so the private package is packed and checked, with the one added allowance for its notices file and the rule that it ships no source maps; the consumer leg packs it by name. Files: `examples/browser`, `scripts/release/*`, `.github/workflows/ci.yml` (the `sdk-packages` filter), `docs/guides/releasing.md`. This is the plain-page task of #44.
5. **The custom element and its typings.** `defineMapElement`, the element, the stylesheet rule, the declarations (with the `declare global` spike), tests 5 and the server case, and `<mapcairn-map>` on the example page. Files: `packages/browser/src/element/**`, `packages/browser/api`, `examples/browser`. Part of #675.
6. **Accessibility and keyboard checks.** axe in both themes and the sample languages over the element and the function, the right-to-left case, and the keyboard walk, as a Playwright project for the example that `npm run a11y` runs (its place in `packages/web/playwright.config.ts`, or a config of its own, is chosen in the issue after reading the config). Files: Playwright config and specs. Part of #675.
7. **Join the release set, and the guides.** `browser` moves from `UNRELEASED_SDK_PACKAGES` into `SDK_PACKAGES`, and into `PACKAGES`, the release workflow's loops, the notes patterns, the CI filter and the sentences of `check.mjs` that list the packages (the 0015 slice 2 list); `private` comes off; the package README with its Status line; the guide for a server-rendered page, including the Content Security Policy section, the files to serve from the page's origin, the worker, the known direction limit and the CDN note, as a page in `sites/docs/docs/guides/`; the `content-security-policy.md` section for the bundle; `capability-matrix.md`, `public-api.md`, `README.md` and `ROADMAP.md`. The maintainer's steps for the first publish by hand are listed in the pull request, and the plan is deleted with its README entry. If the classic script is kept, its step comes before this one. Files as listed.

The release is #679, after #676 and #678.

## Documents to update

`ARCHITECTURE.md` (layer table, "Building the SDK packages"), `AGENTS.md` ("About" and the Architecture list), `DESIGN.md` ("The one announcer", step 1), `docs/guides/releasing.md` (the package list, the new package's first publish, the ceilings), `sites/docs/docs/guides/content-security-policy.md`, `capability-matrix.md`, `public-api.md`, `extending.md` (theme scope for a mounted map), `README.md`, `ROADMAP.md` (embedding row), the package README, and a guide for the server-rendered page. `PRIVACY.md` and `.github/SECURITY.md` do not change, and neither does `sites/docs/docs/guides/without-react.md`.

## Risks

- **Page CSS reaches the interface** (light DOM). Hashed class names limit it to element selectors and inherited properties; the hostile-CSS check in step 4 fails a regression, and shadow DOM is the revisit.
- **The bundle is large.** About 328 KB gzipped to first load and 483 KB more when the engine loads, measured with fakes included. The ceilings fail growth, and the eager `@turf/jsts` cost is its own issue. A page that needs less uses the headless route.
- **A first publish by hand** can delay the release. It is the known step in `releasing.md` and nothing else is skipped because of it; it is listed in step 7's pull request so it is not a surprise.
- **The services gap.** A page that wants Locate me, sharing or feed layers must write an adapter. The loud `MountMapError` and the guide say so; the remedy is a plan of its own.
- **Teardown is not total.** The engine and its worker pool are page-shared. The guide says what was observed and not more.
- **Typings through API Extractor.** A `declare global` may not appear in the report. The fallback is a hand-kept declaration file checked by the pack check.
- **A second copy of the bundle on a page** (two micro-frontends) shares the engine loader only within a copy. The element's idempotent `defineMapElement` keeps registration safe; each copy loads its own engine.

## Decided and open

Decided, on the evidence above:

- A new package, not an `sdk` subpath or a `map` entry point.
- Light DOM.
- React and the engine bundled; the engine in a lazy chunk.
- One `services` option, not one option for each port.
- One announcer for each map.
- Explicit `defineMapElement`, no registration on import.
- No source maps; notices travel with the files.

Open:

- **The package name** (`@mapcairn/browser`, `@mapcairn/embed` or `@mapcairn/mount`). Recommendation: `@mapcairn/browser`.
- **The classic script.** Recommendation: leave it out of the first release, as above, because the engine cannot load lazily from it and it costs 586 KB gzipped up front. The cost to add it later is one build output and one browser leg; the cost to keep it is a second artefact to test and to size-budget.
- **Real browser adapters in the SDK** (location, clipboard, file saving, feed layers). Recommendation: after `0.3.0`, as its own plan, started by a page that needs one. Until then the tools that need them stay off unless the page supplies the port.
- **Whether `update` and the observed `basemap` and `theme` attributes are worth their surface.** Recommendation: keep them, because a Vue or Svelte binding expects a changed attribute to take effect, and removing the element is the wrong answer for a theme switch.
