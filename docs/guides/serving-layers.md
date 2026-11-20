# Serving layers to MapCairn

Which layer kind to serve from your own server, and what each costs it. A layer is a definition, described in [`extending.md`](extending.md); this guide is about the server behind that definition. The browser asks for the data only when someone turns the layer on. A feed or query request carries no cookies and no referrer.

## Choose the shape of the data

| Server gives                 | Layer source   | Fits                                                                                                | Cards and list                                                     | What it costs                                                                    |
| ---------------------------- | -------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| XYZ, WMTS or WMS image tiles | `tiles`        | A dense drawing, such as a forecast field or imagery                                                | No, a tile is a picture; an identify endpoint gives a tap its card | One request a tile, cheapest to cache                                            |
| Vector tiles (MVT)           | `vector-tiles` | Linework and areas where a tile generator exists                                                    | No, the features stay in the tiles                                 | A tileset to build and regenerate, one request a tile                            |
| GeoJSON for a bounding box   | `query`        | A layer of features too large to send whole, and small enough to show at once                       | Yes                                                                | One request for each new area looked at, geometry as JSON                        |
| One GeoJSON file             | `feed`         | A small layer served as one whole file, of any freshness, such as country outlines or an alert list | Yes                                                                | One request when the layer is turned on, then reused while the response is fresh |

The first question is how much geometry there is. A tile layer or a vector tile layer suits a layer whose geometry is far more than a screen can hold, however few features it has. A query layer suits a layer with many features, up to the 5000 a query may show at once, where each feature should be something to tap, with a card and a list. If the whole layer is small enough to send in one file, a feed is simpler than either.

## Raster tiles for dense drawings

A `tiles` source names a URL template with `{z}`, `{x}`, `{y}` and, for a WMS, `{bbox-epsg-3857}`, a tile size of 256 or 512 px, and the deepest level the service has. A provider that holds one image a tile, or draws the map on demand and caches it, is served well by tiles: the browser asks for a tile at a time and the image is cheap for a cache to hold.

- How many tiles a screen asks for depends on the screen size, the zoom and the tile size: a larger screen needs more tiles for the same area, 512 px tiles need about a quarter as many as 256 px, and the engine also loads a buffer around the view. Each new area asks for the tiles over it, so the levels people look at most are the ones your server serves most.
- Set `maxzoom` to the deepest level you hold and let the engine stretch it beyond that, rather than answering 404 for a level that does not exist.
- Set `bounds` when the provider fills the rest of the world with blank or opaque tiles. The map then asks for no tile wholly outside the box. This matters at the poles, where a globe stretches the edge row of tiles over the pole.
- Serve `Cache-Control` with a long `max-age` for a tile that never changes, and a version in the URL when it does. A browser cache and a cache in front of the server both do most of the work here.
- A tile is a picture, so the tiles have no cards or list. An identify endpoint, which the layer's `identify` block names, gives a tap its card; see [identify features on a raster layer](extending.md#identify-features-on-a-raster-layer). Offer a control such as opacity or a date and time, and say in `dataCost` what a screen costs, in words a person can read.
- Say when there is no tile. This applies only to raster layers. When the map has settled and every tile the layer asked for has failed, with none loaded, the layer's entry in the list shows a status: "No imagery was found for" the chosen date or time when the layer has such a control, and otherwise "Could not load". A layer whose tiles partly load says nothing. Before the map settles, a layer that has had tiles asked for and none loaded after 10 seconds shows "Still waiting for imagery. The provider may be slow or not answering." with an hourglass, so a tile server slower than that is reported without waiting for the give-up; the line goes when a tile loads or the layer's tiles change. A server that publishes time-stamped imagery should answer `404` with `Access-Control-Allow-Origin` for a date or time it has no imagery for. A `404` counts as "no tile" only when it carries open CORS headers; without them the browser blocks the response and the engine reports a request error instead. The CORS requirement covers error responses as well as tiles.

## Vector tiles where a generator exists

A `vector-tiles` source names a `{z}`, `{x}`, `{y}` template, the zoom window of the tileset and a style per source layer. A source layer is drawn as shapes or, for points, as a heatmap. Its `sourceLayer` must match the name of the layer inside the tiles. Linework and areas are often smaller as vector tiles than as a rasterised image at the same zoom, and the browser styles them from the definition, so one tileset can take a new look without being rebuilt.

