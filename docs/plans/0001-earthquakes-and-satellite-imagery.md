# Plan 0001: earthquakes and satellite imagery

Status: proposed, not started. Written 2026-11-09; endpoints and terms verified the same day.

## Goal

Add two open data layers to the reference host, so the map has something real to show and the layer model is proven on a vector layer and a raster layer:

1. **Earthquakes**: the USGS live GeoJSON feed, drawn as circles sized by magnitude.
2. **Satellite imagery**: NASA GIBS daily true-colour imagery as a raster overlay with a date.

Both are public-domain, keyless and need no pipeline. The app fetches them in the browser at runtime. Nothing is stored, transformed or refreshed by us.

## Ground rules

- `AGENTS.md` says a dataset is an explicit decision. This plan is that decision for these two layers only.
- The SDK stays domain-agnostic. The layer model and ports go in `core` and `map`. The USGS and GIBS specifics go in `packages/web`, as reference implementations, the same way Nominatim and the basemaps are.
- Both layers are off by default. Turning one on is the only time the browser calls its provider.
- Follow the existing rules: tokens only, ports and adapters, fakes and contract suites, test first, no gesture without a keyboard equivalent, WCAG 2.2 AA.

## Verified on 2026-11-09

Checked with live requests and the providers' own pages. Re-check anything marked "to confirm" when you build.

**USGS earthquake feeds**

- `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{name}.geojson` returns 200 with `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=60`. No key. Names tried: `all_hour`, `all_day`, `2.5_day`; the family also has `all_week`, `2.5_week` and so on (to confirm the full list when building).
- Each feature has `properties.mag`, `place`, `time` (epoch ms), `updated`, `url` (event page), `title`, `tsunami`, `type`, and a Point geometry with `[lng, lat, depthKm]`. `mag` can be null, so the guard must allow it.
- Terms: USGS says its data is in the US public domain and asks for credit, for example "Credit: U.S. Geological Survey". The feed updates about every minute, so a manual refresh is enough and no polling is needed.

**NASA GIBS imagery**

- Use the REST WMTS endpoint: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`. Note the order: row (`y`) before column (`x`). Tiles are 256 px. It answers with `Access-Control-Allow-Origin: *` and `Cache-Control: no-store`.
- **Maximum zoom is 9.** Level 10 returns 400, so the raster source declares `maxzoom: 9` and MapLibre scales the tiles beyond that. Detail is coarse close up, so this is a global and regional overlay.
- **Do not use the Suomi NPP layer.** `VIIRS_SNPP_CorrectedReflectance_TrueColor` returns 404 for recent dates, and NASA says Suomi NPP no longer delivers new data. Use `VIIRS_NOAA21_CorrectedReflectance_TrueColor` (tiles returned 200 for 2026-11-07 and 2026-11-08). `VIIRS_NOAA20_...`, `MODIS_Aqua_...` and `MODIS_Terra_...` also worked; MODIS satellites are old, so NOAA-21 is the safer choice.
- NOAA-21 availability: daily from 2024-02-29 to the current day, with gaps in 2023. The date input uses 2024-02-29 as its minimum, and the default is yesterday in UTC, because the current day is incomplete.
- Terms: NASA asks users to acknowledge GIBS. Its recommended wording starts "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS)", then names the parent programme (ESDIS), and the exact text still needs to be copied from the GIBS documentation. The page states no rate limit (to confirm in the API documentation).

**Still to confirm when building**

- MapLibre fetches raster tiles with `fetch`, so the CSP probably needs both hosts in `connect-src` and `blob:`/`data:` in `img-src`. Test against the production CSP, not the relaxed dev one.
- The exact GIBS acknowledgement text, and any usage guidance on request volume.
- Record both providers in `ATTRIBUTIONS.md`.

## Design

### Core (`packages/core`)

- Extend the `layers` port (today only `LayerRegistry.list`). A `LayerDefinition` is either `geojson-points` (source, id, name, time windows) or `raster-tiles` (tile template, max zoom, attribution, optional date).
- A `LayerSource` port loads a vector layer: `load({ window, signal })` returns typed features or throws a `LayerError` with a kind (`network`, `invalid`, `empty`, `aborted`). A fake and a contract suite come with it.
- Pure logic with tests: magnitude to circle radius and an accessible step scale, depth and age labels, time-window filtering, legend entries, a feature summary sentence (for example "Magnitude 4.6, 12 km deep, 3 hours ago, 40 km SW of Town").

### Map adapter

- Add to `MapAdapter`: draw, update and remove a GeoJSON point layer, add and remove a raster overlay with opacity, and report a tap on a feature. Contract tests run on the MapLibre adapter and on the fake.
- Circles must not rely on colour alone. Size carries magnitude and the legend and list carry the numbers.

### UI (`packages/map`)

- A **Layers** section in the sheet and side panel (the Data section exists and renders only when layers exist; build on it):
  - a switch per layer, with its status (loading, updated at HH:MM, count, error with retry);
  - earthquakes: a time window control (past hour, day, week) and a legend;
  - imagery: an opacity slider and a native date input, defaulting to the latest day.
- Tapping a quake opens a card with the summary. Gesture equivalent: a **list of the loaded quakes** in the Layers section (sorted by time or magnitude), each row with "Show on map". This is the keyboard and screen-reader route to the same information.
- Announce loads and errors through the single `LiveRegion`, once each.
- Layers appear in the permalink (`#layers=quakes,imagery&window=day&date=2026-11-08`) through `UrlState`.

