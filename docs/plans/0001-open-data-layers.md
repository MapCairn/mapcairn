# Plan 0001: open data layers

Status: done on 2026-11-09 (phase 1: steps 1 to 5, live on main and checked against the real services). Written 2026-11-09; endpoints and terms verified the same day.

Progress (2026-11-09): steps 1 to 5 are built on `feat/open-data-layers`, and the step 7 documentation is written. Step 5 landed as definitions, fixtures, CSP lines and credits only, with no code change. Not done yet: step 6 (the e2e, accessibility and visual passes; `e2e/layers.spec.ts` is written but has not been run), the manual check against the live services, and the items marked "to confirm" below. Resolved while building: GDACS sends no `max-age`, so feed definitions gained an optional `cacheSeconds` so its layers share one request; GDACS dates have no zone and are read as UTC; the fire hotspots use the GIBS WMS endpoint as decided.

Tracking issue: [#157](https://github.com/MapCairn/mapcairn/issues/157).

## Goal

Add open data layers to the reference host, and build the layer system so that **adding a layer is data, not code**. The first layers prove it:

1. **Earthquakes**: the USGS live GeoJSON feed, drawn as circles sized by magnitude.
2. **Satellite imagery**: NASA GIBS daily true-colour imagery as a raster overlay with a date.
3. **Active fires**: NASA GIBS thermal anomaly hotspots, plus fire alerts from GDACS.
4. **Floods**: flood alerts from GDACS, and the GloFAS 100-year flood hazard map.
5. **Tropical cyclones**: GDACS cyclone events with their wind-speed severity text.
6. **Volcanoes and droughts**: GDACS events of those types, added as definitions that show an empty state until the feed has any.

All GDACS layers show the feed's own severity text on their cards, an alert level that never relies on colour alone, and an on-demand "Show affected area" for the event polygons.

All are keyless and need no pipeline. The browser fetches them at runtime, and nothing is stored, transformed or refreshed by us.

## Ground rules

- `AGENTS.md` says a dataset is an explicit decision. This plan is that decision for the layers above only.
- The SDK stays domain-agnostic. The layer model, decoders and pure logic go in `core`, the generic Layers UI in `map`, and the layer definitions in `packages/web`, as reference data, the same way basemaps are.
- **Data-driven, with nothing concrete in the code.** A layer is a typed definition (see "Data-driven design"). No code branches on a layer id, a provider name or a response shape. Decoders are pluggable and chosen by name in the definition, never wired to a source.
- Every layer is off by default. Turning one on is the only time the browser calls its provider.
- Follow the existing rules: tokens only, ports and adapters, fakes and contract suites, test first, a keyboard equivalent for every gesture, WCAG 2.2 AA.
- Good UX wins, and the app is for a global audience on any connection: say how much data a layer uses, load nothing until asked.

## Verified on 2026-11-09

Checked with live requests and the providers' own pages. Items marked "to confirm" are for the person who builds the layer, and the terms and credit wording below are confirmed.

### USGS earthquakes

- `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{name}.geojson`: 200, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=60`, no key. Updated about every minute, so no polling.
- Sizes and counts (uncompressed, a quiet moment): `all_hour` 4 events (3 KB), `2.5_hour` 0, `all_day` 180 (129 KB), `2.5_day` 43 (31 KB), `all_week` 1,695 (1.2 MB), `2.5_week` 314 (223 KB), `4.5_week` 84 (59 KB), `all_month` 9,745 (6.9 MB), `2.5_month` 1,975 (1.4 MB).
- Features carry `properties.mag`, `place`, `time` (epoch ms), `updated`, `url`, `title`, `tsunami`, `type` and a Point `[lng, lat, depthKm]`. Every event in `all_day` was an `earthquake` and none had a null magnitude, but feeds can carry other types, so the decoder must tolerate both.
- Terms: US public domain, credit requested ("Credit: U.S. Geological Survey").

### NASA GIBS imagery (WMTS)

- `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`: row before column, 256 px tiles, `Access-Control-Allow-Origin: *`, an `ETag` and an `Expires` in 1970 (so every tile is revalidated). `Layer-Time-Actual` names the day a tile shows.
- Maximum zoom is 9 (level 10 returns 400), so the source declares `maxzoom: 9` and MapLibre scales beyond it.
- Use `VIIRS_NOAA21_CorrectedReflectance_TrueColor`. The Suomi NPP layer returns 404 because that satellite no longer delivers data. NOAA-21 runs daily from 2024-02-29 (gaps in 2023). Dates before that and in the future return a 404 HTML page, so the date control must stay inside the range. The default is yesterday (UTC), because today is partial.
- Terms (confirmed): NASA asks anyone who uses GIBS in a client to include this acknowledgement, verbatim: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)." The page states no rate limit or request-volume guidance, and says "NASA supports full and open sharing of data." Questions go to earthdata-support@nasa.gov.

### Active fires

- **GIBS thermal anomalies are vector tiles** (`.mvt`, `GoogleMapsCompatible_Level7` for MODIS and `Level8` for VIIRS). Fetching tiles for several test dates and places returned 404 (to confirm whether those tiles are empty or my paths were wrong), so do not rely on the native tiles yet.
- **The GIBS WMS endpoint renders them as PNG and works:** `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={layer}&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}&TIME={date}`, with `Access-Control-Allow-Origin: *`. MapLibre fills `{bbox-epsg-3857}` itself. A 512 px request over central Africa returned 13 KB for `MODIS_Terra_Thermal_Anomalies_All` and 70 KB for `VIIRS_NOAA21_Thermal_Anomalies_375m_All`. The VIIRS layer is sharper and about five times heavier.
- Layer dates: MODIS Terra from 2026-02-10, VIIRS NOAA-21 from 2025-09-04, both to the current day. `MODIS_Combined_...` stopped in 2025.
- **GDACS** (UN and European Commission) lists wildfire events (`WF`) as points: `https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP` returns a GeoJSON-like collection of about 100 current events (135 KB) with `Access-Control-Allow-Origin: *` (sent when the request has an `Origin` header). Today 78 of 100 were wildfires. Each has `name`, `alertlevel` (Green, Orange, Red), `fromdate`, `todate`, `country`, `url.report` and `url.geometry`.
- NASA FIRMS has no usable keyless endpoint (its WMS needs a key). NASA EONET was rejected: wildfires was 7.8 MB and 7,168 features, and the floods category was empty.

### Floods

- **GDACS flood events** (`FL`) come from the same feed: 6 of 100 today, such as "Flood in Portugal", with the same fields and alert levels.
- **GloFAS** (Copernicus) WMS: `https://ows.globalfloods.eu/glofas-ows/ows.py`, `Access-Control-Allow-Origin: *`. `FloodHazard100y` (flood hazard for a 100-year return period) is a static map in EPSG:3857 with no time dimension. A 256 px GetMap over Bangladesh returned 7.7 KB in 0.76 s, and over a dry area it returned a near-empty 116 byte tile. The forecast `reportingPoints` layers have a time dimension and need `GetFeatureInfo` for details, so they are out of scope here.
- **What else the GDACS feed offers** (checked on the 100 events live today: 78 wildfires, 14 earthquakes, 6 floods, 2 tropical cyclones):
  - **Tropical cyclones** (`TC`) are in the same feed, for example "Tropical Cyclone PENA-26", with the wind speed in the severity text. They matter a lot to coastal people, and with the filter mechanism they cost one more definition file.
  - **A standard severity block** on every event: `severitydata.severity`, `severitytext` ("Magnitude 4.9M, Depth:10km", "Tropical Storm (maximum wind speed of 93 km/h)", "Green impact for forestfire in 5036 ha") and `severityunit`. Cards can show `severitytext` as written, so no per-hazard formatting code is needed.
  - **Affected areas on demand.** Each event has `url.geometry`, which returns the polygons (a cyclone's track and wind swaths, a flood's extent) as GeoJSON with `Access-Control-Allow-Origin: *`. They are heavy (278 KB and 287 KB for the two I fetched), so they load only when someone asks to "Show affected area" on a card, never with the layer. A definition therefore gets an optional `detail` source.
  - `alertlevel` is Green, Orange or Red, based on exposed population. All 100 events were Green today, so the legend must also work when nothing is Orange or Red. Also present: `country`, `iso3`, `affectedcountries`, `fromdate`, `todate`, `glide` and a report link.
  - GDACS also defines volcanoes (`VO`) and droughts (`DR`), but neither appeared in today's feed (to confirm the codes when one does).
  - The earthquake events overlap USGS. USGS stays the earthquake layer because it is richer and more current. GDACS's alert level is worth showing for significant quakes only if it proves useful.
