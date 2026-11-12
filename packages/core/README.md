# `@mapcairn/core`

The ports, pure logic and basemap definitions of MapCairn. It has no dependency on another MapCairn package, React, a map engine or a browser global, and it never reads the clock. The only runtime dependencies are `@turf` maths libraries.

See [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for how core fits with the other packages and the dependency rules that `npm run lint` enforces.

## Exports

Everything is exported from `@mapcairn/core`, apart from the contract suites, which come from `@mapcairn/core/contracts`.

| Area | Source | What it holds |
|---|---|---|
| Ports | `src/ports` | Types only, apart from small error classes. `Services` (the bundle the app is built from), `MapAdapter` and `MapAdapterFactory`, `SearchProvider`, `RoutingProvider` (optional: routes and travel-time areas, with no provider built in), `LocationProvider`, `SettingsStore`, `ClipboardPort`, `FileSaver`, `FileOpener` (optional: reads a file the person picks, for import), `UrlState`, `ThemeSource`, `DevicePreferences`, `LayerRegistry`, `LayerSource`, `BasemapDefinition`, the geometry types (`LatLng`, `Bounds`, `ViewState`, `PixelPoint`) and the typed errors (`SearchError`, `LocationError`, `LayerError`, `RoutingError`, `MapEngineError`, `FileOpenError`, `PortAbortError`). |
| Basemaps | `src/basemaps` | `BASEMAPS` (OpenFreeMap Bright, Liberty, Positron, Fiord and Dark, VersaTiles Colorful and OpenStreetMap Streets: seven in all), `getBasemap`, `createBasemapCatalogue` with `BUILT_IN_BASEMAP_CATALOGUE` (the basemaps a host offers, passed as the optional `Services.basemaps`), `DEFAULT_BASEMAP_ID` (Bright, in both themes), `DEFAULT_BASEMAP_BACKGROUND` (its land colour, painted before the map draws), `buildAttribution`, and `usesMoreData` (true for a basemap drawn from image tiles: a `raster` source, or a `hybrid` source, which puts a vector style's lines and labels over image tiles). A definition may set `nonCommercial` when its provider's licence allows only non-commercial use; `BASEMAPS` holds none, and a host must keep such a basemap out of any tool an agent can call. The only place that names a tile source or a credit. A definition's optional `thumbnail` is a root-relative path the host is expected to serve (if the image fails to load, the picker shows the swatch); Liberty, Colorful and Fiord name none, so the picker shows their swatch. |
| Fakes | `src/fakes` | In-memory implementations of every port (`FakeMapAdapter`, `FakeSearchProvider`, `MemorySettingsStore` and so on) and `createFakeServices()`, for unit tests that run with no browser, WebGL or network. |
| Contract suites | `src/contracts` (`@mapcairn/core/contracts`) | One shared suite per port, run against the fake and the real adapter, so they cannot drift apart. `PORT_REGISTRY` lists them. |
| Surface and sheet | `src/surface`, `src/sheet`, `src/layout` | The surface state machine (`surfaceReducer` and its actions), sheet detents and snapping, and the chrome layout rules. |
| Map maths | `src/zoom`, `src/scale`, `src/format`, `src/units`, `src/spatial` | Zoom conversion (the app uses 256 px tile zoom, the engine zoom is one lower), metres per pixel, the scale bar, coordinate and number formatting, unit conversion, and line distance and polygon area measurement (`measureLineDistance`, `measurePolygonArea`), the bounds of a set of points (`boundsOfPoints`) and rounding a position before a reverse lookup (`roundForLookup`). |
| Coordinates | `src/coordinates` | `parseCoordinates`, which reads typed coordinates (decimal degrees, degrees minutes and seconds, hemisphere letters) in linear time and refuses anything ambiguous or out of range, and `coordinateSearchResult`, which turns such text into one `SearchResult` so a search box can answer it without a geocoder request. |
| Geometry | `src/geometry` | Pure helpers over GeoJSON geometries and features: `buffer` (metres, with a step count), `union`, `intersect`, `difference`, `simplify` (tolerance in metres), `centroid`, `boundingBox` with `boundingBoxToBounds`, `pointInPolygon` (holes and multipolygons) and `geometryLength` and `geometryArea` (built on the measurement helpers). `wgs84ToWebMercator` and `webMercatorToWgs84` convert between EPSG:4326 and EPSG:3857. `parseWkt` and `formatWkt` read and write Well-Known Text with a hand-written tokenizer, so hostile text takes linear time. Every helper checks its input and throws a `GeometryError` (`invalid`, `empty` or `unsupported`). Longitude is a flat axis: a buffer that would cross the antimeridian or enclose a pole is refused, and a shape that crosses 180 degrees must be split first. The geometry helpers (WKT, Web Mercator conversion, union, intersect, difference, simplify, centroid, point in polygon, bounding box and length) are deliberate SDK surface for hosts that need them. The reference host does not use most of them yet. |
| Keyboard, announcements and URL | `src/keyboard`, `src/announce`, `src/urlHash` | The map key bindings and their help text, the announcement strings for screen readers, and `#map=` parsing and serialising. |
| Theme resolution | `src/theme` | `resolveTheme`, `parseThemeChoice` and `buildThemeBootstrapScript`, with the storage key and `<meta name="theme-color">` values. |
| Layers | `src/layers` | `createLayerRegistry`, which validates a host's layer definitions when the app starts, and `emptyLayerRegistry`, a registry with no layers for a host that supplies none, so the sheet hides its Layers section. |

The `spatial` directory name describes generic geographic measurement and carries no dataset assumptions.

## Usage

Write unit tests against fakes, with no adapters:

```ts
import { createFakeServices } from "@mapcairn/core";

const services = createFakeServices();
```

Add a new port by following "Adding an adapter" in `ARCHITECTURE.md`: the port here, a fake and a contract suite, then a real adapter in `packages/web`.

Rendering belongs in `@mapcairn/map`, browser hooks in `@mapcairn/react`, and every adapter in `@mapcairn/web`.
