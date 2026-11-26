---

title: Layer definitions
sidebar_label: Layer definitions
description: What a data layer definition holds, a minimal working example, and the keys of each kind of layer, from tiles and feeds to polygons, heatmaps, vector tiles, queries for what is in view and identify.
---

# Layer definitions

Write a definition for a data layer of your own, check it, and see which keys each kind of layer takes. The first working map is in [Get started](../get-started.md).

Related guides: [Add a layer](../tasks/add-a-layer.md) gives a definition to the services and turns it on, [Serving layers to MapCairn](serving-layers.md) says which kind fits which server and what each costs it, and [Add to the reference site](add-to-the-reference-site.md#add-a-data-layer) is for a layer in this repository.

## What a definition holds

A layer is data, not code: one `LayerDefinition` (types in `@mapcairn/core`). Nothing in the code names a layer, a provider or a response shape. This is the smallest useful one, a raster tile layer:

```ts check
import type { TileLayerDefinition } from "@mapcairn/core";

const example: TileLayerDefinition = {
  id: "example-overlay",
  name: "Example overlay",
  description: "What the overlay shows, in one sentence.",
  group: "Imagery",
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

Every kind of layer has these keys:

| Key           | Holds                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`          | Lowercase letters, digits and hyphens, starting with a letter. It is used in the permalink.                                    |
| `name`        | The layer's name in the list and the key.                                                                                      |
| `description` | One sentence on what the layer shows.                                                                                          |
| `group`       | The heading the layer is listed under, such as `Hazards`.                                                                      |
| `attribution` | The credits shown while the layer is on: a list of `{ text, url }`.                                                            |
| `controls`    | What a person can adjust. The list may be empty. A control is `segmented`, `switch`, `date`, `datetime`, `opacity` or `range`. |
| `disclaimer`  | Optional. Shown on every card.                                                                                                 |
| `variables`   | Optional. URL variables computed from control values with a lookup table.                                                      |

The kind comes from the shape of the data you have:

| You have                                   | Write                                     | Section                                                                     |
| ------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------------------- |
| Raster tiles (WMTS, WMS or plain pictures) | `source.kind: "tiles"`                    | [Tile layers](#tile-layers)                                                 |
| A file of points                           | `source.kind: "feed"` and a point `style` | [Add a feed layer](#add-a-feed-layer)                                       |
| A file of polygons or lines                | a feed and a `shapes` style               | [Style polygons and lines](#style-polygons-and-lines)                       |
| Points to show as density                  | a feed or a query and a `heatmap` block   | [Add a heatmap](#add-a-heatmap)                                             |
| Vector tiles                               | `source.kind: "vector-tiles"`             | [Add vector tiles](#add-vector-tiles)                                       |
| A dataset too large to fetch whole         | `source.kind: "query"`                    | [Ask only for what is in view](#ask-only-for-what-is-in-view)               |
| A card for a tap on raster tiles           | an `identify` block on a tile layer       | [Identify features on a raster layer](#identify-features-on-a-raster-layer) |

## Check a definition

`validateLayerDefinition(definition, { decoders: createDecoderRegistry(), formatters: createFormatterRegistry() })` from `@mapcairn/core` takes the registries your host uses. It returns a list of problems, empty when the definition is valid, and each names its path, such as `identify.fields.id`. A layer a catalogue loads goes through the same check, and is skipped with its problems when it fails.

## The words in a definition

These fields hold text a person reads: `name`, `description`, `group`, `disclaimer`, `emptyText`, the labels of controls and their options, the labels of a style's classes, sort labels, the card's link label, and the detail source's `label` and `dataCost`. Each takes one of three forms:

- A plain string, shown as written. It is all a layer of your own host needs.
- `{ key, text }`, a `HostText`, for a host that wants its own text translated. The host supplies `definitionTexts` in its catalogue (see the [translation guide](translate-the-sdk.md)), and `text` is the source and the fallback.
- A `MessageKey`, which is how the SDK's own layers do it.

Card titles and lines, list secondary lines, feed polygon and line labels, and range and interval units are a `LayerTemplate`: a plain string, or an object with a host-defined `key` and source `text`.

- The optional `MessageCatalogue.layerTemplates` record holds a translation by key. `createMessageCatalogue` accepts it as its fourth argument.
- A translation may reorder placeholders but must keep every source field and formatter, duplicates included. If the key is missing or the placeholders differ, the source text is used.
- A unit includes its own spacing, such as ` per km²`.
- Vector-tile labels stay plain property names because the map engine reads them directly, and credits in `attribution` are never translated.

## Tile layers

The example above is a complete tile layer. If the provider fills the part of the world it has no data for with opaque or noisy tiles, add `bounds: [west, south, east, north]` (degrees) to the source.

- The map then asks for no tile that lies wholly outside the box. A tile that straddles an edge is still drawn whole, so check what the provider returns there.
- The box must have west less than east, so it cannot cross the antimeridian.
- It matters most near the poles. On a globe the map stretches the edge row of tiles over the pole, so filler there shows as wedges meeting at the pole. The population layer stops at 60 degrees south for this reason.

### Offer a date and a time

A product the provider names by timestamp, such as one image per half hour, takes a `datetime` control.

- Its value is the slot's start in UTC, written `YYYY-MM-DDtHHMM` so it fits a link. The URL template receives it as an ISO instant (`2026-11-11T14:30:00Z`).
- Set `max` and `default` to the provider's latency with `{ minutesAgo }`, so times that are not out yet are never offered. Say the latency in the description.
- The interface shows a date input and a list of the times that exist on that day, both in UTC, with the slot shown and the newest one in words.

From the half-hourly rainfall layer:

```ts no-check
{
  kind: "datetime",
  id: "time",
  label: "Half hour shown",
  description: "A few half hours have no data. If tiles fail to load, try another time.",
  stepMinutes: 30,
  min: "1998-01-01t0000",
  max: { minutesAgo: 420 },
  default: { minutesAgo: 420 },
}
```

with a tile URL such as `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate_30min/default/{time}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`. Validation refuses a step that does not divide a day, a fixed bound off the step and a default outside fixed bounds. Find the latency by probing the provider's tiles over a few hours rather than trusting a capabilities document, which can lag.

A tile layer needs no code for a date or time its provider has no tiles for. When the map settles with none of the layer's tiles loaded, the layer's status says no imagery was found for the chosen date or time, beside its control, and says it once through the live region. The status goes when the control changes, or when a tile of the layer loads later, and the live region says so once.

## Add a feed layer

A feed is one JSON document of features, fetched when the layer is on.

- It names its decoder: `geojson`, or one you register.
- Its `fields` map each decoded field to a dotted path, such as `properties.mag`. `id` and `title` are required.
- Its style, card and list use templates such as `{time|relative}`.
- A point style has a colour rule and, optionally, a size and a marker shape. A colour rule needs a shape, a size or the field named on the card, so colour is never the only signal.
- `saveFeatures: true` offers a "Save as GeoJSON" and a "Save as CSV" button in the layer's entry, which write the features that are loaded, without asking the provider again. It defaults to false and is the decision of whoever writes the definition: a provider's terms say whether its data may be saved and redistributed, so set it only after reading them. On the reference site the Earthquakes and Countries by population layers set it, with the basis recorded in their definitions and in `ATTRIBUTIONS.md`. It is valid only on a feed or query layer of features (not a heatmap, tile or vector tile layer).
  - The cap is by feature count: a file holds at most `MAX_SAVED_FEATURES` (5,000) features, in the order the provider sent them, whatever their size, and the person is told when it cuts.
  - The file carries the layer's credits and the day it was saved (UTC): as members of the GeoJSON, and in the `credit` and `saved` columns of the CSV.
  - The CSV starts with a byte order mark, so Excel reads it as UTF-8. Excel keeps at most 32,767 characters in a cell, so a feature whose geometry text is longer has an empty `geometry` cell (the GeoJSON file holds the whole shape); no other cell is cut.
  - A text cell that a spreadsheet could run as a formula gets a leading apostrophe: one that starts with `=`, `+`, `-` or `@` (after spaces, quotes, tabs or line breaks), or with a tab, carriage return or line feed. This includes text that only looks like a number or a phone number, such as `-5` or `+27 82 000 0000`, since the file cannot tell them apart. A field the decoder reads as a number is written as a number and is never changed.

The example under [Ask only for what is in view](#ask-only-for-what-is-in-view) is a point feed with a card and a list. Polygons and lines have a style of their own.

## Style polygons and lines

A feed of polygons or lines uses a `shapes` style. Colour is a rule over one field:

| Rule        | Colours by                                                               |
| ----------- | ------------------------------------------------------------------------ |
| `fixed`     | One colour for every feature.                                            |
| `category`  | The feature's value for the field.                                       |
| `steps`     | Explicit class breaks.                                                   |
| `intervals` | Equal classes between a `min` and a `max`, one ordinal colour per class. |

- Each class may also set a `pattern` (`stripes`, `dots`, `crosshatch`), a `dash` and a `width`. A label template draws text with a halo.
- The colour names a palette slot, never a value.
- The key is derived from the style. The Layers section and the map key (`MapKey`, in `MapChrome`'s `mapKey` slot) both draw it, so a layer needs nothing extra to appear in either.
- Colour is never the only signal, so validation asks for a different pattern, width or dash in every class, or a label that names the field.

```ts check
import type { FeedLayerDefinition, ShapeStyle } from "@mapcairn/core";

const districts: FeedLayerDefinition<ShapeStyle> = {
  id: "example-districts",
  name: "Districts by density",
  description: "Example districts shaded by people per square kilometre.",
  group: "Boundaries",
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

```ts check
import type { HeatmapLayerDefinition } from "@mapcairn/core";

const density: HeatmapLayerDefinition = {
  id: "example-density",
  name: "Event density",
  description: "How dense the example events are.",
  group: "Density",
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

A `vector-tiles` layer names a tile URL, a zoom window for the layer, and a style per source layer. A source layer can also be a `heatmap`.

- Rules read tile properties by name, and a label template may name one property, such as `{name}`.
- Features stay in the tiles, so the layer has a key and no cards.
- The source's `minzoom` and `maxzoom` are the tile levels the service has. The layer's and each source layer's `minzoom` and `maxzoom` are the zoom levels they are visible at, from `minzoom` up to but not including `maxzoom`.
- Outside the layer's own window the status line names the level to zoom to: "Zoom in to level 5 or closer to load this layer." or "Zoom out below level 12 to see this layer." A layer without a window says nothing about zoom, and the source's `maxzoom` does not count as one.
- Tile origins go in `connect-src` and `img-src`, as for raster tiles.

```ts check
import type { VectorTileLayerDefinition } from "@mapcairn/core";

const parks: VectorTileLayerDefinition = {
  id: "example-areas",
  name: "Parks and water",
  description: "Example areas and roads from vector tiles.",
  group: "Boundaries",
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

## Ask only for what is in view

For a dataset too large to fetch whole, use a `query` source in place of a `feed`. The layer asks for the features inside the current view, after the map has been still for a moment, and asks again only when the view leaves the area it last asked for.

- The URL must use `{west}`, `{south}`, `{east}` and `{north}`. It may use `{limit}`, which is `maxFeatures` plus one so the response shows that more exist.
- The layer draws at most `maxFeatures` and says "Showing the first N. Zoom in to see more." when there are more.
- Below `minzoom` it asks for nothing and says "Zoom in to level 9 or closer to load this layer.", naming the normalised zoom level the map readout shows.
- A view across the antimeridian is asked for as two boxes, one on each side of the line, each inside -180 to 180. The answers are joined, and a feature in both (the same id and geometry) is kept once.
- That costs two requests to the provider instead of one, and each half can return up to `maxFeatures` plus one, so such a view can fetch up to twice the data. If either request fails the layer shows its error and nothing partial.

```ts check
import type { FeedLayerDefinition, PointStyle } from "@mapcairn/core";

const places: FeedLayerDefinition<PointStyle> = {
  id: "example-places",
  name: "Places in view",
  description: "Example places, requested for the part of the map in view.",
  group: "Places",
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

## Identify features on a raster layer

A raster tile layer is a picture, so the tiles themselves have no features. To give a tap a card, add an `identify` block to the layer's definition. It names an `https` URL that answers, in JSON, what is at one point. The browser asks only when someone taps the plain map, or presses `I` for the centre of the map, and only while the layer is on. Hover, movement and a layer that is off send nothing.

```ts check
import type { IdentifiableLayerDefinition } from "@mapcairn/core";

const floodDepth: IdentifiableLayerDefinition = {
  id: "example-flood",
  name: "Flood depth",
  description: "Example modelled flood depth, with the depth at a tap.",
  group: "Imagery",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [
    {
      kind: "segmented",
      id: "period",
      label: "Return period",
      options: [
        { value: "20", label: "1 in 20 years" },
        { value: "100", label: "1 in 100 years" },
      ],
      default: "20",
    },
  ],
  source: {
    kind: "tiles",
    tiles: "https://tiles.example.org/flood/{period}/{z}/{y}/{x}.png",
    tileSize: 256,
    maxzoom: 12,
  },
  identify: {
    url: "https://api.example.org/identify/{period}?lng={lng}&lat={lat}&bbox={bbox}&width={width}&height={height}&i={x}&j={y}&zoom={zoom}",
    tolerance: 12,
    decoder: "geojson",
    fields: { id: "id", title: "properties.name", depth: "properties.depth" },
    card: { title: "{title}", lines: ["{depth} m deep"] },
  },
};

export default floodDepth;
```

The `card` sits inside `identify`, not on the layer, and its `lines` list is required, though it may be empty.

What a person sees:

- While a layer with an `identify` block is on and showing imagery, its Layers section entry says "Tap the map to see details for this layer." after its legend.
- The section adds "Only the first 4 layers are asked on one tap." when more than 4 such layers are on. It cannot know where a tap will land or whether your host calls `identifyAt`, so it says this for every such layer, including one whose `bounds` miss the tapped place.
- If a tap takes longer than 400 ms to answer, a "Looking up what is here" line shows at the bottom of the map until the answer comes, or until Escape or the line's Dismiss button ends the lookup. The line says itself to a screen reader once when it appears, and the result is said once when it arrives.

A host that builds its own chrome shows that line with `useIdentifyFeedback(layers.identifying)` and `<IdentifyStatus onCancel={layers.cancelIdentify} />` from `@mapcairn/map`, and calls `identifyAt` from its map click and its `I` key (`packages/web/src/app/useMapApp.ts` is the reference).

### Placeholders

The URL is filled for each tap. Every value is encoded, so a comma goes out as `%2C`, and the server decodes it like any query string.

| Placeholder           | Value                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `{lng}`, `{lat}`      | The tapped place in WGS 84 degrees, to six decimal places.                                |
| `{bbox}`              | The box as `minx,miny,maxx,maxy` in EPSG:3857 metres, around the tap.                     |
| `{width}`, `{height}` | The box's size in pixels, which is 2 × tolerance + 1.                                     |
| `{x}`, `{y}`          | The tapped pixel's position in the box, which is the tolerance, so the middle of the box. |
| `{zoom}`              | The map's zoom level, to three decimal places.                                            |
| A control's id        | The layer's control value, as in its tile URL. `{period}` above.                          |

- The URL must use `{lng}` and `{lat}`, or all of `{bbox}`, `{width}`, `{height}`, `{x}` and `{y}`.
- The scheme, host and port must be fixed text, with no placeholder in them.
- A control or derived variable may not be named `lng`, `lat`, `bbox`, `width`, `height`, `x`, `y` or `zoom`.
- `tolerance` is a whole number of pixels from 1 to 20, and the default is 12. The box is a square of 2 × tolerance + 1 pixels at the map's zoom, centred on the tap.

For a tap at 0, 0 at zoom 10 with the default tolerance, the request is:

```text
https://api.example.org/identify/20?lng=0&lat=0&bbox=-1910.926%2C-1910.926%2C1910.926%2C1910.926&width=25&height=25&i=12&j=12&zoom=10
```

The box is neither clamped nor shifted at the edges of the world. A tap's longitude is wrapped to -180 up to 180 first, so a tap at 179.9999 gives a box that runs past the edge of the world. Near a pole, `{bbox}` is centred on latitude 85.0511, the limit of Web Mercator, while `{lat}` keeps the tapped latitude. The server decides what to answer for either, and an answer with nothing in it is read as nothing found.

### What the answer may hold

The answer must be JSON, at most 1 MiB, and it is read in one of two shapes:

- **GeoJSON**, with `decoder: "geojson"`. It has a `features` list, and each feature's `fields` are read by dotted path. Coordinates are `[longitude, latitude]` in WGS 84 degrees. A feature with a position beyond 180 in longitude or 90 in latitude is dropped, so a server that answers in its own coordinate system reads as nothing found. A position inside those limits but in another unit would be drawn in the wrong place, so the server must answer in WGS 84. A feature with a missing or `null` geometry, as a server sends for a raster pixel value, is placed at the tap. A document with no `features` list is no features.
- **A JSON list**, with `records` naming its dotted path, such as `results`. `decoder` is still required with `records` and must name a registered decoder, and `geojson` is the usual choice. Each item becomes the properties of a feature at the tap, so a field reads `properties.name`. A path that is not a list is no features.

Without `records`, a decoder other than the built-in `geojson` gets the answer as it came. XML or GML, HTML, plain text (the default `GetFeatureInfo` formats on some servers), JSONP and a POST are not read. A server that cannot send JSON needs a small proxy that asks it and answers in JSON.

### Ids

`id` and `title` are required fields. Map `fields.id` to an attribute the service keeps stable, such as its own identifier. A feature with a missing, `null` or empty id takes its position in the answer. That is unique within one answer but can differ from one tap to the next, so it is not a stable id, and a host should avoid relying on it.

### Limits

- A tap asks at most 4 tile layers, in catalogue order. A layer is asked only when it is on, has an `identify` block, covers the tapped place, and the map has not reported that it has no imagery.
- Any further layers are not asked, and the message says how many were, for example "Asked 4 of 6 layers.".
- Each request has 8 seconds to answer, and a layer that does not answer in time is named in the message.
- A layer shows at most 20 features from one answer, and the rest are dropped.
- One feature opens its card. Several open a list to choose from. Nothing found says "Nothing found here.", and a layer that did not answer is named in the same message.

### Requests and the page

The request is a `GET` over `https` with no cookies and no referrer, in CORS mode. Its answer is not cached, whatever its `Cache-Control`, because a tap's URL never repeats.

- **Content Security Policy.** The request is a `fetch`, so the host page's `connect-src` must list the identify origin. When it is the same origin as the layer's tiles, that origin is already in `connect-src` and `img-src` and nothing more is needed. A separate API origin goes in the host's policy, as the [Content Security Policy guide](content-security-policy.md) describes.
- **CORS.** The identify endpoint must send `Access-Control-Allow-Origin` for the host's origin. A server that sends it for its tiles may not send it for an identify endpoint, and the browser then refuses the answer, which the layer reports as "did not answer".
