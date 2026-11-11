# Extending MapCairn

Short how-tos for adding to the SDK and its reference host: a basemap, a data layer of each kind, a routing provider and an adapter. The architecture behind them is in [`ARCHITECTURE.md`](../../ARCHITECTURE.md), and the design rules in [`DESIGN.md`](../../DESIGN.md).

## Add a basemap

Defining a basemap in the SDK and offering it on a host are separate. `BASEMAPS` holds every basemap the SDK defines (seven today). The reference site does not offer them all: `packages/web/src/basemaps/hostBasemaps.ts` lists the ids it offers, in picker order (five today), and builds its catalogue from them and from the definitions the host owns. Defining a basemap does not put it on the site.

1. Add a `BasemapDefinition` to `BASEMAPS` in `packages/core/src/basemaps/basemaps.ts`. A `raster` source is a tile URL template with 256 px tiles, and a `vector` source is a MapLibre style URL. Set the zoom limits, the provider credits and `appearance`. For a heavy layer that a vector style can do without (a shaded-relief raster, say), list its style layer id in `saveDataOmitLayers`; Save data mode then leaves it, and any source only it uses, out of the style. The SDK's basemap test lists the tile origins whose terms allow commercial use with no agreement; it fails for a new origin until you have read that provider's terms and added the origin there with the reason.

A host of your own builds a catalogue from `BASEMAPS`, or from its own definitions, and needs nothing more from this repository. To offer the basemap on the reference site as well:

