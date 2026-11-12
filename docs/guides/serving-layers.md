# Serving layers to MapCairn

Which layer kind to serve from your own server, and what each costs it. A layer is a definition, described in [`extending.md`](extending.md); this guide is about the server behind that definition. The browser asks for the data only when someone turns the layer on. A feed or query request carries no cookies and no referrer.

## Choose the shape of the data

| Server gives | Layer source | Fits | Cards, list and selection | What it costs |
| --- | --- | --- | --- | --- |
| XYZ or WMTS image tiles | `tiles` | A dense drawing, such as a forecast field or imagery | No, a tile is a picture | One request a tile, cheapest to cache |
| Vector tiles (MVT) | `vector-tiles` | Linework and areas where a tile generator exists | No, the features stay in the tiles | A tileset to build and regenerate, one request a tile |
| GeoJSON for a bounding box | `query` | A layer of features too large to send whole, and small enough to show at once | Yes | One request for each new area looked at, geometry as JSON |
| One GeoJSON file | `feed` | A small layer served as one whole file, of any freshness, such as country outlines or an alert list | Yes | One request when the layer is turned on, then reused while the response is fresh |

The first question is how much geometry there is. A tile layer or a vector tile layer suits a layer whose geometry is far more than a screen can hold, however few features it has. A query layer suits a layer with many features, up to the 5000 a query may show at once, where each feature should be something to tap, with a list and a selection. If the whole layer is small enough to send in one file, a feed is simpler than either.

## Raster tiles for dense drawings

A `tiles` source names a URL template with `{z}`, `{x}`, `{y}` and, for a WMS, `{bbox-epsg-3857}`, a tile size of 256 or 512 px, and the deepest level the service has. A provider that holds one image a tile, or draws the map on demand and caches it, is served well by tiles: the browser asks for a tile at a time and the image is cheap for a cache to hold.

- How many tiles a screen asks for depends on the screen size, the zoom and the tile size: a larger screen needs more tiles for the same area, 512 px tiles need about a quarter as many as 256 px, and the engine also loads a buffer around the view. Each new area asks for the tiles over it, so the levels people look at most are the ones your server serves most.
- Set `maxzoom` to the deepest level you hold and let the engine stretch it beyond that, rather than answering 404 for a level that does not exist.
- Set `bounds` when the provider fills the rest of the world with blank or opaque tiles. The map then asks for no tile wholly outside the box. This matters at the poles, where a globe stretches the edge row of tiles over the pole.
- Serve `Cache-Control` with a long `max-age` for a tile that never changes, and a version in the URL when it does. A browser cache and a cache in front of the server both do most of the work here.
- A tile is a picture, so it has no cards or list. Offer a control such as opacity or a date and time, and say in `dataCost` what a screen costs, in words a person can read.
- Say when there is no tile. This applies only to raster layers. When the map has settled and every tile the layer asked for has failed, with none loaded, the layer's entry in the list shows a status: "No imagery was found for" the chosen date or time when the layer has such a control, and otherwise "Could not load". A layer whose tiles partly load says nothing. A server that publishes time-stamped imagery should answer `404` with `Access-Control-Allow-Origin` for a date or time it has no imagery for. A `404` counts as "no tile" only when it carries open CORS headers; without them the browser blocks the response and the engine reports a request error instead. The CORS requirement covers error responses as well as tiles.

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
- This is the source that gives cards, a list and a selection from data too large to send whole. When the response holds more than `maxFeatures`, the layer draws the first ones and says to zoom in. As guidance only, features cost more as JSON than the same geometry costs in a tile, so choose `maxFeatures` by measuring a response, not by a fixed number.

## One GeoJSON file for a small layer

A `feed` source is a URL to a whole GeoJSON file. It suits a small layer of any freshness, from country outlines to earthquakes and alerts, with `Cache-Control` setting how stale the data may be: the reference host's earthquake feed sends a `max-age` of a minute. Layers split from one file share a request. Send `Cache-Control`, and for a large file send compressed.