- The work moves to the build: a generator turns your data into a tileset at each level, and it has to run again when the data changes. Low zoom tiles hold a lot of geometry, so keep them coarse.
- Serve the tiles from a cache with a version in the path or the query, and regenerate the whole tileset rather than patching single tiles.
- Features stay in the tiles, so the layer has a key but no cards or list. Rule colours read tile properties by name, so name them in the tileset as the definition expects. A label template may name only one property, such as `{name}`.

## GeoJSON by bounding box for features

A `query` source is a GeoJSON endpoint that takes a box and a limit. The definition's URL must use `{west}`, `{south}`, `{east}` and `{north}`, in decimal degrees, and may use `{limit}`, which is `maxFeatures` plus one so the response shows whether more exist. `maxFeatures` is 1 to 5000, and `minzoom` keeps the layer from asking while the view is too wide for the features to mean anything.

- The layer asks again only when the view leaves the area last asked for (a window larger than the view, snapped to a grid) or zooms in far enough that a much smaller area would do. There is one request in flight per layer, so small pans send nothing and a layer that is turned off sends nothing more.
- Answer the box and the limit. Put `{limit}` in the URL and honour it, so the server never builds a response bigger than `maxFeatures` plus one. The guarantee holds only if the URL uses `{limit}`, which is optional; without it the server decides how much to send, and the client draws no more than `maxFeatures` of it.
- Return features in a stable order. When more than `maxFeatures` come back the client keeps the first ones, so an unstable order makes features appear and vanish between requests.
- Send GeoJSON with the fields your `fields` map names. This is the simplest server: a query, a limit and a JSON encoder, with no tileset and no image renderer.
- This is the source that gives cards and a list from data too large to send whole. When the response holds more than `maxFeatures`, the layer draws the first ones and says to zoom in. As guidance only, features cost more as JSON than the same geometry costs in a tile, so choose `maxFeatures` by measuring a response, not by a fixed number.

## One GeoJSON file for a small layer

A `feed` source is a URL to a whole GeoJSON file. It suits a small layer of any freshness, from country outlines to earthquakes and alerts, with `Cache-Control` setting how stale the data may be: the reference host's earthquake feed sends a `max-age` of a minute. Layers split from one file share a request. Send `Cache-Control`, and for a large file send compressed.

The page keeps every response, a query response as well as a feed, for at least the server's `max-age`. A feed definition may also set `cacheSeconds` (at most 3600), a minimum retention for a provider that sends no `max-age`; when both are present the longer applies. A query definition cannot set it. Nothing is kept beyond the page.

### How much of a response is read

The reference host's source reads at most 4 MiB of a feed, query or detail response, counting bytes as they arrive, and refuses a larger one as `invalid`, so the layer shows its usual error and nothing is parsed. A `Content-Length` over the limit refuses the response before it is read, and the count while reading covers a server that omits or understates the header. 4 MiB is about five times the largest response the reference site documents (the country outlines, about 840 KB decoded). The limit belongs to the source, not to a definition: a host that builds its own `FetchLayerSource` can set `maxResponseBytes` in its options, and it then applies to every layer that source serves, so one large layer raises the limit for all of them. A layer whose response is larger than a few MiB belongs in a `query` source or in tiles, because a response this size is still parsed in the page.

## Services that speak open standards

A team's own services often speak OGC API Features, WMS or WMTS. The existing layer kinds can request all three, with the definition written by hand: MapCairn never reads a service's capabilities document, so the host copies the layer name, style, format and tile matrix set out of it. The examples use invented hosts under `example.org`. The tests in `packages/core/src/layers/openStandards.test.ts` validate each definition with `validateLayerDefinition`, build the request the engine or the query would send, and compare it to the shape the standard defines. They also fail if a URL, tile size, zoom limit, feature cap or field map shown below stops matching the test.

Three limits hold for all three:

- **Coordinate systems.** The engine asks tile layers in Web Mercator (EPSG:3857) only, and a query layer asks in WGS 84 longitude and latitude. A service that can serve nothing but another system, such as a national grid, is not supported.
- **Cross-origin access.** The standards do not ask a server to send `Access-Control-Allow-Origin`, so check that the service does, on errors as well as answers (see "What the server should do" below).
- **Content Security Policy.** The host page must allow each origin: a tile service in `img-src` and `connect-src`, and a feature or identify service in `connect-src`. See the [Content Security Policy guide](content-security-policy.md).

