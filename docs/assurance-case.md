# Assurance case

_Last updated: 2026-11-11_

This document says what a visitor to MapCairn can and cannot expect about security, where the trust boundaries are, what could go wrong at each, and why the project believes its security requirements are met. Each claim points to the file or test that backs it, so a reader can check it. It covers the reference site (`packages/web`) and the SDK packages as the site uses them. It is the project's answer to the OpenSSF Best Practices silver criteria `assurance_case` and `documentation_security`.

It argues from the repository. It does not claim that the code has been audited by anyone outside the project, and a check that is not a test or a lint rule is said to be a setting. To report a problem, see [`SECURITY.md`](../SECURITY.md).

Links to code point at the `main` branch. Test names are quoted so they can be searched for.

## Security requirements

### What a visitor can expect

1. **No account, no stored personal data on a server.** There is no sign-in, no database and no form. The Worker's only inputs from visitors are page requests and the automatic error report. See [`PRIVACY.md`](../PRIVACY.md) and [`wrangler.jsonc`](https://github.com/MapCairn/mapcairn/blob/main/wrangler.jsonc), which declares only the static assets binding.
2. **The map view and settings stay on the device.** Settings are in `localStorage`. The map view is in the address fragment, which browsers do not send to a server. After Locate me the view is the visitor's position, so the error-report path removes it (requirement 4).
3. **Third parties are contacted only for what the visitor asks for.** Basemap tiles load with the map. Search suggestions send the text typed so far, once the visitor pauses, after three characters; a search by Enter, routing and each data layer send a request only when the visitor searches, asks for a route or turns the layer on. The browser calls the provider directly, and the Worker does not relay it. Those providers see the visitor's IP address and the request, as any website does, and have their own policies.
4. **An error report carries no position.** If the app fails in the browser, a short report (message, stack, page origin and path, and a source) is logged. The query and the fragment are dropped before logging.
5. **Pages cannot run unexpected scripts or be framed.** Production pages are served with a Content Security Policy that allows no `unsafe-inline` source, with origin allowlists, and with headers that stop framing, sniffing and downgrades.
6. **Data from a provider is treated as data.** It is validated, and drawn as text or shapes by React and the map engine, never as markup. Links from a provider open only if they are `https`.
7. **Cloud settings the project relies on.** Traffic is HTTPS only, with HSTS. The Cloudflare zone requires TLS 1.2 or later and uses Full (strict) encryption. These are settings in Cloudflare, not in this repository, and were checked from outside on 2026-11-10 (see [#4](https://github.com/MapCairn/mapcairn/issues/4)).

### What a visitor cannot expect

- **Control over the providers.** The project does not run the tile, search, routing or data services. It cannot promise what they log, how long they keep it, that they are available or that their data is correct. A provider that is compromised could serve wrong tiles or data (see the threat model below for what the page does to limit that).
- **Anonymity from the providers.** Requests to them carry the visitor's IP address. The project sends no cookies and no referrer to the layer, search and routing providers, but cannot hide the IP address from them.
- **Privacy of a shared link.** A link made with "Copy link with shapes", or copied from the address bar, contains the map view and may contain drawn shapes. The person who shares it decides who sees it.
- **Privacy from people who use the same device.** Settings in `localStorage` are readable by anyone with access to the browser profile.
- **Protection if the browser is compromised, or from an extension** that has page access.
- **A service level.** The site is run by a volunteer and may be slow or unavailable.
- **Accuracy of what is shown.** A map and its layers are not safety information. Layers carry their provider's disclaimer.
- **Security fixes for old versions.** Only the current `main` is supported (see [`SECURITY.md`](../SECURITY.md)).

SDK consumers who build their own host are responsible for their own headers, Content Security Policy, providers and privacy text. The SDK gives them the ports, validation and tests described here, not the hosting.

## Trust boundaries

| Boundary | Trusted side | Untrusted side | What crosses it |
| --- | --- | --- | --- |
| Browser to Worker | The Worker and its static assets | The visitor's browser and anything that can send HTTP to the site | Page requests, and `POST /log-error` |
| Browser to providers | The page's own code | Tile, style, search, routing and data providers, and any network between | Tile and style fetches, search and route requests, layer feeds and their responses |
| Address fragment | The page's own code | Whoever wrote the link (a link can be hand-made) | The map view, basemap, layers and shapes, read at load |
| Client error report | The Worker's log | The sender of the report, who can be anyone, not only the app | A bounded JSON body |
| Hosting and supply chain | The repository's source and lockfile | The npm packages, GitHub Actions and the Cloudflare account | Dependencies, build and deploy |
| Third-party script | The page | `static.cloudflareinsights.com` | A script that Cloudflare Web Analytics loads (page-view counts) |

The Worker makes no outbound requests. A search of the Worker and route code finds no `fetch` call, so there is no server-side request forgery surface, and the Worker holds no secret.

## Threat model by boundary

### Browser to Worker

The Worker serves server-rendered pages, static assets, `robots.txt`, `sitemap.xml`, `llms.txt`, the error-report route, and a redirect from the previous hostname.

| Threat | Counter | Evidence |
| --- | --- | --- |
| Script injection into a page | A Content Security Policy for production with no `unsafe-inline`. `script-src` holds `'self'`, one SHA-256 hash for the theme script, a per-request nonce for React's streaming scripts, and the analytics origin. `style-src` allows only the site's own files | [`securityHeaders.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/constants/securityHeaders.ts); tests "allows inline styles and the hot-reload socket only in development" and "adds a matching nonce token to script-src when a nonce is given" in [`securityHeaders.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/constants/securityHeaders.test.ts) |
| The hash stops matching the one inline script | A test recomputes the hash from the script and compares it with both header sources | tests "is the only script hash the policy built in securityHeaders.ts allows" and "is the only script hash in public/_headers" in [`themeBootstrap.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/app/themeBootstrap.test.ts) |
| Headers differ between static assets and rendered pages | One constant is the source of both, and a test parses `_headers` and compares | test "matches every header/value pair in _headers' global block" in `securityHeaders.test.ts`; [`workers/app.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/workers/app.ts) applies the constant to rendered responses; [`public/_headers`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/public/_headers) |
| Framing and clickjacking | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, and `frame-src 'none'` | `securityHeaders.ts` |
| Content sniffing, downgrade, permission abuse | `X-Content-Type-Options: nosniff`, HSTS, and a Permissions-Policy that allows geolocation for the site only and blocks camera and microphone | `securityHeaders.ts`; test "lets this origin use geolocation for Locate me and blocks camera and microphone"; test "sets a Strict-Transport-Security header on every response" in [`httpHeaders.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/httpHeaders.test.ts) |
| Test code or the design guide reaching production | A build step scans the production bundle for the test seam and the design guide and fails if it finds them | [`verifyNoTestSeam.mjs`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/scripts/verifyNoTestSeam.mjs); test "fails and names the file when the marker is in the client build" in [`verifyNoTestSeam.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/composition/verifyNoTestSeam.test.ts) |
| Open redirect on the previous hostname | The redirect goes only to the fixed site address, and carries only the path and query | `redirectFromPreviousHostname` in `workers/app.ts` |

### Browser to providers

| Threat | Counter | Evidence |
| --- | --- | --- |
| A page request goes to an origin nobody approved | `connect-src` and `img-src` list every allowed origin. A new origin needs a change to the list, reviewed in a pull request | `securityHeaders.ts` and `_headers`; test "has every origin it requests allowed by the production CSP" in [`layers.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/layers/layers.test.ts) |
| A provider's response carries a link or address that leads somewhere unexpected | A detail URL from a feed is requested only when it is `https` on an origin the layer's definition declares. A provider link on a card is shown only when `https` | test "never requests a detail URL off the declared origins" in [`FetchLayerSource.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/adapters/layers/FetchLayerSource.test.ts); `safeLink` in [`FeatureCard.tsx`](https://github.com/MapCairn/mapcairn/blob/main/packages/map/src/layers/FeatureCard.tsx); test "links to the provider only over https" in [`LayersSection.test.tsx`](https://github.com/MapCairn/mapcairn/blob/main/packages/map/src/layers/LayersSection.test.tsx) |
| A provider response is malformed or hostile | Layer definitions are validated at start-up, geometry is validated, and a response that does not decode becomes a typed error, not a crash | [`validate.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/core/src/layers/validate.ts), [`validate.ts` in geometry](https://github.com/MapCairn/mapcairn/blob/main/packages/core/src/geometry/validate.ts); test "refuses a position that is not two or three finite numbers" in [`validate.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/core/src/geometry/validate.test.ts); test "drops items that are unusable and bounds that are malformed" in [`NominatimSearchProvider.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/adapters/search/NominatimSearchProvider.test.ts); test "rejects a 200 whose body is not JSON as invalid" in [`ValhallaRoutingProvider.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/adapters/routing/ValhallaRoutingProvider.test.ts) |
| A raster layer's service answers a tap with a very large body | `FetchLayerSource` reads an identify answer at most `MAX_IDENTIFY_RESPONSE_BYTES` (1 MiB), checking `Content-Length` first and counting bytes while it reads, and refuses a larger answer as `invalid`. It requests only `https`, sends no cookies or referrer, never stores an answer, and the request can be cancelled. `useDataLayers.identifyAt` asks it only for a tap, at most four layers at a time with eight seconds each, and no layer of the reference site has an `identify` block, so nothing asks it there (plan 0008, step 3) | tests in the "the size of an answer" group in [`FetchLayerSource.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/adapters/layers/FetchLayerSource.test.ts) and [`readJson.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/adapters/layers/readJson.test.ts) |
| Tracking through cookies or the referrer | Layer and routing requests are made with `credentials: "omit"` and `referrerPolicy: "no-referrer"` | [`FetchLayerSource.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/adapters/layers/FetchLayerSource.ts); test "sends no cookies, no referrer and no cached copy, and no header beyond Accept" in `ValhallaRoutingProvider.test.ts` |
| Hammering a public service | Search and routing start at most one request a second, suggestions wait for a pause in typing and start at most four a second, a superseded request is cancelled, and suggestions stop for a cooldown after repeated failures | [`RequestSpacer.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/adapters/shared/RequestSpacer.ts); test "starts queued requests at least the interval apart, in order" in [`RequestSpacer.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/adapters/shared/RequestSpacer.test.ts) |
| A provider serves wrong or changed data | Not preventable by the page. The layer shows its provider's name and disclaimer, and a provider's data is drawn only as points, shapes, tiles and text | Residual risk, below |

### Address fragment and shape links

The fragment is read at load, so a hand-made link is untrusted input. The decoders are pure functions in `packages/core`.

| Threat | Counter | Evidence |
| --- | --- | --- |
| Crash, hang or injection from a hostile fragment | Every part is parsed against a fixed grammar and range. Anything else is ignored, never evaluated. A view outside the world is dropped | [`urlHash.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/core/src/urlHash/urlHash.ts); tests "reads any text without throwing" and "only returns a view that is inside the world" in [`urlHash.property.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/core/src/urlHash/urlHash.property.test.ts); test "drops bad ids, duplicates, values for layers that are off and odd values" in [`urlHash.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/core/src/urlHash/urlHash.test.ts) |
| An unknown layer or control value reaching code | Values are resolved against the layer's definition when read, and at most 20 layers are kept | test "keeps at most 20 layers" in `urlHash.test.ts` |
| A shape link that is huge, malformed or slow to decode | Link-safe characters only, at most 2,000 characters and 50 shapes, a seven-character limit on each number, coordinates inside the world, and every shape validated | [`share.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/core/src/draw/share.ts); tests "rejects text that is empty, too long or has characters outside the alphabet", "rejects numbers that run on without end" and "is fast on the longest input it accepts" in [`share.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/core/src/draw/share.test.ts); test "reads any text without throwing" in [`share.property.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/core/src/draw/share.property.test.ts) |
| A layer definition that is not valid | `validateLayerDefinition` returns problems as text for any input | test "lists problems as text for any JSON, without throwing" in [`validate.property.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/core/src/layers/validate.property.test.ts) |

### Client error report

`POST /log-error` is the only endpoint that accepts visitor-controlled text. It writes a log line and returns no body. `navigator.sendBeacon` is exempt from cross-origin preflight, so another site can send a beacon to it.

| Threat | Counter | Evidence |
| --- | --- | --- |
| Another site fills the logs | A request with an `Origin` other than the site's own is refused with 403 | test "rejects a request from a mismatched Origin without logging" in [`log-error.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/routes/log-error.test.ts) |
| Oversized or unbounded body | `Content-Length` must be present and at most 32 KiB, checked before the body is read. Every field has a 2,000-character limit | tests "rejects a request whose Content-Length exceeds the maximum body size, without parsing it" and "rejects a request with no Content-Length header at all, without parsing it"; [`log-error.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/routes/log-error.ts) |
| Forged log lines | Control characters are replaced before logging | test "strips control characters from logged fields before writing to Workers Logs" |
| A position leaks into the log | The address is cut at `?` or `#`, in the route and in the sender | tests "logs only the origin and path of the page, dropping any query or hash a client sends" and "drops a query or hash even from a url that is not absolute" in `log-error.test.ts`; test "sends only the origin and path, never the query or the hash that can hold the user's position" in [`BeaconErrorReporter.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/adapters/errorReporting/BeaconErrorReporter.test.ts) |
| A page that loops on an error floods the endpoint | The reporter sends the same error once, and stops after a fixed number of reports per page load | test "sends the same error at most once per page load" in `BeaconErrorReporter.test.ts` |
| A client with no `Origin` header | Accepted on purpose, because some same-origin requests omit it. Such a client still meets every other check | test "accepts a request with no Origin header at all". This is a residual risk, below |

### Hosting and supply chain

| Threat | Counter | Evidence |
| --- | --- | --- |
| A malicious or vulnerable dependency | A committed lockfile and `npm ci` in CI. Dependabot proposes updates weekly for npm and for GitHub Actions. Actions are pinned to commit hashes. | [`.github/dependabot.yml`](https://github.com/MapCairn/mapcairn/blob/main/.github/dependabot.yml); [`ci.yml`](https://github.com/MapCairn/mapcairn/blob/main/.github/workflows/ci.yml); `package-lock.json` |
| A weak spot in repository practice | OpenSSF Scorecard runs weekly and uploads its result to code scanning | [`scorecard.yml`](https://github.com/MapCairn/mapcairn/blob/main/.github/workflows/scorecard.yml) |
| An unreviewed or failing change reaching `main` | Changes go through pull requests, with the `build` and `e2e` checks required by the repository ruleset | [`ci.yml`](https://github.com/MapCairn/mapcairn/blob/main/.github/workflows/ci.yml), [`playwright.yml`](https://github.com/MapCairn/mapcairn/blob/main/.github/workflows/playwright.yml); [`CONTRIBUTING.md`](../CONTRIBUTING.md) |
| A secret committed by mistake | The Worker has no secret to commit. Secret scanning with push protection is turned on in the repository settings | `wrangler.jsonc` declares no binding but the assets; [#4](https://github.com/MapCairn/mapcairn/issues/4). The second part is a setting, not a test |
| Account takeover | Two-factor authentication is required for the GitHub organisation | A setting, recorded in [#4](https://github.com/MapCairn/mapcairn/issues/4) |

## Secure design arguments

The requirements are met because of these design choices, each of which a test, a lint rule or a build step keeps in place.

1. **Small attack surface.** No accounts, no database, no outbound requests from the Worker and one endpoint that takes visitor text. Most of what could go wrong in a web application has nothing to attach to. Evidence: `wrangler.jsonc`, `packages/web/src/routes.ts`.
2. **Content Security Policy without `unsafe-inline` in production.** Script runs only from the site, from one hash, from a per-request nonce and from the analytics origin. Styles come only from the site's own files, so they are compiled at build time (vanilla-extract), and the lint rule `noInlineStyles` in Biome and the harmony scanner stop an inline style being added. Evidence: `securityHeaders.ts`, the tests above, [`biome.jsonc`](https://github.com/MapCairn/mapcairn/blob/main/biome.jsonc) and [`scripts/harmony`](https://github.com/MapCairn/mapcairn/tree/main/scripts/harmony).
3. **One inline script, fixed.** The theme script that prevents a flash is a constant string built in `packages/core`, rendered with the only use of `dangerouslySetInnerHTML` in the code. A Biome rule (`lint/security/noDangerouslySetInnerHtml`) flags any other use, and the one use carries an explanation. Evidence: [`root.tsx`](https://github.com/MapCairn/mapcairn/blob/main/packages/web/src/root.tsx), `themeBootstrap.test.ts`.
4. **Origin allowlists, in one place, tested.** A layer, basemap or service names its origins in data. The lists in `_headers` and `securityHeaders.ts` must contain them, and a test says what is missing. Evidence: `layers.test.ts`, `httpHeaders.test.ts`.
5. **Validate, bound and fail closed at every parser.** The fragment, the shape link, layer definitions, geometry, provider responses and the error report each have a grammar, a range and a size limit, and each returns "nothing" or a typed error when its input is bad as a whole. Where the input is a list (the shape link's shapes, the fragment's layer ids), a part that cannot be read or breaks the rules is skipped and the valid rest is kept, so no part is ever used half read. Property-based tests run the parsers on arbitrary text. Evidence: the tests above.
6. **Ports and adapters.** The interface and the logic use ports. Anything that touches the browser, the network or the map engine is in one adapter, so the places that make requests are few and each has contract tests. Browser globals outside adapters, engine imports outside the MapLibre adapter and adapters outside the composition root are build failures. Evidence: [`ARCHITECTURE.md`](../ARCHITECTURE.md), [`.dependency-cruiser.cjs`](https://github.com/MapCairn/mapcairn/blob/main/.dependency-cruiser.cjs), [`boundaries.test.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/core/src/lint/boundaries.test.ts).
7. **Nothing stored, nothing sent that is not asked for.** Layers are off until turned on, directions and areas are requested only by a button, and shapes are never stored or written to the address bar. Evidence: [`ARCHITECTURE.md`](../ARCHITECTURE.md), `PRIVACY.md`.
8. **Defence is checked in CI, not only intended.** Lint, typecheck, coverage, build and the browser tests run on every pull request. Coverage floors are enforced. Evidence: [`ci.yml`](https://github.com/MapCairn/mapcairn/blob/main/.github/workflows/ci.yml), [`playwright.yml`](https://github.com/MapCairn/mapcairn/blob/main/.github/workflows/playwright.yml).

## Common weakness classes

Each row names a class of weakness, how this project counters it, and where to check. "Not applicable" is given only where the code has nothing the weakness could attach to.

| Weakness | Counter | Evidence |
| --- | --- | --- |
| Cross-site scripting (CWE-79) | React escapes text. The one `dangerouslySetInnerHTML` is a fixed string. The Content Security Policy blocks inline and foreign script. Provider links are `https` only | `root.tsx`; `securityHeaders.ts`; `safeLink` in `FeatureCard.tsx`; test "links to the provider only over https" |
| Improper input validation (CWE-20) | A grammar, range and size limit on every parser, with property-based tests | `urlHash.property.test.ts`; `share.property.test.ts`; `validate.property.test.ts` |
| Uncontrolled resource consumption (CWE-400) | A body size limit checked before reading, a field length limit, a shape link length and count limit, one request a second to public services, and a cap on error reports per page | `log-error.ts`; test "is fast on the longest input it accepts"; `RequestSpacer.ts`; `BeaconErrorReporter.test.ts` |
| Inefficient regular expression or algorithmic complexity (CWE-1333, CWE-407) | The shape decoder reads once, left to right, with a fixed limit on each number, and a test times the longest input | test "is fast on the longest input it accepts" in `share.test.ts`; test "rejects numbers that run on without end" |
| Log injection (CWE-117) | Control characters are replaced in every logged field | test "strips control characters from logged fields before writing to Workers Logs" |
| Cross-site request forgery and cross-origin abuse (CWE-352, CWE-346) | The one state-free `POST` route checks `Origin`. There are no sessions or cookies to forge, because there are no accounts | test "rejects a request from a mismatched Origin without logging" |
| Exposure of sensitive information (CWE-200) | The error report drops the query and fragment, which can hold the visitor's position. Requests to providers carry no cookies and no referrer | tests in `log-error.test.ts` and `BeaconErrorReporter.test.ts`; `FetchLayerSource.ts` |
| Clickjacking (CWE-1021) | `frame-ancestors 'none'` and `X-Frame-Options: DENY` | `securityHeaders.ts` |
| Server-side request forgery (CWE-918) | Not applicable to the Worker, which makes no outbound request. In the browser, the allowed origins are listed and detail URLs are checked against the layer's declared origins | `workers/app.ts`; test "never requests a detail URL off the declared origins" |
| Open redirect (CWE-601) | The only redirect goes to a fixed address and carries the path and query | `redirectFromPreviousHostname` in `workers/app.ts` |
| Cleartext transmission (CWE-319) | HTTPS only with HSTS (one year, including subdomains), and providers are `https` origins | `securityHeaders.ts`; test "sets a Strict-Transport-Security header on every response"; `isHttpsUrl` in [`validateSupport.ts`](https://github.com/MapCairn/mapcairn/blob/main/packages/core/src/layers/validateSupport.ts) |
| Tabnabbing through links (CWE-1022) | Links that open a new tab carry `rel="noopener noreferrer"`, and credit links carry `rel="noopener"` | `FeatureCard.tsx`; [`Attribution.tsx`](https://github.com/MapCairn/mapcairn/blob/main/packages/map/src/chrome/Attribution/Attribution.tsx) |
| Debug or test code left in production (CWE-489) | A build step fails if the test seam or the design guide reaches the production bundle | `verifyNoTestSeam.mjs`; `verifyNoTestSeam.test.ts` |
| Use of an untrusted component (CWE-829, CWE-1104) | A lockfile, `npm ci`, weekly Dependabot updates, pinned Actions and a weekly Scorecard run | `dependabot.yml`; `ci.yml`; `scorecard.yml` |
| Hard-coded credentials (CWE-798) | None needed. The Worker has no binding that takes a secret. Secret scanning push protection is on | `wrangler.jsonc`; a repository setting |
| Broken access control, authentication, session management (CWE-284, CWE-287, CWE-384) | Not applicable. There are no accounts, no sessions and no protected resources | `PRIVACY.md`; `wrangler.jsonc` |
| SQL and command injection (CWE-89, CWE-78) | Not applicable. There is no database, and no code runs a shell or builds a query from input | `wrangler.jsonc` |

## Residual risks

These are known, and are accepted or being worked on.

- **A third-party script.** `script-src` allows `https://static.cloudflareinsights.com`, which Cloudflare Web Analytics loads. The script has no subresource integrity, because Cloudflare serves it and may change it. A compromise there could run script on the page. The analytics are cookieless page-view counts, and removing them would remove the risk.
- **Provider content.** A compromised provider could serve wrong tiles, styles or data. The page limits the effect (data is validated and drawn as data, and origins are an allowlist), but it cannot make a provider's data correct.
- **The error-report route.** It has no rate limit of its own, and it accepts a request with no `Origin` header, so a client that is not a browser can still write bounded log lines. The effect is limited to log volume.
- **Scorecard findings that need a second person.** Code review and branch protection checks are limited while the project has one maintainer (see [`GOVERNANCE.md`](../GOVERNANCE.md)). The maintainer's own pull requests have no second reviewer, and no independent review is claimed.
- **Third-party code in the map engine.** MapLibre GL JS and its worker run in the page under the site's policy (`worker-src 'self' blob:`). A flaw in it is a flaw here, and the project depends on its maintainers' fixes arriving through updates.
- **No external audit.** No one outside the project has reviewed this design.

## Keeping this current

A change that adds a provider origin, an input the page parses, a route on the Worker or a header must update the relevant row in the same pull request. The pull request template asks about network changes. The maintainer re-reads this document each year with the roadmap (see [`ROADMAP.md`](../ROADMAP.md)).
