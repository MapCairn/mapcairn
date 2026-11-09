# Plan 0002: data saving and first paint

Status: in progress. Written 2026-11-09. The Save data mode (section 1) is deferred by the owner; the caching audit, the skeleton and the measurement go ahead.

Tracking issue: [#158](https://github.com/mooship/karta/issues/158).

## Why

Karta is for everyone, and much of the world pays dearly for mobile data or has a slow connection. The aim is the best experience for every visitor on a good connection, while staying kind to people with little data: few bytes by default, something useful on screen quickly, and a way to say "spend less". Saving data is never allowed to make the default experience worse for everyone else. This plan covers three agreed pieces and one measurement that keeps them honest:

1. A Save data mode.
2. A caching audit and the fixes it finds.
3. A server-rendered chrome skeleton, so the first paint is the real layout.
4. A measured data budget that fails the build when it is exceeded.

## Starting point

Checked against the live site on 2026-11-09 and the review's build numbers (not yet a full cold-load measurement):

- Hashed assets under `/assets/` send `Cache-Control: public, max-age=31536000, immutable` and are Brotli compressed. Good.
- Basemap thumbnails and the favicon send `max-age=0, must-revalidate`, so every visit revalidates them. The manifest caches for an hour.
- First load is about 150 KB of JavaScript and 7 KB of CSS, compressed, plus fonts. MapLibre adds about 241 KB compressed after hydration. Thumbnails are 7 to 12 KB each.
- Vector basemaps (Positron, Liberty and, at the time, Dark, since removed) download much less than the raster Streets basemap, whose tiles are PNGs.
- The server renders only a skip link, a hidden heading and a flat placeholder until the app mounts.

## Measured

Measured on 2026-11-09, after Liberty became the default basemap in both themes. No CI budgets are set yet.

### Our own headers

Checked on the e2e-mode preview (`npm start`) and, for the production bundle, `npm run preview -w @karta/web`, both through `wrangler dev`, then compared with the live site.

| Response | Before (live) | Now (`public/_headers`, `entry.server.tsx`) |
| --- | --- | --- |
| HTML (`/`, `/privacy`) | no `Cache-Control` (the `/index.html` rule never matched: the Worker renders pages, so `_headers` does not reach them) | `no-cache`, set by the server entry; revalidated every visit, still allowed in the back/forward cache. The dead `/index.html` rule is gone. |
| Hashed `/assets/*` (JS, CSS, fonts) | `public, max-age=31536000, immutable`, Brotli | unchanged. The fonts are hashed under `/assets/fonts/`, so they get the same year. |
| `/basemaps/*.jpg`, favicons, touch and tile icons, `og-image.png`, `safari-pinned-tab.svg`, `browserconfig.xml` | `public, max-age=0, must-revalidate` | `public, max-age=604800, stale-while-revalidate=86400`, one rule per file. Filenames are not hashed, so a regenerated thumbnail reaches people within about a week. |
| `site.webmanifest`, `/.well-known/security.txt` | an hour, and `max-age=0` respectively | `public, max-age=86400` |
| `robots.txt`, `sitemap.xml`, `llms.txt` | `public, max-age=3600` from the route | unchanged |

Security headers on static files are unchanged, and `securityHeaders.test.ts` still checks them against `securityHeaders.ts`. `src/httpHeaders.test.ts` now parses `_headers`, matches every file in `public/` against every rule (a `*` crosses `/`, as Cloudflare treats it) and requires exactly one `Cache-Control` per file, because Cloudflare joins the values of overlapping rules with a comma. Each rule was also checked with `curl -I` on the running preview.

### What the providers send

`curl -I` on 2026-11-09:

| Request | Cache headers | Size on the wire |
| --- | --- | --- |
| OpenFreeMap style (`/styles/liberty`, `/styles/positron`) | `max-age=86400, public`, `Last-Modified`, gzip | about 6 KB |
| OpenFreeMap TileJSON (`/planet`) | `max-age=3600, public`, `ETag` | about 2 KB |
| Vector tiles (`/planet/<version>/{z}/{x}/{y}.pbf`) | `max-age=315360000, public` (ten years), `ETag`; the URL carries the data version, so a new planet build is a new URL | 100 to 130 KB each at zoom 1, 35 KB for a city tile at zoom 14, gzip |
| Sprites (`/sprites/ofm_f384/ofm@2x.json` and `.png`) | ten years, versioned path | 4 KB and 117 KB |
| Glyphs (`/fonts/<stack>/<range>.pbf`) | `max-age=604800, public` (a week) | 1 to 78 KB per range, gzip |
| Shaded relief (`/natural_earth/ne2sr/{z}/{x}/{y}.png`), used by Liberty up to zoom 7 | ten years, `ETag` | 45 to 250 KB per PNG |
| OpenStreetMap tiles (`tile.openstreetmap.org/{z}/{x}/{y}.png`) | `max-age` of about 26 hours, `stale-while-revalidate=604800`, `stale-if-error=604800`, `ETag` | 6.8 KB for the zoom 0 tile, 103 bytes for an all-sea tile at zoom 12 (land tiles are larger; not measured in the app here) |

The app does nothing that defeats this: the MapLibre adapter sets no `transformRequest`, no request `cache` mode and no query strings, and uses the style and tile URLs as the providers publish them. The warm repeat view below shows every provider request answered from the browser cache.

### Transferred bytes

`node scripts/measureTransfer.mjs` against the production bundle served locally (`npm run build`, then `npm run preview -w @karta/web -- --port 4173`), real providers, Chromium at 390 by 844 (DPR 3, mobile), the page throttled to Lighthouse's slow 4G. Three runs agreed to within 1 KB except where noted. Local `wrangler dev` sends the app's own text files uncompressed over plain http, so the app figure is the script's Brotli (quality 11) estimate of what Cloudflare sends; the raw local figure is 1,787 KB.

| Case | Total | App | Style and sprites | Vector tiles | Glyphs | Relief PNGs |
| --- | --- | --- | --- | --- | --- | --- |
| Cold first view, Liberty, whole world | 2,689 KB | 586 KB (21 requests) | 128 KB | 445 KB (4) | 596 KB (14) | 933 KB (8) |
| Warm repeat view | 3 KB | 3 KB (the HTML; 20 of 21 from cache) | 0 | 0 | 0 | 0 |
| Switch to Positron (sheet opened, at the world view) | 46 KB | 42 KB (the four picker thumbnails) | 4 KB (style; sprites cached) | 0 (shared with Liberty) | 0 | none |
| A minute of keyboard panning and zooming over Johannesburg, zoom 11 to 14, Liberty | 900 KB | 0 | 0 | 900 KB (20 or 21 tiles) | 0 | none |

For comparison, a cold first view with Positron (the old light default) was 1,754 KB: the same app, tiles and glyphs, with no relief layer. At the world view Liberty costs about 935 KB more, all of it the Natural Earth shaded relief PNGs, which Liberty draws from zoom 0 to 7 and fades out from 60% to 10% opacity by zoom 6. Glyphs are the next largest share at the world view (14 ranges, because world labels need Latin, Cyrillic, Greek and other scripts).

Notes for the budget and for the deferred Save data mode:

- The relief layer is the cheapest large saving: dropping it, or loading it only on a fast connection, would bring Liberty's cold world view close to Positron's without changing the look much at city zooms. That is a design decision for the owner, not made here.
- The cold total is dominated by the map, not the app: about 2.1 MB of the 2.7 MB comes from OpenFreeMap.
- Throttling is set on the page through the DevTools protocol and may not slow MapLibre's worker requests, so these are byte counts, not timings.

## 1. Save data mode (deferred)

Deferred on 2026-11-09 to keep this pass short. The design below is kept for a later pass.

- A Save data switch in the Settings section of the sheet, stored with the other settings (`SettingsStore`, key under `karta:`).
- Its default comes from a signal when the browser has one: `navigator.connection.saveData`, or an effective connection type of `slow-2g` or `2g`. Chrome, Edge and Samsung Internet expose these. Safari on iOS does not, so the switch is what makes this work there. An explicit choice always wins over the signal.
- Put the signal behind a port (`DevicePreferences` already carries `reducedMotion` and `finePointer`; add `saveData`), with a fake and contract tests, so the UI never reads `navigator.connection`.
- When Save data is on:
  - the basemap picker shows names and a plain colour swatch instead of loading thumbnails;
  - the raster Streets basemap carries a note that it uses more data, and the app does not pick it on its own;
  - MapLibre gets a smaller tile cache and no fade animation, and tile requests for off-screen padding are kept to a minimum (check the options of the installed version before choosing);
  - future data layers (plan 0001) ask for confirmation before loading and say roughly how much they download.
- The switch states in words what it changes. Nothing is hidden behind it that a person needs.

## 2. Caching

- Audit the headers for every response class (HTML, hashed assets, fonts, images, manifest and icons, `robots.txt`, `sitemap.xml`, `llms.txt`) on a built preview and the live site.
- Give thumbnails and icons a sensible lifetime. They change only when regenerated, so use a hashed filename or a week with `stale-while-revalidate`, not `must-revalidate` on every visit.
- Leave HTML short-lived or revalidated so a deploy reaches people quickly.
- Record what OpenFreeMap and OpenStreetMap send for tiles and styles, and confirm the app does nothing that defeats their caching (for example `no-cache` on requests or cache-busting query strings).
- Put the expected headers in `public/_headers`, and add a test that parses it, as the security headers already do.

## 3. Server-rendered chrome skeleton

- The server renders the real `MapChrome` layout on the map-colour background, so each control is in its final position: the search pill, the Map options, Measure and Locate me group, the zoom group (when shown) and the credits button.
- It is decorative: `aria-hidden` and `inert`, so nobody can tab to a button that does nothing before hydration. When the app mounts, the real chrome replaces it in the same boxes, so nothing shifts.
- It obeys the usual rules: no `style=` attributes in server output, tokens only, no Radix parts that write inline styles. It works in both themes because the pre-paint script sets the theme first.
- Test: the server HTML contains the skeleton and no `style=`; an e2e check compares each control's box before and after mount (no layout shift); the layout collision matrix still passes.

## 4. Measured data budget

- Measure the production build against real tile servers for four cases: a cold first view, a repeat visit with a warm cache, a basemap switch and a typical minute of panning and zooming. Record transferred bytes, not file sizes.
- Turn the cold-load and warm-load numbers into limits in the Lighthouse CI run (a budgets file) or a build-time size check, with a little headroom, so a heavy change fails.
- Report the Lighthouse result on a slow mobile profile before and after the skeleton.

## Out of scope

A service worker, offline maps and tile caching in our own storage. They add moving parts, and the providers' own cache headers already do most of the work. Revisit with real numbers.

## Order of work

1. Measure the baseline and audit the headers (read only), and record the numbers here.
2. Caching fixes and the headers test.
3. The skeleton.
4. The `saveData` preference port and the Save data mode, with the Settings switch and the picker change.
5. The budget check, then the Lighthouse comparison.
6. Update DESIGN.md (the skeleton and the Save data behaviour), PRIVACY.md if anything new is read, and the README.