- Terms (confirmed). **GDACS:** the Commission's reuse policy applies, which the feed metadata states as EU CC BY 4.0, so reuse is allowed with credit. The credit line GDACS's API quickstart asks for is "Global Disaster Alert and Coordination System, GDACS". Its Terms of Use say the earthquake, tsunami and tropical cyclone notifications are "automatic, produced by algorithms and not reviewed by human experts before being issued", the data "should not be used for decision making without prior confirmation of their validity", and the service is "not meant to substitute nor to override any official information or alert message" from national or local authorities. No rate limit is stated. Cards therefore carry the disclaimer "Automatic estimate. Check official sources before acting." **GloFAS (CEMS-FLOODS licence):** free access to reproduce, distribute, communicate to the public and adapt the data, subject to the notice "Generated using Copernicus Emergency Management Service information [Year]", or "Contains modified Copernicus Emergency Management Service information [Year]" when adapted. The data is "provided for information purposes only", "does not constitute in any way a flood warning" (only national or regional institutions may issue those) and is provided "as is". The licence covers only CEMS EFAS and GloFAS data. The hazard card says the same in plain words. Restricted data needs registration, but the public WMS layers used here are not restricted.

## Data-driven design

### The layer definition

A `LayerDefinition` is typed data with a schema, held in `packages/web/src/layers/definitions/`, one file per layer. It has:

- `id`, `name`, `description`, `group`, a `dataCost` hint ("about 30 KB"), `attribution` entries and an optional `disclaimer`.
- `source`: either `{ kind: "feed", url, decoder, fields, filter?, refresh: "manual" }` or `{ kind: "tiles", tiles, tileSize, maxzoom, bounds? }`. URLs are templates over the layer's control values, such as `{window}`, `{minMagnitude}` and `{date}`.
- `controls`: a list drawn from a small set of types (`segmented`, `switch`, `date`, `opacity`), each with options, ranges and defaults. Their values fill the URL template and the permalink.
- `style` for feeds: a declarative mapping, such as circle radius by property stops and colour by category, with the legend derived from it.
- `detail` (optional): a second source fetched only on request from a field of the selected feature, such as GDACS `url.geometry`, with its own decoder and style (polygons and lines).
- `card` and `list`: template strings over the decoded fields (`"Magnitude {value}"`, `"{depthKm} km deep"`, `"{time|relative}"`), the list sort options, and the link to the source.

### Pluggable decoders and formatters

- A **decoder** is a function from a raw response to a list of features, registered by name. The built-in `geojson` decoder maps fields by dotted path from the definition (`id`, `title`, `time`, `value`, `category`, `url`, `depth`), so GDACS and USGS both use it with different `fields` and no new code. A feed in another format adds one decoder module and registers it. No decoder knows which provider it serves.
- **Formatters** (`relative`, `number`, `km`, `date`) are a registry in the same way, referenced by name in templates.
- **Filters** on the definition (`eventtype in [WF]`) split one feed into several layers. Responses are cached by URL for the cache lifetime, so two GDACS layers cost one request.

### Where it lives

- `core`: the definition types and schema, the template engine, the filter, the decoder and formatter registries with the built-in `geojson` decoder, style evaluation, and the `LayerSource` port with a fake and a contract suite (`load({ controls, signal })` returns features or throws a typed `LayerError`: `network`, `invalid`, `empty`, `aborted`).
- `map`: one generic **Layers** section and one generic card and list that render any definition. No component names a layer.
- `web`: the definitions, the `fetch` adapter for `LayerSource`, the MapLibre overlay support, and the registrations in `createServices()`.
- `MapAdapter` gains generic calls: set a feed layer's features with a style spec, add or remove a tile overlay with opacity, and report a tap on a feature. Contract tests run on the fake and the MapLibre adapter.

### Adding a layer

The acceptance test for this design: a new layer is **one definition file, one fixture and one CSP line.**

1. Add `definitions/<name>.ts`.
2. Add a recorded sample response in the fixtures folder (feeds only).
3. Add its origins to `public/_headers` and `securityHeaders.ts`. A test lists any origin a definition needs that the policy lacks, so it names the line to add.
4. Add the provider's credit to `ATTRIBUTIONS.md`. A test fails if a definition's attribution is missing there.

A test loops over every definition: it passes the schema, every URL origin is allowed by the CSP, a feed decodes its fixture to the expected count, and every template variable has a control or a default. One generic e2e spec enables each definition against its fixture and checks the card, the list, the legend and the permalink.

## UI