### Web host (`packages/web`)

- `UsgsEarthquakeSource`: fetch with an `AbortSignal`, a narrow runtime guard for the fields we use, ignore unknown fields, typed errors. No polling. It loads when the layer is turned on, on window change and on an explicit Refresh.
- `GibsImagery`: the raster definition and date handling, registered in the composition root.
- `createServices()` registers both. The e2e seam can script them.

### Security, privacy and credits

- CSP: add `earthquake.usgs.gov` to `connect-src` and the GIBS host to `img-src` (and `connect-src` if the tiles are fetched as data). Update `public/_headers` and `securityHeaders.ts`; the sync test covers drift.
- Update the privacy page and `PRIVACY.md`: turning a layer on sends the request, including the visitor's IP address, to USGS or NASA. Nothing is sent before.
- Update `ATTRIBUTIONS.md` and the in-app credits with the wording the providers ask for.

## Tests

- Unit: the pure logic, the source adapter against recorded sample feeds in fixtures, the contract suites, the Layers section with fakes (loading, empty, error and retry states, the list, announcements).
- E2E with mocked responses (no live calls): enable and disable each layer, window and date changes, tap and list routes to the same card, failure states, permalink restore, keyboard-only use.
- Accessibility: axe over the new states, focus order, target sizes, and the layout collision matrix with the legend and a card open.
- A single manual check against the live services before release, noted in the PR.

## Order of work

1. Confirm the items still marked "to confirm" above, and record both providers in `ATTRIBUTIONS.md`.
2. Core: types, the `LayerSource` port, the pure logic, fakes and contracts.
3. Map adapter: vector and raster overlay support, with contract tests.
4. Web: the USGS source and GIBS definition, the CSP and credits.
5. UI: the Layers section, legend, card and list, permalink.
6. E2E, accessibility and visual passes in both themes and on phone and desktop.
7. Documentation: `ARCHITECTURE.md` (layer ports), `DESIGN.md` (new components and tokens), the README how-to for adding a layer.

## Out of scope

Polling or push updates, clustering, saving or exporting data, user-supplied layers, authentication, other datasets, and any server-side proxy or storage.

## Decisions

These were open questions. I have settled them so the plan can start. Change them here if you disagree.

- **Imagery is an overlay with an opacity slider, not a basemap.** GIBS stops at zoom 9, so the user needs to fade it over the street map to read detail.
- **Earthquakes default to the past day at magnitude 2.5 and above** (`2.5_day`), because the unfiltered feed fills the map with tiny events. A switch, "Include smaller earthquakes", loads the `all_*` feed for the same window.
- **Time windows for earthquakes:** past hour, day and week. The hour is only offered unfiltered, because the 2.5 hour feed is usually empty.
- **No polling.** The feed is cached for a minute and the layer loads on enable, on a window change and on Refresh.
- **Imagery date:** native date input, minimum 2024-02-29, maximum yesterday (UTC), default yesterday.