### OGC API Features

An items resource that takes a `bbox` and a `limit` is a `query` source. The `f=json` in the URL below is a convention some servers use to pick the format, not part of the standard (see "Format" below), so remove it if your service rejects unknown parameters.

```ts
import type { FeedLayerDefinition, PointStyle } from "@mapcairn/core";

const parks: FeedLayerDefinition<PointStyle> = {
  id: "example-ogc-parks",
  name: "Parks",
  description: "Example parks from a feature service, asked for by view.",
  group: "Places",
  dataCost: "a few KB per screen",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: {
    kind: "query",
    url: "https://features.example.org/collections/parks/items?f=json&bbox={west},{south},{east},{north}&limit={limit}",
    decoder: "geojson",
    fields: { id: "id", title: "properties.name" },
    maxFeatures: 500,
    minzoom: 9,
  },
  style: { colour: { kind: "fixed", colour: "bluish-green", label: "Park" } },
  card: { title: "{title}", lines: [] },
  list: {
    secondary: "{title}",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "No parks in view.",
};
```

For a view over Cape Town the request is `.../items?f=json&bbox=18.2,-34.1,18.7,-33.7&limit=501`. What the standard defines and what the query sends line up:

- `bbox` is `minimum longitude, minimum latitude, maximum longitude, maximum latitude` in CRS84, which is the order of `{west},{south},{east},{north}`. The query sends no `bbox-crs`, so the service's default applies.
- `limit` is `maxFeatures` plus one, so a service that honours it lets the layer tell that more exist.
- The answer is a GeoJSON feature collection. The decoder reads `features` and ignores `numberMatched`, `numberReturned` and `links`.

What does not work:

- **Paging.** A `next` link is not followed. The layer keeps the first `maxFeatures` of one response and says to zoom in. A service that caps `limit` below `maxFeatures + 1` may send a shorter page, and the layer then cannot tell that more exist, or may refuse the request (a strict service can answer HTTP 400 for a `limit` above its declared maximum). Set `maxFeatures` at least one below the service's maximum `limit`.
- **The antimeridian and the poles.** The box is kept within -180 to 180 and -85 to 85 degrees, so it never wraps the antimeridian, though the standard allows it to.
- **Other coordinate systems.** Geometry in a `crs` other than CRS84 is not requested. A feature with any position beyond 180 or 90 degrees is skipped whole.
- **Format.** The request sets no `Accept` header. The recipe's `f=json` is not part of OGC API Features Part 1, which negotiates the format on `Accept`; some servers use it as a convention. Remove it if the service rejects unknown parameters. A service that answers HTML or another format by default and has no such parameter cannot be used without a proxy. The answer must be JSON.

### WMS

A WMS draws a map image for a box, so it is a `tiles` source with `{bbox-epsg-3857}`, and its `GetFeatureInfo` is the layer's `identify` block.

```ts
import type { IdentifiableLayerDefinition } from "@mapcairn/core";

const roads: IdentifiableLayerDefinition = {
  id: "example-wms-roads",
  name: "Roads",
  description: "Example road map drawn by a WMS, with the road at a tap.",
  group: "Places",
  dataCost: "about 100 KB per screen",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: {
    kind: "tiles",
    tiles: "https://maps.example.org/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=roads&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}",
    tileSize: 256,
    maxzoom: 18,
  },
  identify: {
    url: "https://maps.example.org/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=roads&QUERY_LAYERS=roads&STYLES=&CRS=EPSG:3857&BBOX={bbox}&WIDTH={width}&HEIGHT={height}&I={x}&J={y}&INFO_FORMAT=application/json&FEATURE_COUNT=10",
    decoder: "geojson",
    fields: { id: "id", title: "properties.name" },
    card: { title: "{title}", lines: [] },
  },
};
```

