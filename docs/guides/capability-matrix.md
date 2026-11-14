# Capability matrix

_Last reviewed: 2026-11-14. Review it whenever a row below changes status, and at least with each yearly review of [`ROADMAP.md`](../../ROADMAP.md)._

The project's aim is an SDK with everything a team needs to build an industry-grade GIS application ([`ROADMAP.md`](../../ROADMAP.md), "Direction"). This page lists what such an application needs, as neutral capability areas, and says what MapCairn has, partly has or lacks, with the code or issue that shows it. It is the basis for the order of the SDK work.

The areas were drawn up from the public documentation of commercial and open-source mapping development kits, summarised in the project's own words. It compares nothing with any product, and no text is copied.

## Reading this matrix

- **has**: built, in the code now. The evidence column names the path or document.
- **partial**: some of it is built, and the evidence says which part. Nothing planned is described as built.
- **lacks**: not built. The last column names the issue that covers it, or says why there is none.
- **out of scope by decision**: the project has chosen not to do it. [`ROADMAP.md`](../../ROADMAP.md) ("Non-goals") and [`README.md`](../../README.md) give the reasons, repeated under "Deliberately out of scope" below.
- Paths are relative to the repository root. "Tracked by" lists open issues unless it says closed.
- A capability that would need a new runtime dependency in an SDK package, or a new data source, is marked **needs a decision**: both are the maintainer's, and everything in an SDK package must allow commercial use, so a dependency or data with restricted terms belongs in the host.
- The reference site shows the parts working together and does not adopt a capability just because the SDK offers it. A row describes the SDK unless it names the reference site.