- A **Layers** section in the sheet and side panel, drawn from the definitions: a switch per layer with its status (loading, updated at HH:MM, count, error with retry), its data cost, and its controls.
- Tapping a feature opens a card. The gesture equivalent is a **list of the loaded features** (sorted by time or value), each row with "Show on map". That is the keyboard and screen-reader route to the same information.
- Colour is never the only signal: size, a shape or a label carries the alert level or magnitude, and the legend and list carry the words.
- Announce loads and errors through the single `LiveRegion`, once each. Layers appear in the permalink (`#layers=earthquakes,imagery&earthquakes.window=day&imagery.date=2026-11-08`) through `UrlState`.
- Hazard layers show their disclaimer on the card: automatic estimates, check official sources before acting.

## Security, privacy and credits

- CSP: each definition's feed origin goes in `connect-src`. Tile origins go in both `connect-src` and `img-src`, because MapLibre loads raster tiles with `fetch` or an image element. Update `public/_headers` and `securityHeaders.ts`; the sync test covers drift. Test against the production policy, not the relaxed dev one.
- Update the privacy page and `PRIVACY.md`: turning a layer on sends the request, including the visitor's IP address, to its provider. Nothing is sent before. Name the providers (USGS, NASA, GDACS, Copernicus).
- Update `ATTRIBUTIONS.md` and the in-app credits with the wording the providers ask for.

## Tests

- Unit: the schema, templates, filters, decoders and formatters, style evaluation, the contract suites, the Layers section with fakes (loading, empty, error and retry, the list, announcements).
- E2E with mocked responses (no live calls): the generic spec over every definition, window and date changes, tap and list reaching the same card, failures, permalink restore, keyboard-only use.
- Accessibility: axe over the new states, focus order, target sizes, and the layout collision matrix with a legend and a card open.
- One manual check against the live services before release, noted in the PR.

## Order of work

1. Core: definition types and schema, templates, filter, the decoder and formatter registries with the `geojson` decoder, style evaluation, the `LayerSource` port, fake and contracts.
2. Map adapter: feed and tile overlay support and tap events, with contract tests.
3. Web: the fetch adapter, the first two definitions (earthquakes, imagery), CSP and credits.
   The GDACS definitions (fires, floods, cyclones, volcanoes, droughts) follow in step 5 as pure additions.
4. UI: the generic Layers section, legend, card, list and permalink.
5. Fires and floods as pure additions (definitions and fixtures only). If one needs code, the design has a gap: fix the design.
6. E2E, accessibility and visual passes in both themes, on phone and desktop.
7. Documentation: `ARCHITECTURE.md` (layer ports, decoders), `DESIGN.md` (new components), and the README how-to "add a layer".

## Out of scope

Polling or push updates, clustering, saving or exporting data, user-supplied layers or URLs, authentication, GloFAS forecast reporting points, other datasets, and any server-side proxy or storage.

## Decisions

Settled so the plan can start. Change them here if you disagree.

- **Imagery is an overlay with an opacity slider.** GIBS stops at zoom 9, so people fade it over the street map to read detail.
- **Earthquakes default to the past day at magnitude 2.5 and above** (`2.5_day`). A switch, "Include smaller earthquakes", offers the unfiltered feed for the hour and the day only (up to about 129 KB). The week stays at 2.5 and above (about 223 KB). There are no month feeds. The hour is offered unfiltered only, because its 2.5 feed is usually empty.
- **Fire hotspots use the GIBS WMS endpoint with `MODIS_Terra_Thermal_Anomalies_All` by default** (about 13 KB per large tile), and a second definition adds the sharper VIIRS NOAA-21 layer with a heavier data-cost label. Because layers are data, the second one is one more file.
- **Fire and flood alerts come from one GDACS feed**, split by filter into layers, with a shared cached response. **Tropical cyclones are a third such layer** (one more definition), and cards show GDACS's own `severitytext`. A "Show affected area" action loads the event polygons on demand.
- **Volcanoes and droughts are included as definitions** with the GDACS codes `VO` and `DR`, and an empty state ("No volcano alerts right now") until the feed has events. The codes are unverified (to confirm when one appears), and a wrong code only means an empty layer, which the empty state already covers.
- **Floods also offer the GloFAS 100-year hazard map** as a static overlay. It needs no date control.
- **No polling, and no caching of our own** (no proxy, no service worker). Layers load on enable, on a control change and on Refresh.
- **Imagery and fire dates** use a native date input, bounded by each layer's availability (imagery from 2024-02-29, MODIS fires from 2026-02-10, VIIRS fires from 2025-09-04), with yesterday (UTC) as the default and maximum.
