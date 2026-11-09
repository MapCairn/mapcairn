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
- Vector basemaps (Positron, Liberty, Dark) download much less than the raster Streets basemap, whose tiles are PNGs.
- The server renders only a skip link, a hidden heading and a flat placeholder until the app mounts.

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
