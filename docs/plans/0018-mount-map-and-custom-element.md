# 0018: A mount function, a prebuilt browser bundle and a custom element

Status: proposed. Tracking issues: [#44](https://github.com/MapCairn/mapcairn/issues/44) (the mount function and the bundle) and [#675](https://github.com/MapCairn/mapcairn/issues/675) (the custom element), both under [#51](https://github.com/MapCairn/mapcairn/issues/51). The aim is to ship them in the `0.3.0` SDK release.

## Goal

A page with no React and no build step adds one module script and one link tag and gets a map: `mountMap(element, options)` returns a handle with `setView`, `on` and `destroy`. A page on Vue, Svelte, Solid, Angular or plain HTML gets the same thing as `<mapcairn-map>`, with services passed as properties and events as `CustomEvent`s. Neither needs React installed, several maps work on one page, and the code does nothing on a server. Everything here is added: no existing export, message key or stored value changes.

## Ground rules

- `AGENTS.md`: ports and adapters, no module-level services, no layer or provider id in a branch, tokens only, the SDK packages carry nothing that needs a licence agreement of their own, a new runtime dependency in an SDK package is the maintainer's call. This plan adds none: React, React DOM, MapLibre GL JS and the other bundled code are already production dependencies or required peers of the packages that are bundled, and `npm run licence:sdk` already judges them there.
- The accessibility contract in `DESIGN.md` ("Components and accessibility contracts") holds, with one amendment for maps mounted outside React (see "The announcer"): the landmarks named through `useLandmarkName`, 44 px targets, visible focus, both themes.
- #44 asks for several maps on one page, each with its own services, clean teardown, a strict Content Security Policy with no `unsafe-inline`, and a size budget checked in CI. #675 asks for the shadow or light DOM choice, React inside or outside, placement, typings and no per-framework wrapper packages.
- The consumer check, the pack check and the release workflow already exist and are extended, not replaced (`docs/guides/releasing.md`). Getting-started pages for each route are [#678](https://github.com/MapCairn/mapcairn/issues/678) and the framework checks are [#676](https://github.com/MapCairn/mapcairn/issues/676): this plan does not write or duplicate them.
- #44 also asks for a classic script (IIFE). The first release ships the ES module only, for the reasons under "Decision: the ES module only"; the issue's task is changed to match.
- The release itself is [#679](https://github.com/MapCairn/mapcairn/issues/679).

## What exists

Read from `main`, so the design starts from facts.

- `examples/embed` composes the map by hand in about 300 lines (`ExampleApp.tsx`): `ServicesProvider`, `LiveRegionProvider`, `TooltipProvider`, `MapView` with a `chrome` render prop, `MapChrome` and its slots. The reference host does the same in `packages/web/src/app/AppChrome.tsx` and `App.tsx`. There is no composed, reusable map component in an SDK package.
- `Services` (`packages/core/src/ports/services.ts`) requires `createMapAdapter`, `search`, `location`, `settings`, `clipboard`, `fileSaver`, `url`, `theme`, `messages`, `preferences`, `layers` and `layerSource`. The real adapters for all but the MapLibre adapter live in `packages/web/src/adapters` and are not in any SDK package. `get-started.md` tells an outside app to use `createFakeServices` with the real map adapter. The interface sorts adapter failures with `instanceof` against core's error classes (`useSearch.ts:214`, `useSuggestions.ts:102`, `useLocate.ts:125`, `layerStatus.ts:50`, `useDirections.ts:341`, `useMapEngine.ts:75`), so an adapter that throws must use the same copy of `core` the interface was built with.
- `createMapLibreMapAdapter` takes `loadWorkerUrl`. `engineLoader.ts` loads `maplibre-gl` and its stylesheet once per page, shared by every adapter, and uses the first caller's worker URL.
- `@mapcairn/sdk` re-exports and holds no code. `UNRELEASED_SDK_PACKAGES` in `scripts/sdkPackages.mjs` lets a package build, be cruised and get an API report while private; `0015` used it for the umbrella.
- `createThemeStylesheet` in `@mapcairn/theme` already makes a host theme as a file, scoped to a selector the host owns.

## Design

### Decision: a new package, `@mapcairn/browser`

Status: proposed.
Context: `mountMap` composes services, the interface and the adapter and calls `react-dom/client`, so it needs a home that may import the adapter.
Options:

1. An entry point of `@mapcairn/sdk`. It changes the umbrella rule in `ARCHITECTURE.md`, `AGENTS.md` and dependency-cruiser from "no code of its own" to "no code of its own except this", and it has to choose between React as a required peer (already so for `sdk`) and a second, bundled artefact in the same tarball that every React user also downloads. It avoids a first publish by hand.
2. An entry point of `@mapcairn/map`. Refused for one reason: it would import the adapter, which breaks the layer table (`map` never imports an adapter or an engine). `map` already peers `react-dom`, so `createRoot` alone would not stop it.
3. A new package. It costs a first publish by hand (the umbrella and the adapter went through the same step), one more entry in `SDK_PACKAGES` and the lists that follow it, and one more API report. It keeps the umbrella as it is and gives non-React users a tarball with no dependencies.

Choice: option 3. Its one job is the prebuilt distribution: every file in `dist` is self-contained, `dependencies` and `peerDependencies` are empty, and the packages it bundles (`core`, `map`, `react`, `theme`, `adapter-maplibre`, React, React DOM, MapLibre GL JS) are `devDependencies`. The layer table gains a row: the package may import the other SDK packages' entry points and React, and nothing may import it. It is not re-exported by `@mapcairn/sdk`, and `sdk` does not depend on it.
Name: `@mapcairn/browser`, so the file is `@mapcairn/browser/dist/mapcairn.js`. The registry had no package under it, `@mapcairn/embed` or `@mapcairn/mount` when this was written.
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

Choice: option 1. The bundle's stylesheet is one file the page links, so strict CSP needs no `adoptedStyleSheets` and no nonce, and the existing browser checks and axe runs apply unchanged. The cost is that the page's CSS reaches the interface. The vanilla-extract class names are hashed, so only element selectors and inherited properties of the page leak. Two more costs of several maps in one document are handled in "Several maps on one page" below. The hostile-CSS check is owned by step 4.
Public surface: none beyond the element's own markup, which is not public.
Revisit when a measured conflict with page CSS cannot be fixed in the interface's own rules. The move then costs the six focus reads, the skip link, the token selectors and the font, and could be an opt-in.

### Decision: React and the engine are bundled, privately

Status: proposed.
Context: #675 asks for the gzipped cost of bundling React against taking it as a peer.
Measured with a throwaway build outside the repository, Vite 8 with Rolldown, minified, `react` 19.3.1, `maplibre-gl` 6.19.0. The entry mounted `MapView`, `MapChrome`, `EndStack`, `SearchPill`, the sheet and its content, the data layers, the measure tools and the MapLibre adapter, and built its services with `createFakeServices`. The real package also fills the ports its tools do not use with core's fakes (see "Services"), so fakes ship in the real bundle too and these figures describe a similar composition. They are not an upper bound. Ceilings are set from the real build in step 4.

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
Public surface: none. Consequences: the licence notices of what is bundled must travel with the files (see "Licences").

### Decision: the ES module only, in the first release

Status: proposed. It drops the classic-script task of #44 from the first release.
The engine loads lazily in an ES module, which is why the first load is 328 KB gzipped (script and stylesheet) and the engine and worker, 483 KB, follow when a map mounts. A classic script cannot split: the IIFE inlines the engine (586 KB gzipped before any map is shown), and Rolldown replaces `import.meta` with `{}` in it, so the worker URL cannot come from `import.meta.url` and would have to come from `document.currentScript` or the `workerUrl` option. Every browser the SDK supports loads `<script type="module">`, which is subject to the same `script-src`, and it needs no global.
Revisit when a named page cannot use a module script. It would be one more build output and one more browser leg, exposing one global, `MapCairn`.

### `mountMap`

The page passes plain data. A page with no build cannot import `@mapcairn/core`, and core's factories and error classes are in the bundle's private copy, so the options take definitions and the bundle builds the catalogues inside.

```ts
function mountMap(element: HTMLElement, options?: MountMapOptions): MapHandle;

interface MountMapOptions {
  readonly view?: ViewState; // the starting view; a world view when left out
  readonly basemaps?: readonly BasemapDefinition[]; // the basemaps offered; the SDK's built-in ones when left out
  readonly basemap?: string; // the id to start on; the catalogue's default when left out
  readonly layers?: readonly LayerDefinition[] | (() => Promise<readonly LayerDefinition[]>); // data or a loader
  readonly languages?: readonly MountLanguage[]; // tag, label, direction and messages, on top of English
  readonly language?: string; // a tag from `languages`; the browser's choice when left out
  readonly theme?: "light" | "dark" | "system"; // "system" when left out
  readonly label?: string; // the name of this map, for a page with more than one
  readonly tools?: readonly MapTool[]; // see below
  readonly services?: MountServices; // the providers the page writes: search, suggestions, location, layerSource
  readonly workerUrl?: string; // where the engine's worker is served
}

interface MapHandle {
  readonly ready: Promise<void>; // resolves when the engine is drawing
  getView(): ViewState;
  setView(view: Partial<ViewState>, options?: { readonly animate?: boolean }): void;
  update(options: { readonly basemap?: string; readonly theme?: "light" | "dark" | "system" }): void;
  on<K extends keyof MapEvents>(type: K, listener: (event: MapEvents[K]) => void): () => void;
  destroy(): void;
}
```

`basemaps` goes through `createBasemapCatalogue`, `layers` through `createStaticLayerCatalogue` (an array) or `createRuntimeLayerCatalogue` (a loader), with the SDK's own decoder and formatter registries, and `languages` through `createLanguageCatalogue` over `createMessageCatalogue` with English as the fallback (`EN_GB_CATALOGUE` is inside). A definition that fails validation makes `mountMap` throw `MountMapError` with every problem named, as the static catalogue does; the runtime one skips what is wrong and reports it through the `error` event. These shapes (`BasemapDefinition`, `LayerDefinition`, `MountLanguage`) are public data formats a page writes; see "Public surface".

`MountServices` is a `Pick` of `Services`: `search`, `suggestions`, `location` and `layerSource`. The page may not replace the map adapter, settings or theme. Because a provider written on the page is sorted by the interface with `instanceof`, the bundle re-exports the classes a provider throws and reads: `MapEngineError`, `SearchError`, `LocationError`, `LayerError` and `PortAbortError`, so a page writes `import { mountMap, SearchError } from "/mapcairn/mapcairn.js"` and a provider's failure is understood. Two copies of the bundle on a page do not share these classes; each map works with providers written against its own copy.

`MapEvents` has `viewchange` (a `ViewState`, at move end, as `MapView`'s `onViewChange` reports it), `click` (the position), `featuretap` (what `MapDataLayers`' `onFeatureTap` reports) and `error` (a `MapEngineError` or a `MountMapError`). Payloads are plain data, never React objects or DOM nodes. `MountMapError` is thrown, synchronously, for a call that cannot work: an element that already holds a map, a `tools` entry whose provider is missing, a definition that is not valid, a `basemap` id that is not in the catalogue.

**Services, and the smallest honest first release.** The SDK ships no real adapter for search, location, the clipboard, saving files or loading feed layers; they are the reference host's, and moving about a thousand lines of them into an SDK package is a boundary change that is not on this path. So the first release is what works with none of them: a map with the built-in basemaps or the page's own, tile layers from definitions, the measure tool, the settings that live in memory, the light and dark themes, the credits and the accessible chrome. Search and Locate me are there only when the page writes a provider.

- The package builds the rest from what the SDK has: the MapLibre adapter with the worker URL, the English messages, an in-memory settings store and in-memory URL state, so a map reads and writes nothing on the device and never touches the page's address, and a theme source, device preferences and a file saver written in the package (small, and the only new browser code).
- The ports a composed tool never calls are filled by core's in-memory fakes, so the type is satisfied. A fake succeeds quietly, so unreachable is the only safe state, and the tests hold it: they replace each stand-in with an object that fails the test on any call, for every tool the plan composes. This is a choice to reuse what exists over writing stubs, and it puts the fakes in the bundle.
- Two composed tools do reach a port. The layers section saves a layer's features through `fileSaver` (`SaveFeatures.tsx`, shown when a definition allows it), and `useDataLayers` loads feed layers through `layerSource`. The package therefore writes its own `fileSaver` (a `Blob`, an object URL and a download link, as the host's `BrowserFileSaver` does, which this repeats until the adapters move). A layer that needs a feed, query or heatmap source with no `services.layerSource` is reported when the catalogue is known: `MountMapError` for an array, and the `error` event for a loader's result.
- `tools` names the optional tools: `"search"`, `"basemaps"`, `"layers"`, `"measure"`, `"settings"` and `"locate"`. A tool whose provider the page did not supply (`"search"` without `services.search`, `"locate"` without `services.location`) makes `mountMap` throw `MountMapError` at once, instead of showing a search box that never finds anything. There is no directions tool. Zoom, compass, attribution and the scale readout are always there: the credits are a legal requirement.

Revisit when a page needs Locate me, sharing or feed layers without writing an adapter. That is a plan of its own: where the adapters live, and the host importing them from there.

**How the handle reaches the map.** `mountMap` wraps the `createMapAdapter` it gives the services, keeps the adapter instance the wrapper builds, and the handle's `setView`, `getView` and `update` call it. Nothing new is exported from `map`.

**Teardown.** `destroy()` is idempotent. It unmounts the React root (which runs `MapView`'s cleanup, so the adapter's `destroy()` removes the engine and its listeners), disposes the announcer, removes the `data-theme` and marker attributes the mount set, unsubscribes the theme source and every listener the handle holds, and empties the element. After it, `setView` and `update` do nothing, `on` returns a no-op, and `getView()` returns the last view the map reported. `ready`, when `destroy()` is called before it settles, rejects with a `MountMapError` of kind `destroyed`; a copy of the promise has a handler attached inside, so an unobserved handle raises no unhandled rejection, and a page that awaits it still sees the rejection. What it does not promise: MapLibre keeps one worker pool and one loaded module for the page, shared by design (`engineLoader.ts`), so destroying the last map does not unload the engine. Whether the pool releases its workers when the last map is removed is checked in the browser, not assumed (step 2), and the guide says only what was seen.

**Theme.** The default `"system"` is resolved with `matchMedia` and written as `data-theme` on the container, not on `<html>`, so two maps can differ and a mount changes nothing outside its element. The token stylesheet's `[data-theme="dark"]` rule matches any element, which is why it works, and also why a page-level `[data-theme="dark"]` (a page that sets it on `<html>` or `body` for its own use) reaches a map that has none of its own. The mount therefore always writes the attribute on its container, and the hostile-CSS fixture includes a page-level `[data-theme="dark"]` rule over a light map. The `:root:not([data-theme])` rule only matches the root. A host's own colours come from a stylesheet made with `createThemeStylesheet`, scoped to a class on the container (see `extending.md`). A page with no build cannot run that function; a file made at the site's build time or by hand is the route, and anything easier is a later issue.

**The font.** The bundle does not ship IBM Plex Sans. Only `examples/embed` loads it; `tokens.css.ts` carries a metric-matched fallback and no font file. Bundling the font needs the SIL Open Font Licence 1.1, which is not on the SDK allowlist, and only the maintainer allows a licence there. So a page gets the fallback stack unless it loads Plex itself (its own `@font-face` or a `<link>`, with its own `font-src`), and the guide shows how. Bundling the font is a question for the maintainer.

**Language and direction.** `language` seeds the in-memory settings. In light DOM, CSS logical properties follow the container's `dir` through inheritance. The scripted direction reads `<html dir>` only (`useReadingDirection.ts`), so a `dir` set on an element below it fixes the layout but not the gestures that depend on it. That is recorded as a known limit in the guide, and the hook is an issue to file.

**Several maps on one page.** Light DOM puts every map's markup in one document, so three things need care.

- Ids. React's client `useId` counter is shared within one copy of React and not per root, so two roots do not collide inside this bundle, but a second copy of the bundle on the page, or the page's own React, starts its count again and can produce the same id (`MapView.tsx:239` and `:361` use it for the help text and its reference, and the sheet and map ids derive from the same hook, as `ExampleApp.tsx:138` shows for the sheet). Each `createRoot` gets an `identifierPrefix` made from a counter and a random suffix, so ids differ between maps and between copies.
- Landmarks. `MapChrome` is always given `mainLandmark={false}`, because the page owns its `main` (`DESIGN.md:85`). A map with a `label` names its landmarks as `useLandmarkName` does. Two maps without a label would share every name ("Map", "Map tools"); `mountMap` warns once through `console.warn` when it finds another map without a label on the page (it marks each container with a `data-mapcairn` attribute and looks them up in the document, so it keeps no module-level state), and the guide says to give each a `label`.
- Layout. `MapChrome` chooses its panel layout from a viewport media query (`panelLayoutQuery`, `MapChrome.css.ts:39,90`), not from the container's width, so a small map on a wide page gets the desktop layout. This is true of the React embed too; it is an issue to file, and the guide says to give an embedded map room.

**The announcer.** `LiveRegionProvider` keeps a module-level count of mounted providers and warns when it is more than one (`LiveRegion.tsx`, `mountedProviders`), and `DESIGN.md` (the `LiveRegion` row, line 151) and `ARCHITECTURE.md` ("Announcement flow", line 106) say there is one announcer, which two labelled maps in one React tree share through `LiveRegionScope` with one throttle (the `/design/two-maps` page). Two `mountMap` calls are two React roots, and a context cannot cross roots. Options:

1. One announcer for each mount. Each map's messages go to its own region and nothing is read twice, and no state is shared. The cost is that two maps announcing in the same window are not throttled against each other. The existing contract holds for maps inside one React tree.
2. One region shared by every mount of one bundle copy, created on the first mount and released by a reference count when the last is destroyed, with each map's `label` prefix. It keeps the cross-map throttle, but it needs a module-level, reference-counted singleton (which #44 forbids and which has to survive the teardown of the map that created it) and a new way for a provider to take an announcer from outside React, which is a new export from `map`.

Choice: option 1. Two maps announcing at the same moment is rare (a person acts on one map at a time), and a polite region queues. Step 1 changes the warning to fire for a provider nested in another, and states in `DESIGN.md` and `ARCHITECTURE.md` that the single announcer holds for one React tree and that each mounted map outside React has its own. `isDevelopment()` is false in a production bundle, so the warning never shows in this package's output; the behaviour is proved by a browser test, not by the warning.

### Decision: the build and the files

Status: proposed.
`packages/browser` is built by `buildPackage.mjs`, which `buildSdk.mjs` runs for every package (it does not run a package's own `build` script). `buildPackage.mjs` writes one module per source file and keeps every import external, and `entryPointsOf` refuses an export with no `@mapcairn/source` condition. Step 2 adds a bundle mode, chosen by the package's manifest, that bundles instead. The API report, the build order and the staleness stamp stay as they are. The output in `dist`:

- `mapcairn.js`: the ES module, with React bundled and the engine in a lazy chunk beside it (`mapcairn-engine-<hash>.js`). The build defines `process.env.NODE_ENV` as `"production"`, because Vite's library mode does not and React and the interface test it.
- `mapcairn.css`: the token stylesheet, the interface's, the adapter's and MapLibre's, in one file. `engineLoader.ts:29` imports `maplibre-gl/dist/maplibre-gl.css` dynamically; in bundle mode that import must land in `mapcairn.css`, and neither chunk may create a `<link>` or a `<style>` element at run time (test 4 and the CSP leg check it).
- `maplibre-gl-worker.js`: the engine's worker, a plain same-origin file. The build copies it from `maplibre-gl/dist` as a file. It is not imported from `packages/browser/src`, because dependency-cruiser's `map-engine-libraries-only-in-engine-adapters` rule (`.dependency-cruiser.cjs:248`) refuses an engine import outside the adapter and the host's `workerUrl.ts`. The adapter is told where it is with `loadWorkerUrl`, from `new URL("maplibre-gl-worker.js", import.meta.url)` or `options.workerUrl`. A worker must be same-origin, so the files are served from the page's own origin; a CDN needs the page to host the worker or allow `blob:` in `worker-src`, which the guide says. The first map's worker URL wins for the whole page (`engineLoader.ts:19`).
- `index.d.ts` and the declaration entries below.
- No source maps. The pack check requires each map's sources to sit under the package's own `src`, and a bundle's maps name other packages' files. The sources are public, so the minified files are enough, and the pack check is told this package ships none.
- A third-party notices file (see "Licences").

The shipped `package.json` has an `exports` map to these files, `sideEffects: false` apart from the stylesheet, and no `dependencies`.

**Declarations.** The existing roll-up cannot serve this package as it stands: `rollUpDeclarations` (`buildPackage.mjs:219`) sets no `bundledPackages`, so `index.d.ts` would keep imports of `@mapcairn/core` in a package that has no dependencies. In bundle mode the roll-up sets `bundledPackages` for the SDK packages, so core's port types that the options and events name (`ViewState`, `BasemapDefinition`, `LayerDefinition`, `MapEngineError`, the provider interfaces) are inlined and become part of this package's API report. The test is `publint` and `attw` over the packed tarball, plus a script test that `index.d.ts` imports no `@mapcairn/*` and no `react`.

**Licences.** `licence:sdk` reads `SDK_PACKAGES` only and never fails a `devDependency`, so the bundled code, which sits in `devDependencies`, would pass it unjudged. Step 2 adds a check inside the build instead: the bundler's module graph gives the set of packages that reached the output, build tools excluded (`vite`, `typescript`, API Extractor), and each is judged against `scripts/sdkLicences.allowlist.json` with the same SPDX evaluation `sdkLicences.mjs` uses. The build fails on one that is not allowed. `@turf/jsts` is `EDL-1.0 OR EPL-1.0`; the notice takes the EDL side explicitly and ships the EDL text. The licence text of each package comes from the installed package's own licence file, not from the lockfile, which holds no text. The build writes `THIRD-PARTY-NOTICES.md` (name, version, licence, text), and the pack check's allowed file list gains that one file for this package (step 4). `SIZE_CEILINGS` gets an entry for `browser`, set at about one and a half times the packed size measured.

### Decision: the custom element

Status: proposed.
`defineMapElement(name = "mapcairn-map")` registers the element and returns its class; it is idempotent (it checks `customElements.get`), so two copies of the bundle on one page do not throw. Importing the module registers nothing: a side effect on import cannot be tree-shaken and cannot be undone.

- Attributes: `latitude`, `longitude`, `zoom`, `bearing`, `basemap`, `theme`, `label`, `language` and `tools` (space separated). Changes to the four view attributes call `setView`; `basemap` and `theme` call `update`. `label`, `language` and `tools` are read when the element connects and change only by removing and inserting the element: `label` and `tools` name landmarks and compose tools, which `update` would have to rebuild, and `language` is not observed because the language is also a person's choice in Settings, kept in the map's memory, and an attribute that overwrote it would fight them.
- Properties: `services`, `basemaps`, `layers`, `languages` (objects, so they cannot be attributes), `view`, and a read-only `map` for the handle. The view has two inputs, the attributes and the `view` property; the latest write wins, they are read once at connect for the starting view, nothing is ever written back to an attribute, and a `setView` with the view the map already has does nothing.
- Events, as bubbling, composed `CustomEvent`s with the handle's payload in `detail`: `mapcairn-view-change`, `mapcairn-click`, `mapcairn-feature-tap` and `mapcairn-error`. They carry a prefix because a bare `click` is the browser's. An error thrown while mounting, which has no caller to receive it, is dispatched as `mapcairn-error` with the `MountMapError` in `detail`.
- Lifecycle. Frameworks move elements by removing and inserting them, and a mounted WebGL map that is destroyed and rebuilt in the same tick loses its context for nothing. So `connectedCallback` and `disconnectedCallback` only schedule work for a microtask: the mount runs if the element is still connected, the destroy is skipped if it is connected again by then. Setting a data property (`services`, `layers`, `basemaps`, `languages`) before or in the same tick as connecting changes what the one pending mount reads; setting one after the map is mounted remounts it once, however many are set in that tick.
- `connectedCallback` mounts with the container as the element itself; children placed inside it (a fallback sentence) are replaced when the map mounts, so progressive enhancement works.
- The stylesheet gives `mapcairn-map` `display: block`, because an unknown element is inline. The page still has to give it a height, as for any map.
- Server rendering: the module guards `HTMLElement` and `customElements` behind `typeof`, so `class extends HTMLElement` is never evaluated in Node and an import does nothing. The consumer check's plain-Node import of every entry point (`entryPoints.test.ts`) already fails a read of `window` or `document` at load, so it covers this once the package is in the release set.

**Typings.** The `HTMLElementTagNameMap` entry for `mapcairn-map` ships in the main declarations, because it costs nothing where the types are not used. The JSX and Vue augmentations are separate entries a project opts into (`@mapcairn/browser/react-jsx`, `@mapcairn/browser/vue`), because a project without `@types/react` or `vue` would fail to compile if the main file named them. They are shaped as ordinary entries, an empty module with the declaration beside it, so `entryPointsOf` (which refuses an export without `default` and the source condition), `apiReports.mjs` (which iterates `entryPointsOf`, line 101), `publint`, `attw` and the consumer check treat them like every other entry and need no special case. Whether API Extractor reports a `declare global` block at all is not known (no package declares one today) and is the first thing step 5 settles, with a fallback of a hand-kept declaration file listed in the pack check.

**What is not in this plan:** a wrapper package for any framework (#675 rules them out), the framework checks (#676) and the guides for each route (#678).

### Public surface, in one place

Added: the package `@mapcairn/browser` and its API report (`mountMap`, `defineMapElement`, `MountMapOptions`, `MountLanguage`, `MountServices`, `MapHandle`, `MapEvents`, `MapTool`, `MountMapError`, the re-exported error classes and the core types they name, the element class); the element name `mapcairn-map`, its attributes, properties and five event names; the global declarations; the files in `dist` and the `exports` map. Each is a contract from the first release, so the names above are final wording once the plan merges.
Changed: the development warning of `LiveRegionProvider`, and the sentences of `DESIGN.md` and `ARCHITECTURE.md` that describe the announcer. No export, type, message key or stored value changes.
Formats a page writes or the mount writes, and how each is versioned:

- `BasemapDefinition` and `LayerDefinition` objects, and `MountLanguage` messages keyed by `MessageKey`. They are the SDK's existing definition schemas, validated at mount, so they are versioned by the package version as the SDK's other definitions are, and a new required field is a breaking change under the same rule. A new message key needs a value in every host catalogue, which the English fallback softens for a page.
- The `tools` vocabulary and the basemap ids in `basemap` and `basemaps`. A name added later is additive; one removed or renamed is breaking. An unknown tool name throws `MountMapError`, so a typo is loud and an old page never silently loses a tool.
- The attributes, properties and event names of the element, and the `data-theme` attribute and the `data-mapcairn` marker the mount writes on its container. The theme attribute is the token stylesheet's own selector, so its values are the theme names. The marker is for the mount's own bookkeeping and is not public.
- Nothing is stored or written to the address: settings and URL state are in memory. Attribute values are plain text and are validated like the options.

Not public, as today: the custom property names and other `data-*` hooks.
Privacy and security: the map contacts only the origins of the basemap and layer definitions it is given, and the guide names what the built-in basemap contacts, because `PRIVACY.md` covers the reference site only. The bundle creates no `<style>` or `<script>` element and no `style` attribute (the components already render none, which their tests require), so `style-src 'self'` and `script-src 'self'` are enough and a nonce is only for the page's own inline script. A step proves it under the policy `buildContentSecurityPolicy` makes. Options and attributes are validated before use. `workerUrl` must be same-origin or a `blob:` URL; any other origin is refused with a `MountMapError`, since a cross-origin worker cannot start.

## Tests

Each starts as a failing test (`design-tests`); the level is the cheapest that can prove it.

1. **`map`, unit.** Two sibling `LiveRegionProvider`s log no warning; a provider inside another does; a message announced inside one lands only in that one's region. Fails today on the first.
2. **`browser`, unit (happy-dom).** The package keeps an internal `mount` that takes a `Services` builder, and the public `mountMap` calls it with the real one, so a test passes a `FakeMapAdapter` factory without widening the public options. Two instances: a view change in one is not seen by the other, there are two status regions and each sits in its own container, ids do not repeat across the two, and destroying one leaves the other working. Teardown: after `destroy()` the container is empty and has no `data-theme` or marker, the adapter's `destroy` ran once, every `addEventListener` on `document` and `window` has a matching `removeEventListener` (spied), `vi.getTimerCount()` is zero, a second `destroy()` does nothing, `getView()` still answers, and `ready` rejects with kind `destroyed` when it is called before the fake mounts, with no unhandled rejection. Events: each type fires with its payload and its unsubscribe stops it. A `tools` entry with no provider throws `MountMapError`; so does an invalid definition, a second `mountMap` on one element and a cross-origin `workerUrl`. `ready` rejects with a `MapEngineError` when the fake fails to mount. A test replaces each unused stand-in with an object that fails on any call and renders every composed tool; another proves the layers section's save action reaches the package's file saver. A provider that throws the re-exported `SearchError` shows the search status for its kind.
3. **`browser`, server.** With `environment: "node"` the module imports, `defineMapElement()` returns without defining anything, and `mountMap` throws a clear `MountMapError` instead of reading `document`.
4. **Build output (script tests, no browser).** `dist` holds exactly the files above; `mapcairn.js` and its chunk import no bare specifier (nothing left external); `process.env.NODE_ENV` is replaced in both; the engine chunk imports no stylesheet and `mapcairn.css` holds MapLibre's rules; neither JavaScript file creates a `link` or `style` element; the worker is a copy of `maplibre-gl/dist`'s; `index.d.ts` imports no `@mapcairn/*` and no `react`; the notices file names every bundled package with its licence and its text; a bundled package with a licence off the allowlist fails the build (a fixture); no source map is present; `package.json` has no dependencies. From step 4, the pack check, `publint`, `attw` and the size ceilings pass too.
5. **Element, unit.** `defineMapElement` twice defines once; each observed attribute reaches `setView` or `update`, and `label`, `language` and `tools` changes do not; `services` and the other data properties reach `mountMap`; a property set before and in the same tick as connecting mounts once, and one set later remounts once; moving the element (remove then insert in one tick) does not destroy the map; each event is a bubbling `CustomEvent` with the payload in `detail`; a `MountMapError` from connecting arrives as `mapcairn-error`; no attribute is written back; children are replaced on mount.
6. **Browser, Chromium through Playwright, against the real packed bundle.** Split by owner so each case has one home:
   - Step 4: a plain HTML page, no build, under `buildContentSecurityPolicy`. The map draws over the consumer check's fixture tiles, with no policy violation and no console error. Two maps on one page, one destroyed, the other still draws. After `destroy()` no `.maplibregl-canvas` and no live region of that map is in the page. An init script wraps `EventTarget.prototype.addEventListener` and `removeEventListener` (and `Worker`) before the bundle loads, so listeners and workers are counted on the real page and not only through the fake adapter; the guide says what was seen. A page with hostile global CSS (element selectors on `button`, `*` margins, a global `box-sizing`, and a page-level `[data-theme="dark"]` rule over a light map) leaves the chrome's targets at 44 px with a visible focus ring and the map's own theme.
   - Step 6: axe in light and dark over the `<mapcairn-map>` page and the function page, in two sample languages, one left-to-right and one right-to-left. The example builds them from the English messages (pseudo-translated, and the second marked `rtl`) through the `languages` option, so the SDK's English-only catalogue and the rule that an example imports public entry points only both hold, and with `dir="rtl"` on the element. The keyboard walk (Tab reaches search, the controls and the credits in order, arrows pan, Escape closes a sheet and focus returns to the control that opened it) runs with `<html dir>` set to match, because the scripted direction reads only `<html dir>`.
7. **Upgrade and existing checks.** The consumer check's plain-Node import, bundler resolution and upgrade legs pass with the package in the release set, which is what #676 builds on.

## Order of work

Each step is one pull request that leaves the build and `npm run check` green and ships on its own. They are issues once the plan merges (`split-plan`). Step 3 and later need the package from step 2.

1. **One announcer for each mount.** Change `LiveRegionProvider` to warn only for a provider nested in another, with test 1, and say in `DESIGN.md` (line 151) and `ARCHITECTURE.md` ("Announcement flow") that the single announcer holds for one React tree and that each mounted map outside React has its own. Files: `packages/map/src/ui/LiveRegion/LiveRegion.tsx` and its test, `DESIGN.md`, `ARCHITECTURE.md`. Part of #44.
2. **The private package and a first `mountMap`.** `packages/browser` in `UNRELEASED_SDK_PACKAGES`, with the bundle mode of `buildPackage.mjs` (the output above, `bundledPackages` for the declarations, `process.env.NODE_ENV`, the stylesheet merge, the worker copy), the bundled-licence check and the notices generator, the layer-table row in `ARCHITECTURE.md`, the dependency-cruiser rule, and `AGENTS.md`'s package list. `mountMap` renders `MapView` with zoom, compass, attribution and the scale readout (`MapChrome` with `mainLandmark={false}`, `EndStack`, `Attribution`, `MapReadout`), takes `view`, `basemaps`, `basemap`, `theme`, `label`, `workerUrl` and `services`, returns the handle with `ready`, `getView`, `setView`, `update`, `on` and `destroy`, prefixes each root's ids, and re-exports the error classes. Tests 2 (apart from the tools, definitions and languages cases), 3 and 4 as far as they apply. The pack check and the consumer check read `SDK_PACKAGES`, so a private package is invisible to them until step 4. A real `npm install` for the workspace and `npm ci --ignore-scripts` in a clean clone, as `AGENTS.md` asks. Browser check of worker release on destroy, recorded for the guide. Files: `packages/browser/**`, `scripts/sdkPackages.mjs`, `scripts/buildPackage.mjs`, `.dependency-cruiser.cjs`, `scripts/depcruise.mjs`, `ARCHITECTURE.md`, `AGENTS.md`, `package-lock.json`. Part of #44.
3. **Layers, languages and the tools.** The `layers` and `languages` options through the catalogue factories, and the `tools` option: the sheet with the basemap, layer and settings sections, search, measure and locate, composed as `examples/embed` and the host compose them; the package's file saver; `MountMapError` for a tool without its provider and for an invalid definition; the `featuretap` event; the rest of test 2. Files: `packages/browser/src/**`. The browser checks for this step are in step 4. Part of #44.
4. **A plain page, the consumer leg and the ceilings.** `examples/browser`: `index.html` using the packed script and stylesheet, with `<mapcairn-map>` added in step 5; a leg in `scripts/release/` that packs the package, serves a copy of the page under `buildContentSecurityPolicy` and runs the step 4 cases of test 6, including the hostile-CSS page, which this step owns; `BUNDLE_CEILINGS` entries for the first load (script and stylesheet) and the engine chunk at about 1.15 times the measured size, and `SIZE_CEILINGS.browser`. `packCheck.mjs` gets its own list, `BUILT_SDK_PACKAGES`, so the private package is packed and checked. The release workflow's lists and `scripts/release/tarballs.mjs` stay on `SDK_PACKAGES`, so a release still packs and publishes six packages until step 7, with the one added allowance for its notices file and the rule that it ships no source maps; `publint` and `attw` run over it; the consumer leg packs it by name. Files: `examples/browser`, `scripts/release/*`, `.github/workflows/ci.yml` (the `sdk-packages` filter), `docs/guides/releasing.md`. This is the plain-page task of #44.
5. **The custom element and its typings.** `defineMapElement`, the element and its lifecycle, the stylesheet rule, the declaration entries (with the `declare global` spike), test 5 and the server case, and `<mapcairn-map>` on the example page. Files: `packages/browser/src/element/**`, `packages/browser/api`, `scripts/buildPackage.mjs` if the spike needs it, `examples/browser`. Part of #675.
6. **Accessibility and keyboard checks.** The step 6 cases of test 6 as a Playwright project for the example that `npm run a11y` runs (its place in `packages/web/playwright.config.ts`, or a config of its own, is chosen in the issue after reading the config). Files: Playwright config and specs. Part of #675.
7. **Join the release set, and the guides.** `browser` moves from `UNRELEASED_SDK_PACKAGES` into `SDK_PACKAGES`, and into the release workflow's loops and `tarballs.mjs` (which step 4 left alone), and `packCheck.mjs` goes back to `SDK_PACKAGES`, the notes patterns, the CI filter and the sentences of `check.mjs` that list the packages (the 0015 slice 2 list); `private` comes off; the package README with its Status line; the guide for a server-rendered page, including the Content Security Policy section, the files to serve from the page's origin, the worker, loading Plex, the unlabelled-map and room-for-the-map notes, the known direction limit and the CDN note, as a page in `sites/docs/docs/guides/`; the `content-security-policy.md` section for the bundle; `without-react.md`'s route list; `capability-matrix.md`, `public-api.md`, `README.md` and `ROADMAP.md`. The maintainer's steps for the first publish by hand are listed in the pull request, and the plan is deleted with its README entry. Files as listed.

The release is #679, after #676 and #678.

## Documents to update

`ARCHITECTURE.md` (layer table, "Building the SDK packages", "Announcement flow", step 1), `AGENTS.md` ("About" and the Architecture list), `DESIGN.md` (the `LiveRegion` row, step 1), `docs/guides/releasing.md` (the package list, the new package's first publish, the ceilings, the pack and consumer checks), `sites/docs/docs/guides/content-security-policy.md`, `capability-matrix.md`, `public-api.md`, `extending.md` (theme scope and fonts for a mounted map), `without-react.md` (the "Next" route list at its end), `README.md`, `ROADMAP.md` (embedding row), the package README, and a guide for the server-rendered page. `PRIVACY.md` and `.github/SECURITY.md` do not change.

## Risks

- **Page CSS reaches the interface** (light DOM). Hashed class names limit it to element selectors and inherited properties; the hostile-CSS check in step 4 fails a regression, and shadow DOM is the revisit.
- **The bundle is large.** About 328 KB gzipped to first load and 483 KB more when the engine loads, measured with fakes included and re-measured from the real build. The ceilings fail growth, and the eager `@turf/jsts` cost is its own issue. A page that needs less uses the headless route.
- **A first publish by hand** can delay the release. It is the known step in `releasing.md` and nothing else is skipped because of it; it is listed in step 7's pull request so it is not a surprise.
- **The services gap.** A page that wants sharing or feed layers must write an adapter, and one that wants search or Locate me writes a provider against the bundle's error classes. The loud `MountMapError` and the guide say so; the remedy is a plan of its own.
- **Two bundle copies on a page** do not share error classes, the engine loader or the announcer. `defineMapElement` is idempotent, so registration is safe, but a provider written against one copy is misread by the other. The guide says to load one copy.
- **Teardown is not total.** The engine and its worker pool are page-shared. The guide says what was observed and not more.
- **Typings through API Extractor.** A `declare global` may not appear in the report. The fallback is a hand-kept declaration file checked by the pack check.
- **Panel layout follows the viewport**, so a small map on a wide page gets the desktop layout. Not caused by this plan, and filed separately.
- **No font.** Without Plex the type falls back and the layout may shift; the guide shows how to load it.

## Decided and open

Decisions, with the reasons above:

- A new package, `@mapcairn/browser`, not an `sdk` subpath or a `map` entry point.
- Light DOM.
- React and the engine bundled; the engine in a lazy chunk.
- The ES module only in the first release; #44's classic-script task is dropped from it. Revisit when a named page cannot use a module script.
- Plain data options (`basemaps`, `layers`, `languages`) and a narrow `services`, with the error classes re-exported. Selection is left out of the first release, because the SDK has no factory for a selection store outside its fakes (a follow-up).
- One announcer for each mount, with the single announcer kept for one React tree.
- `update()` keeps `theme` and `basemap`, observed as attributes; `language`, `label` and `tools` need a remount.
- Explicit `defineMapElement`, no registration on import.
- No source maps; notices travel with the files.
- Real browser adapters in the SDK stay a later plan.

Open, for the maintainer:

- **Bundling IBM Plex Sans.** It needs the SIL Open Font Licence 1.1 on the SDK allowlist. Recommendation: not in the first release; the guide shows how a page loads the font.
