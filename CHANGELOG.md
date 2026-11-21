# Changelog

What changed in each release of the SDK packages: `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react`, `@mapcairn/theme`, and from `0.1.0-rc.3` `@mapcairn/adapter-maplibre` and `@mapcairn/sdk`. They are released together under one version, so one list covers all of them, newest release first.

Each entry says what you can now do and what to change when you upgrade, grouped by what it means for someone using the SDK. The same text is the body of the GitHub Release. The style guide is in `docs/guides/releasing.md`.

## 0.1.0 (2026-11-21)

This is MapCairn's first release. MapCairn is an open-source SDK for maps that serve the public: open data maps, hazard maps and the other maps a council, a research group or a community puts in front of people. It gives you the whole interface around a map, on MapLibre GL JS, React and a set of typed design tokens, so your team can spend its time on the data instead. The repository also holds the playground, a reference site built from these same packages.

### What is new

**One install.** For most apps, `@mapcairn/sdk` is the only MapCairn package you need:

```bash
npm install @mapcairn/sdk react react-dom maplibre-gl
```

It needs React 19 and `maplibre-gl` 6.18 or later. One stylesheet, `@mapcairn/sdk/styles.css`, brings in the tokens, the interface and the engine's styles. The interface comes from `@mapcairn/sdk` and the MapLibre adapter from `@mapcairn/sdk/adapter-maplibre`, so an app that never imports the adapter carries no map engine. The [quick start in the README](https://github.com/MapCairn/mapcairn/blob/main/README.md#embed-a-map) is a whole app in three files.

**Six packages, released together.** They share one version and one changelog.

- `@mapcairn/sdk`: everything below, from one name. It has no code of its own.
- `@mapcairn/core`: the ports (the small interfaces every service sits behind), the pure logic, the basemap definitions, and an in-memory fake and a shared contract suite for each port. No React and no browser globals.
- `@mapcairn/map`: the map interface, `MapView` and the services provider.
- `@mapcairn/react`: generic React hooks.
- `@mapcairn/theme`: the typed design tokens for the light and dark themes, and their contrast checks.
- `@mapcairn/adapter-maplibre`: the MapLibre GL JS adapter and its engine styles, with `maplibre-gl` as a peer dependency.

The single packages are the advanced option, for a host that wants fewer dependencies or only one piece, such as `@mapcairn/core` on its own in a test.

**A finished map interface.** Out of the box you get:

- a choice of basemaps, on a flat map or a globe;
- place search, with suggestions as you type if the host turns them on;
- measuring distance and area, and drawing and editing points, lines, polygons and circles;
- importing and exporting shapes as GeoJSON, CSV and WKT, and links that share the view, the basemap, the layers and the shapes;
- data layers written as data (feeds, raster and vector tiles, heatmaps, and queries for what is in view), with the key, the feature card and the list built for you;
- a pin, whose address is looked up only when someone asks;
- saving the map as an image;
- zoom, compass and locate controls, and a bottom sheet that becomes a side panel on a wide screen.

You can test all of it without WebGL or a network, on the fakes, and check an adapter of your own against the same contract suite as the fake.

