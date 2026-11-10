# Plan 0003: drawing, styling and geometry tools

Status: done. Written 2026-11-09, built the same day.

Tracking issue: [#159](https://github.com/mooship/karta/issues/159).

## Goal

Round out the SDK with capabilities that open-source map SDKs commonly offer and that Karta lacks today, so people can mark up a map, see data as areas and density, and work with shapes in code:

1. **Draw and edit tools:** draw polygons, circles (by radius) and lines, edit their vertices, and get the result as GeoJSON with its area and length.
2. **Thematic styling for areas and lines:** graduated and categorised colouring of polygons and lines, outlines and text labels, driven by the layer definition, as points are today.
3. **More layer kinds:** vector tile sources with a per-layer zoom window, and a heatmap for dense points.
4. **Several features under one tap:** a list of overlapping features, each with its own card.
5. **Geometry helpers in `core`:** buffer, union, intersect, simplify, centroid, bounds, point in polygon, Web Mercator conversion, and WKT and GeoJSON conversion.
6. **Export the view as an image**, and drawn shapes as GeoJSON or CSV.
7. **A routing port:** a `RoutingProvider` interface with a fake and a contract suite, for routes and travel-time areas, with no provider built into the SDK, and one public-server adapter plus a Directions tool in the reference host.

## Ground rules

- The SDK stays domain-agnostic. Examples, fixtures and tests use neutral data: generic shapes, famous places and abstract features.
- Everything follows the existing rules: tokens only, ports and adapters, fakes and contract suites, test first, a keyboard equivalent for every gesture, WCAG 2.2 AA, good UX over feature count, and nothing sent to a third party until the person asks.
- Data-driven where a definition can carry it (styling, layer kinds, zoom windows). Pure logic goes in `core`, the engine calls in the MapLibre adapter, and the interface in `map`.
- New dependencies only where a well-maintained package clearly beats writing the code: `@turf/*` is already allowed in `core`. A projection library is added only if the maths cannot stay a few lines.

## Design

### Geometry helpers (`packages/core`)

- Pure functions over GeoJSON geometries, wrapping `@turf` where it already does the job: buffer, union, intersect, simplify, centroid, bounding box, point in polygon, length and area (measurement exists).
- `wgs84ToWebMercator` and `webMercatorToWgs84`, with round-trip tests.
- `parseWkt` and `formatWkt` for points, lines and polygons, with tests that cover empty, nested and malformed input and bound the time on hostile input.

### Draw and edit

- A pure state machine in `core` for the draw modes (point, line, polygon, circle), with add, undo, finish, cancel and vertex move, and keyboard commands.
- `MapAdapter` gains generic calls to show an editable shape and report vertex and shape changes, with fake and contract tests. Drag handles have a keyboard equivalent: select a vertex, move it with the arrow keys, add or remove with a key.
- A **Draw** tool in the chrome with a toolbar, live area and length, Finish and Cancel, and an export action. Shapes survive a basemap swap and appear in the permalink only if the person chooses to share them.

### Styling

- The layer definition's style gains polygon fill and outline, line width and dash, graduated class breaks (stops or equal-interval) and categorised values, plus a text label template with a halo. Colour is never the only signal: patterns, widths or labels also carry meaning.
- Legends derive from the style, as they do now.

### Layer kinds

- `vector-tiles`: a tile URL template with `minzoom` and `maxzoom` for the layer and for its source layers.
- `heatmap`: a feed or a vector-tile source rendered as density, with radius and intensity controls and an opacity slider.
- A `query` source kind, where the layer requests only the features inside the current view and refreshes after the map settles, for datasets too large to fetch whole.

### Selection

- A tap that hits several features opens a list of them. Each row opens its card, and there is a keyboard route to the same list.

### Export

- `MapAdapter.toImage()` returns the current map, with overlays, as a PNG blob. A tool exports it, with attribution drawn in, and exports drawn shapes as GeoJSON or CSV.

### Routing port

- `RoutingProvider` in `core`: `route(stops, mode, signal)` and `reachableArea(origin, minutes, mode, signal)`, returning GeoJSON, with typed errors, a fake and a contract suite. The SDK ships no adapter: a host supplies one for its chosen service, and its privacy text lists what the adapter sends.
- **Reference host:** `packages/web` supplies one adapter for the public Valhalla server run by the FOSSGIS community, which needs no key and allows browser requests. It supports routes and travel-time areas, spaces requests to at most one a second, and shows a clear message when the server is busy or down. A Directions tool in the interface appears only when the host provides a routing service, takes stops by tap or by search, offers drive, walk and cycle, and draws the route or the reachable area with its distance and time. Nothing is sent until the person asks, and the privacy page and the credits name the service and OpenStreetMap.

## Tests

- Unit: every pure function, the draw state machine, style evaluation, the new layer kinds, selection lists.
- E2E with mocked data: drawing, editing and finishing shapes by pointer and by keyboard, class-break and label styling, heatmap and vector tile layers, a multi-feature tap, image export.
- Accessibility: axe over the Draw tool and the new cards, focus order, target sizes, the layout collision matrix with the toolbar open.

## Order of work

1. Geometry helpers and the routing port (pure, no interface).
2. Styling for areas and lines, and the new layer kinds.
3. Selection lists and image export.
4. Draw and edit tools, with the toolbar in the reference app.
5. Docs: `ARCHITECTURE.md`, `DESIGN.md`, the README how-tos, and the package READMEs.

## Out of scope

Server-side rendering, a routing or geocoding provider inside the SDK, chart markers, offline maps, printing layouts, and any shapefile or proprietary format.
