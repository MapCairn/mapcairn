# 0018: A mount function, a prebuilt browser bundle and a custom element

Status: proposed. Tracking issues: [#44](https://github.com/MapCairn/mapcairn/issues/44) (the mount function and the bundle) and [#675](https://github.com/MapCairn/mapcairn/issues/675) (the custom element), both under [#51](https://github.com/MapCairn/mapcairn/issues/51). They ship together in the `0.3.0` SDK release, with the framework checks ([#676](https://github.com/MapCairn/mapcairn/issues/676)) and the getting-started pages ([#678](https://github.com/MapCairn/mapcairn/issues/678)). `0.3.0` is meant to be a substantial step towards `1.0.0`, so there is no cut line: the release is cut only when every step here, #676 and #678 have landed, and the steps are ordered for quality, not speed.

## Goal

A page with no React and no build step adds one stylesheet and one module script and gets a map from `mountMap(element)`, which returns a handle with `setView`, `on` and `destroy`. A page on Vue, Svelte, Solid, Angular or plain HTML gets the same thing as `<mapcairn-map>`, with services passed as properties and events as `CustomEvent`s. Both come from the one install the SDK already has, `@mapcairn/sdk`, at the subpath `@mapcairn/sdk/browser`. Neither needs React written or built by the page, several maps work on one page, and the code does nothing on a server. Everything here is added: no existing export, message key or stored value changes.

## Ground rules

- `AGENTS.md`: ports and adapters, no module-level services, no layer or provider id in a branch, tokens only, the SDK packages carry nothing that needs a licence agreement of their own, a new runtime dependency in an SDK package is the maintainer's call. This plan adds none: React, React DOM, MapLibre GL JS and the other bundled code are already production dependencies or required peers of the packages the umbrella depends on, and `npm run licence:sdk` already judges them there.
- The accessibility contract in `DESIGN.md` ("Components and accessibility contracts") holds, with one amendment for maps mounted outside React (see "The announcer"): the landmarks named through `useLandmarkName`, 44 px targets, visible focus, both themes.
- #44 asks for several maps on one page, each with its own services, clean teardown, a strict Content Security Policy with no `unsafe-inline`, and a size budget checked in CI. #675 asks for the shadow or light DOM choice, React inside or outside, placement, typings and no per-framework wrapper packages.
- The consumer check, the pack check and the release workflow already exist and are extended, not replaced (`docs/guides/releasing.md`). The umbrella is already in the release set, so this adds no package and no first publish. The getting-started pages are #678 and the framework checks are #676: they are their own issues in the same release, and this plan says what they must show ("Adopter experience") without writing them.
- #44 also asks for a classic script (IIFE). The first release ships the ES module only, for the reasons under "Decision: the ES module only"; #44's task for it changes when this plan is accepted; the issue body is unchanged until then.
- The release itself is [#679](https://github.com/MapCairn/mapcairn/issues/679).

## Adopter experience

The maintainer's priority is that nothing is complicated or confusing for the people who use the SDK. These rules shape the design and are tested (see "Tests").

- **One install, at most three routes.** `npm install @mapcairn/sdk` is the only install line. The getting-started page shows one table of at most three routes, each with who it is for, a snippet and nothing about how the SDK is built:

  | Route                             | For                                             | Import                                            |
  | --------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
  | React                             | An app written in React                         | `@mapcairn/sdk`                                   |
  | No React, with a build or without | A server-rendered page, Vue, Svelte, plain HTML | `@mapcairn/sdk/browser`                           |
  | Headless                          | Your own interface on any framework             | `@mapcairn/core` and `@mapcairn/adapter-maplibre` |

  The browser route's snippets are the real ones, three lines each:

  ```html
  <link rel="stylesheet" href="/mapcairn/browser.css" />
  <script type="module">import { mountMap } from "/mapcairn/browser.js"; mountMap(document.getElementById("map"));</script>
  ```

  ```html
  <link rel="stylesheet" href="/mapcairn/browser.css" />
  <script type="module" src="/mapcairn/browser-element.js"></script>
  <mapcairn-map></mapcairn-map>
  ```

  The React and headless rows link to the pages that exist today. Their snippets are not three lines (the React quickstart is about eighty), and shortening them is not in this plan; a composed React map component built from the same composition as `mountMap` would give it, and is an issue to file.
- **Fewest arguments, sensible defaults.** Every option of `mountMap` is optional. `mountMap(element)` and a bare `<mapcairn-map>` draw a working map: a world view, the built-in basemap, the system theme, zoom, compass, credits and the scale. Nothing else has to be passed to get a map.
- **No choice the adopter has to understand.** Where the code lives, that React is bundled, that the interface is in the page's own DOM and not a shadow root, and how announcements are shared are internal. They do not appear in an option, a type, an error message, the README or the guides. The guides say what a person must do (serve these files from your own origin, give the map a height, give each of several maps a `label`) and not why the SDK is built that way.
- **An honest frame.** The guide says what this route is: an accessible map with basemaps, tile layers, measure and settings. Search and Locate me appear when the page supplies a provider. The reference site's own adapters (its search, location, sharing and feed layers) are not included. A page that wants those writes a provider, or uses the React route with its own adapters.
- **Errors that name the fix.** Each `MountMapError` says what to do, for example `tools: "search" needs a search provider. Pass services.search, or remove "search" from tools.`, `This element already holds a map. Call destroy() on its handle first.`, and `workerUrl must be on this page's origin. Serve the browser files from your own site.` An element with no height logs one warning, `The map's element has no height, so nothing shows. Give it a height in CSS.`

## What exists

Read from `main`, so the design starts from facts.

- `examples/embed` composes the map by hand in about 300 lines (`ExampleApp.tsx`): `ServicesProvider`, `LiveRegionProvider`, `TooltipProvider`, `MapView` with a `chrome` render prop, `MapChrome` and its slots. The reference host does the same in `packages/web/src/app/AppChrome.tsx` and `App.tsx`. There is no composed, reusable map component in an SDK package.
- `Services` (`packages/core/src/ports/services.ts`) requires `createMapAdapter`, `search`, `location`, `settings`, `clipboard`, `fileSaver`, `url`, `theme`, `messages`, `preferences`, `layers` and `layerSource`. The real adapters for all but the MapLibre adapter live in `packages/web/src/adapters` and are not in any SDK package. `get-started.md` tells an outside app to use `createFakeServices` with the real map adapter. The interface sorts adapter failures with `instanceof` against core's error classes (`useSearch.ts:214`, `useSuggestions.ts:102`, `useLocate.ts:125`, `layerStatus.ts:50`, `useDirections.ts:341`, `useMapEngine.ts:75`), so an adapter that throws must use the same copy of `core` the interface was built with.
- `createMapLibreMapAdapter` takes `loadWorkerUrl`. `engineLoader.ts` loads `maplibre-gl` and its stylesheet once per page, shared by every adapter, and uses the first caller's worker URL.
- `@mapcairn/sdk` re-exports and holds no code. Its root imports neither the adapter nor the engine; the adapter is reachable only at the subpath `@mapcairn/sdk/adapter-maplibre`, whose one source file may import it (`umbrella-root-has-no-adapter` in `.dependency-cruiser.cjs`), and each subpath has its own API report in `packages/sdk/api`. `sdk` is in `SDK_PACKAGES` and builds with the others through `buildPackage.mjs`, which writes one module per source file with every import external. Its manifest lists the five MapCairn packages as `dependencies` and `maplibre-gl`, `react` and `react-dom` as required peers (`vitest` is optional).
- `createThemeStylesheet` in `@mapcairn/theme` already makes a host theme as a file, scoped to a selector the host owns.

## Design

### Decision: a subpath of `@mapcairn/sdk`, not a new package

Status: proposed.
Context: `mountMap` composes the interface and the adapter and calls `react-dom/client`, so it needs a home that may import the adapter. The maintainer's priority is one install name.
Options:

1. A separate package, `@mapcairn/browser`. Its tarball has no dependencies and no peers, so a Vue or server-rendered page installs only the bundle. It costs a first publish by hand (the umbrella and the adapter went through the same step), a trusted-publisher setup, one more entry in `SDK_PACKAGES` and the lists that follow it (release workflow loops, notes patterns, CI filter, `check.mjs`), and one more npm name for adopters to learn and choose between.
2. A subpath of `@mapcairn/sdk`, `@mapcairn/sdk/browser`, following `@mapcairn/sdk/adapter-maplibre`. One install name, no new npm name, no new trusted publisher and no change to the release workflow or `tarballs.mjs`. The first release that carries it is an ordinary one.
3. An entry point of `@mapcairn/map`. Refused: it would import the adapter, which breaks the layer table (`map` never imports an adapter or an engine). `map` already peers `react-dom`, so `createRoot` alone would not stop it.

Choice: option 2. The root export stays free of the bundle and of the engine, as it is free of the adapter today. The subpath's modules are built artefacts whose React and engine are private to them, so a React host that imports the root gets no second React, and a host that imports the subpath does not share React with it.
Name: `@mapcairn/sdk/browser`, with the files `browser.js`, `browser.css`, `browser-worker.js` and, for the element, `browser-element.js`.

What is lost against a separate package, said plainly:

- **A larger tarball.** The files add about 0.8 MB gzipped to the `sdk` tarball (see "React and the engine are bundled") and about 3.3 MB unpacked, against roughly 0.1 MB unpacked today. `SIZE_CEILINGS.sdk` in `packCheck.mjs` is 25,000 bytes now and stays 25,000 for everything in `sdk` that is not a `browser*` file, so a bundle slipping into the root's modules still fails. The `browser*` files get their own ceiling, set in step 3 from the real build at about one and a half times its packed size; the pack check measures the two groups apart.
- **An install a no-React user does not need all of.** `@mapcairn/sdk` depends on the five MapCairn packages and has `maplibre-gl`, `react` and `react-dom` as required peers. Measured for `0.2.0`, in an empty folder: `npm install @mapcairn/sdk --omit=peer` installs about 90 MB of `node_modules` (core 3.1 MB, map 2.5 MB, adapter 0.5 MB, theme 0.3 MB, react 0.1 MB, and their dependencies) and none of `react`, `react-dom` or `maplibre-gl`; a plain install adds those three. The bundle needs none of the installed packages or the peers at run time: the page serves only the `browser*` files, copied or served from `node_modules/@mapcairn/sdk/dist`.
- **Mitigation.** The guide says the peers install but are never loaded, and that only the `browser*` files are served. It mentions `--omit=peer` only for an install folder used for nothing else: in an existing project the flag drops every package's peers and the next plain `npm install` brings them back, and npm still checks peer ranges, so a project that holds React 18 elsewhere gets an `ERESOLVE` against `sdk`'s React 19 peer, which the guide names. The peers stay required: making them optional with `peerDependenciesMeta` would stop npm installing `react`, `react-dom` and `maplibre-gl` for every existing user of the root and the adapter subpath, and make pnpm's strict mode fail for them, a change to the root's install behaviour in order to help a new route. Revisit if adopters report the install weight as a problem; the move is then a separate package that republishes the same files, at the cost of one first publish.

Public surface: new entry points of `sdk` (`./browser`, `./browser/styles.css`, `./browser/worker`, `./browser/element`, and the opt-in `./browser/react-jsx` and `./browser/vue`), each with its own API report beside `adapterMaplibre.api.md`. The root, the other subpaths and the five packages do not change. Minor release.

**What the umbrella rules become.** "Holds no code of its own" and "re-exports only" (the `ARCHITECTURE.md` layer table and umbrella paragraph, `AGENTS.md`, and the `.dependency-cruiser.cjs` rules `umbrella-reexports-entry-points-only` and `umbrella-root-has-no-adapter`) change to: the root and every subpath except `browser` still re-export only, and the root still imports neither the adapter nor the engine; the `browser` subpath is source under `packages/sdk/src/browser/`, built as a self-contained bundle, and may import every SDK package and React. A new rule keeps the root and the re-export files from importing `src/browser`, and `umbrella.test.ts` gains the same drift check. Nothing outside `sdk` imports it, as today.

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

Choice: option 1. The bundle's stylesheet is one file the page links, so strict CSP needs no `adoptedStyleSheets` and no nonce, and the existing browser checks and axe runs apply unchanged. The cost is that the page's CSS reaches the interface. The vanilla-extract class names are hashed, so only element selectors and inherited properties of the page leak. Two more costs of several maps in one document are handled in "Several maps on one page" below. The hostile-CSS check is owned by step 5.
Public surface: none beyond the element's own markup, which is not public.
Revisit when a measured conflict with page CSS cannot be fixed in the interface's own rules. The move then costs the six focus reads, the skip link, the token selectors and the font, and could be an opt-in.

### Decision: React and the engine are bundled, privately

Status: proposed.
Context: #675 asks for the gzipped cost of bundling React against taking it as a peer.
Measured with a throwaway build outside the repository, Vite 8 with Rolldown, minified, `react` 19.3.1, `maplibre-gl` 6.19.0. The entry mounted `MapView`, `MapChrome`, `EndStack`, `SearchPill`, the sheet and its content, the data layers, the measure tools and the MapLibre adapter, and built its services with `createFakeServices`. The real package also fills the ports its tools do not use with core's fakes (see "Services"), so fakes ship in the real bundle too and these figures describe a similar composition. They are not an upper bound. Ceilings are set from the real build in steps 3 and 5, after step 2.

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
Choice: bundled. The bundle's React runs only in its own roots and is never shared, so a React host cannot end up with two copies in one tree. A React app uses the root of `@mapcairn/sdk` and its components, not this subpath.
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

`MountServices` is a `Pick` of `Services`: `search`, `suggestions`, `location` and `layerSource`. The page may not replace the map adapter, settings or theme. Because a provider written on the page is sorted by the interface with `instanceof`, the bundle re-exports the classes a provider throws and reads: `MapEngineError`, `SearchError`, `LocationError`, `LayerError` and `PortAbortError`, so a page writes `import { mountMap, SearchError } from "/mapcairn/browser.js"` and a provider's failure is understood. Two copies of the bundle on a page do not share these classes; each map works with providers written against its own copy.

`MapEvents` has `viewchange` (a `ViewState`, at move end, as `MapView`'s `onViewChange` reports it), `click` (the position), `featuretap` (what `MapDataLayers`' `onFeatureTap` reports) and `error` (a `MapEngineError` or a `MountMapError`). Payloads are plain data, never React objects or DOM nodes. `MountMapError` is thrown, synchronously, for a call that cannot work: an element that already holds a map, a `tools` entry whose provider is missing, a definition that is not valid, a `basemap` id that is not in the catalogue.

**Services, and the smallest honest first release.** The SDK ships no real adapter for search, location, the clipboard, saving files or loading feed layers; they are the reference host's, and moving about a thousand lines of them into an SDK package is a boundary change that is not on this path. So the first release is what works with none of them: a map with the built-in basemaps or the page's own, tile layers from definitions, the measure tool, the settings that live in memory, the light and dark themes, the credits and the accessible chrome. Search and Locate me are there only when the page writes a provider.

- The subpath builds the rest from what the SDK has: the MapLibre adapter with the worker URL, the English messages, an in-memory settings store and in-memory URL state, so a map reads and writes nothing on the device and never touches the page's address, and a theme source, device preferences and a file saver written in the package (small, and the only new browser code).
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

### Decision: lazy-load `@turf/jsts` first

Status: proposed. It is step 2, its own issue, before the bundle build, because bundle weight is the biggest adopter cost.
Measured with the throwaway build below, `@turf/jsts` is about 385 KB of the 1.5 MB (unminified) eager chunk, and with the `polyclip-ts`, `bignumber.js` and `splaytree-ts` beside it about 464 KB, which is about 65 to 85 KB gzipped in an unminified measure, roughly a fifth of the eager gzipped size. Nothing the first release composes uses it: the entry did not import the draw tool, yet it stayed in the graph. The step's first task is to find what retains it (`core/src/geometry/operations.ts` imports `@turf/buffer`, `union`, `difference` and `intersect`; the question is which importer from `map` keeps that module live, and whether a barrel or a missing `sideEffects` entry does it). The fixes, in order of preference: remove a false retention; mark the module side-effect free; load it with a dynamic import where its caller is already asynchronous. It does not turn a synchronous public function into an asynchronous one, which would be a breaking change; if that is the only route, the step reports it and stops. The saving is re-measured minified and recorded in the pull request, and it lowers every size below.

### Decision: the build and the files

Status: proposed.
`buildSdk.mjs` runs `buildPackage.mjs` for each package, and `buildPackage.mjs` writes one module per source file with every bare import external. Step 3 adds a bundle mode, chosen by a field in `packages/sdk/package.json` that names the entries to bundle (`browser` and `browser-element`), that bundles those and builds the rest as before. `entryPointsOf` refuses an export with no `@mapcairn/source` condition, `apiReports.mjs` (line 101) iterates it, and the pack check names every file an export lists, so the stylesheet and the worker are exports too (`./browser/styles.css` and `./browser/worker`) and `entryPointsOf` learns to skip them as it skips `.css`. The output in `dist`:

- `browser.js`: the ES module, with React bundled and the engine in a lazy chunk beside it (`browser-engine-<hash>.js`). The build defines `process.env.NODE_ENV` as `"production"`, because Vite's library mode does not and React and the interface test it. `browser-element.js` registers the element on import and shares the chunks.
- `browser.css`: the token stylesheet, the interface's, the adapter's and MapLibre's, in one file. `engineLoader.ts:29` imports `maplibre-gl/dist/maplibre-gl.css` dynamically; in bundle mode that import must land in `browser.css`, and no chunk may create a `<link>` or a `<style>` element at run time (test 5 and the CSP leg check it).
- `browser-worker.js`: the engine's worker, a plain same-origin file. The build copies it from `maplibre-gl/dist` as a file. It is not imported from `packages/sdk/src`, because dependency-cruiser's `map-engine-libraries-only-in-engine-adapters` rule (`.dependency-cruiser.cjs:248`) refuses an engine import outside the adapter and the host's `workerUrl.ts`. The adapter is told where it is with `loadWorkerUrl`, from `new URL("browser-worker.js", import.meta.url)` or `options.workerUrl`. A worker must be same-origin, so the files are served from the page's own origin; a CDN needs the page to host the worker or allow `blob:` in `worker-src`, which the guide says. The first map's worker URL wins for the whole page (`engineLoader.ts:19`).
- `browser.d.ts`, `browser-element.d.ts` and the opt-in declaration entries below.
- No source maps for the bundle files. The pack check requires each map's sources to sit under the package's own `src`, and a bundle's maps name other packages' files. The sources are public, so the minified files are enough, and the pack check accepts bundle files without maps.

`sdk`'s `sideEffects` is `["**/*.css"]`, so `browser-element.js`, which registers the element on import, is added to it, or a bundler would drop the import. The notices file below is generated at build, git-ignored and listed in `sdk`'s `files`. The pack check needs a per-package allowance for it, because `EXPECTED_FILES_FIELD` (`packCheck.mjs:47`) holds every package to `["dist", "!dist/.built"]`, `ROOT_FILES` allows only `package.json`, `README.md` and `LICENSE`, and `DIST_ENDING` takes no `.md`: a small per-package table (`sdk` only) adds the file to the expected `files` and to the allowed and required root files. `buildPackage.mjs` builds `./styles.css` as it does (`stylesheetOf` returns the first `.css` export only, and `hasHandWrittenStylesheet` copies `src/styles.css`); in bundle mode the bundle build writes `browser.css` itself, named by the bundle field, so `stylesheetOf` is not asked for a second stylesheet and `entryPointsOf` already skips every `.css` export.

**Declarations.** The existing roll-up cannot serve the bundle entries as it stands: `rollUpDeclarations` (`buildPackage.mjs:219`) sets no `bundledPackages`, and `shareDeclarations.mjs` rewrites a non-main entry's imports of names the main entry exports to import them from the package. For the bundle entries the roll-up sets `bundledPackages` for the SDK packages and skips that rewrite, so the declarations are self-contained: core's port types that the options and events name (`ViewState`, `BasemapDefinition`, `LayerDefinition`, `MapEngineError`, the provider interfaces) are inlined and become part of the `browser` API report. The test is `publint` and `attw` over the packed tarball, plus a script test that `browser.d.ts` imports no `@mapcairn/*` and no `react`.

**Licences.** `licence:sdk` still judges `sdk` as it does now, through its dependencies and required peers, which are what the bundle is built from. It does not read what the bundler pulled in. Step 3 adds a check inside the build: the bundler's module graph gives the set of packages that reached the output, build tools excluded (`vite`, `typescript`, API Extractor), and each is judged against `scripts/sdkLicences.allowlist.json` with the same SPDX evaluation `sdkLicences.mjs` uses. The build fails on one that is not allowed. `@turf/jsts` is `EDL-1.0 OR EPL-1.0`; the notice takes the EDL side explicitly and ships the EDL text. The licence text of each package comes from the installed package's own licence file, not from the lockfile, which holds no text. The build writes `THIRD-PARTY-NOTICES.md` at the root of `packages/sdk` (name, version, licence, text). It is generated, not committed, so it cannot go stale, and `.gitignore` lists it.

### Decision: the custom element

Status: proposed.
`defineMapElement(name = "mapcairn-map")` registers the element and returns its class; it is idempotent (it checks `customElements.get`), so two copies of the bundle on one page do not throw. Importing `browser.js` registers nothing. A plain page that only wants the tag loads `browser-element.js`, which calls `defineMapElement()` on import (it is listed in `sideEffects`) and exports nothing, so the bare `<mapcairn-map>` route needs no script of the page's own.

- Attributes: `latitude`, `longitude`, `zoom`, `bearing`, `basemap`, `theme`, `label`, `language` and `tools` (space separated). Changes to the four view attributes call `setView`; `basemap` and `theme` call `update`. `label`, `language` and `tools` are read when the element connects and change only by removing and inserting the element: `label` and `tools` name landmarks and compose tools, which `update` would have to rebuild, and `language` is not observed because the language is also a person's choice in Settings, kept in the map's memory, and an attribute that overwrote it would fight them.
- Properties: `services`, `basemaps`, `layers`, `languages` (objects, so they cannot be attributes), `view`, and a read-only `map` for the handle. The view has two inputs, the attributes and the `view` property; the latest write wins, they are read once at connect for the starting view, nothing is ever written back to an attribute, and a `setView` with the view the map already has does nothing.
- Events, as bubbling, composed `CustomEvent`s with the handle's payload in `detail`: `mapcairn-view-change`, `mapcairn-click`, `mapcairn-feature-tap` and `mapcairn-error`. They carry a prefix because a bare `click` is the browser's. An error thrown while mounting, which has no caller to receive it, is dispatched as `mapcairn-error` with the `MountMapError` in `detail`.
- Lifecycle. Frameworks move elements by removing and inserting them, and a mounted WebGL map that is destroyed and rebuilt in the same tick loses its context for nothing. So `connectedCallback` and `disconnectedCallback` only schedule work for a microtask: the mount runs if the element is still connected, the destroy is skipped if it is connected again by then. Setting a data property (`services`, `layers`, `basemaps`, `languages`) before or in the same tick as connecting changes what the one pending mount reads; setting one after the map is mounted remounts it once, however many are set in that tick.
- `connectedCallback` mounts with the container as the element itself; children placed inside it (a fallback sentence) are replaced when the map mounts, so progressive enhancement works.
- The stylesheet gives `mapcairn-map` `display: block`, because an unknown element is inline. The page still has to give it a height, as for any map.
- Server rendering: the module guards `HTMLElement` and `customElements` behind `typeof`, so `class extends HTMLElement` is never evaluated in Node and an import does nothing. The consumer check's plain-Node import of every entry point (`entryPoints.test.ts`) already fails a read of `window` or `document` at load, so it covers this once the package is in the release set.

**Typings.** The `HTMLElementTagNameMap` entry for `mapcairn-map` ships in the main declarations, because it costs nothing where the types are not used. The JSX and Vue augmentations are separate entries a project opts into (`@mapcairn/sdk/browser/react-jsx`, `@mapcairn/sdk/browser/vue`), because a project without `@types/react` or `vue` would fail to compile if the main file named them. They are shaped as ordinary entries, an empty module with the declaration beside it, so `entryPointsOf` (which refuses an export without `default` and the source condition), `apiReports.mjs` (which iterates `entryPointsOf`, line 101), `publint`, `attw` and the consumer check treat them like every other entry and need no special case. Whether API Extractor reports a `declare global` block at all is not known (no package declares one today) and is the first thing step 5 settles, with a fallback of a hand-kept declaration file listed in the pack check.

**What is not in this plan:** a wrapper package for any framework (#675 rules them out), and the text of the framework checks (#676) and the getting-started pages (#678), which are their own issues in the same release.

### Public surface, in one place

Added: the entry points of `@mapcairn/sdk` listed above and their API reports (`mountMap`, `defineMapElement`, `MountMapOptions`, `MountLanguage`, `MountServices`, `MapHandle`, `MapEvents`, `MapTool`, `MountMapError`, the re-exported error classes and the core types they name, the element class); the element name `mapcairn-map`, its attributes, properties and four event names; the global declarations; the files in `dist` and the `exports` entries. Each is a contract from the first release, so the names above are final wording once the plan merges.
Changed: the development warning of `LiveRegionProvider`, and the sentences of `DESIGN.md` and `ARCHITECTURE.md` that describe the announcer and the umbrella. No export, type, message key or stored value changes.
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
2. **Size, script test.** The built bundle's module list holds no `@turf/jsts` in the eager chunk (step 2 reads the `examples/embed` production build until step 3 gives a bundle to read).
3. **`sdk` browser entry, unit (happy-dom).** The entry keeps an internal `mount` that takes a `Services` builder, and the public `mountMap` calls it with the real one, so a test passes a `FakeMapAdapter` factory without widening the public options. Two instances: a view change in one is not seen by the other, there are two status regions and each sits in its own container, ids do not repeat across the two, and destroying one leaves the other working. Teardown: after `destroy()` the container is empty and has no `data-theme` or marker, the adapter's `destroy` ran once, every `addEventListener` on `document` and `window` has a matching `removeEventListener` (spied), `vi.getTimerCount()` is zero, a second `destroy()` does nothing, `getView()` still answers, and `ready` rejects with kind `destroyed` when it is called before the fake mounts, with no unhandled rejection. Events: each type fires with its payload and its unsubscribe stops it. A `tools` entry with no provider throws `MountMapError`; so does an invalid definition, a second `mountMap` on one element and a cross-origin `workerUrl`, each with a message that names the fix. `ready` rejects with a `MapEngineError` when the fake fails to mount. A test replaces each unused stand-in with an object that fails on any call and renders every composed tool; another proves the layers section's save action reaches the package's file saver. A provider that throws the re-exported `SearchError` shows the search status for its kind.
4. **Server.** With `environment: "node"` the module imports, `defineMapElement()` returns without defining anything, and `mountMap` throws a clear `MountMapError` instead of reading `document`. The consumer check's plain-Node import of every entry point covers the new subpaths too.
5. **Build output (script tests, no browser).** `dist` holds the files above; `browser.js` and its chunks import no bare specifier (nothing left external); `process.env.NODE_ENV` is replaced; the engine chunk imports no stylesheet and `browser.css` holds MapLibre's rules; no bundle file creates a `link` or `style` element; the worker is a copy of `maplibre-gl/dist`'s; `browser.d.ts` imports no `@mapcairn/*` and no `react`; the notices file names every bundled package with its licence and its text; a bundled package with a licence off the allowlist fails the build (a fixture); the root and the other subpaths still import neither the bundle nor the engine; `publint`, `attw` and the size ceilings pass, and the consumer check's second app, which lists only `@mapcairn/sdk`, still shows its root never reaching `maplibre-gl` or the adapter.
6. **Element, unit.** `defineMapElement` twice defines once, and `browser-element.js` registers on import; each observed attribute reaches `setView` or `update`, and `label`, `language` and `tools` changes do not; the data properties reach `mountMap`; a property set before and in the same tick as connecting mounts once, and one set later remounts once; moving the element (remove then insert in one tick) does not destroy the map; each event is a bubbling `CustomEvent` with the payload in `detail`; a `MountMapError` from connecting arrives as `mapcairn-error`; no attribute is written back; children are replaced on mount.
7. **Adopter acceptance.** The plain-page example's script and the element example are each under about ten lines, counted by a test that reads the files; each draws a map with no option passed; a page that imports the root of `@mapcairn/sdk` and one that imports `@mapcairn/sdk/browser` build with plain Vite and webpack and each gets exactly one React for the root's page; a docs test fails when an adopter-facing page (the README, the guides for the browser route, the error messages) names the shadow DOM, the announcer, the bundling of React or the package layout; the `adopter-check` skill runs against the release candidate, and its stuck points are fixed before the stable release.
8. **Browser, Chromium through Playwright, against the real packed bundle.**
   - Step 5: a plain HTML page, no build, under `buildContentSecurityPolicy`. The map draws over the consumer check's fixture tiles, with no policy violation and no console error. Two maps on one page, one destroyed, the other still draws. After `destroy()` no `.maplibregl-canvas` and no live region of that map is in the page. An init script wraps `EventTarget.prototype.addEventListener` and `removeEventListener` (and `Worker`) before the bundle loads, so listeners and workers are counted on the real page and not only through the fake adapter; the guide says what was seen. A page with hostile global CSS (element selectors on `button`, `*` margins, a global `box-sizing`, and a page-level `[data-theme="dark"]` rule over a light map) leaves the chrome's targets at 44 px with a visible focus ring and the map's own theme. This step owns the hostile-CSS check.
   - Step 7: axe in light and dark over the `<mapcairn-map>` page and the function page, in two sample languages, one left-to-right and one right-to-left. The example builds them from the English messages (pseudo-translated, and the second marked `rtl`) through the `languages` option, so the SDK's English-only catalogue and the rule that an example imports public entry points only both hold, and with `dir="rtl"` on the element. The keyboard walk (Tab reaches search, the controls and the credits in order, arrows pan, Escape closes a sheet and focus returns to the control that opened it) runs with `<html dir>` set to match, because the scripted direction reads only `<html dir>`.
9. **Upgrade and existing checks.** The consumer check's plain-Node import, bundler resolution and upgrade legs pass with the new subpaths, which is what #676 builds on.

## Order of work

Each step is one pull request that leaves the build and `npm run check` green and ships on its own, and they are issues once the plan merges (`split-plan`). The order is for quality: the weight is cut before the bundle is built, the function route is proved in a real browser before the element is added, and the checks and the guides come last. There is no cut line. `0.3.0` carries all of it, with #676 and #678, and the release is cut only when every step and those two issues have landed.

1. **One announcer for each mount.** Change `LiveRegionProvider` to warn only for a provider nested in another, with test 1, and say in `DESIGN.md` (line 151) and `ARCHITECTURE.md` ("Announcement flow") that the single announcer holds for one React tree and that each mounted map outside React has its own. Files: `packages/map/src/ui/LiveRegion/LiveRegion.tsx` and its test, `DESIGN.md`, `ARCHITECTURE.md`. Part of #44.
2. **Take `@turf/jsts` out of the eager chunk.** Find what retains it, fix it as "Decision: lazy-load `@turf/jsts` first" says, record the minified saving, with test 2. Files: `packages/core/src/geometry/*` and the `map` imports that keep it, `packages/*/package.json` (`sideEffects`). Part of #44.
3. **The bundle build and a first `mountMap`.** Bundle mode in `buildPackage.mjs`, the `browser` entries and exports of `sdk`, the output above (`bundledPackages` for the declarations, `process.env.NODE_ENV`, the stylesheet merge, the worker copy), the bundled-licence check and the notices file, the API reports, the dependency-cruiser, `ARCHITECTURE.md` and `AGENTS.md` changes ("What the umbrella rules become"), the amendments to `packages/core/src/lint/umbrella.test.ts` (the `sideEffects` equality near line 209, the export list near 230, the one-file-for-each-subpath rule near 267, the only-re-exports rule near 276 and the adapter-and-engine-only-in-their-own-subpath rule near 290, each excepting `browser`, plus the new rule that the root and the re-export files never import `src/browser`), the per-package pack allowances and the separate ceiling for the `browser*` files. `mountMap` renders `MapView` with zoom, compass, attribution and the scale readout (`MapChrome` with `mainLandmark={false}`, `EndStack`, `Attribution`, `MapReadout`), takes `view`, `basemaps`, `basemap`, `theme`, `label`, `workerUrl` and `services`, returns the handle with `ready`, `getView`, `setView`, `update`, `on` and `destroy`, prefixes each root's ids, re-exports the error classes, and has tests 3 (apart from the tools, definitions and languages cases), 4 and 5. Browser check of worker release on destroy, recorded for the guide. No new dependency, so no lockfile change. Files: `packages/sdk/**`, `scripts/buildPackage.mjs`, `scripts/shareDeclarations.mjs`, `scripts/release/packCheck.mjs`, `.dependency-cruiser.cjs`, `ARCHITECTURE.md`, `AGENTS.md`. Part of #44.
4. **Layers, languages and the tools.** The `layers` and `languages` options through the catalogue factories, and the `tools` option: the sheet with the basemap, layer and settings sections, search, measure and locate, composed as `examples/embed` and the host compose them; the package's file saver; `MountMapError` for a tool without its provider and for an invalid definition; the `featuretap` event; the rest of test 3. Files: `packages/sdk/src/browser/**`. Part of #44.
5. **A plain page, the consumer leg and the ceilings.** `examples/browser`: `index.html` using the packed script and stylesheet (the example files of test 7, each under about ten lines); a leg in `scripts/release/` that packs `sdk`, serves a copy of the page under `buildContentSecurityPolicy` and runs the step 5 cases of test 8, including the hostile-CSS page; `BUNDLE_CEILINGS` entries for the first load (script and stylesheet) and the engine chunk at about 1.15 times the measured size; the consumer check's bundler legs for the new subpaths. Files: `examples/browser`, `scripts/release/*`, `.github/workflows/ci.yml` (the `sdk-packages` filter if needed), `docs/guides/releasing.md`. This is the plain-page task of #44.
6. **The custom element and its typings.** `defineMapElement`, the element and its lifecycle, `browser-element.js` and its `sideEffects` entry (with the matching `umbrella.test.ts` change to the `sideEffects` expectation), the stylesheet rule, the declaration entries (with the `declare global` spike), test 6 and test 4's element case, and `<mapcairn-map>` on the example page. Files: `packages/sdk/src/browser/element/**`, `packages/sdk/api`, `scripts/buildPackage.mjs` if the spike needs it, `examples/browser`. Part of #675.
7. **Accessibility and keyboard checks.** The step 7 cases of test 8 as a Playwright project for the example that `npm run a11y` runs (its place in `packages/web/playwright.config.ts`, or a config of its own, is chosen in the issue after reading the config), and the adopter-acceptance docs test of test 7. Files: Playwright config and specs. Part of #675.
8. **The guides and the clean-up.** The guide for a server-rendered page (the files to serve from the page's origin, that the peers install but are never loaded, `--omit=peer` for a folder used for nothing else and the React 18 conflict, the worker, loading Plex, giving the map a height and each of several maps a label, the known direction limit and the CDN note), the `content-security-policy.md` section for the bundle, the `sdk` README, `without-react.md`'s route list, `capability-matrix.md`, `public-api.md`, `README.md` and `ROADMAP.md`; the plan is deleted with its README entry. #678 writes the getting-started pages with the route table above and #676 checks the frameworks against the element; both are their own issues, in the same release, and step 8 makes the guides agree with them. Part of #44 and #675.

The release is #679, cut only when steps 1 to 8, #676 and #678 have landed.

## Documents to update

`ARCHITECTURE.md` (layer table and umbrella paragraph, "Building the SDK packages", "Announcement flow"), `AGENTS.md` ("About" and the Architecture list, which say the umbrella holds no code), `DESIGN.md` (the `LiveRegion` row), `docs/guides/releasing.md` (the ceilings, the pack and consumer checks), `sites/docs/docs/guides/content-security-policy.md`, `capability-matrix.md`, `public-api.md`, `extending.md` (theme scope and fonts for a mounted map), `without-react.md` (the "Next" route list at its end), the getting-started page (#678), the `sdk` README, `README.md`, `ROADMAP.md` (embedding row), and a guide for the server-rendered page. `PRIVACY.md` and `.github/SECURITY.md` do not change.

## Risks

- **Page CSS reaches the interface** (light DOM). Hashed class names limit it to element selectors and inherited properties; the hostile-CSS check in step 5 fails a regression, and shadow DOM is the revisit.
- **The bundle is large.** About 328 KB gzipped to first load and 483 KB more when the engine loads, measured with fakes included and before step 2; both are re-measured from the real build. The ceilings fail growth. A page that needs less uses the headless route.
- **A larger `sdk`.** The tarball and an adopter's `node_modules` grow (see the placement decision). The guide says what to install and what to serve, and the separate package stays the revisit.
- **The services gap.** A page that wants sharing or feed layers must write an adapter, and one that wants search or Locate me writes a provider against the bundle's error classes. The loud `MountMapError` and the guide say so; the remedy is a plan of its own.
- **Two bundle copies on a page** do not share error classes, the engine loader or the announcer. `defineMapElement` is idempotent, so registration is safe, but a provider written against one copy is misread by the other. The guide says to load one copy.
- **Teardown is not total.** The engine and its worker pool are page-shared. The guide says what was observed and not more.
- **Typings through API Extractor.** A `declare global` may not appear in the report. The fallback is a hand-kept declaration file checked by the pack check.
- **Panel layout follows the viewport**, so a small map on a wide page gets the desktop layout. Not caused by this plan, and filed separately.
- **No font.** Without Plex the type falls back and the layout may shift; the guide shows how to load it.
- **The root's bundler behaviour.** A bundler that follows `sdk`'s `exports` must not reach the bundle from the root. The consumer check's module-graph leg (test 5) fails it.

## Decided and open

Decisions, with the reasons above:

- A subpath of `@mapcairn/sdk`, not a new package or a `map` entry point.
- Light DOM.
- React and the engine bundled; the engine in a lazy chunk; `@turf/jsts` out of the eager chunk first.
- The ES module only in the first release; #44's classic-script task is dropped from it. Revisit when a named page cannot use a module script.
- Plain data options (`basemaps`, `layers`, `languages`) and a narrow `services`, with the error classes re-exported. Selection is left out of the first release, because the SDK has no factory for a selection store outside its fakes (a follow-up).
- One announcer for each mount, with the single announcer kept for one React tree.
- `update()` keeps `theme` and `basemap`, observed as attributes; `language`, `label` and `tools` need a remount.
- Explicit `defineMapElement`, with `browser-element.js` as the registering import for a plain page.
- The peers of `sdk` stay required.
- No source maps for the bundle; notices travel with the files.
- Real browser adapters in the SDK stay a later plan.
- One release carries all of it, with no cut line.

Open, for the maintainer:

- **Bundling IBM Plex Sans.** It needs the SIL Open Font Licence 1.1 on the SDK allowlist. Recommendation: not in this release; the guide shows how a page loads the font.
