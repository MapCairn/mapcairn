# 0006: Optional Google adapters package

Status: proposed. Tracking issue: [#40](https://github.com/MapCairn/mapcairn/issues/40).

## Goal

A host that already runs on Google Maps Platform can add one optional package, `@mapcairn/google`, and get search, routing and tiles from Google through the ports MapCairn already has, using its own key. The reference site, the four SDK packages and any host that does not install the package send nothing to Google. Google's terms appear to restrict showing its content with a map that is not Google's, so this plan records what they say, offers only what they appear to allow, and lists the readings the maintainer must settle before any code.

## Ground rules

- Nothing from Google goes into `core`, `map`, `react`, `theme` or `web`. The package depends on `@mapcairn/core` alone, and only a host or the example app imports it.
- AGPL-3.0 with its own `LICENSE`. No runtime dependency: plain `fetch`.
- The key is the host's configuration, never committed. Constructors do no I/O, and nothing is requested until the person uses the feature.
- Findings are what the terms appear to say, with links. They are not legal conclusions.
- No code until this plan merges and the questions that gate a step are answered. The package stays private and unwired, and nothing is published, enabled or usable, until the Google-only basemap catalogue lands (step 3, after #43, the MapLibre package).

### What the terms appear to say

Read on 2026-11-12, with each page's own date. The adapter cannot see the host's billing address or basemaps, so both regimes are recorded.

| Topic | Standard terms (billing address outside the EEA) | EEA terms |
| --- | --- | --- |
| Places and Geocoding with a map | [Terms of Service](https://cloud.google.com/maps-platform/terms) (26 Aug 2026), "No Use With Non-Google Maps": the Core Services must not be used "with or near a non-Google Map in a Customer Application", for example Places content on one. The [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) (28 Oct 2026) repeat it for Places and Geocoding, and allow use without a Google Map. "Google Map" is not defined on the pages read. | [EEA Service Specific Terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms) (28 Oct 2026): apart from latitude, longitude and place ID, no use "With any Map", meaning on, next to or visually associated with any map, Google's included. [Places permitted uses](https://cloud.google.com/terms/maps-platform/eea-places-api-permitted-uses) (4 Jun 2025) lists address lookup and autocompletion among nine uses; a general place search is not named. |
| Routes | Not with a non-Google map. | Not the description or steps With any Map. `RouteResult` holds geometry, distance and duration only. |
| Map Tiles | A listed service, so the same clause applies. The [tiles policy](https://developers.google.com/maps/documentation/tile/policies) mentions third-party renderers and overlaying non-Google data on Google's basemap, so MapLibre drawing Google tiles seems contemplated, but it does not say whether that is "a Google Map". | Only Street View tiles are restricted With any Map. |
| Places UI Kit | May be used "with or without any map, including a non-Google Map", and that prevails over the non-Google-maps clause. | Lifts the Places limits above for the kit. |
| Attribution | [Places policy](https://developers.google.com/maps/documentation/places/web-service/policies): the Google Maps logo where possible, else the text "Google Maps", unaltered, untranslated, unwrapped, in white, `#1F1F1F` or `#5E5E5E`, always visible and visually distinguished from other content. Tiles return a `copyright` string that changes with the view. | EEA Service Specific Terms: the host "will not misrepresent Google or create confusion as to the source or placement of the content". |
| Caching | None except as the Service Specific Terms allow. Place IDs may be kept, latitude and longitude for 30 days. | The same shape. |
| Sessions | [Session tokens](https://developers.google.com/maps/documentation/places/web-service/place-session-tokens): a UUID per session, from Autocomplete (New) to Place Details (New); a reused or missing token bills each request alone. | The same. |
| Keys | [Security guidance](https://developers.google.com/maps/api-security-best-practices) (9 Nov 2026): an application restriction plus API restrictions, "Websites" for direct REST calls from a page; browsers may cut the referrer to the origin; separate projects for client-side and server-side use, a client-side SDK first and an authenticated proxy otherwise. | The same. |
| Preview | The Isochrones API is labelled [Preview, pre-GA](https://developers.google.com/maps/documentation/isochrones) and is not in the [services list](https://cloud.google.com/maps-platform/terms/maps-services). The standard pre-GA section has no non-Google-map clause. | Only the EEA pre-GA section bars pre-GA offerings "with or near a non-Google Map". |

Unverified, so questions and not assumptions: whether Geocoding and tile endpoints answer a browser's cross-origin request; the rate limits (the pages give no spacing rule, and say a client-side project can carry per-minute, per-user quota limits); the lifetime of an abandoned autocomplete session; the redistribution terms of Google's logo files; and whether "always visible" allows a collapsed control.

## Design

### What is offered

| Adapter | Offered | Not offered |
| --- | --- | --- |
| `GoogleSearchProvider` | `search` over Places Text Search (New), field mask `places.id,places.displayName,places.formattedAddress,places.location,places.viewport`; `reverse` over Geocoding | Photos, reviews, summaries, ratings |
| `GoogleRoutingProvider` | `route` over Routes `computeRoutes` (drive, walk, cycle), mask of polyline, distance and duration, so no description or steps | `reachableArea` rejects `unsupported`: Routes has none and the Isochrones API is Preview |
| `GoogleSuggestionProvider` | Autocomplete (New) with sessions, in step 6 | Version one |
| Tile basemap | In step 3 | Street View tiles |

The Places UI Kit is not offered: it is documented as HTML elements loaded through the Maps JavaScript API, not a port, and if they are custom elements `AGENTS.md` rules out Shadow DOM component libraries. It is the one Places surface the terms free from the map restriction, which weakens the case for building this package (question 1).

The adapters do not reorder, filter or merge results, since the terms appear to forbid modifying search results.

**Port gaps.**

- **Suggestions have no centre.** Autocomplete predictions carry a place ID and text, not a position, and the session ends only at Place Details. `SuggestionProvider` requires a centre and has no call for a pick. Fetching details for five predictions per keystroke would end each session and bill each time, so it is rejected. Core would need an optional `resolve(suggestion)`, a public API change (question 4).
- **A tile basemap is not static data.** A `BasemapDefinition` has a fixed URL template and attribution. Google tiles need a session token requested at runtime and an attribution that follows the view. Step 3 needs a core change (a source resolved when first used) and a credit that follows the view.
- **The credits popover is not enough.** `Attribution` collapses after five seconds and shows text and a link, while Google asks for attribution that is always visible, in set colours that are not tokens. Step 2 adds a generic, provider-neutral persistent credit to `map` (question 5).
- **Errors and capabilities.** The ui builds its text from the error kind alone (`announceSearchError`, `routingErrorMessage`), never `error.message`. A rejected key mapped to `RoutingError("network")` therefore reads "You may be offline", and `reachableArea` rejecting `unsupported` would show "That way of travelling is not available here" on every press, because `DirectionsPanel` offers its area buttons whenever `services.routing` exists. Step 5 adds an optional capability flag on `RoutingProvider` that hides the area control (question 9). The misleading key text is accepted: the message reaches only the host's log, and the guide tells hosts to read it there.

### The package

`packages/google`, `@mapcairn/google`, `private` like the others until publication (#1). One entry point exports the providers, `createGoogleProviders({ apiKey, ... })` (returning the providers and the Google-only catalogue to use), a tile helper and `GOOGLE_CREDIT` (the text `Google Maps`, marked `translate="no"`). It ships no Google logo file.

- Every adapter takes `fetch`, `isOnline`, `languageCode` and an `endpoint`, so a host can put a proxy in front.
- Lint: dependency-cruiser rules that `packages/google/src` imports only core and itself and that no other package imports it, and `manifests.test.ts` extended. The README says it is not one of the four SDK packages, because using it needs the host's own agreement with Google.
- `RequestSpacer`, `defaultFetch` and the polyline decoder live in `packages/web`, which a package may not import, and core may not read the clock. Step 1 copies them: about 207 lines before tests, and a copy cuts against DRY. Question 10 is the follow-up.

### Credentials and #45

Places and Routes take the key in an `X-Goog-Api-Key` header. Geocoding and the tile requests take `key=` in the query, which collides with #45's rule that no credential appears in a URL or client error report, so adapters never put a URL in an error message (question 6). A rejected key (401 or 403) becomes `SearchError("failed")` or `RoutingError("network")`. It does not use #45's `unauthorised`, which tells the person to sign in again, and #45's credentials option is a host's own session, not Google's key. Requests send the origin as referrer, since a referrer-restricted key fails without one, and no cookies.

The adapter relies on the ui's debounce and single request in flight, and maps HTTP 429 to `rate-limited`.

### Privacy and policy

The browser sends Google the key, the IP address, user agent and origin, plus the query and any bias box (search), the pin position (reverse), the stops and mode (routes), and each tile request, which shows the viewed area. The host owns the notice, as with the Directions panel's `note`. A host's `connect-src` needs `https://places.googleapis.com`, `https://maps.googleapis.com`, `https://routes.googleapis.com` and `https://tile.googleapis.com`. The reference site's policy and `PRIVACY.md` stay as they are.

## Tests

- Each adapter runs the shared contract suite from `@mapcairn/core/contracts` over a scripted `fetch`, with tests of the typed errors, the key header, the field masks (Routes never asks for description or steps) and cancellation.
- Fixtures are hand-written in the documented response shape with invented places. Real responses are never recorded, unlike the layer fixtures, because committing Google's output to a public repository could look like the storing and resharing the terms restrict.
- A script after the web build, beside `verifyNoTestSeam.mjs`, fails if the output holds `googleapis.com`, and the lint and manifest tests fail if `web` depends on or imports the package.

## Order of work

0. Maintainer decisions on questions 1, 2, 3 and 7. No code.
1. Scaffold, private and unwired: manifest, licence, README, copied helpers, options types, lint rules, manifest test, bundle check, and `docs/guides/google-adapters.md`, which opens with the two regimes, that the readings are unverified, that a browser key is visible to anyone, and that the terms must be re-read.
2. `map`: a persistent, provider-neutral credit line with an accessible name, tests, an a11y check and `DESIGN.md`. No Google name in `map`.
3. Tiles and the Google-only catalogue, after #43: core's lazily resolved basemap source, then the tile helper, session token, viewport credit and `createGoogleProviders`' catalogue.
4. `GoogleSearchProvider` with its contract suite, and the example app wired to it on a scripted `fetch` and a placeholder key. This step names three changes: `examples-use-public-entry-points` in `.dependency-cruiser.cjs` allows the new package's entry point, `examples/embed` gains a dependency on it, and the `AGENTS.md` "About" sentence that says the example uses the four SDK packages changes to match.
5. `GoogleRoutingProvider` with its contract suite, the capability flag and the `DirectionsPanel` change.
6. Autocomplete: core `resolve` if approved, then `GoogleSuggestionProvider` with sessions.

Each step is one pull request, build green, tests first.

## Documents to update

`ATTRIBUTIONS.md` and `PRIVACY.md` do not change. The other documents change in the step that touches them, and each step's pull request names them.

## Risks

Carried by the opening of the guide (step 1): the two regimes, the unverified readings, a visible browser key and changing terms.

## Decided and open

Decided on 2026-11-12: this is a plan only; the code goes in a separate optional package, never in `core`, `map`, `react` or `theme`; the plan reads Google's current terms first and offers only what they allow.

Decided in this plan: every adapter takes `endpoint` for a proxy; `reachableArea` is `unsupported`; no recorded fixtures; no Google logo file shipped; a rejected key is not `unauthorised`.

Open, each with a recommendation and the step it gates:

1. **Gates step 3 and the rest. Does MapLibre drawing Google tiles count as "a Google Map", and what do "with or near" (standard) and "next to" (EEA) cover?** The pages do not say. Ask Google in writing or take advice before step 3. If the answer is no, close #40, record the outcome in this plan, then fold or delete the plan as `docs/plans/README.md` describes, with a line in `ROADMAP.md`.
2. **Gates step 4. Is a general place search a permitted use under the EEA list?** Treat Places as unavailable to EEA hosts unless Google confirms.
3. **Gates step 3. Hand out search and routing only with a Google-only basemap catalogue?** It costs a second factory and fits a mixed host less well, but stops an accidental pairing with an OpenStreetMap basemap. Yes.
4. **Gates step 6. Add an optional `resolve` to `SuggestionProvider`?** Not yet; revisit when a host asks.
5. **Gates step 2. May the design system carry Google's text colours and a non-collapsing credit?** One exempt surface in `DESIGN.md`, supplied by the host, not a token.
6. **Gates `reverse` in step 4. Should it, which needs `key=` in a URL, wait for a proxy?** Offer it only through a proxy `endpoint` until #45 settles URL credentials.
7. **Gates step 1 and decides whether `packages/google` exists. Is a package whose use needs the host's own Google agreement acceptable beside the SDK packages?** `AGENTS.md` reserves this to the maintainer. Yes, kept out of "SDK packages" by name.
8. **Gates step 1. Any runtime dependency?** None assumed. Keep the copied polyline decoder.
9. **Gates step 5. Add a capability flag to `RoutingProvider`, or accept the misleading area text?** Add the flag: it is a small, optional field and the alternative shows a wrong message on every press.
10. **Follow-up, filed only if the plan is accepted. Consolidate `RequestSpacer`, `defaultFetch` and the polyline decoder in one shared home?** Yes, once a second package such as #43's needs them, so the copy in step 1 is short-lived.