The page keeps every response, a query response as well as a feed, for at least the server's `max-age`. A feed definition may also set `cacheSeconds` (at most 3600), a minimum retention for a provider that sends no `max-age`; when both are present the longer applies. A query definition cannot set it. Nothing is kept beyond the page.

## What the server should do

- Use `https`. Validation refuses any other origin, and the host page's Content Security Policy must allow the origins a definition names: tiles in `img-src` and `connect-src`, feeds and queries in `connect-src`.
- Allow cross-origin requests. A feed, a query, a vector tile and a raster tile are all fetched by the browser, so every source needs `Access-Control-Allow-Origin`. No cookies are needed, and the app sends none.
- Put a version in a URL when its data changes. The host writes each URL, so a changed definition with a new URL makes the browser ask again. There is no separate way to invalidate tiles.
- Send the response compressed and cacheable. `Cache-Control` with an `ETag` lets a browser revalidate a feed cheaply, though a revalidation is still a request. The browser's own cache reuses a response within its `max-age` without asking the server at all.
- Credit the provider and say what the browser requests in your attributions and privacy pages, as the reference host does in `ATTRIBUTIONS.md` and `PRIVACY.md`.

## A catalogue for each person

Definitions are plain data, and the SDK never fetches a catalogue itself. The reference host collects its definitions at build time from `packages/web/src/layers/definitions`, validates them at start-up and hands the catalogue to the interface as `Services.layers`. A host that serves its own layers builds a catalogue from its own definitions with `createStaticLayerCatalogue` and passes it there.

`createStaticLayerCatalogue` can be given definitions from anywhere when the host composes its services, for example fetched when its server starts. The limit is that the list is fixed when the app starts, and is one list for everyone, and it throws at start-up on any invalid definition, so one bad definition fails start-up. A host that needs a different list for each person, or one it changes without a deploy, uses `createRuntimeLayerCatalogue` from `@mapcairn/core`. The host writes the `load` function that fetches its own endpoint, so the catalogue stays host code and the SDK still fetches nothing. The endpoint returns a JSON array of definitions. Each entry is validated on its own (`partitionDefinitions`), so one bad definition costs its own layer and never the rest, and the host can log what was skipped through `onSkipped`. `load` should reject when the request fails, including a session that has expired, and not resolve with an empty list. The catalogue calls `load` on its first subscription and only once, and again only when the host calls `refresh()`.

What a runtime catalogue does with the address and with a changing list: a layer named in the address waits for the first list and stays in the address meanwhile, and is turned on when the list has it, with its control values checked against its definition. One the list does not have (missing, or not offered to that person) is dropped for good, and, when the catalogue was still loading as the page opened, the interface says so once ("1 layer in the link is not available."). A layer that arrives after the page has opened has its controls' defaults. An enabled layer that a refresh no longer lists is turned off, its request is aborted, and the interface says so once. A layer whose definition changed keeps the control values that are still valid.

What is not built yet, because it is later steps of plan 0005 ([#46](https://github.com/MapCairn/mapcairn/issues/46)): the Layers section shows nothing while the catalogue is loading, has failed or is empty, with no message or Try again action; and a feed or raster layer whose definition changes only its style is not drawn again until its features, tile URL or opacity change. Until those steps land, a runtime catalogue is not ready to put behind a page. The reference site is unaffected, because its static catalogue is ready on the first render.

## What the tests cover

The loop test in `packages/web/src/layers/layers.test.ts` checks the reference host's own definitions: the schema, the production Content Security Policy, `ATTRIBUTIONS.md` and a recorded fixture. It does not see a host's definitions. Validate a host's definitions in the host and test its own fixtures. A host can reuse `validateLayerDefinition` and `assertValidDefinitions`, both exported from `@mapcairn/core`, to check its definitions against its own decoders and formatters. The content security policy check is the host's own: the loop test builds the policy from the reference host's `buildContentSecurityPolicy`, so a host needs its own test that its policy lists the origins its definitions request.