**Your own colours, checked.** `createThemeStylesheet` gives the interface your colours for its 14 colour roles, in light and dark, and refuses a theme that falls below WCAG 2.2 AA. `checkThemeContrast` tells you why. The [theming guide](https://github.com/MapCairn/mapcairn/blob/main/docs/guides/extending.md#theme-the-sdk-with-your-own-colours) walks through it.

**English, Afrikaans, and your language.** Every word of the interface is looked up by key in a message catalogue. The SDK ships British English and the reference site adds Afrikaans. A host can supply a catalogue for any other language, written left to right or right to left, and the layout mirrors to match. The [translation guide](https://github.com/MapCairn/mapcairn/blob/main/docs/guides/translate-the-sdk.md) says what the SDK supplies and what a host supplies.

**Directions, through a routing provider you choose.** Routes and travel-time areas go through a `RoutingProvider` that the host passes in. The SDK ships none and carries no provider's terms. The playground uses the public Valhalla server run by the FOSSGIS community, a shared service for light use under its own usage terms, with no promise that it stays up. A commercial or busy site should run its own Valhalla or pay for a routing service. [Add a routing provider](https://github.com/MapCairn/mapcairn/blob/main/docs/guides/extending.md#add-a-routing-provider) has the details.

**Accessible.** WCAG 2.2 AA is the target, in both themes. Every gesture has a keyboard or single-tap equivalent, focus is always visible, and changes on the map are announced to screen readers through one live region. Automated accessibility checks run on every pull request.

**Private by default.** The SDK has no accounts and no tracking. Apart from the basemap, nothing is requested until a person asks: a layer loads when it is turned on, a search when it is submitted, an address or a route when one is asked for. Search suggestions are the one exception, and only if the host turns them on, because they send the text typed so far. The panels that tell people what is sent take the host's own words. The reference site has no tracking beyond cookieless page views, and [its privacy policy](https://github.com/MapCairn/mapcairn/blob/main/PRIVACY.md) says plainly what each provider receives. Place search and routing receive the site's address as the referrer, because their terms ask for one, and the map's tile requests carry it too.

**Open source.** MapCairn is licensed under AGPL-3.0-only, an open-source licence that allows commercial use. If you distribute an app that includes the SDK, including by serving it to people's browsers, you must offer them the corresponding source of the code you combine with the SDK and serve with it, under the same licence. If you modify the SDK and let people interact with your modified version over a network, you must offer them its corresponding source. [What the licence means for your project](https://github.com/MapCairn/mapcairn/blob/main/docs/guides/licence.md) explains it in plain words. A licence for closed-source use is not on offer yet. Every production dependency of the SDK packages has a permissive licence, and the lint checks that on every change.

**Where it stands.** `0.1.0` is for early adopters. While the version starts with `0.`, a minor release can contain a breaking change to the public API and a patch release is not meant to, so a `^0.1.0` range takes patch releases but not the next minor release. Each release's notes name the breaking changes it finds, and [what counts as the public API](https://github.com/MapCairn/mapcairn/blob/main/docs/guides/public-api.md) says what is covered. Some things are not here yet: there is no generated API reference site, so the guides and the type declarations are what you read; no map engine but MapLibre; no tilt, terrain or 3D buildings; no mounting without React; no clustering of dense points and no offline use. The [capability matrix](https://github.com/MapCairn/mapcairn/blob/main/docs/guides/capability-matrix.md) lists what MapCairn has, partly has and lacks.

**Where to ask, report and help.** Ask a question in [Discussions](https://github.com/MapCairn/mapcairn/discussions), and report a bug in the [issue tracker](https://github.com/MapCairn/mapcairn/issues). Report a security problem privately, as [`SECURITY.md`](https://github.com/MapCairn/mapcairn/blob/main/SECURITY.md) explains, not in an issue. To contribute, [`CONTRIBUTING.md`](https://github.com/MapCairn/mapcairn/blob/main/CONTRIBUTING.md) has the checks and conventions, and a first pull request asks you to agree to the [contributor licence agreement](https://github.com/MapCairn/mapcairn/blob/main/CLA.md).

### Thanks

Thank you for reading this far and for giving MapCairn a try. If it helps you put a useful map in front of the public, tell us about it in Discussions: that is how the next release gets better.

## 0.1.0-rc.3 (2026-11-21)

### What is new

This is the release where one install gets you a real map. Until now the four packages gave you the interface around a map, and the MapLibre adapter that draws the map itself lived inside the reference site for you to copy. Two new packages change that, and every package in the set is now at `0.1.0-rc.3`.

**`@mapcairn/sdk`, the front door.** It re-exports `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme` from one name, so an app installs one package and imports from one place. `@mapcairn/sdk/styles.css` brings the theme tokens and the interface styles in one line. The four packages are still published on their own, for a host that wants only one of them, and the subpaths `@mapcairn/sdk/core`, `@mapcairn/sdk/map`, `@mapcairn/sdk/react` and `@mapcairn/sdk/theme` reach each of them. ([#564](https://github.com/MapCairn/mapcairn/pull/564), [#568](https://github.com/MapCairn/mapcairn/pull/568))

**`@mapcairn/adapter-maplibre`, the MapLibre adapter as a package.** `createMapLibreMapAdapter` is the adapter the reference site runs on, moved out of the site and published, so you no longer copy a folder to draw a map. It takes `maplibre-gl` as a peer dependency, so the engine and its version are yours to choose, and `core`, `map`, `react` and `theme` still carry no map engine at all. The adapter makes no request until the map is given a basemap, and it has no basemap or provider of its own. Its engine styles come in through `@mapcairn/adapter-maplibre/styles.css`, or through the umbrella's stylesheet. ([#580](https://github.com/MapCairn/mapcairn/pull/580), [#583](https://github.com/MapCairn/mapcairn/pull/583))

**A real map from one install.** With the umbrella, the quickstart is two imports and a worker URL:

```ts
import { createFakeServices } from "@mapcairn/sdk";
import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";
```

The adapter is at the subpath `@mapcairn/sdk/adapter-maplibre`, not at the root, so an app that never imports it does not pull the engine into its bundle. The measured client bundle of an app that imports only the root has no module of `maplibre-gl` in it. Because the umbrella lists `maplibre-gl` as a required peer, install it next to `react` and `react-dom`: `npm install @mapcairn/sdk@next react react-dom maplibre-gl`. The README and the "Show a real map" section of `docs/guides/extending.md` walk through it, and `docs/guides/content-security-policy.md` says what `worker-src` needs. ([#583](https://github.com/MapCairn/mapcairn/pull/583), [#585](https://github.com/MapCairn/mapcairn/pull/585))

**You say where the engine's worker lives.** The adapter no longer imports the engine's worker file itself, because that import only works in one bundler. You pass `loadWorkerUrl`, a function that resolves to the URL of `maplibre-gl/dist/maplibre-gl-worker.mjs` as your app serves it. With Vite that is a `?worker&url` import. The reference site does exactly this, and a failed load shows up as a normal map load failure and is tried again on the next mount. ([#579](https://github.com/MapCairn/mapcairn/pull/579))

**How this candidate was published.** `@mapcairn/adapter-maplibre` and `@mapcairn/sdk` are uploaded by the maintainer for this candidate, so they carry no provenance statement, as `0.1.0-rc.1` carried none. The other four are published by the workflow with provenance, as `0.1.0-rc.2` was. Install all of them under `@next`.

#### @mapcairn/core

**Fit a wide feature on the right side of the world.** `boundsOfPaths` boxes the rings and lines of a shape using every vertex and every edge between them, each edge taken the short way round. A polygon or a line wider than half the globe, with only a few vertices, is now fitted where it really is and not on the far side of its biggest gap. A shape that covers every longitude gets the whole span, and `featureBounds` in `@mapcairn/map` uses it. ([#582](https://github.com/MapCairn/mapcairn/pull/582))

**Query layers across the antimeridian.** A query layer used to ask its provider for a window clamped to the edge of the map, so a view that straddled the 180th meridian got a box that was too narrow or in the wrong place. `queryWindow` now gives such a view a window across the line, `queryBoxes` splits it into the part west of 180 and the part east of -180, `feedUrls` returns one URL for each part, and `decodeFeeds` joins the answers, keeping a feature that sits on the line once. Every other view still sends one request. A view across the line sends two, and if either fails the layer shows its error with no partial result. The URL template, the limit and the provider are the same, so nothing new is requested from anyone. ([#581](https://github.com/MapCairn/mapcairn/pull/581))

### What got better

**Bounds that cross the antimeridian.** `boundsOfPoints` takes the short way round the globe. Points at 179 and -179 give a box from 179 to 181, not one the width of the world. Routes and reachable areas in Directions fit the short way too, and the map centre is always reported between -180 and 180. ([#550](https://github.com/MapCairn/mapcairn/pull/550))

**Releases you can check.** The packages are published by the project's release workflow with provenance, from the same files the GitHub Release holds. The workflow now waits up to about ten minutes for the registry to show each version, reads the registry package by package so one new package does not hold back the others, and `release:verify-published` can compare what the registry holds with the attested tarballs. The project also has a check that an app which installs only `@mapcairn/sdk` draws a real map in a browser under a strict Content Security Policy. It runs in CI and is part of preparing a release. ([#549](https://github.com/MapCairn/mapcairn/pull/549), [#563](https://github.com/MapCairn/mapcairn/pull/563), [#578](https://github.com/MapCairn/mapcairn/pull/578), [#584](https://github.com/MapCairn/mapcairn/pull/584))

### What to change when you upgrade

**`feedUrl` throws for an area across the antimeridian.** It used to clamp the box to the edge of the world and so ask for the wrong area without saying so. Use `feedUrls`, which returns one URL for each part of the area, and `decodeFeeds` to join the answers. A view that does not cross the line behaves as before.

Before:

```ts
const url = feedUrl(definition, controls, Date.now(), area);
const feed = decodeFeed(definition, await (await fetch(url)).json(), decoders);
```

After:

```ts
const urls = feedUrls(definition, controls, Date.now(), area);
const raws = await Promise.all(urls.map(async (url) => (await fetch(url)).json()));
const feed = decodeFeeds(definition, raws, decoders);
```

**A bounding box can have `east` past 180.** For points on both sides of the antimeridian, `boundsOfPoints`, `routeBounds` and the new `boundsOfPaths` return `west` inside -180 to 180 and `east` beyond 180, and a longitude outside the range is wrapped, not clamped. Code that assumed `east` is never above 180 must read the width as `east - west`, which is how the fit helpers already do it.

Before:

```ts
const bounds = boundsOfPoints([{ lat: 0, lng: 179 }, { lat: 0, lng: -179 }]);
// west -179, east 179: a box as wide as the world
```

After:

```ts
const bounds = boundsOfPoints([{ lat: 0, lng: 179 }, { lat: 0, lng: -179 }]);
// west 179, east 181: a box two degrees wide
```

**If you copied the reference site's MapLibre adapter.** Earlier candidates pointed you at the adapter's source in the reference site to copy. It now lives in `@mapcairn/adapter-maplibre`, whose only public names are `createMapLibreMapAdapter`, its options type, `TILE_LAYER_SLOW_MS` and the stylesheet. The copied code took a `workerCacheKey` and imported the worker file inside the adapter. Install the package and pass `loadWorkerUrl` instead. The adapter's class and loader are not exported, so build the adapter through the factory. None of this was ever part of a published package, so no installed version of the four packages changes.

Before:

```ts
// copied from the reference site's source
const adapter = createMapLibreMapAdapter({ workerCacheKey });
```

After:

```ts
import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";

const adapter = createMapLibreMapAdapter({
  loadWorkerUrl: async () => {
    const worker = await import(
      "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
    );
    return worker.default;
  },
});
```

## 0.1.0-rc.2 (2026-11-20)

### What is new

This release candidate has the same code as `0.1.0-rc.1`: nothing in `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` or `@mapcairn/theme` has changed. What is new is how it reaches you. `0.1.0-rc.1` was published by hand. This one is published by the project's own release workflow from the same commit it was built on, and the tarballs on the GitHub Release are the files that go to the registry. ([#436](https://github.com/MapCairn/mapcairn/issues/436))

If you already use `0.1.0-rc.1`, there is nothing to change and nothing to gain in how the packages behave. If you would rather install what the workflow published, add `@next` to the package names as before.

The API is still settling, so a breaking change can land before `0.1.0`, and the changelog will list each one.

## 0.1.0-rc.1 (2026-11-20)

### What is new

This is the first release of the four MapCairn SDK packages: `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme`. It is a release candidate, meant for early adopters. The packages are tested and documented, and the public API is still settling, so a breaking change can still land before 0.1.0. When one does, it will be listed under "What to change when you upgrade" with a Before and an After. The four packages share one version. They are ESM only, so a TypeScript project needs `moduleResolution` set to `node16`, `nodenext` or `bundler`, and React 19 is a peer dependency of the two packages that use it.

**A map interface you can mount in a React app.** `@mapcairn/map` supplies everything around a MapLibre map: a search box, zoom and compass controls, a bottom sheet that becomes a side panel on wide screens, a layers panel with keys and feature cards, and a settings panel. Import `@mapcairn/theme/tokens.css` and `@mapcairn/map/styles.css`, and your app needs no vanilla-extract plugin. The `examples/embed` app in the repository shows the whole thing working from the packages' public entry points only. ([#455](https://github.com/MapCairn/mapcairn/pull/455), [#17](https://github.com/MapCairn/mapcairn/pull/17))

**Test your map interface without a browser.** Every service the interface talks to (search, routing, geolocation, storage, the clipboard, link state, layers and the map engine) sits behind a small interface in `@mapcairn/core`, and each has an in-memory fake. `createFakeServices()` gives you all of them, and the shared contract suites let you check an adapter of your own against the same rules the fakes pass.

**Search.** People can search for a place by name, or by typing its coordinates, which the SDK reads with the digits, minus signs and separators of other languages. Suggestions as you type are off until your app turns them on, and then they use a provider you choose. ([#14](https://github.com/MapCairn/mapcairn/pull/14), [#68](https://github.com/MapCairn/mapcairn/pull/68), [#389](https://github.com/MapCairn/mapcairn/pull/389))

**Measuring and drawing.** People can measure distances and areas, and draw and edit points, lines and polygons. Shapes can be imported and exported as GeoJSON, CSV and WKT, with a choice of axis order for WKT, and they travel in the shared link along with the view, the basemap and the layers. Very small shapes survive the round trip, and a WKT geometry that cannot be used is skipped while the rest is read. ([#16](https://github.com/MapCairn/mapcairn/pull/16), [#83](https://github.com/MapCairn/mapcairn/pull/83), [#284](https://github.com/MapCairn/mapcairn/pull/284), [#200](https://github.com/MapCairn/mapcairn/pull/200))

**Open data layers written as data.** A layer is one definition: a feed, raster or vector tiles, a heatmap, or a query for what is in view. The SDK draws it and builds its key, its card, its list and its credit, and validates the definition. Layers stay off until a person turns them on, and a runtime catalogue can add or replace layers while the map is open. People can tap to ask a raster layer what is at a place, and `MapView` calls the `onIdentifyKey` handler your app supplies when the `I` key is pressed. People can also turn every layer off at once with an Undo. A tile layer that is slow, or has no imagery for the chosen date, says so. ([#130](https://github.com/MapCairn/mapcairn/pull/130), [#145](https://github.com/MapCairn/mapcairn/pull/145), [#103](https://github.com/MapCairn/mapcairn/pull/103), [#202](https://github.com/MapCairn/mapcairn/pull/202), [#65](https://github.com/MapCairn/mapcairn/pull/65))

**Selecting features.** `useFeatureSelection` keeps a selection of features for the interface, and the core package has the port and an in-memory store behind it, so a selection can be tested like everything else. ([#132](https://github.com/MapCairn/mapcairn/pull/132), [#138](https://github.com/MapCairn/mapcairn/pull/138))

**Words in your own language, in either direction.** All of the interface's text is looked up by key in a message catalogue, so you can translate or replace it. English ships with the SDK, and the reference site adds Afrikaans as a worked example. You can also translate your own layer templates, unit symbols, coordinate words and layer labels, and a catalogue check lists the keys you have not translated yet. The page direction follows the language tag, plural forms, numbers and days follow the language, and coordinates and names stay readable inside right-to-left text. ([#257](https://github.com/MapCairn/mapcairn/pull/257), [#267](https://github.com/MapCairn/mapcairn/pull/267), [#364](https://github.com/MapCairn/mapcairn/pull/364), [#351](https://github.com/MapCairn/mapcairn/pull/351), [#391](https://github.com/MapCairn/mapcairn/pull/391))

**Accessibility and privacy by default.** The target is WCAG 2.2 AA in the light and dark themes, every gesture has a keyboard or single-tap equivalent, and announcements go through one live region. Apart from the basemap, nothing is requested until a person asks, and the SDK has no accounts and no tracking. The panels that say what is sent to a provider take your wording, with neutral defaults that name no provider.

**A public API that is written down.** The packages come with committed API reports, and `docs/guides/public-api.md` says what counts as public: anything without a tag is public, `@beta` may change in a minor release, and `@internal` is unsupported. A light sweep before this release took the clearly internal exports out of the public surface. The names of the generated CSS custom properties are not public. ([#461](https://github.com/MapCairn/mapcairn/pull/461), [#504](https://github.com/MapCairn/mapcairn/pull/504))

#### @mapcairn/theme

**Your own colours, with the contrast checked.** `checkThemeContrast` takes a proposed colour override for the 14 interface roles and reports how it measures against WCAG 2.2 AA over the worst-case map backdrops. `createThemeStylesheet` turns an override into a stylesheet scoped to a selector you own, or refuses a theme that falls below AA. High-contrast and forced-colours modes keep the SDK's own values. Tooltips, which are drawn outside the page tree, take the colours of your scope too. ([#463](https://github.com/MapCairn/mapcairn/pull/463), [#477](https://github.com/MapCairn/mapcairn/pull/477), [#519](https://github.com/MapCairn/mapcairn/pull/519))

#### @mapcairn/react

**Tools for AI agents on the page.** `useModelContextTool` registers a WebMCP tool for as long as a component is mounted, and `useReadingDirection` and `useLatestRef` are there for the cases the other hooks do not cover.

### What got better

**Your own styles win over the SDK's.** The recipes behind `Surface`, `Button`, `IconButton`, `Chip` and `ListRow` now sit in a lower cascade layer, so a class of yours on one of them wins whatever the stylesheet order. ([#506](https://github.com/MapCairn/mapcairn/pull/506))

**Controls that keep still.** The credits button, scale, coordinates and map key in the bottom corners now move only when a toolbar or banner would actually cover them, rather than whenever something opens in the middle. The credits button is also legible over a light map. ([#488](https://github.com/MapCairn/mapcairn/pull/488), [#493](https://github.com/MapCairn/mapcairn/pull/493))

**A size limit on every answer.** Layer sources read a feed, query or detail response with a 4 MiB limit and refuse a larger one, and the reference site's place search, suggestions and routing adapters do the same at 256 KiB, 256 KiB and 2 MiB. A refused answer shows the usual error state, and a host can set its own limit on each adapter it creates. The contract suites for search, suggestions and routing require an adapter to hold its limit. ([#526](https://github.com/MapCairn/mapcairn/pull/526), [#529](https://github.com/MapCairn/mapcairn/pull/529))

**Offline, said once.** `DevicePreferences` reports whether the device is online, and the reference site says so once when it is not, without making a request to find out. ([#447](https://github.com/MapCairn/mapcairn/pull/447))

**Type that suits the script.** Letter spacing and line height adjust for non-Latin scripts. ([#380](https://github.com/MapCairn/mapcairn/pull/380))

**One set of types across entry points.** A type you import from `@mapcairn/core` and one you import from `@mapcairn/core/contracts` is the same declaration, so code that names a type from both sees one. ([#522](https://github.com/MapCairn/mapcairn/pull/522))
