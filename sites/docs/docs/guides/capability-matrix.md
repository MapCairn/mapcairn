---

title: Capability matrix
sidebar_label: Capability matrix
description: What the SDK does and does not do, row by row.
---

# Capability matrix

Which capabilities of a GIS application MapCairn has, partly has or lacks, row by row, with the code or issue that shows it. The areas come from the public documentation of mapping development kits and are written in the project's own words. The gaps set the order of the SDK work ([`ROADMAP.md`](https://github.com/MapCairn/mapcairn/blob/main/ROADMAP.md), "Direction").

_Last reviewed: 2026-11-24. Review it whenever a row changes status, and at least with each yearly review of [`ROADMAP.md`](https://github.com/MapCairn/mapcairn/blob/main/ROADMAP.md)._

## Reading this matrix

- **has**: built, in the code now.
- **partial**: some of it is built, and the evidence says which part.
- **lacks**: not built. The last column names the open issue that covers it, or "none" with the reason in the evidence.
- **out of scope by decision**: the project has chosen not to do it, for the reasons under "Deliberately out of scope".

Paths are relative to the repository root. A row describes the SDK unless it names the reference site. **Needs a decision** marks a capability that would need a new runtime dependency in an SDK package or a new data source, both the maintainer's call: everything in an SDK package must allow commercial use, so a dependency or data with restricted terms belongs in the host.

## Data formats and connections

| Capability                                                                         | Status  | Evidence                                                                                                                   | Tracked by |
| ---------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Point, line and polygon features from a GeoJSON document, with fields read by path | has     | `FeedSource` and the `geojson` decoder in `packages/core/src/layers`                                                       | none       |
| Any other JSON shape through a registered decoder                                  | has     | `decodeWith` and the decoder registry in `packages/core/src/layers/decoders.ts`                                            | none       |
| Only the features in view, from a bounding box query, with a cap                   | has     | `QuerySource` (`maxFeatures` 1 to 5000)                                                                                    | none       |
| Raster tiles, including a WMS through a box template                               | has     | `TileSource` (`{z}/{x}/{y}` and `{bbox-epsg-3857}`), [Serving layers to MapCairn](serving-layers.md)                       | none       |
| Vector tiles styled by source layer                                                | has     | `VectorTileSource`, [Layer definitions](layer-definitions.md)                                                              | none       |
| Worked recipes for OGC API Features, WMS and WMTS endpoints                        | has     | [Serving layers to MapCairn](serving-layers.md), checked in `packages/core/src/layers/openStandards.test.ts`               | none       |
| Tiles read from a single-file archive                                              | lacks   | none                                                                                                                       | [#192]     |
| MapLibre Tile (MLT) vector tiles, when the host serves them                        | has     | `VectorTileSource.encoding`, [Layer definitions](layer-definitions.md)                                                     | none       |
| Layers supplied at runtime, per user, validated one at a time                      | has     | `createRuntimeLayerCatalogue` and `partitionDefinitions`                                                                   | none       |
| Hosts that sit behind a login                                                      | lacks   | the reference site calls only public providers, so a host cannot attach credentials or react to a refused request          | [#45]      |
| One place for tile and layer request limits, retry, priority and a host hook       | partial | each load is cancelled when replaced, and a slow tile layer says so (`useDataLayers`)                                      | [#195]     |
| Importing drawn shapes from GeoJSON, WKT and CSV files                             | has     | `parseShapeFile` in `packages/core/src/draw/import.ts`, with the WKT axis order chosen by `wktAxisOrder`                   | none       |
| Importing drawn shapes from GPX and KML files                                      | has     | GPX is read by `readGpx` in `packages/core/src/draw/gpx.ts`, KML by `readKml` in `kml.ts`; KMZ and `gx:Track` are not read | [#227]     |
| Zipped vector sets, GeoPackage, FlatGeobuf, GeoTIFF and other raster files         | lacks   | each needs a reader library, a runtime dependency decision, so wait for a named need and start with a plan                 | none       |
| Reading a service's capabilities document to list its layers                       | lacks   | a definition is written by the host on purpose: the service's own list adds a parser and a trust question for little gain  | none       |

## Coordinate systems and projections

| Capability                                                         | Status  | Evidence                                                                                                                          | Tracked by                                                  |
| ------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| WGS 84 positions and Web Mercator, with conversion                 | has     | `packages/core/src/geometry/mercator.ts`                                                                                          | none                                                        |
| Decimal degrees and degrees, minutes and seconds, written and read | has     | `packages/core/src/format`, `packages/core/src/coordinates/parseCoordinates.ts`                                                   | none                                                        |
| UTM and MGRS references                                            | lacks   | none (pure arithmetic, no dependency)                                                                                             | [#222]                                                      |
| Data in other coordinate systems, read by code and reprojected     | lacks   | `parseWkt` refuses any SRID but 4326 with `UnsupportedSridError`; needs a decision (a projection library or a fixed list in core) | [#223]                                                      |
| A map projection other than flat Web Mercator or a globe           | lacks   | `MapProjection` is `"flat"` or `"globe"`                                                                                          | out of scope with one engine, unless [#223] finds otherwise |
| Shapes that cross the antimeridian                                 | partial | see the note below the table                                                                                                      | none, a documented limit in `packages/core/README.md`       |

Shapes across the antimeridian: a buffer that would cross it is refused, a shape that crosses it must be split first, and image export refuses a box across it. Fitting the map to points or a feature on both sides of the line is not limited. `boundsOfPoints` returns the short box, with `east` past 180, and `boundsOfPaths` (used for a polygon or line feature) takes every edge the short way. A shape that covers every longitude gets the whole circle (-180 to 180).

## Rendering and styling

| Capability                                                                                                                | Status  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                       | Tracked by                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A catalogue of basemaps, vector, image and hybrid, with host-defined ones                                                 | has     | `BASEMAPS`, `createBasemapCatalogue`, [Extending MapCairn](extending.md)                                                                                                                                                                                                                                                                                                                                                                       | none                                                             |
| Light, dark and system themes, with contrast checked                                                                      | has     | `packages/theme`, `packages/core/src/theme`                                                                                                                                                                                                                                                                                                                                                                                                    | none                                                             |
| A host's own colours and font                                                                                             | partial | colours: `createThemeStylesheet` in `packages/theme` takes one `accent` (tint, text on the accent and focus ring derived, lightness moved to pass where needed) or the 14 interface roles, in light and dark, and refuses a theme below WCAG 2.2 AA, and `checkThemeContrast` only reports the contrast without making a stylesheet ([Extending MapCairn](extending.md)). The font, the page, map overlay and data colours are not overridable | [#220]                                                           |
| Symbology by category, class breaks or equal intervals, marker shapes, size by value, patterns, dashes and outline widths | has     | `ShapeStyle`, `PointStyle`, [Layer definitions](layer-definitions.md)                                                                                                                                                                                                                                                                                                                                                                          | none                                                             |
| Labels from a template, with a halo and a minimum zoom                                                                    | has     | `ShapeLabel` and the point label template in `packages/core/src/layers/definition.ts`                                                                                                                                                                                                                                                                                                                                                          | none                                                             |
| Custom image icons for points                                                                                             | lacks   | none; a style names a palette slot and colour is never the only signal, so an image icon needs a design decision on contrast and text alternatives first                                                                                                                                                                                                                                                                                       | none                                                             |
| Heatmaps with controls for radius and intensity                                                                           | has     | `packages/core/src/layers/heatmap.ts`, [Layer definitions](layer-definitions.md)                                                                                                                                                                                                                                                                                                                                                               | none                                                             |
| Clustering of dense points, with expansion                                                                                | lacks   | none                                                                                                                                                                                                                                                                                                                                                                                                                                           | [#183]                                                           |
| Legend or key for each layer, in the sheet and over the map                                                               | partial | `LayerKey` and `MapKey` exist; the selector and host options of the map key are open                                                                                                                                                                                                                                                                                                                                                           | [#71]                                                            |
| Layer order and opacity on any layer                                                                                      | partial | an opacity control only where the definition declares one                                                                                                                                                                                                                                                                                                                                                                                      | [#176]                                                           |
| A globe as well as a flat map                                                                                             | has     | `MapProjection`, `ARCHITECTURE.md` ("Flat or globe")                                                                                                                                                                                                                                                                                                                                                                                           | none                                                             |
| Camera tilt                                                                                                               | lacks   | the camera is north-up with no pitch, by design; whether to add one is to be decided                                                                                                                                                                                                                                                                                                                                                           | [#177]                                                           |
| Hillshade, terrain and extruded buildings                                                                                 | lacks   | none; needs a decision (an elevation data source)                                                                                                                                                                                                                                                                                                                                                                                              | [#224]                                                           |
| A second renderer for very dense data                                                                                     | lacks   | MapLibre draws everything                                                                                                                                                                                                                                                                                                                                                                                                                      | research only: [#185] (needs a decision if it adds a dependency) |

## Editing and geometry operations

| Capability                                                      | Status  | Evidence                                                                                     | Tracked by            |
| --------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------- | --------------------- |
| Draw points, lines, polygons and circles, with validity rules   | has     | `packages/core/src/draw`, `ARCHITECTURE.md` ("Drawing")                                      | none                  |
| Edit vertices by drag, midpoint handle or arrow keys, with undo | has     | `packages/core/src/draw/reducer.ts`, `packages/adapter-maplibre/src/editHandles.ts`          | none                  |
| Snap to other shapes while drawing                              | lacks   | none                                                                                         | [#225]                |
| Buffer, union, intersect, difference, simplify and centroid     | partial | pure helpers in `packages/core/src/geometry/operations.ts`; the draw tool does not call them | [#226]                |
| Share shapes in a link, and import and export them as files     | has     | `packages/core/src/draw/share.ts`, `import.ts`, `export.ts`                                  | larger states: [#188] |
| Write edits back to a service                                   | lacks   | no port; each host would supply one, and [#45] comes first                                   | none                  |

## Measurement and analysis

| Capability                                                       | Status                   | Evidence                                                                             | Tracked by |
| ---------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------ | ---------- |
| Distance and area on the ground (great circle), with unit choice | has                      | `packages/core/src/spatial/measurement.ts`, `MeasureToolbar`                         | none       |
| An elevation profile along a line                                | lacks                    | none; through an optional port, so no data source is built in                        | [#180]     |
| Areas reachable within a travel time                             | has                      | `ReachableAreaRequest` in `packages/core/src/ports/routing.ts`, the Directions panel | none       |
| Features near a point from a spatial index                       | lacks                    | none; for hosts with a database                                                      | [#187]     |
| Bearing and angle between points                                 | lacks                    | none; a small addition to the measure tool once someone asks                         | none       |
| Overlay analysis, summary statistics and geoprocessing chains    | out of scope by decision | `README.md`: "not a GIS analysis engine"                                             | none       |

## Search and geocoding

| Capability                                                    | Status | Evidence                                                                                                                         | Tracked by           |
| ------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Place search through a replaceable provider                   | has    | `SearchProvider`, the Nominatim adapter in `packages/web/src/adapters/search`                                                    | none                 |
| Suggestions as you type, only when a host supplies a provider | has    | `SuggestionProvider`, `PhotonSuggestionProvider`                                                                                 | none                 |
| Coordinates typed into search                                 | has    | `coordinateSearchResult`                                                                                                         | UTM and MGRS: [#222] |
| Reverse lookup of a place                                     | has    | `useReverseAddress`, the pin card                                                                                                | none                 |
| A guide to plugging in a custom provider                      | has    | [Extending MapCairn](extending.md) (routing, search, search suggestions, adapters), a custom search provider in `examples/embed` | none                 |
| Search over a host-owned index                                | lacks  | none                                                                                                                             | [#186]               |
| One palette for layers, places, shapes and tools              | lacks  | none                                                                                                                             | [#175]               |
| Bulk geocoding of address lists                               | lacks  | a browser SDK has no place to run it, and public geocoders limit bulk use                                                        | none                 |

## Routing and network analysis

| Capability                                                      | Status                   | Evidence                                                                                               | Tracked by |
| --------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ | ---------- |
| A route through ordered stops, by drive, walk or cycle          | has                      | `RoutingProvider`, the Valhalla adapter in `packages/web/src/adapters/routing`                         | none       |
| Routing as a replaceable port with a fake and a contract suite  | has                      | `packages/core/src/ports/routing.ts`, [Extending MapCairn](extending.md)                               | none       |
| Distance matrices, closest facility and stop-order optimisation | lacks                    | none; they belong to a routing service's own API, and the routing port could grow if a host needs them | none       |
| Adapters for a closed provider's search and routing services    | out of scope by decision | `ROADMAP.md`, [#40] closed as not planned                                                              | none       |

## Selection and querying

| Capability                                                                                         | Status  | Evidence                                                                                                                                                                                                                                                      | Tracked by |
| -------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A card for a tapped feature, a list of loaded features with sorting, choices where several overlap | has     | `FeatureCard`, `FeatureChoices` in `packages/map/src/layers`                                                                                                                                                                                                  | none       |
| Identify on raster layers through a host endpoint                                                  | has     | the `identify` block and `LayerSource.identify`, the tap and `I` key, and the guide in [Layer definitions](layer-definitions.md#identify-features-on-a-raster-layer); no reference-site layer defines one, because it would send a tapped place to a provider | [#47]      |
| Selecting several features, with a host's store                                                    | partial | the port, store, hook and provider are built; highlighting, a panel and select mode are open                                                                                                                                                                  | [#49]      |
| Features inside a drawn shape                                                                      | partial | the optional `FeatureQuery` port is built; no interface calls it yet                                                                                                                                                                                          | [#121]     |
| Features inside a box or a freehand loop, from loaded features                                     | lacks   | none                                                                                                                                                                                                                                                          | [#181]     |
| Filters a person can change, and layers that wait for a filter                                     | partial | controls fill URL templates and a fixed `filter` splits a feed; no person-set attribute filter                                                                                                                                                                | [#62]      |
| Full details for a feature in a side panel, with a chart for a series                              | lacks   | the card shows templated lines only                                                                                                                                                                                                                           | [#179]     |
| Cards for features in vector tiles                                                                 | lacks   | vector tile layers have a key but no cards                                                                                                                                                                                                                    | [#193]     |

## Time-based data

| Capability                                          | Status                   | Evidence                                                     | Tracked by |
| --------------------------------------------------- | ------------------------ | ------------------------------------------------------------ | ---------- |
| Date and date-time controls that fill a layer's URL | has                      | `DateTimeControl`, [Layer definitions](layer-definitions.md) | none       |
| Playing a layer through its dates                   | lacks                    | none                                                         | [#182]     |
| Layers that refresh on a timer                      | out of scope by decision | `ROADMAP.md`, "Live refresh of layers"                       | none       |

## Printing and export

| Capability                                                               | Status | Evidence                                                                                                                                              | Tracked by                                                                        |
| ------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Save the map as an image, with the credits                               | has    | `toImage`, `packages/adapter-maplibre/src/imageExport.ts`                                                                                             | none                                                                              |
| An image at a requested size, pixel ratio and view                       | has    | `MapImageOptions`, `planRequestedImage` in `packages/core/src/imageExport` (the port and adapter only: the Save image button uses the view on screen) | the interface for it, scale bar, key, title, overlays and a headless route: [#48] |
| Print with a title, key and credits, and save as PDF through the browser | lacks  | none                                                                                                                                                  | [#178]                                                                            |
| Export drawn shapes as GeoJSON, CSV and WKT                              | has    | `packages/core/src/draw/export.ts`                                                                                                                    | none                                                                              |
| Export the features of a layer                                           | lacks  | none; needs each provider's terms checked                                                                                                             | [#228]                                                                            |
| A link that carries view, basemap, layers and shapes                     | has    | `packages/core/src/urlHash`, `draw/share.ts`                                                                                                          | map shape and tilt: [#177]; large states: [#188]                                  |

## Offline use

| Capability                            | Status  | Evidence                                                                                                                                      | Tracked by            |
| ------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Say when the device is offline        | partial | the search adapters already raise an offline error and the interface names it; layers and tiles do not, and nothing announces the change once | [#229]                |
| Tiles stored on the device            | lacks   | none; a privacy and storage question first                                                                                                    | research only: [#196] |
| An installable app that works offline | lacks   | none; a service worker belongs to the host, and the reference site would need a decision about what it stores                                 | none                  |

## Performance on large data

| Capability                                         | Status | Evidence                                                       | Tracked by |
| -------------------------------------------------- | ------ | -------------------------------------------------------------- | ---------- |
| Ask only for the view, with a cap and a zoom floor | has    | `QuerySource`, [Serving layers to MapCairn](serving-layers.md) | none       |
| Raster and vector tiles for dense drawings         | has    | `TileSource`, `VectorTileSource`                               | none       |
| A reused response within a page                    | has    | `packages/core/src/layers/responseCache.ts`                    | none       |
| A measured budget for tiles per view               | lacks  | none                                                           | [#194]     |

For clustering and tile archives see [#183] and [#192]. The reference site's Lighthouse work is in [Performance](performance.md).

## Embedding and server-rendered pages

| Capability                                                                                                                        | Status  | Evidence                                                                                                                                                                       | Tracked by          |
| --------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| React components in the `core`, `map`, `react` and `theme` packages, with an example app that uses only their public entry points | has     | `examples/embed`, [Extending MapCairn](extending.md)                                                                                                                           | none                |
| The map engine adapter as an optional package                                                                                     | has     | `packages/adapter-maplibre`, re-exported by the umbrella at `@mapcairn/sdk/adapter-maplibre`                                                                                   | none                |
| A script and stylesheet with a mount function for pages without React                                                             | lacks   | none                                                                                                                                                                           | [#44]               |
| A guide for serving the bundle from a Windows web server and server-rendered pages                                                | partial | [Serving MapCairn from IIS](serving-from-iis.md), checked against Microsoft's documentation and not run on a server; there is no prebuilt bundle or mount function to describe | [#221], after [#44] |
| The Content Security Policy a host needs                                                                                          | has     | [Content Security Policy](content-security-policy.md), `buildContentSecurityPolicy` in `examples/embed/src/contentSecurityPolicy.ts`                                           | none                |
| Making the SDK easy to drop into existing server-rendered applications                                                            | lacks   | the tracker for the items above                                                                                                                                                | [#51]               |
| The interface text and language chosen by the host                                                                                | partial | a message catalogue and language setting for left-to-right and right-to-left languages; the site offers English and Afrikaans and shows a failed language load with a retry    | [#231]              |
| An agent that can drive the map through a tool catalogue                                                                          | partial | the reference host registers a few tools (`packages/web/src/webmcp`); the SDK ships none                                                                                       | [#56]               |
| Hosts plugging in their own analytics                                                                                             | lacks   | none; the reference site stays untouched                                                                                                                                       | [#75]               |

## Server-side rendering

| Capability                                                      | Status | Evidence                                                     | Tracked by           |
| --------------------------------------------------------------- | ------ | ------------------------------------------------------------ | -------------------- |
| The page shell and chrome rendered on the server, then hydrated | has    | `ChromeSkeleton`, `packages/web/src/entry.server.tsx`        | none                 |
| The map itself rendered on the server                           | lacks  | the reference site draws the map in the browser, by decision | research only: [#53] |
| Map images produced where no one is looking at the map          | lacks  | none                                                         | [#48], [#53]         |

## Accessibility

| Capability                                                                       | Status  | Evidence                                                        | Tracked by |
| -------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------- | ---------- |
| WCAG 2.2 AA as the target, with a keyboard or single-tap route for every gesture | has     | `DESIGN.md`, the `@a11y` Playwright tests in `packages/web/e2e` | none       |
| Announcements through one live region                                            | has     | `LiveRegionProvider`, `packages/core/src/announce`              | none       |
| Contrast calculations for every token pair                                       | has     | `packages/theme/src/contrast.ts`                                | none       |
| Screen reader checks of the announcements                                        | partial | automated checks only                                           | [#146]     |

## Security and privacy

| Capability                                               | Status           | Evidence                                                                                  | Tracked by           |
| -------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- | -------------------- |
| No accounts and no tracking beyond cookieless page views | has, by decision | `PRIVACY.md`, `ROADMAP.md`                                                                | none                 |
| Untrusted text read in bounded, linear time              | has              | the WKT, shape file, coordinate and link readers, with property-based tests               | none                 |
| A strict Content Security Policy on the reference site   | has              | `packages/web/public/_headers`                                                            | none                 |
| A check that every SDK dependency allows commercial use  | has              | `scripts/sdkLicences.mjs` and `scripts/sdkLicences.allowlist.json`, run by `npm run lint` | none                 |
| Reporting channel and assurance case                     | has              | `.github/SECURITY.md`, `docs/assurance-case.md`                                           | OpenSSF silver: [#4] |

## Developer experience

| Capability                                                       | Status | Evidence                                                                                                                 | Tracked by |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Ports with fakes and shared contract suites, and coverage floors | has    | `packages/core/src/contracts`, `AGENTS.md`                                                                               | none       |
| An example app and guides                                        | has    | `examples/embed`, `sites/docs/docs/guides`                                                                               | none       |
| Packages published with generated API documentation              | has    | published to npm, with an API report for each entry point in `packages/*/api` and a generated API reference on this site | none       |
| A documentation site                                             | has    | `sites/docs`, served at `docs.mapcairn.com`                                                                              | [#199]     |
| Component documentation for consumers                            | lacks  | none                                                                                                                     | [#174]     |

## Deliberately out of scope

These come from [`ROADMAP.md`](https://github.com/MapCairn/mapcairn/blob/main/ROADMAP.md) ("Non-goals") and [`README.md`](https://github.com/MapCairn/mapcairn/blob/main/README.md). An SDK item may let a host do something the reference site will not.

| Not built                                                                                   | Why                                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts and stored user data                                                               | The reference site has no sign-in and no server-side user data, so there is no saved-maps service and no sharing by account.                               |
| Tracking                                                                                    | Only cookieless page views. No counting of feature use on the reference site ([#41], closed as not planned). A host can plug in its own analytics ([#75]). |
| Bundled datasets                                                                            | A layer is a definition that points to a public provider, and the browser fetches it only when a person turns it on.                                       |
| Another map engine                                                                          | MapLibre GL JS is the only engine, behind a port that tests replace with a fake.                                                                           |
| Adapters for a closed provider's search and routing services ([#40], closed as not planned) | The provider's terms appear to restrict use with another map, and a host may write its own adapter against the ports.                                      |
| Proxying or caching layers on the Worker                                                    | Browsers talk to providers directly.                                                                                                                       |
| Live refresh of layers                                                                      | No timers and no polling, because the providers are public services nobody pays for.                                                                       |
| A GIS analysis engine                                                                       | The SDK offers measuring, drawing aids and geometry helpers, not overlay analysis or geoprocessing.                                                        |

[#4]: https://github.com/MapCairn/mapcairn/issues/4
[#40]: https://github.com/MapCairn/mapcairn/issues/40
[#41]: https://github.com/MapCairn/mapcairn/issues/41
[#44]: https://github.com/MapCairn/mapcairn/issues/44
[#45]: https://github.com/MapCairn/mapcairn/issues/45
[#47]: https://github.com/MapCairn/mapcairn/issues/47
[#48]: https://github.com/MapCairn/mapcairn/issues/48
[#49]: https://github.com/MapCairn/mapcairn/issues/49
[#51]: https://github.com/MapCairn/mapcairn/issues/51
[#53]: https://github.com/MapCairn/mapcairn/issues/53
[#56]: https://github.com/MapCairn/mapcairn/issues/56
[#62]: https://github.com/MapCairn/mapcairn/issues/62
[#71]: https://github.com/MapCairn/mapcairn/issues/71
[#75]: https://github.com/MapCairn/mapcairn/issues/75
[#121]: https://github.com/MapCairn/mapcairn/issues/121
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
[#185]: https://github.com/MapCairn/mapcairn/issues/185
[#186]: https://github.com/MapCairn/mapcairn/issues/186
[#187]: https://github.com/MapCairn/mapcairn/issues/187
[#188]: https://github.com/MapCairn/mapcairn/issues/188
[#192]: https://github.com/MapCairn/mapcairn/issues/192
[#193]: https://github.com/MapCairn/mapcairn/issues/193
[#194]: https://github.com/MapCairn/mapcairn/issues/194
[#195]: https://github.com/MapCairn/mapcairn/issues/195
[#196]: https://github.com/MapCairn/mapcairn/issues/196
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
[#231]: https://github.com/MapCairn/mapcairn/issues/231
