# 0008: Identify features on raster tile layers

Status: in progress. Tracking issue: [#47](https://github.com/MapCairn/mapcairn/issues/47).

## Goal

A person taps a raster layer, or presses `I` at the centre of the map, and sees what the layer says is there, in the same card or choices list as any feature. A host opts a layer in with an `identify` block in its definition, naming a URL that answers for a point, as a WMS `GetFeatureInfo` request does. Nothing is asked until a tap. The reference site changes only if the maintainer chooses (open question 1).

## Ground rules

- Definitions stay plain data, nothing branches on a layer id, and the SDK adds no runtime dependency.
- A request is made only for a tap or the `I` key (the keyboard route), never for hover or move. It is `https` on a fixed origin, sends no cookies or referrer, can be cancelled, and its outcome is said once through `LiveRegion`.
- **Sequencing.** Steps that touch `useDataLayers` come after PR #103 (open, mergeable, checks passing), which adds `withoutTraces` and `turnOff` to it. Plan 0005 step 2 (its `reconcile` over the hook's state) also changes that hook and the `LayerSource` ripple; plan 0007 (merged) also changes `identifyAtCentre`, `onMapClick`, `FeatureChoices` and the bottom-centre slot. Whichever lands second resolves the textual conflicts, as plan 0007 says for plan 0005. Plan 0005 validates `identify` with the rest of a definition. Issue #45 owns `unauthorised` and credentials.

## Design

### The definition (`packages/core/src/layers`)

```ts
interface IdentifySource {
  readonly url: string;          // https template, fixed origin
  readonly tolerance?: number;   // CSS pixels, 1 to 20, default DEFAULT_IDENTIFY_TOLERANCE_PX (12)
  readonly decoder: string;      // a registered decoder, as for a feed
  readonly records?: string;     // dotted path to a list in a plain JSON response
  readonly fields: FieldMap;     // id and title required
  readonly card: CardSpec;
}
// TileLayerDefinition gains: readonly identify?: IdentifySource
```

- **The card is nested.** `isFeedLayer` and `loadsFeatures` test `"card" in definition`, so a top-level `card` would send the layer to `layerSource.load` and `feedUrl`. New `isIdentifiable` and `cardOf` (a feed's `card`, or `identify.card`) let `FeatureCard` and `FeatureChoices` stop casting to `FeedLayerDefinition`. With no style the card leaves out the glyph and class line.
- **Placeholders.** `{lng}`, `{lat}`, `{bbox}`, `{width}`, `{height}`, `{x}`, `{y}`, `{zoom}` and the layer's controls, so a time control follows the tiles. `x` and `y` are in `ENGINE_PLACEHOLDERS`, which `fillUrlTemplate` leaves unfilled and `checkUrl` rejects without `engine: true`. So `fillUrlTemplate` takes the names to leave alone (identify passes none), and `checkUrl` an identify allowance that wins over the engine list.
- **Validation.** `checkFields`, `checkCard` and the decoder check hard-code `source.fields`, `card.*` and `source.decoder`; they take a path prefix so errors read `identify.fields.id`. The identify names go into `known`, and a control or derived variable whose id equals one of them is rejected, so a template name is never ambiguous. A template needs `{lng}` and `{lat}`, or all of `{bbox}`, `{width}`, `{height}`, `{x}` and `{y}`, and no placeholder in the scheme or host.
- **The request is a small picture.** The port has no viewport size and `getBounds` is axis-aligned, wrong for a rotated map or a globe. So the box is square, 2t+1 pixels across for tolerance t, centred on the tap: `{width}` and `{height}` are 2t+1, `{x}` and `{y}` are t, and `{bbox}` is `minx,miny,maxx,maxy` in EPSG:3857 metres (the CRS `flood-hazard.ts` already requests), (t + 0.5) × `EQUATOR_METRES_PER_PIXEL_AT_ZOOM_0` (`core/src/zoom/zoom.ts`) / 2^zoom either side of `wgs84ToWebMercator(point)`. `{zoom}` is the normalised zoom. WMS 1.3.0 writes `I={x}&J={y}`. An EPSG:4326 `{bbox}` is not offered (1.3.0 puts latitude first); `{lng}` and `{lat}` serve other servers. `fillUrlTemplate` encodes every value, so `{bbox}` goes out as `a%2Cb%2Cc%2Cd`; servers decode it, and the guide says so.
- **Edges of the world.** The box is not clamped or shifted. The tap longitude is wrapped to [-180, 180) (`positionOf`), so a tap at 179.9999 gives a box ending beyond 20037508 metres, and `wgs84ToWebMercator` clamps latitude to 85.0511, so near a pole `{bbox}` is centred on the clamp while `{lat}` is raw. The server decides; no answer shows as "did not answer". The guide says so.
- **Decoding.** `decodeIdentify(definition, raw, decoders, at)` prepares the response, then runs the named decoder, so `Decoder` keeps its signature. The preparation applies only to GeoJSON-like input and to `records`; a custom decoder gets the raw response. A GeoJSON feature with a missing or `null` geometry (as a server sends for raster pixel values) gets the tapped point, because the decoder drops those and `LayerFeature.geometry` is required; that also places the selection ring and "Show on map". A document with no `features` list, such as `{}`, is read as no features, where `geojsonDecoder` would throw. With `records`, each item of the list becomes the `properties` of a feature, so fields read `properties.name`, and a non-list is `[]`. Supported: GeoJSON and a JSON list by path. Not supported: XML or GML, HTML, plain text (the default `GetFeatureInfo` formats), JSONP and POST; a server that cannot send JSON needs a small proxy, which the guide says. A layer yields at most `MAX_IDENTIFIED_FEATURES` (20).
- **Ids.** The decoder falls back to the position in the answer: unique for one answer, enough for the card and list, not stable between taps. A host should map `fields.id` to a real attribute.

### The port and the fetch source

```ts
interface IdentifyTarget { readonly latlng: LatLng; readonly zoom: number }
interface LayerIdentifyRequest {
  readonly definition: IdentifiableLayerDefinition;  // a tile layer with identify
  readonly controls: ControlValues; readonly now: number;
  readonly at: IdentifyTarget; readonly signal?: AbortSignal;
}
// LayerSource.identify(request): Promise<readonly LayerFeature[]>
```

- **Nothing found is not an error.** It is the common result, so `identify` resolves to `[]`. (`load` rejects with `empty` because an empty feed is a state a layer shows.) Rejections are `network` (including a non-2xx answer), `invalid` and `aborted`. When #45 lands, 401 and 403 reject with its `unauthorised` kind; until then they are `network`. This plan does not add the kind.
- **`FetchLayerSource.identify` never stores.** `#get` cannot do this: its third argument is a minimum, and `SharedResponseCache` keeps any response whose `max-age` is above 0, so one answer with `Cache-Control: max-age=3600` would be kept, and every tap's URL differs, pushing feed responses out of the 16-entry cache. So the fetch and JSON steps move out of `#get`'s callback into one private method, which `#get` wraps in `cache.load` and `identify` calls directly. Identify ignores the response's `Cache-Control` and does no in-flight sharing, because no two taps share a URL. It builds the URL with core's `identifyUrl(definition, controls, now, at)`, and #45's headers and credentials reach it through the shared fetch method.
- **A required method**, because an optional one makes every caller guard it. A host's own source stops compiling, accepted before publication as in plan 0005 (`feat(core)!:`).
- **Fake and contract.** `LayerSourceControls` gains identify counterparts to `respondWith`, `failWith` and `hold`, implemented for the fake and for the `FetchLayerSource` subject, and the contract gains a tile layer with `identify`. `FakeLayerSource.hold()` holds every load for every layer, so the fake gets `holdIdentify(layerId)` for one layer, plus `setIdentified`, `failIdentify` and `identifyRequests` with the URL a real source would fetch.

### The hook and the map bindings (`packages/map`)

- **State.** `useDataLayers` gets `identified`, features by layer id, apart from `results`, which feeds the list and the drawing. `select` and the `selected` and `choices` memos read both through a small `featuresFor`. An entry is cleared by `withoutTraces` (after #103) and when its layer's tile URL changes (as `tilesUnavailableFor` does). It is replaced at settlement, not at the start, so a tap on empty ground leaves an open card alone, as today. At settlement the old `selection` and `choices` are dropped only if they point into an entry that was replaced.
- **One entry point, `identifyAt(target, { focus })`.** It asks each layer that is on, has `identify`, shows imagery (not `tiles-unavailable`) and whose `bounds` hold the point: at most `MAX_IDENTIFY_LAYERS` (4, in catalogue order). The requests start together, each with its own `IDENTIFY_TIMEOUT_MS` (8 s) run by the hook, which records the timeout because the source only sees `aborted`, which callers ignore. It waits for all, makes one transition and returns `{ asked, found }`.
- **Cancelling.** A new tap or `I` press, Escape (which cancels first, before it closes any surface), turning the layer off and unmount abort a pending identify. So does the person leaving the plain map, because a request that runs up to 8 s must not open the sheet or take focus over measure, draw, directions, search or a pin: the hook has `cancelIdentify()`, which the host calls on a surface change, when `ignoreTaps` turns true and from `onLongPress`.
- **Found.** One feature opens its card, several open `FeatureChoices` with "Back to list", through the step `choose` uses; the caller then opens the sheet (`openFeature`). A tap that lands on a drawn feed feature does not call `identifyAt` and opens at once as today (open question 2).
- **One message.** Core's `announceIdentified` takes the counts, how many layers were asked of how many could be, and the names of layers that failed or timed out. Several found: "3 features here. Choose one from the list." One found: nothing, as the card takes focus. None: "Nothing found here." (an open card is left alone). A failure adds "Rainfall did not answer.", assertive only when every request failed. Over the cap it adds "Asked 4 of 6 layers." The announcer coalesces a burst to the latest, so the hook sends this one message at settlement, and `choose` does not announce on this route. For `asked === 0` the old behaviour holds: a tap is silent and `I` says "No features at the centre of the map."
- **Waiting.** After `IDENTIFY_FEEDBACK_MS` (400 ms) a status line "Looking up what is here" shows in the bottom-centre slot. A screen reader hears nothing during the wait, deliberately: a message at 400 ms would be coalesced with the result. A new tap or Escape cancels it.
- **Layers section.** An identifiable layer that is on shows "Tap the map to see details for this layer." after its legend, plus "Only the first 4 layers are asked on one tap." when more than 4 are identifiable and on. The `I` help line reads "Show what is at the centre of the map".

### Plan 0007 (selection)

- Plan 0007 routes taps and `I` through the hook's `tapHits`, adds a select mode and shows "Selecting on the map" in the bottom-centre slot. **While select mode is on, a tap on empty map asks no raster layer**; revisit when both exist.
- **Identified features are not selectable** (their ids are not stable), so in a `FeatureChoices` list they open their card as today and have no toggle, beside selectable rows that do. The row says nothing extra; a card for an identified feature has no "Select" toggle.
- **The slot.** The two status lines never show together, since identify does not start in select mode and an identify started before it is cancelled when the mode turns on. If a later change allows both, "Looking up what is here" stacks above "Selecting on the map".

### The hosts (`packages/web`, `examples/embed`)

- **The tap route is the host's `onClick`**, not a new `MapDataLayers` subscription. `featureTap` fires only for feed hits, and `MapView` drops the click that ends a long press only on the path to `onClick`. `useMapApp.onMapClick` already routes by surface for measure, directions and draw; its plain-map case calls `identifyAt` when `adapter.featuresAt(event.point)` is empty. `identifyAtCentre` does the same and waits for the result before it says anything. `ExampleApp.tsx` wires it alike.
- **CSP and CORS.** The request is a `fetch`, so `connect-src` must name the origin. A tile origin is already in both `connect-src` and `img-src` (`layers.test.ts` requires it), so a layer whose identify shares the tile host needs nothing more; a separate API origin goes in `public/_headers` and `src/constants/securityHeaders.ts`. The loop test gains a `connect-src` check for identify. The endpoint also needs `Access-Control-Allow-Origin`, which a server that allows it for tiles may not send for `GetFeatureInfo`.

## Tests

Each step below starts with its failing tests.

## Order of work

Steps 1 and 2 touch no hook and need not wait for #103. Step 3 waits for it.

1. **Core: definition, validation, URL, decoding.** Tests: a valid block passes and a top-level `card` is not read as a feed; each rule above fails with a path such as `identify.fields.id`; a control id equal to `lng` is rejected; `{x}` and `{y}` fill for identify and stay in a tile URL; `identifyUrl` is pinned to the exact string, `%2C` included, at a known point and zoom 10 with tolerance 12; at longitude 179.9999 `maxx` exceeds 20037508 and at latitude 89 the box is centred on the y of 85.0511 while `{lat}` is 89; a property test that the box is centred on the point elsewhere; `decodeIdentify` with a geometry, `geometry: null`, no geometry, `{}`, `records` with a list and with a non-list, 21 results, and a custom decoder given the raw response.
2. **Port, fake, contract, fetch source.** Tests: the contract (features, `[]`, `network`, `invalid`, `aborted` before and during a hold, one layer held while another answers); `FetchLayerSource` with a stubbed `fetch` (no cookies or referrer, 500 is `network`, non-JSON is `invalid`); identify answers sent with `Cache-Control: max-age=3600` and a feed response that still survives 20 identify calls; the loop test's `connect-src` check.
3. **Hook, card, choices (after #103).** Tests: one layer opens its card at the tapped point; two give choices and Back; none says "Nothing found here." once and leaves an open card; one timing out beside one answering opens the answer and names the other in a single message (real `createAnnouncer` with a clock); six layers ask four and say so; a layer outside `bounds` or without imagery is not asked; a new tap, Escape, a surface change, `ignoreTaps` and a long press each abort the request and open nothing; `setEnabled` off, `turnOff` and a tile URL change clear and abort; settlement drops an old selection into a replaced entry; a tap on a feed feature sends nothing; a choices list with a selectable and an identified row (once plan 0007's step 6 exists).
4. **Hosts, section text, status line.** Tests: tap and `I` in `useMapApp`; measure, draw and directions ask nothing; the section lines and key help; the status line after 400 ms and its collision case. Playwright, with an identify tile layer in `e2e/support/kindLayers.ts` answered by `page.route`: tap to card, choices and nothing, a slow answer, a failure, Escape during a wait and the `I` key. axe in both themes at three widths, and screenshots over Bright, Satellite and Dark, including a rotated map and a globe.
5. **Guide.** Docs only.

## Documents to update

- `ARCHITECTURE.md`: the `LayerSource` and "Selection" bullets in "Data layers" (step 3), the "Hits and bounds" line, which says only feed layers are tappable (step 4).
- `DESIGN.md`: the `LayersSection` row, the status line and bottom-centre slot, the "Map region" key list (the `I` line) and the gesture equivalents (step 4).
- `docs/guides/extending.md` (step 5): "Identify features on a raster layer" with the placeholders, the encoded `{bbox}`, formats, ids, the edges of the world, the cap of 4, CSP and CORS. `docs/guides/serving-layers.md` says a tile "has no cards or list" and its table says "No, a tile is a picture": reword both in step 5 to say an identify endpoint gives a tap its card. `docs/guides/using-the-reference-site.md` (line 19, the `I` key) in step 4, if a reference-site layer ever uses identify; otherwise unchanged.
- The `LayerLoadRequest` JSDoc ("Tile layers have nothing to load"), the `core` and `map` READMEs and `ROADMAP.md`, with the first step that changes what they offer.
- `PRIVACY.md`: none here. A layer given `identify` sends the tapped place to its provider and needs a `PRIVACY.md` change with it (open question 1).

## Risks

- **A slow or hostile endpoint.** Contained by the 8 s timeout, the caps of 4 layers and 20 features, https, a fixed origin, a path that never stores and the content security policy.
- **A stale card.** Each tap aborts the last and replaces results at settlement, so a result shows only for the tap that made it.

## Decided and open

Decided in this plan: the nested `identify` block; the box around the tap, unclamped at the edges of the world; nothing found is `[]` and leaves an open card; a fetch path that never stores; the origin fixed in the template with no separate `origins` list, because the URL comes from the definition and not from data as a detail URL does; one batch, one transition, one message; cancel on a new tap, Escape or leaving the plain map; a required port method; no `unauthorised` kind here; no raster request in select mode; identified features outside plan 0007's selected set, because their ids are not stable. A later step could admit a layer whose `fields.id` is a real attribute through that plan's snapshot route; it is not designed here.

Open, each with a recommendation:

1. **Does the reference site turn `identify` on for an existing layer?** It sends a person's tapped place to a provider and needs a provider decision and a `PRIVACY.md` change. Recommend no for now: ship the SDK, the guide and the e2e layer, then decide per layer.
2. **Should a tap on a drawn feature also ask raster layers and merge the answers?** The card would wait for the network, focus could move when a second answer arrives, and select mode needs a rule. Recommend no.
3. **The default tolerance.** A feed tap reaches 16 pixels (`TAP_TOLERANCE_PX` in `MapLibreMapAdapter`), so 6 would be fingertip-hostile on touch. Recommend 12, a 25 pixel box a little under a fingertip, with each definition free to set its own up to 20.
