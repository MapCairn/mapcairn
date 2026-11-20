# Changelog

What changed in each release of the four SDK packages: `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme`. They are released together under one version, so one list covers all four, newest release first.

Each entry says what you can now do and what to change when you upgrade, grouped by what it means for someone using the SDK. The same text is the body of the GitHub Release. The style guide is in `docs/guides/releasing.md`.

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
