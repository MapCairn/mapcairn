# Serving layers to MapCairn

Which layer kind to serve from your own server, and what each costs it. A layer is a definition, described in [`extending.md`](extending.md); this guide is about the server behind that definition. The browser asks for the data only when someone turns the layer on. A feed or query request carries no cookies and no referrer.

## Choose the shape of the data

| Server gives | Layer source | Fits | Cards, list and selection | What it costs |
| --- | --- | --- | --- | --- |
| XYZ or WMTS image tiles | `tiles` | A dense drawing, such as a forecast field or imagery | No, a tile is a picture | One request a tile, cheapest to cache |
| Vector tiles (MVT) | `vector-tiles` | Linework and areas where a tile generator exists | No, the features stay in the tiles | A tileset to build and regenerate, one request a tile |
| GeoJSON for a bounding box | `query` | A layer of features too large to send whole, and small enough to show at once | Yes | One request for each new area looked at, geometry as JSON |
| One GeoJSON file | `feed` | A small layer that changes rarely, such as country outlines | Yes | One request when the layer is turned on, then reused from the cache |

A tile layer and a vector tile layer are the only options for something with far more geometry than a screen can hold. A query layer is the only option that gives features to tap, a list and a selection from a dataset too large to send whole.

## Raster tiles for dense drawings

A `tiles` source names a URL template with `{z}`, `{x}`, `{y}` and, for a WMS, `{bbox-epsg-3857}`, a tile size of 256 or 512 px, and the deepest level the service has. A provider that holds one image a tile, or draws the map on demand and caches it, is served well by tiles: the browser asks for a tile at a time and the image is cheap for a cache to hold.

- A desktop screenful is around 20 tiles at 256 px, and a quarter of that at 512 px. Each new area asks for the tiles over it, so the levels people look at most are the ones your server serves most.
- Set `maxzoom` to the deepest level you hold and let the engine stretch it beyond that, rather than answering 404 for a level that does not exist.
- Set `bounds` when the provider fills the rest of the world with blank or opaque tiles. The map then asks for no tile wholly outside the box. This matters at the poles, where a globe stretches the edge row of tiles over the pole.
- Serve `Cache-Control` with a long `max-age` for a tile that never changes, and a version in the URL when it does. A browser cache and a cache in front of the server both do most of the work here.
- A tile is a picture, so it has no cards or list. Offer a control such as opacity or a date and time, and say in `dataCost` what a screen costs, in words a person can read.

## Vector tiles where a generator exists

A `vector-tiles` source names a `{z}`, `{x}`, `{y}` template, the zoom window of the tileset and a style per source layer. Linework and areas are often smaller as vector tiles than as a rasterised image at the same zoom, and the browser styles them from the definition, so one tileset can take a new look without being rebuilt.

- The work moves to the build: a generator turns your data into a tileset at each level, and it has to run again when the data changes. Low zoom tiles hold a lot of geometry, so keep them coarse.
- Serve the tiles from a cache with a version in the path or the query, and regenerate the whole tileset rather than patching single tiles.
- Features stay in the tiles, so the layer has a key but no cards or list. Rule colours read tile properties by name, so name them in the tileset as the definition expects.

## GeoJSON by bounding box for features

A `query` source is a GeoJSON endpoint that takes a box and a limit. The definition's URL must use `{west}`, `{south}`, `{east}` and `{north}`, in decimal degrees, and may use `{limit}`, which is `maxFeatures` plus one so the response shows whether more exist. `maxFeatures` is 1 to 5000, and `minzoom` keeps the layer from asking while the view is too wide for the features to mean anything.

- The layer asks again only when the view leaves the area last asked for, snapped to a grid, with one request in flight per layer, so small pans send nothing and a layer that is turned off sends nothing more.
- Answer the box and the limit. A spatial index on the geometry and a cap on rows kept both ends cheap: the client never draws more than `maxFeatures`, and the server never builds a response bigger than `limit`.
- Send GeoJSON with the fields your `fields` map names. This is the simplest server: a query, a limit and a JSON encoder, with no tileset and no image renderer.
- This is the source that gives cards, a list and a selection from data too large to send whole. A screen of features is larger as JSON than as a tile, so a cap in the low hundreds is usually right; the layer says to zoom in when the response is cut short.

## One GeoJSON file for a small layer

A `feed` source is a URL to a whole GeoJSON file. It suits boundaries and reference data that change rarely. The page keeps the response for its `Cache-Control` `max-age`, or for the definition's `cacheSeconds` when the server sends none, and layers split from one file share a request. Send `Cache-Control`, and for a large file send compressed.

## What the server should do

- Use `https`. Validation refuses any other origin, and the host page's Content Security Policy must allow the origins a definition names: tiles in `img-src` and `connect-src`, feeds and queries in `connect-src`.
- Allow cross-origin requests. A feed, a query, a vector tile and a raster tile are all fetched by the browser, so every source needs `Access-Control-Allow-Origin`. No cookies are needed, and the app sends none.
- Put a version in a URL when its data changes. The host writes each URL, so a changed definition with a new URL makes the browser ask again. There is no separate way to invalidate tiles.
- Send the response compressed and cacheable. `Cache-Control` with an `ETag` lets a browser revalidate a feed for free.
- Credit the provider and say what the browser requests in your attributions and privacy pages, as the reference host does in `ATTRIBUTIONS.md` and `PRIVACY.md`.

## A catalogue for each person

Definitions are plain data, and the SDK never fetches a catalogue itself. The reference host collects its definitions at build time from `packages/web/src/layers/definitions`, validates them at start-up and hands the registry to the interface as `Services.layers`. A host that serves its own layers builds a registry from its own definitions with `createLayerRegistry` and passes it there.

A host that needs a different list for each person, or one it changes without a deploy, waits for the runtime catalogue, which is tracked in [#46](https://github.com/MapCairn/mapcairn/issues/46) and not built yet. Until then the list is fixed at build time. When it arrives, the host writes the `load` function that fetches its own endpoint, so the catalogue stays host code and the SDK still fetches nothing. The plan is for that endpoint to return a JSON array of definitions, with one bad definition costing its own layer and never the rest.

## What the tests cover

The loop test in `packages/web/src/layers/layers.test.ts` checks the reference host's own definitions: the schema, the production Content Security Policy, `ATTRIBUTIONS.md` and a recorded fixture. It does not see a host's definitions. Validate a host's definitions in the host and test its own fixtures; the schema check and the CSP rule do not depend on the reference site.