1. Add its id to `HOST_BASEMAP_IDS` in `packages/web/src/basemaps/hostBasemaps.ts`, where you want it in the picker. It fails at start-up, with the id in the message, if neither the SDK nor the host defines such a basemap.
2. Allow the provider's origins in the Content Security Policy (`img-src` and `connect-src`) in `packages/web/src/constants/securityHeaders.ts` and, identically, `packages/web/public/_headers`; a test keeps the two in step. Read the style and its tile sets to find every host they request (sprite, glyphs, terrain), and add only those.
3. Render its picker preview with `node scripts/generateBasemapThumbnails.mjs <id>` and commit the image in `packages/web/public/basemaps/`.
4. Record the provider in `ATTRIBUTIONS.md` and in the map tiles section of the privacy page (`packages/web/src/app/PrivacyPage.tsx`) and `PRIVACY.md`.
5. Update the basemap constants in `packages/web/e2e/support/basemaps.ts` (`BASEMAP_COUNT` and the rest) and the tests that count basemaps, and the backdrop per basemap in `packages/web/src/basemaps/chromeLegibility.test.ts`. A spec that needs a basemap the site does not offer (the SDK's Liberty, for its Save data layer, say) runs on a host that offers the SDK's whole list, through `scriptBasemaps` in `packages/web/e2e/support/services.ts`.

To take a basemap off the site while keeping it in the SDK, remove its id from `HOST_BASEMAP_IDS`, its origin from the Content Security Policy, its preview image, and its provider from `ATTRIBUTIONS.md`, `PRIVACY.md` and the privacy page, if nothing else the site offers uses them. A saved or linked id the site no longer offers opens on Bright.

A provider whose licence the reusable SDK packages must not carry, or whose volunteer-run server should not be sent the traffic of every app built on the SDK, or that asks to be told of use, is not added to `BASEMAPS`. Define it in the host instead. Topographic is the worked example: `packages/web/src/basemaps/openTopoMapBasemap.ts` defines OpenTopoMap as a `BasemapDefinition` that imports types only, `hostBasemaps.ts` lists it in `HOST_OWN_BASEMAPS` and by id in `HOST_BASEMAP_IDS`, and `scripts/generateBasemapThumbnails.mjs` loads it beside the SDK's list. The host's catalogue is built with `createBasemapCatalogue` and passed by the composition root as `Services.basemaps` (see `ARCHITECTURE.md`, host-supplied basemaps). Its definition can leave out `thumbnail` when it has no right to a preview image (set `swatch`, a hex colour of your own, so its picker tile does not look like the default).

Bright is the default basemap in both themes; the basemap never follows the light or dark theme. To change the default, change `DEFAULT_BASEMAP_ID` and `DEFAULT_BASEMAP_BACKGROUND` (the new style's `background` layer colour) in `basemaps.ts`, and the matching `defaultBasemap` backdrop in `packages/theme/src/tokenValues.ts`. A test in `packages/web` fails until the two colours agree.

## Add a data layer

A layer is data, not code: one definition file, one recorded fixture (feeds only) and the provider's origins in the Content Security Policy. Nothing in the code names a layer, a provider or a response shape.

1. Add `packages/web/src/layers/definitions/<id>.ts` with a default export of a `LayerDefinition` (types in `packages/core/src/layers/definition.ts`). It is picked up by `import.meta.glob`, so no list needs editing. A feed names its decoder (`geojson`, or one you register in `packages/web/src/layers/index.ts`), maps fields by dotted path, and describes its style, card and list with templates such as `{time|relative}`. A colour rule needs a shape, a size or the field named on the card, so colour is never the only signal.
2. For a feed, record a small sample response in `packages/web/src/layers/fixtures/` and add it to `manifest.json` with the number of features it should decode to (and a detail fixture if the layer has `detail`).
3. Add the provider's origins to `public/_headers` and `src/constants/securityHeaders.ts`: feeds in `connect-src`, tiles in `connect-src` and `img-src`.
4. Add the provider's credit to `ATTRIBUTIONS.md` and name the provider in the privacy page and `PRIVACY.md`.

Run `npx --no-install vitest run packages/web/src/layers`: the definition-loop test checks the schema, the fixture, the CSP and the credit, and names the line to add for anything missing. A minimal tile layer:

```ts
import type { TileLayerDefinition } from "@mapcairn/core";

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

### Offer a date and a time

A product the provider names by timestamp, such as one image per half hour, takes a `datetime` control. Its value is the slot's start in UTC, written `YYYY-MM-DDtHHMM` so it fits a link, and the URL template receives it as an ISO instant (`2026-11-11T14:30:00Z`). Set `max` and `default` to the provider's latency with `{ minutesAgo }`, so times that are not out yet are never offered, and say the latency in the description. The ui shows a date input and a list of the times that exist on that day, both in UTC, with the slot shown and the newest one in words. From the half-hourly rainfall layer:

```ts
{
  kind: "datetime",
  id: "time",
  label: "Half hour shown",
  description: "A few half hours have no data. If tiles fail to load, try another time.",
  stepMinutes: 30,
  min: "2000-06-01t0000",
  max: { minutesAgo: 360 },
  default: { minutesAgo: 360 },
}
```

with a tile URL such as `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate_30min/default/{time}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`. Validation refuses a step that does not divide a day, a fixed bound off the step and a default outside fixed bounds. Find the latency by probing the provider's tiles over a few hours rather than trusting a capabilities document, which can lag.

## Style polygons and lines

A feed of polygons or lines uses a `shapes` style. Colour is a rule over one field: `fixed`, `category`, `steps` (explicit class breaks) or `intervals` (equal classes between a `min` and a `max`, one ordinal colour per class). Each class may also set a `pattern` (`stripes`, `dots`, `crosshatch`), a `dash` and a `width`, and a label template draws text with a halo. The key is derived from the style. Colour is never the only signal, so validation asks for a different pattern, width or dash in every class, or a label that names the field. The colour names a palette slot, never a value.

```ts
import type { FeedLayerDefinition, ShapeStyle } from "@mapcairn/core";

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

## Add a heatmap

A `heatmap` layer draws point density from a feed (or a query) and has no cards or list. The radius and intensity come from `range` controls so people can tune it, and the legend names each step of the ramp with a word.

```ts
import type { HeatmapLayerDefinition } from "@mapcairn/core";

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

## Add vector tiles

A `vector-tiles` layer names a tile URL, a zoom window for the layer, and a style per source layer. Rules read tile properties by name, and a label template may name one property, such as `{name}`. A source layer can also be a `heatmap`. The source's `minzoom` and `maxzoom` are the tile levels the service has; the layer's and each source layer's `minzoom` and `maxzoom` are the zoom levels they are visible at. Features stay in the tiles, so the layer has a key and no cards.

```ts
import type { VectorTileLayerDefinition } from "@mapcairn/core";

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

## Ask only for what is in view

For a dataset too large to fetch whole, use a `query` source in place of a `feed`. The layer asks for the features inside the current view, after the map has been still for a moment, and asks again only when the view leaves the area it last asked for. It draws at most `maxFeatures`, says "Showing the first N. Zoom in to see more." when there are more, and below `minzoom` asks for nothing and says "Zoom in to load this layer." The URL must use `{west}`, `{south}`, `{east}` and `{north}`, and may use `{limit}`, which is `maxFeatures` plus one so the response shows that more exist.

```ts
import type { FeedLayerDefinition, PointStyle } from "@mapcairn/core";

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

## Add a routing provider

The Directions tool appears only when `services.routing` exists, and the SDK ships no provider. To offer directions, write one adapter and register it:

1. Implement `RoutingProvider` from `@mapcairn/core` in `packages/web/src/adapters/routing`. `route({ stops, mode, signal })` returns one line feature for each leg with its distance in metres and time in seconds, and `reachableArea({ origin, minutes, mode, signal })` returns polygon features. Reject only with `RoutingError` (`network`, `invalid`, `no-route`, `rate-limited`, `aborted`, `unsupported`), and honour the `AbortSignal`. Keep to the service's usage limits inside the adapter, for example with `RequestSpacer` from `adapters/shared`, and send no cookies or referrer.
2. Run `runRoutingProviderContract` against it with a scripted `fetch`, as `ValhallaRoutingProvider.test.ts` does, and add recorded sample responses as fixtures.
3. Register it as `routing` in `createServices()`. Nothing else in the app names it.
4. Allow its origin in `connect-src` in `packages/web/public/_headers` and `constants/securityHeaders.ts`, name the service on the privacy page and in `PRIVACY.md` and `ATTRIBUTIONS.md`, and pass its credit and a note about what a request sends to the Directions panel (`ROUTING_CREDITS` and `ROUTING_NOTE` in `packages/web/src/constants/routingCredits.ts`).

Leave `routing` out and the Directions button, panel and overlays are never mounted, so a host without a service carries no dead controls.

## Add an adapter

Define the port, write its fake and contract suite, write the real adapter in `packages/web/src/adapters` and register it in `createServices()`. [`ARCHITECTURE.md`](../../ARCHITECTURE.md#adding-an-adapter) has the steps.
