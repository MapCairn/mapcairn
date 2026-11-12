# 0006: Optional Google adapters package

Status: proposed. Tracking issue: [#40](https://github.com/MapCairn/mapcairn/issues/40).

## Goal

A host that already runs on Google Maps Platform can add one optional package, `@mapcairn/google`, and get search, routing and (later) tiles from Google through the ports MapCairn already has, using its own key. The reference site, the four SDK packages and any host that does not install the package send nothing to Google. Google's terms appear to restrict showing its content beside a map that is not Google's, so this plan records what they say, offers only what they appear to allow, and lists the readings the maintainer must settle before any code.

## Ground rules

- Nothing from Google goes into `core`, `map`, `react`, `theme` or `web`. The package depends on `@mapcairn/core` alone, and only a host or the example app imports it.
- AGPL-3.0 with its own `LICENSE`. No runtime dependency: plain `fetch`.
- The key is the host's configuration, never committed. Constructors do no I/O, and nothing is requested until the person uses the feature.
- Findings are what the terms appear to say, with links. They are not legal conclusions.
- No code until this plan merges and open questions 1 to 3 are answered. The tile step also waits for #43 (the MapLibre package).

### What the terms appear to say

Read on 2026-11-12, with each page's own date. The adapter cannot see the host's billing address or basemaps, so both regimes are recorded.

| Topic | Standard terms (billing address outside the EEA) | EEA terms |
| --- | --- | --- |
| Places and Geocoding beside a map | [Terms of Service](https://cloud.google.com/maps-platform/terms) (26 Aug 2026) 3.2.3(e): no "display or use Places content on a non-Google Map". [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) (28 Oct 2026) 14.2 and 6.2 say the same for Places and Geocoding; 14.1 and 6.1 allow use without a Google Map. "Google Map" is not defined on the pages read. | [EEA Service Specific Terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms) (28 Oct 2026) 15.1 and 6.1: apart from latitude, longitude and place ID, no use "With any Map", meaning on, next to or visually associated with any map, Google's included. [Places permitted uses](https://cloud.google.com/terms/maps-platform/eea-places-api-permitted-uses) (4 Jun 2025) lists address lookup and autocompletion among nine uses; a general place search is not named. |
| Routes | Service Specific Terms 19.2: not with a non-Google map. | EEA 20.1: not the description or steps With any Map. `RouteResult` holds geometry, distance and duration only. |
| Map Tiles | A listed service, so 3.2.3(e) applies. The [tiles policy](https://developers.google.com/maps/documentation/tile/policies) mentions third-party renderers and overlaying non-Google data on Google's basemap, so MapLibre drawing Google tiles seems contemplated, but it does not say whether that is "a Google Map". | EEA 9.1 restricts only Street View tiles With any Map. |
| Attribution | [Places policy](https://developers.google.com/maps/documentation/places/web-service/policies): the Google Maps logo where possible, else the text "Google Maps", unaltered, untranslated, unwrapped, in white, `#1F1F1F` or `#5E5E5E`, always visible. Tiles return a `copyright` string that changes with the view. | The same pages. The EEA terms add that the host must make clear what is Google content. |
| Caching | ToS 3.2.3(a) and (b): none except as the Service Specific Terms allow. Place IDs may be kept, latitude and longitude for 30 days. | Same shape (EEA 15.4, 20.2, 6.2). |
| Sessions | [Session tokens](https://developers.google.com/maps/documentation/places/web-service/place-session-tokens): a UUID per session, from Autocomplete (New) to Place Details (New); a reused or missing token bills each request alone. | The same. |
| Keys | [Security guidance](https://developers.google.com/maps/api-security-best-practices) (9 Nov 2026): an application restriction plus API restrictions; "Websites" for direct REST calls from a page; browsers may cut the referrer to the origin; prefer client SDKs, else a proxy; a separate key for client-side web calls. | The same. |
| Preview | The Isochrones API is Preview and not in the [services list](https://cloud.google.com/maps-platform/terms/maps-services), so pre-GA terms apply. | EEA 6.5(b): no pre-GA offering near a non-Google map. |

Unverified, so questions and not assumptions: whether Geocoding and tile endpoints answer a browser's cross-origin request; any rate limits (none published on the pages read); how long an abandoned autocomplete session lasts; the redistribution terms of Google's logo files; and whether "always visible" allows a collapsed control.

## Design

### What is offered

| Adapter | Offered | Not offered |
| --- | --- | --- |
| `GoogleSearchProvider` | `search` over Places Text Search (New), field mask `places.id,places.displayName,places.formattedAddress,places.location,places.viewport`; `reverse` over Geocoding | Photos, reviews, summaries, ratings |
| `GoogleRoutingProvider` | `route` over Routes `computeRoutes` (drive, walk, cycle), mask of polyline, distance and duration, so no description or steps | `reachableArea` rejects `unsupported`: Routes has none and the Isochrones API is Preview |
| `GoogleSuggestionProvider` | Autocomplete (New) with sessions, in step 6 | Version one |
| Tile basemap | In step 5 | Street View tiles |

The adapters do not reorder, filter or merge results, since the terms appear to forbid modifying search results (ToS 3.2.3(g)).

**Port gaps.**

- **Suggestions have no centre.** Autocomplete predictions carry a place ID and text, not a position, and the session ends only at Place Details. `SuggestionProvider` requires a centre on every suggestion and has no call for a pick. Fetching details for five predictions per keystroke would end each session and bill each time, so it is rejected. Core would need an optional `resolve(suggestion)`, a public API change (question 4).
- **A tile basemap is not static data.** A `BasemapDefinition` has a fixed URL template and attribution. Google tiles need a session token requested at runtime and an attribution that follows the view. Step 5 needs a core change (a source resolved when first used) and a credit that follows the view.
- **The credits popover is not enough.** `Attribution` collapses after five seconds and shows text and a link, while Google's pages ask for attribution that is always visible, in set colours that are not tokens. Results shown without a map need the mark in their own container. Step 4 adds a generic, provider-neutral persistent credit to `map` (question 5).

### The package

`packages/google`, `@mapcairn/google`, `private` like the others until publication (#1). One entry point exports the three providers, `createGoogleProviders({ apiKey, ... })`, a tile helper and `GOOGLE_CREDIT` (the text `Google Maps`, to be marked `translate="no"`). It ships no Google logo file.

- Every adapter takes `fetch`, `isOnline`, `languageCode` and an `endpoint`, so a host can put a proxy in front, which Google's guidance prefers where no client SDK exists.
- Lint: dependency-cruiser rules that `packages/google/src` imports only core and itself, and that no other package imports it; `manifests.test.ts` extended. The guide and README say it is not one of the four SDK packages, because using it needs the host's own agreement with Google.
- `RequestSpacer`, `defaultFetch` and the polyline decoder live in `packages/web`, which a package may not import, and core may not read the clock. Step 1 copies them (about 100 lines); consolidating can follow with #43.

### Credentials and #45

Places and Routes take the key in an `X-Goog-Api-Key` header. Geocoding and the tile requests take `key=` in the query, which collides with #45's rule that no credential appears in a URL or client error report. The adapters never put a URL in an error message (question 6). A rejected key (401 or 403) becomes `SearchError("failed")` or `RoutingError("network")` with a message naming the referrer and API restrictions. It does not use #45's `unauthorised`, which tells the person to sign in again, and #45's credentials option is a host's own session, not Google's key. A host behind a login can wrap `fetch`. Requests send the origin as referrer, since a referrer-restricted key fails without one, and no cookies.

### Pacing and sessions

The pages read give no spacing rule, so the plan invents none. The adapter relies on the ui's debounce and single request in flight, and takes an optional `minIntervalMs` to cap a host's bill. HTTP 429 becomes `rate-limited`. A session token is a UUID made on the first suggestion, kept until a pick or a pause, then dropped; the pause is a named constant to confirm.

### Privacy and policy

For a host that turns it on, the browser sends Google the key, the IP address, user agent and origin, plus the query and any bias box (search), the pin position (reverse), the stops and mode (routes), and every tile request, which shows the viewed area. Google may keep search terms, IP addresses and coordinates (ToS 4.4(a)). The host owns the notice, as with the Directions panel's `note`: the guide gives text for `privacyNote`, `lookupNote` and `note`, and the wording ToS 3.2.2(a) asks for in the host's own terms. The reference site's `PRIVACY.md` and page do not change. A host's `connect-src` needs `https://places.googleapis.com`, `https://maps.googleapis.com`, `https://routes.googleapis.com` and `https://tile.googleapis.com` (the tile path is confirmed in step 5); the reference site's policy stays as it is.

## Tests

- Each adapter runs the shared contract suite from `@mapcairn/core/contracts` over a scripted `fetch`, with tests of the typed errors, the key header, the field masks (Routes never asks for description or steps) and cancellation.
- Fixtures are hand-written in the documented response shape with invented places. Real responses are never recorded, unlike the layer fixtures, because committing Google's output to a public repository could look like the storing and resharing ToS 3.2.3(a) and (b) restrict.
- A script after the web build, beside `verifyNoTestSeam.mjs`, fails if the output holds `googleapis.com`, and the lint and manifest tests fail if `web` depends on or imports the package.
- The example app's test mounts it on a scripted `fetch` and checks no real request is made.

## Order of work

0. Maintainer decisions on questions 1 to 3. No code.
1. Scaffold: manifest, licence, README, copied helpers, options types, lint rules, manifest test, bundle check, and a new `docs/guides/google-adapters.md` with keys, CSP and privacy text.
2. `GoogleSearchProvider` with its contract suite, and the example app wired to it with a scripted `fetch` and a placeholder key.
3. `GoogleRoutingProvider` with its contract suite, and the example's Directions button.
4. `map`: a persistent, provider-neutral credit line with an accessible name, tests, an a11y check and `DESIGN.md`. No Google name in `map`.
5. Tiles: core's lazily resolved basemap source, then the package's tile helper, session token and viewport credit. After #43.
6. Autocomplete: core `resolve` if approved, then `GoogleSuggestionProvider` with sessions.

Each step is one pull request, build green, tests first.

## Documents to update

`README.md`, a package README and `docs/guides/extending.md` (step 1); `docs/guides/google-adapters.md` (step 1, extended after); `ARCHITECTURE.md` "Ports" and "Adding an adapter" for a package outside `web` (step 1), and for the lazy basemap and `resolve` (steps 5 and 6); `DESIGN.md` for the credit (step 4); `AGENTS.md` where it describes the SDK packages (step 1, the maintainer's call); `ROADMAP.md`. `ATTRIBUTIONS.md` and `PRIVACY.md` do not change.

## Risks

- A host reads the package as clearance. The guide opens with the two regimes and says the readings are unverified and the host's own.
- Google changes its terms. Findings carry source and date, and the guide tells hosts to re-read them.
- A browser key is visible to anyone, so only restriction and a proxy protect it. The guide says so first.
- A host pairs these adapters with an OpenStreetMap basemap (question 3).

## Decided and open

Decided on 2026-11-12: this is a plan only; the code goes in a separate optional package, never in `core`, `map`, `react` or `theme`; the plan reads Google's current terms first and offers only what they allow.

Decided in this plan: every adapter takes `endpoint` for a proxy; `reachableArea` is `unsupported`; no recorded fixtures; no Google logo file shipped; a rejected key is not `unauthorised`.

Open, each with a recommendation:

1. **Does MapLibre drawing Google tiles count as "a Google Map" under the standard terms, and does a result list count as "next to" a map under the EEA terms?** The pages do not say. Ask Google in writing or take advice before step 2. If the answer is no, close #40 and say in the guide that the adapters are not offered. Building first risks the whole package.
2. **Is a general place search a permitted use under the EEA list?** Treat Places as unavailable to EEA hosts unless Google confirms.
3. **Hand out search and routing only with a Google-only basemap catalogue?** It costs a second factory and fits a mixed host less well, but stops an accidental pairing with an OpenStreetMap basemap. Yes: `createGoogleProviders` returns the catalogue to use.
4. **Add an optional `resolve` to `SuggestionProvider`?** Not yet. Ship submit-only search and revisit when a host asks.
5. **May the design system carry Google's text colours and a non-collapsing credit?** One exempt surface in `DESIGN.md`, supplied by the host, not a token.
6. **Should `reverse`, which needs `key=` in a URL, wait for a proxy?** Offer it only through a proxy `endpoint` until #45 settles URL credentials.
7. **Is a package whose use needs the host's own Google agreement acceptable beside the SDK packages?** `AGENTS.md` reserves this to the maintainer. Yes, kept out of "SDK packages" by name.
8. **Any runtime dependency?** None assumed. A polyline decoder is the only likely one; keep the copied decoder.