The engine fills `{bbox-epsg-3857}` with `minx,miny,maxx,maxy` in metres for each tile, so every tile is one `GetMap` for a square picture of that box. `WIDTH` and `HEIGHT` must equal `tileSize`. For a tap, `{bbox}` is a small square of `2 × tolerance + 1` pixels centred on the tap, `{width}` and `{height}` are its size, and `{x}` and `{y}` are the tolerance, so `I` and `J` name the middle pixel. See [identify features on a raster layer](extending.md#identify-features-on-a-raster-layer) for the placeholders.

- **Versions.** WMS 1.3.0 names the system `CRS` and the pixel `I` and `J`. WMS 1.1.1 names them `SRS`, `X` and `Y`, and both validate. In both, EPSG:3857 is easting first, so the box is in the order the engine writes it. Older services sometimes advertise Web Mercator as EPSG:900913 or EPSG:3785. The SDK does not read the system's text, so a host can write the code its service lists, provided it is the same Web Mercator projection.
- **Coordinate systems.** Ask for EPSG:3857. WMS 1.3.0 puts latitude first for EPSG:4326, and the engine does not send a box in degrees, so a service that offers no EPSG:3857 is not supported.
- **Cost.** A WMS draws each tile on demand, so size `tileSize` and a cache in front of the server to the traffic. A `tileSize` of 512 needs about a quarter as many requests as 256, with `WIDTH` and `HEIGHT` set to match.
- **What a tap answers.** The answer must be JSON. Set `INFO_FORMAT` to a JSON or GeoJSON format the server offers. XML, GML, HTML and plain text, which are the usual defaults, are not read. A server that offers none needs a small proxy that answers in JSON.
- **Coordinates in the answer.** The decoder expects WGS 84 degrees. A server that answers in EPSG:3857 metres has its features dropped, because a feature with any position beyond 180 or 90 is skipped whole.
- **The encoded box.** `{bbox}` is written with its commas as `%2C`, which a server decodes as any query string. A server that does not decode it is not supported.

### WMTS

A WMTS tile matrix set that is the XYZ grid is a `tiles` source, whichever form the service offers.

```ts
import type { LayerDefinition } from "@mapcairn/core";

const imagery: LayerDefinition = {
  id: "example-wmts-imagery",
  name: "Imagery",
  description: "Example imagery from a WMTS tile service.",
  group: "Imagery",
  dataCost: "about 300 KB per screen",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: {
    kind: "tiles",
    tiles: "https://tiles.example.org/wmts/imagery/default/WebMercatorQuad/{z}/{y}/{x}.jpg",
    tileSize: 256,
    maxzoom: 19,
  },
};
```

This is the RESTful form. Its tile template ends `{TileMatrix}/{TileRow}/{TileCol}`, which is `{z}/{y}/{x}`: the row comes before the column. A service that offers only the key-value form uses the same three placeholders:

```
https://tiles.example.org/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=imagery&STYLE=default&TILEMATRIXSET=WebMercatorQuad&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg
```

What does not work:

- **Other tile matrix sets.** The engine asks for tile `z/x/y` of the Web Mercator grid, with the origin at the top left and row 0 at the top. That is the `WebMercatorQuad` set, also published as `GoogleMapsCompatible`. A grid in another system, with another origin or with a tile size that is not 256 or 512, is not supported. Set `tileSize` to the set's tile width.
- **Matrix names.** `{z}` is the level as a plain number. A matrix named with text before the number, such as `EPSG:3857:3`, works as `EPSG:3857:{z}`. A name with zero padding or any other pattern does not.
- **Limits.** The service's tile limits per matrix are not read. Set `maxzoom` to the deepest matrix and `bounds` to the box the service holds.
- **Dimensions.** A fixed style or time is fixed text in the URL, and one a person chooses is a control whose id is a placeholder, as for any tile layer.

## What the server should do

- Use `https`. Validation refuses any other origin, and the host page's Content Security Policy must allow the origins a definition names: tiles in `img-src` and `connect-src`, feeds and queries in `connect-src`.
- Allow cross-origin requests. A feed, a query, a vector tile and a raster tile are all fetched by the browser, so every source needs `Access-Control-Allow-Origin`. No cookies are needed, and the app sends none.
- Put a version in a URL when its data changes. The host writes each URL, so a changed definition with a new URL makes the browser ask again. There is no separate way to invalidate tiles.
- Send the response compressed and cacheable. `Cache-Control` with an `ETag` lets a browser revalidate a feed cheaply, though a revalidation is still a request. The browser's own cache reuses a response within its `max-age` without asking the server at all.
- Credit the provider and say what the browser requests in your attributions and privacy pages, as the reference host does in `ATTRIBUTIONS.md` and `PRIVACY.md`.

## A catalogue for each person

Definitions are plain data, and the SDK never fetches a catalogue itself. The reference host collects its definitions at build time from `packages/web/src/layers/definitions`, validates them at start-up and hands the catalogue to the interface as `Services.layers`. A host that serves its own layers builds a catalogue from its own definitions with `createStaticLayerCatalogue` and passes it there.

`createStaticLayerCatalogue` can be given definitions from anywhere when the host composes its services, for example fetched when its server starts. The limit is that the list is fixed when the app starts, and is one list for everyone, and it throws at start-up on any invalid definition, so one bad definition fails start-up. A host that needs a different list for each person, or one it changes without a deploy, uses `createRuntimeLayerCatalogue` from `@mapcairn/core`. The host writes the `load` function that fetches its own endpoint, so the catalogue stays host code and the SDK still fetches nothing. The endpoint returns a JSON array of definitions. Each entry is validated on its own (`partitionDefinitions`), so one bad definition costs its own layer and never the rest, and the host can log what was skipped through `onSkipped`. `load` should reject when the request fails, including a session that has expired, and not resolve with an empty list. The catalogue calls `load` on its first subscription and only once, and again only when the host calls `refresh()`.

What a runtime catalogue does with the address and with a changing list: a layer named in the address waits for the first list and stays in the address meanwhile, and is turned on when the list has it, with its control values checked against its definition. One the list does not have (missing, or not offered to that person) is dropped for good, and, when the catalogue was still loading as the page opened, the interface announces it once ("1 layer in the link is not available."). An address carries at most 20 layers: a hand-edited one with more keeps the first 20, and the rest are counted in that same message, for example "3 layers in the link are not available.". A layer that arrives after the page has opened has its controls' defaults. An enabled layer that a refresh no longer lists is turned off, its request is aborted, and the interface announces it once. A layer whose definition changed keeps the control values that are still valid.

A layer whose definition a refresh replaces is drawn again, so a changed style, heatmap setting, zoom limit or tile size shows. A feed layer is drawn again from the features it already has and is requested again only when its URL changes, so put a version in the URL when its data changes. A change to how features are decoded (the decoder, the field map or the filter, including a style, label or list that now names a field the field map did not read) also needs a new URL or a retry to take effect, and a load already under way when the definition is replaced finishes with the old definition's decoder. A refresh that lists a definition unchanged draws nothing.

What a person sees while a runtime catalogue works: the Layers section says "Loading layers" while the first list loads. A failed load shows "Layers could not be loaded." with a Try again button, which asks the catalogue to load again. A list with no layers shows "No layers are available.", except for a host whose catalogue was ready and empty from the start, which has no Layers section. Definitions the catalogue left out show as "1 layer could not be shown" or "3 layers could not be shown". A refresh that fails keeps the last list and shows "Layers could not be updated. Showing the last list." with Try again. The interface never refreshes by itself and has no refresh button: only the host calls `refresh()`. The line above the layers reads "Open data from public providers. Nothing is requested until you turn a layer on." unless the host passes its own text as `intro` (to `LayersSection`, or to `SheetContent`), which a host behind a login should, since its layers are not that.

Each change is announced once, as one message, in this order: the layers turned off, the layers in the address that are not available, the skipped count, then "Layers updated: 1 added, 1 removed." (a part that is zero is left out, and the first list is not an update). "Loading layers" is announced only while a layer named in the address is waiting. A failed load or a failed refresh is its own assertive message. The reference site is unaffected, because its static catalogue is ready on the first render, so it shows none of this.

## What the tests cover

The loop test in `packages/web/src/layers/layers.test.ts` checks the reference host's own definitions: the schema, the production Content Security Policy, `ATTRIBUTIONS.md` and a recorded fixture. It does not see a host's definitions. Validate a host's definitions in the host and test its own fixtures. A host can reuse `validateLayerDefinition` and `assertValidDefinitions`, both exported from `@mapcairn/core`, to check its definitions against its own decoders and formatters. The content security policy check is the host's own: the loop test builds the policy from the reference host's `buildContentSecurityPolicy`, so a host needs its own test that its policy lists the origins its definitions request.