## Data formats and connections

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| Point, line and polygon features from a GeoJSON document, with fields read by path | has | `FeedSource` and the `geojson` decoder in `packages/core/src/layers` | none |
| Any other JSON shape through a registered decoder | has | `decodeWith` and the decoder registry in `packages/core/src/layers/decoders.ts` | none |
| Only the features in view, from a bounding box query, with a cap | has | `QuerySource` (`maxFeatures` 1 to 5000) | none |
| Raster tiles, including a WMS through a box template | has | `TileSource` (`{z}/{x}/{y}` and `{bbox-epsg-3857}`), `docs/guides/serving-layers.md` | none |
| Vector tiles styled by source layer | has | `VectorTileSource`, `docs/guides/extending.md` | none |
| Worked recipes for OGC API Features, WMS and WMTS endpoints | partial | the templates should cover the three, but nothing has tested them and no guide shows them | [#232] |
| Tiles read from a single-file archive | lacks | none | [#192] |
| Newer vector tile encodings | lacks | none | [#197] |
| Layers supplied at runtime, per user, validated one at a time | has | `createRuntimeLayerCatalogue` and `partitionDefinitions` (steps closed as #94 to #99) | [#46], all its steps merged |
| Hosts that sit behind a login | lacks | the reference site calls only public providers, so there is no way for a host to attach credentials or react to a refused request | [#45] |
| One place for tile and layer request limits, retry, priority and a host hook | partial | each load is cancelled when replaced, and a slow tile layer says so (`useDataLayers`, #159 closed) | [#195] |
| Importing drawn shapes from GeoJSON, WKT and CSV files | has | `parseShapeFile` in `packages/core/src/draw/import.ts` | none |
| Importing drawn shapes from GPX and KML files | lacks | none | [#227] |
| Binary vector files (zipped vector sets, GeoPackage, FlatGeobuf) and raster files | lacks | none | none, see "Gaps left without an issue" |
| Reading a service's capabilities document to list its layers | lacks | a definition is written by the host | none, see "Gaps left without an issue" |

## Coordinate systems and projections

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| WGS 84 positions and Web Mercator, with conversion | has | `packages/core/src/geometry/mercator.ts` | none |
| Decimal degrees and degrees, minutes and seconds, written and read | has | `packages/core/src/format`, `packages/core/src/coordinates/parseCoordinates.ts` | none |
| UTM and MGRS references | lacks | none (pure arithmetic, no dependency) | [#222] |
| Data in other coordinate systems, read by code and reprojected | lacks | `parseWkt` refuses any SRID but 4326 with `UnsupportedSridError`; needs a decision (a projection library or a fixed list in core) | [#223] |
| A map projection other than flat Web Mercator or a globe | lacks | `MapProjection` is `"flat"` or `"globe"` | out of scope with one engine, unless [#223] finds otherwise |
| Shapes that cross the antimeridian | partial | a buffer that would cross it is refused and a shape that crosses it must be split first; image export refuses a box across it | none, a documented limit in `packages/core/README.md` |

## Rendering and styling

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| A catalogue of basemaps, vector, image and hybrid, with host-defined ones | has | `BASEMAPS`, `createBasemapCatalogue`, `docs/guides/extending.md` | none |
| Light, dark and system themes, with contrast checked | has | `packages/theme`, `packages/core/src/theme` | none |
| A host's own colours and font | partial | the tokens are typed and exported; a supported way to replace them with contrast checking is not built | [#220] |
| Symbology by category, class breaks or equal intervals, marker shapes, size by value, patterns, dashes and outline widths | has | `ShapeStyle`, `PointStyle`, `docs/guides/extending.md` | none |
| Labels from a template, with a halo and a minimum zoom | has | `ShapeLabel` and the point label template in `packages/core/src/layers/definition.ts` | none |
| Custom image icons for points | lacks | none | none, see "Gaps left without an issue" |
| Heatmaps with controls for radius and intensity | has | `packages/core/src/layers/heatmap.ts`, `docs/guides/extending.md` | none |
| Clustering of dense points, with expansion | lacks | none | [#183] |
| Legend or key for each layer, in the sheet and over the map | partial | `LayerKey` and `MapKey` exist; the selector and host options of the map key are open | [#71] |
| Layer order and opacity on any layer | partial | an opacity control only where the definition declares one | [#176] |
| A globe as well as a flat map | has | `MapProjection`, `ARCHITECTURE.md` ("Flat or globe") | none |
| Camera tilt | lacks | the camera is north-up with no pitch, by design; whether to add one is to be decided | [#177] |
| Hillshade, terrain and extruded buildings | lacks | none; needs a decision (an elevation data source) | [#224] |
| A second renderer for very dense data | lacks | MapLibre draws everything | research only: [#185] (needs a decision if it adds a dependency) |

## Editing and geometry operations

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| Draw points, lines, polygons and circles, with validity rules | has | `packages/core/src/draw`, `ARCHITECTURE.md` ("Drawing") | none |
| Edit vertices by drag, midpoint handle or arrow keys, with undo | has | `packages/core/src/draw/reducer.ts`, `packages/web/src/adapters/maplibre/editHandles.ts` | none |
| Snap to other shapes while drawing | lacks | none | [#225] |
| Buffer, union, intersect, difference, simplify and centroid | partial | pure helpers in `packages/core/src/geometry/operations.ts`; the draw tool does not call them | [#226] |
| Share shapes in a link, and import and export them as files | has | `packages/core/src/draw/share.ts`, `import.ts`, `export.ts` | larger states: [#188] |
| Write edits back to a service | lacks | no port; each host would supply one | none, see "Gaps left without an issue" |

## Measurement and analysis

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| Distance and area on the ground (great circle), with unit choice | has | `packages/core/src/spatial/measurement.ts`, `MeasureToolbar` | none |
| An elevation profile along a line | lacks | none; through an optional port, so no data source is built in | [#180] |
| Areas reachable within a travel time | has | `ReachableAreaRequest` in `packages/core/src/ports/routing.ts`, the Directions panel | none |
| Features near a point from a spatial index | lacks | none; for hosts with a database | [#187] |
| Bearing and angle between points | lacks | none | none, see "Gaps left without an issue" |
| Overlay analysis, summary statistics and geoprocessing chains | out of scope by decision | `README.md`: "not a GIS analysis engine" | none |

## Search and geocoding

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| Place search through a replaceable provider | has | `SearchProvider`, the Nominatim adapter in `packages/web/src/adapters/search` | none |
| Suggestions as you type, only when a host supplies a provider | has | `SuggestionProvider`, `PhotonSuggestionProvider` | none |
| Coordinates typed into search | has | `coordinateSearchResult` | UTM and MGRS: [#222] |
| Reverse lookup of a place | has | `useReverseAddress`, the pin card | none |
| A guide to plugging in a custom provider | partial | the ports are documented in `ARCHITECTURE.md`, and `docs/guides/extending.md` has sections for routing, search suggestions and adapters but none for a search provider | [#184] |
| Search over a host-owned index | lacks | none | [#186] |
| One palette for layers, places, shapes and tools | lacks | none | [#175] |
| Bulk geocoding of address lists | lacks | a browser SDK with no server | none, see "Gaps left without an issue" |

## Routing and network analysis

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| A route through ordered stops, by drive, walk or cycle | has | `RoutingProvider`, the Valhalla adapter in `packages/web/src/adapters/routing` | none |
| Routing as a replaceable port with a fake and a contract suite | has | `packages/core/src/ports/routing.ts`, `docs/guides/extending.md` | none |
| Distance matrices, closest facility and stop-order optimisation | lacks | none | none, see "Gaps left without an issue" |
| Adapters for a closed provider's search and routing services | out of scope by decision | `ROADMAP.md`, [#40] closed as not planned | none |

## Selection and querying

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| A card for a tapped feature, a list of loaded features with sorting, choices where several overlap | has | `FeatureCard`, `FeatureChoices` in `packages/map/src/layers` | none |
| Identify on raster layers through a host endpoint | partial | the definition block, `LayerSource.identify` and the tap in `useDataLayers` are built; no host defines an `identify` block yet, and the tap path and key press are open | [#47] ([#126], [#127]) |
| Selecting several features, with a host's store | partial | the port, store, hook and provider are built (closed #114 to #116); highlighting, a panel and select mode are open | [#49] ([#117] to [#119], [#122]) |
| Features inside a drawn shape | partial | the optional `FeatureQuery` port is built (closed #120); no interface calls it yet | [#121] |
| Features inside a box or a freehand loop, from loaded features | lacks | none | [#181] |
| Filters a person can change, and layers that wait for a filter | partial | controls fill URL templates and a fixed `filter` splits a feed; no person-set attribute filter | [#62] |
| Full details for a feature in a side panel, with a chart for a series | lacks | the card shows templated lines only | [#179] |
| Cards for features in vector tiles | lacks | vector tile layers have a key but no cards | [#193] |

## Time-based data

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| Date and date-time controls that fill a layer's URL | has | `DateTimeControl`, `docs/guides/extending.md` | none |
| Playing a layer through its dates | lacks | none | [#182] |
| Layers that refresh on a timer | out of scope by decision | `ROADMAP.md`, "Live refresh of layers" | none |

## Printing and export

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| Save the map as an image, with the credits | has | `toImage`, `packages/web/src/adapters/maplibre/imageExport.ts` | none |
| An image at a requested size, pixel ratio and view | has | `MapImageOptions`, `planRequestedImage` in `packages/core/src/imageExport` (the port and adapter only: the Save image button uses the view on screen) | the interface for it, scale bar, key, title, overlays and a headless route: [#48] |
| Print with a title, key and credits, and save as PDF through the browser | lacks | none | [#178] |
| Export drawn shapes as GeoJSON, CSV and WKT | has | `packages/core/src/draw/export.ts` | none |
| Export the features of a layer | lacks | none; needs each provider's terms checked | [#228] |
| A link that carries view, basemap, layers and shapes | has | `packages/core/src/urlHash`, `draw/share.ts` | map shape and tilt: [#177]; large states: [#188] |

## Offline use

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| Say when the device is offline | partial | the search adapters already raise an offline error and the interface names it; layers and tiles do not, and nothing announces the change once | [#229] |
| Tiles stored on the device | lacks | none; a privacy and storage question first | research only: [#196] |
| An installable app that works offline | lacks | none | none, see "Gaps left without an issue" |

## Performance on large data

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| Ask only for the view, with a cap and a zoom floor | has | `QuerySource`, `docs/guides/serving-layers.md` | none |
| Raster and vector tiles for dense drawings | has | `TileSource`, `VectorTileSource` | none |
| A reused response within a page | has | `packages/core/src/layers/responseCache.ts` | none |
| A measured budget for tiles per view | lacks | none | [#194] |
| Clustering and tile archives | lacks | none | [#183], [#192] |
| Measured Lighthouse work on the reference site | has | `docs/guides/performance.md` | none |

## Embedding and server-rendered pages

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| React components built from four packages, with an example app that uses only public entry points | has | `examples/embed`, `docs/guides/extending.md` | none |
| The map engine adapter as an optional package | lacks | the adapter is in `packages/web` | [#43], after [#24] |
| A script and stylesheet with a mount function for pages without React | lacks | none | [#44] |
| A guide for serving the bundle from a Windows web server and server-rendered pages | lacks | none | [#221] |
| The Content Security Policy a host needs | lacks | the reference site's own is in `packages/web/public/_headers` | [#230] |
| Making the SDK easy to drop into existing server-rendered applications | lacks | the tracker for the items above | [#51] |
| The interface text and language chosen by the host | lacks | English only, with copy inline in components; changing it is a decision | [#231] |
| An agent that can drive the map through a tool catalogue | partial | the reference host registers a few tools (`packages/web/src/webmcp`); the SDK ships none | [#56] |
| Hosts plugging in their own analytics | lacks | none | [#75] |

## Server-side rendering

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| The page shell and chrome rendered on the server, then hydrated | has | `ChromeSkeleton`, `packages/web/src/entry.server.tsx` | none |
| The map itself rendered on the server | lacks | the reference site draws the map in the browser, by decision | research only: [#53] |
| Map images produced where no one is looking at the map | lacks | none | [#48], [#53] |

## Accessibility

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| WCAG 2.2 AA as the target, with a keyboard or single-tap route for every gesture | has | `DESIGN.md`, the `@a11y` Playwright tests in `packages/web/e2e` | none |
| Announcements through one live region | has | `LiveRegionProvider`, `packages/core/src/announce` | none |
| Contrast calculations for every token pair | has | `packages/theme/src/contrast.ts` | none |
| Screen reader checks of the announcements | partial | automated checks only | [#146] |

## Security and privacy

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| No accounts and no tracking beyond cookieless page views | has, by decision | `PRIVACY.md`, `ROADMAP.md` | none |
| Untrusted text read in bounded, linear time | has | the WKT, shape file, coordinate and link readers, with property-based tests | none |
| A strict Content Security Policy on the reference site | has | `packages/web/public/_headers` | for hosts: [#230] |
| A check that every SDK dependency allows commercial use | lacks | the licence header check only | [#198] |
| Reporting channel and assurance case | has | `SECURITY.md`, `docs/assurance-case.md` | OpenSSF silver: [#4] |
| Optional host analytics that keep the reference site untouched | lacks | none | [#75] |

## Developer experience

| Capability | Status | Evidence | Tracked by |
| --- | --- | --- | --- |
| Ports with fakes and shared contract suites, and coverage floors | has | `packages/core/src/contracts`, `AGENTS.md` | none |
| An example app and guides | has | `examples/embed`, `docs/guides` | none |
| Packages published with generated API documentation | lacks | the four packages are not yet published | [#1] |
| A documentation site | lacks | none | [#199] |
| Component documentation for consumers | lacks | none | [#174] |

## Proposed order for the SDK track

This is a proposal, not a promise. It orders the open issues by what unlocks the most for a team that wants to adopt the SDK, and by how little each costs. The ranked list in [`ROADMAP.md`](../../ROADMAP.md) is a separate step and may differ. An item that needs a decision from the maintainer, a plan or research is marked as such.

**Now: finish what is half built and open the way in**

- [#1]: until the packages can be installed with API documentation, nothing else reaches a team.
- [#198]: a small lint check that protects the promise that every SDK package allows commercial use.
- [#117] to [#119], [#121], [#122] (the rest of [#49]): the selection port and hook are built and nothing in the interface uses them yet.
- [#126] and [#127] (the rest of [#47]): the identify core is built and its tap path, key press and guide are not.
- [#146]: accessibility is the project's main claim, and the announcements have had automated checks only.

**Next: what makes the SDK usable in another team's stack**

- [#24] then [#43]: the engine adapter in its own package, so a host can embed without copying `packages/web`.
- [#44], then [#45], [#221] and [#230]: a mount function for pages without React, hosts behind a login (which the serving guide's login part needs), and the guides that make it work in a server-rendered stack under a strict policy.
- [#220]: host theming with contrast checks, so the chrome can match another team's look.
- [#192], [#194], [#195], [#193], [#183]: the performance track for large data, from tile archives and a tile budget to clustering and cards for vector features.
- [#62], [#176], [#71]: the layer controls a person expects (filters, order and opacity, the key over the map).
- [#232], [#184]: two small guides that show how to use what exists (open service standards, a custom search provider).
- [#48], [#178]: image export beyond the screen, and printing.
- [#222], [#225], [#226], [#227]: small, dependency-free additions that fill obvious gaps in measuring, drawing and import.
- [#229]: small, and it improves every failure message.

**Later: needs research, a plan or a decision first**

- [#223]: coordinate systems beyond two, which needs a plan and may need a dependency (needs a decision).
- [#224]: terrain and 3D, which needs elevation data (needs a decision) and follows the tilt decision in [#177].
- [#231]: interface text and language, which changes a standing decision (needs a decision).
- [#182], [#179], [#181], [#180], [#175]: larger interface additions that build on selection and layers.
- [#199], [#174]: a documentation site and component documentation, worth most after [#1].
- [#185], [#196], [#197], [#186], [#187], [#188], [#53]: research and host-side work, each to be decided after its measurement or plan.
- [#228]: saving a layer's features, which needs each provider's terms checked first.
- [#56], [#75]: an agent tool catalogue and an analytics sink, useful once the embedding work above has shipped.
- [#177]: the camera tilt and map-shape-in-link decision.

## Deliberately out of scope

These come from [`ROADMAP.md`](../../ROADMAP.md) ("Non-goals") and [`README.md`](../../README.md). An SDK item may let a host do something the reference site will not.

- **Accounts and stored user data.** The reference site has no sign-in and no server-side user data, so there is no saved-maps service and no sharing by account.
- **Tracking.** Only cookieless page views. No counting of feature use on the reference site ([#41], closed as not planned). A host can plug in its own analytics ([#75]).
- **Bundled datasets.** A layer is a definition that points to a public provider, and the browser fetches it only when a person turns it on. Adding a dataset is a separate, explicit decision.
- **Another map engine.** MapLibre GL JS is the only engine, behind a port that tests replace with a fake.
- **Adapters for a closed provider's search and routing services** ([#40], closed as not planned): the provider's terms appear to restrict use with another map, and a host may write its own adapter against the ports.
- **Proxying or caching layers on the Worker.** Browsers talk to providers directly.
- **Live refresh of layers.** No timers and no polling, because the providers are public services nobody pays for.
- **A GIS analysis engine.** The SDK offers measuring, drawing aids and geometry helpers, not overlay analysis or geoprocessing.

## Gaps left without an issue

A gap is filed only when it is real, small enough to pick up (or says it needs a plan) and not a duplicate. These were left, with the reason, and can be filed when someone needs one.

- **Binary vector files and raster files** (zipped vector sets, GeoPackage, FlatGeobuf, GeoTIFF). Each needs a reader library, which is a decision about a runtime dependency, and several are large. Wait for a named need, then start with a plan.
- **Reading a service's capabilities document.** A definition is data a host writes on purpose, so the service's own list adds a parser and a trust question for little gain. [#232] will show how to write the definitions by hand.
- **Custom image icons for points.** The design contract is that colour is never the only signal and that a style names a palette slot, never a value. An image icon would need its own rules for contrast and for a text alternative, so it needs a design decision first.
- **Bearing and angle measurement.** Low demand, and a small addition to the measure tool once someone asks.
- **Write-back of edits to a service.** It needs a port with a write method, and no host has asked. [#45] comes first.
- **Bulk geocoding.** A browser SDK has no place to run it, and public geocoders limit bulk use.
- **Distance matrices, closest facility and stop-order optimisation.** They belong to a routing service's own API. The routing port could grow, but nothing needs it yet.
- **An installable, offline-capable app.** A service worker belongs to the host, and the reference site would need a decision about what it stores ([#196] is the research for tiles).
- **Wrappers for other UI frameworks.** Wait until the mount function in [#44] settles, because a wrapper is a thin layer over it.
- **Shapes crossing the antimeridian.** A documented limit: the helpers refuse such a shape and ask for it to be split.

[#1]: https://github.com/MapCairn/mapcairn/issues/1
[#4]: https://github.com/MapCairn/mapcairn/issues/4
[#24]: https://github.com/MapCairn/mapcairn/issues/24
[#40]: https://github.com/MapCairn/mapcairn/issues/40
[#41]: https://github.com/MapCairn/mapcairn/issues/41
[#43]: https://github.com/MapCairn/mapcairn/issues/43
[#44]: https://github.com/MapCairn/mapcairn/issues/44
[#45]: https://github.com/MapCairn/mapcairn/issues/45
[#46]: https://github.com/MapCairn/mapcairn/issues/46
[#47]: https://github.com/MapCairn/mapcairn/issues/47
[#48]: https://github.com/MapCairn/mapcairn/issues/48
[#49]: https://github.com/MapCairn/mapcairn/issues/49
[#51]: https://github.com/MapCairn/mapcairn/issues/51
[#53]: https://github.com/MapCairn/mapcairn/issues/53
[#56]: https://github.com/MapCairn/mapcairn/issues/56
[#62]: https://github.com/MapCairn/mapcairn/issues/62
[#71]: https://github.com/MapCairn/mapcairn/issues/71
[#75]: https://github.com/MapCairn/mapcairn/issues/75
[#117]: https://github.com/MapCairn/mapcairn/issues/117
[#119]: https://github.com/MapCairn/mapcairn/issues/119
[#121]: https://github.com/MapCairn/mapcairn/issues/121
[#122]: https://github.com/MapCairn/mapcairn/issues/122
[#126]: https://github.com/MapCairn/mapcairn/issues/126
[#127]: https://github.com/MapCairn/mapcairn/issues/127
[#146]: https://github.com/MapCairn/mapcairn/issues/146
[#174]: https://github.com/MapCairn/mapcairn/issues/174
[#175]: https://github.com/MapCairn/mapcairn/issues/175
[#176]: https://github.com/MapCairn/mapcairn/issues/176
[#177]: https://github.com/MapCairn/mapcairn/issues/177
[#178]: https://github.com/MapCairn/mapcairn/issues/178
[#179]: https://github.com/MapCairn/mapcairn/issues/179
[#180]: https://github.com/MapCairn/mapcairn/issues/180
[#181]: https://github.com/MapCairn/mapcairn/issues/181
[#182]: https://github.com/MapCairn/mapcairn/issues/182
[#183]: https://github.com/MapCairn/mapcairn/issues/183
[#184]: https://github.com/MapCairn/mapcairn/issues/184
[#185]: https://github.com/MapCairn/mapcairn/issues/185
[#186]: https://github.com/MapCairn/mapcairn/issues/186
[#187]: https://github.com/MapCairn/mapcairn/issues/187
[#188]: https://github.com/MapCairn/mapcairn/issues/188
[#192]: https://github.com/MapCairn/mapcairn/issues/192
[#193]: https://github.com/MapCairn/mapcairn/issues/193
[#194]: https://github.com/MapCairn/mapcairn/issues/194
[#195]: https://github.com/MapCairn/mapcairn/issues/195
[#196]: https://github.com/MapCairn/mapcairn/issues/196
[#197]: https://github.com/MapCairn/mapcairn/issues/197
[#198]: https://github.com/MapCairn/mapcairn/issues/198
[#199]: https://github.com/MapCairn/mapcairn/issues/199
[#220]: https://github.com/MapCairn/mapcairn/issues/220
[#221]: https://github.com/MapCairn/mapcairn/issues/221
[#222]: https://github.com/MapCairn/mapcairn/issues/222
[#223]: https://github.com/MapCairn/mapcairn/issues/223
[#224]: https://github.com/MapCairn/mapcairn/issues/224
[#225]: https://github.com/MapCairn/mapcairn/issues/225
[#226]: https://github.com/MapCairn/mapcairn/issues/226
[#227]: https://github.com/MapCairn/mapcairn/issues/227
[#228]: https://github.com/MapCairn/mapcairn/issues/228
[#229]: https://github.com/MapCairn/mapcairn/issues/229
[#230]: https://github.com/MapCairn/mapcairn/issues/230
[#231]: https://github.com/MapCairn/mapcairn/issues/231
[#232]: https://github.com/MapCairn/mapcairn/issues/232
