# Karta

Karta is a reusable SDK for public-interest map platforms, with a reference host. The SDK is built on ports and adapters: the interface and the pure logic depend on small interfaces, and one place wires in the map engine and the browser services. MapLibre GL JS is the only map engine.

`packages/web` is the reference host: a map with basemaps, place search, distance and area measurement, drawing and editing shapes, directions (drive, walk and cycle, from a public routing server, only when asked), saving the map as an image, a pin, theme and unit settings, and open data layers (earthquakes, satellite imagery, fire hotspots, GDACS fire, flood, cyclone, volcano and drought alerts, a flood hazard map and a countries-by-population example). Every layer is off until someone turns it on, and the browser then fetches it straight from its public provider; nothing is stored or proxied. The site has no accounts and no tracking beyond cookieless page views. [`docs/plans/`](docs/plans/README.md) holds plans for larger work.

## Documentation

| Document | Covers |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Layers, ports and adapters, the map adapter, adding an adapter |
| [`DESIGN.md`](DESIGN.md) | Tokens, layout slots, accessibility contracts and the lint rules. The living style guide is at `/design` in development and e2e builds only |
| [`docs/plans/`](docs/plans/README.md) | Numbered plans for work not yet built |
| [`packages/core/README.md`](packages/core/README.md) | Ports, pure logic, basemaps, fakes and contract suites |
| [`packages/map/README.md`](packages/map/README.md) | Map user interface, `MapView` and the services provider |
| [`packages/react/README.md`](packages/react/README.md) | Generic React hooks |
| [`packages/theme/README.md`](packages/theme/README.md) | Design tokens |
| [`AGENTS.md`](AGENTS.md) | Guidance for people and AI working in the repository |

## Stack

- Five npm workspaces: `@karta/core`, `@karta/map`, `@karta/react`, `@karta/theme` and `@karta/web`.
- React, TypeScript, React Router framework mode, Vite and MapLibre GL JS.
- Vanilla-extract styling, IBM Plex Sans (self-hosted) and Lucide icons.
- Cloudflare Workers for server rendering and static assets.

## Development

Use Node 24 or newer and npm 11 or newer. `.node-version` selects Node 24.

```bash
npm install
npm run dev
```

| Script | Does |
|---|---|
| `npm run dev` | Vite SSR dev server with hot reload at http://localhost:5173. It never touches Cloudflare |
| `npm start` | Builds the e2e-mode bundle, then serves it through wrangler at http://localhost:4173. This is the server the end-to-end tests use |
| `npm run build` | Production build of every workspace |
| `npm run lint` | Biome, dependency-cruiser (layer and import rules) and the harmony scanner (style and markup rules) |
| `npm run typecheck` | Type checks every workspace |
| `npm test` | Unit tests (Vitest) |
| `npm run test:coverage` | Unit tests with coverage thresholds |
| `npm run e2e` | Playwright end-to-end tests, without the accessibility subset |
| `npm run a11y` | The accessibility subset of the Playwright tests, tagged `@a11y` |
| `npm run check` | Lint, typecheck, unit tests, build, e2e and a11y in sequence |

## How to

### Run the tests

```bash
npm test                                  # unit tests, all packages
npx --no-install vitest run path/to/file.test.ts   # one file
npm run playwright:install -w @karta/web  # once, to install the browsers
npm run e2e                               # end-to-end tests
npm run a11y                              # accessibility tests
```

Playwright starts `npm start` itself and reuses a server already running on port 4173. The tests mock basemap tiles, styles and place search, so they need no network.

### Add a basemap

1. Add a `BasemapDefinition` to `BASEMAPS` in `packages/core/src/basemaps/basemaps.ts`. A `raster` source is a tile URL template with 256 px tiles, and a `vector` source is a MapLibre style URL. Set the zoom limits, the provider credits and `appearance`. For a heavy layer that a vector style can do without (a shaded-relief raster, say), list its style layer id in `saveDataOmitLayers`; Save data mode then leaves it, and any source only it uses, out of the style.
2. Allow the provider's origins in the Content Security Policy in `packages/web/public/_headers` (`img-src` and `connect-src`).
3. Render its picker preview with `node scripts/generateBasemapThumbnails.mjs <id>` and commit the image in `packages/web/public/basemaps/`.
4. Record the provider in `ATTRIBUTIONS.md` and in the map tiles section of the privacy page (`packages/web/src/app/PrivacyPage.tsx`) and `PRIVACY.md`.
5. Update the basemap constants in `packages/web/e2e/support/basemaps.ts` and the tests that count basemaps.

Liberty is the default basemap in both themes; the basemap never follows the light or dark theme. To change the default, change `DEFAULT_BASEMAP_ID` and `DEFAULT_BASEMAP_BACKGROUND` (the new style's `background` layer colour) in `basemaps.ts`, and the matching `liberty` backdrop in `packages/theme/src/tokenValues.ts`. A test in `packages/web` fails until the two colours agree.

### Add a data layer

A layer is data, not code: one definition file, one recorded fixture (feeds only) and the provider's origins in the Content Security Policy. Nothing in the code names a layer, a provider or a response shape.

1. Add `packages/web/src/layers/definitions/<id>.ts` with a default export of a `LayerDefinition` (types in `packages/core/src/layers/definition.ts`). It is picked up by `import.meta.glob`, so no list needs editing. A feed names its decoder (`geojson`, or one you register in `packages/web/src/layers/index.ts`), maps fields by dotted path, and describes its style, card and list with templates such as `{time|relative}`. A colour rule needs a shape, a size or the field named on the card, so colour is never the only signal.
2. For a feed, record a small sample response in `packages/web/src/layers/fixtures/` and add it to `manifest.json` with the number of features it should decode to (and a detail fixture if the layer has `detail`).
3. Add the provider's origins to `public/_headers` and `src/constants/securityHeaders.ts`: feeds in `connect-src`, tiles in `connect-src` and `img-src`.
4. Add the provider's credit to `ATTRIBUTIONS.md` and name the provider in the privacy page and `PRIVACY.md`.

Run `npx --no-install vitest run packages/web/src/layers`: the definition-loop test checks the schema, the fixture, the CSP and the credit, and names the line to add for anything missing. A minimal tile layer:

```ts
import type { TileLayerDefinition } from "@karta/core";

const example: TileLayerDefinition = {
  id: "example-overlay",
  name: "Example overlay",
  description: "What the overlay shows, in one sentence.",
  group: "Imagery",
  dataCost: "about 100 KB per screen",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [{ kind: "opacity", id: "opacity", label: "Opacity", default: 0.8 }],
  source: {
    kind: "tiles",
    tiles: "https://tiles.example.org/{z}/{x}/{y}.png",
    tileSize: 256,
    maxzoom: 12,
  },
};

export default example;
```

### Add a routing provider

The Directions tool appears only when `services.routing` exists, and the SDK ships no provider. To offer directions, write one adapter and register it:

1. Implement `RoutingProvider` from `@karta/core` in `packages/web/src/adapters/routing`. `route({ stops, mode, signal })` returns one line feature for each leg with its distance in metres and time in seconds, and `reachableArea({ origin, minutes, mode, signal })` returns polygon features. Reject only with `RoutingError` (`network`, `invalid`, `no-route`, `rate-limited`, `aborted`, `unsupported`), and honour the `AbortSignal`. Keep to the service's usage limits inside the adapter, for example with `RequestSpacer` from `adapters/shared`, and send no cookies or referrer.
2. Run `runRoutingProviderContract` against it with a scripted `fetch`, as `ValhallaRoutingProvider.test.ts` does, and add recorded sample responses as fixtures.
3. Register it as `routing` in `createServices()`. Nothing else in the app names it.
4. Allow its origin in `connect-src` in `packages/web/public/_headers` and `constants/securityHeaders.ts`, name the service on the privacy page and in `PRIVACY.md` and `ATTRIBUTIONS.md`, and pass its credit and a note about what a request sends to the Directions panel (`ROUTING_CREDITS` and `ROUTING_NOTE` in `packages/web/src/constants/routingCredits.ts`).

Leave `routing` out and the Directions button, panel and overlays are never mounted, so a host without a service carries no dead controls.

### Style polygons and lines

A feed of polygons or lines uses a `shapes` style. Colour is a rule over one field: `fixed`, `category`, `steps` (explicit class breaks) or `intervals` (equal classes between a `min` and a `max`, one ordinal colour per class). Each class may also set a `pattern` (`stripes`, `dots`, `crosshatch`), a `dash` and a `width`, and a label template draws text with a halo. The key is derived from the style. Colour is never the only signal, so validation asks for a different pattern, width or dash in every class, or a label that names the field. The colour names a palette slot, never a value.

```ts
import type { FeedLayerDefinition, ShapeStyle } from "@karta/core";

const districts: FeedLayerDefinition<ShapeStyle> = {
  id: "example-districts",
  name: "Districts by density",
  description: "Example districts shaded by people per square kilometre.",
  group: "Boundaries",
  dataCost: "about 60 KB",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: {
    kind: "feed",
    url: "https://data.example.org/districts.geojson",
    decoder: "geojson",
    fields: {
      id: "properties.code",
      title: "properties.name",
      density: "properties.density",
    },
  },
  style: {
    kind: "shapes",
    geometry: "area",
    colour: {
      kind: "intervals",
      field: "density",
      min: 0,
      max: 300,
      ramp: ["ordinal-1", "ordinal-3", "ordinal-5"],
      unit: " per km²",
      patterns: ["solid", "dots", "crosshatch"],
    },
    label: { template: "{title}", minzoom: 6 },
  },
  card: { title: "{title}", lines: ["About {density|number} per km²"] },
  list: {
    secondary: "About {density|number} per km²",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "No districts could be shown.",
};

export default districts;
```

Labels need a basemap with a glyph source, which the vector basemaps have. On a raster basemap the map draws the fills, patterns and outlines without text, and the list and card keep the words. `world-countries.ts` is a working example, from Natural Earth country outlines.

### Add a heatmap

A `heatmap` layer draws point density from a feed (or a query) and has no cards or list. The radius and intensity come from `range` controls so people can tune it, and the legend names each step of the ramp with a word.

```ts
import type { HeatmapLayerDefinition } from "@karta/core";

const density: HeatmapLayerDefinition = {
  id: "example-density",
  name: "Event density",
  description: "How dense the example events are.",
  group: "Density",
  dataCost: "about 40 KB",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [
    { kind: "range", id: "radius", label: "Radius", min: 4, max: 80, step: 2, default: 20, unit: " px" },
    { kind: "range", id: "intensity", label: "Intensity", min: 0.1, max: 5, step: 0.1, default: 1 },
    { kind: "opacity", id: "opacity", label: "Opacity", default: 0.8 },
  ],
  source: {
    kind: "feed",
    url: "https://data.example.org/events.geojson",
    decoder: "geojson",
    fields: { id: "id", title: "properties.name", weight: "properties.size" },
  },
  heatmap: {
    weightField: "weight",
    radius: { control: "radius" },
    intensity: { control: "intensity" },
    ramp: ["ordinal-1", "ordinal-3", "ordinal-5"],
    words: ["Sparse", "Moderate", "Dense"],
  },
  emptyText: "No events to show.",
};

export default density;
```

### Add vector tiles

A `vector-tiles` layer names a tile URL, a zoom window for the layer, and a style per source layer. Rules read tile properties by name, and a label template may name one property, such as `{name}`. A source layer can also be a `heatmap`. The source's `minzoom` and `maxzoom` are the tile levels the service has; the layer's and each source layer's `minzoom` and `maxzoom` are the zoom levels they are visible at. Features stay in the tiles, so the layer has a key and no cards.

```ts
import type { VectorTileLayerDefinition } from "@karta/core";

const parks: VectorTileLayerDefinition = {
  id: "example-areas",
  name: "Parks and water",
  description: "Example areas and roads from vector tiles.",
  group: "Boundaries",
  dataCost: "about 100 KB per screen",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: { kind: "vector-tiles", tiles: "https://tiles.example.org/{z}/{x}/{y}.pbf", maxzoom: 14 },
  minzoom: 3,
  sourceLayers: [
    {
      sourceLayer: "areas",
      style: {
        kind: "shapes",
        geometry: "area",
        colour: {
          kind: "category",
          field: "kind",
          categories: [
            { value: "park", label: "Park", colour: "bluish-green", pattern: "dots" },
            { value: "water", label: "Water", colour: "sky-blue", pattern: "stripes" },
          ],
          other: { label: "Other area", colour: "orange" },
        },
      },
    },
    {
      sourceLayer: "roads",
      minzoom: 8,
      style: {
        kind: "shapes",
        geometry: "line",
        colour: {
          kind: "steps",
          field: "rank",
          steps: [
            { min: 0, label: "Minor road", colour: "ordinal-2", width: 1.5 },
            { min: 5, label: "Major road", colour: "ordinal-4", width: 4, dash: "dashed" },
          ],
        },
      },
    },
  ],
};

export default parks;
```

Tile origins go in `connect-src` and `img-src`, as for raster tiles.

### Ask only for what is in view

For a dataset too large to fetch whole, use a `query` source in place of a `feed`. The layer asks for the features inside the current view, after the map has been still for a moment, and asks again only when the view leaves the area it last asked for. It draws at most `maxFeatures`, says "Showing the first N. Zoom in to see more." when there are more, and below `minzoom` asks for nothing and says "Zoom in to load this layer." The URL must use `{west}`, `{south}`, `{east}` and `{north}`, and may use `{limit}`, which is `maxFeatures` plus one so the response shows that more exist.

```ts
import type { FeedLayerDefinition, PointStyle } from "@karta/core";

const places: FeedLayerDefinition<PointStyle> = {
  id: "example-places",
  name: "Places in view",
  description: "Example places, requested for the part of the map in view.",
  group: "Places",
  dataCost: "a few KB per screen",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: {
    kind: "query",
    url: "https://api.example.org/places?bbox={west},{south},{east},{north}&limit={limit}",
    decoder: "geojson",
    fields: { id: "id", title: "properties.name", kind: "properties.kind" },
    maxFeatures: 500,
    minzoom: 9,
  },
  style: { colour: { kind: "fixed", colour: "blue", label: "Place" } },
  card: { title: "{title}", lines: ["{kind}"] },
  list: {
    secondary: "{kind}",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "No places in view.",
};

export default places;
```

### Save an image and choose between features

The sheet's "Save image" button saves a PNG of the map with its layers, any drawn shapes and credits, made in the browser from what the map has already loaded. A tap that finds several features opens a list, and the `I` key opens the same list for the centre of the map. Neither needs configuration.

### Draw and export shapes

Choose **Draw shapes** in the control group beside the map. Pick Point, Line, Polygon or Circle, then tap the map to place points, or use **Add point at map centre** (or Space) after panning. A circle takes its centre first and its radius from the second tap. **Finish** (or Enter) closes the shape; a polygon needs three points and no crossing edges. Tap a shape's edge or choose it in the **Shapes** list to edit it: drag a point, drag a small midpoint handle to add one, or select a point with Previous point and Next point and move it with the arrow keys. Undo and Redo cover every edit.

**Shapes and export** opens the list. **Download GeoJSON** and **Download CSV** build a file on your device from the finished shapes (the CSV has `id`, `type`, `area_m2`, `length_m` and the GeoJSON geometry as text). Shapes are not stored and are not in the address bar. **Copy link with shapes** copies a link that carries them in a compact encoding of up to 2,000 characters; anyone who opens it sees the shapes, and moving the map in their window drops them from the address. In code, the pure rules are in `packages/core/src/draw`, the state hook is `useDraw`, the toolbar and overlay are `DrawToolbar` and `DrawOverlay` in `@karta/map`, and a host adds drawing by passing `onDraw` to `EndStack` and `draw` to `SheetContent`.

### Add an adapter

Define the port, write its fake and contract suite, write the real adapter in `packages/web/src/adapters` and register it in `createServices()`. [`ARCHITECTURE.md`](ARCHITECTURE.md#adding-an-adapter) has the steps.

## Contributing, security and conduct

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for checks and conventions, [`SECURITY.md`](SECURITY.md) for private vulnerability reporting and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for community expectations.

## Licence

Karta is licensed under [AGPL-3.0](LICENSE), and each SDK package (`packages/core`, `packages/map`, `packages/react` and `packages/theme`) carries its own copy. If you ship the SDK in a product, or let people use a modified version over a network, you must publish the corresponding source under the same licence.

A commercial licence is available for use in closed-source products. Contact the author through [github.com/mooship](https://github.com/mooship).

See [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) for software and basemap credits and [`PRIVACY.md`](PRIVACY.md) for the privacy policy.
