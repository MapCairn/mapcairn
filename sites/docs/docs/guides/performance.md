---

title: Performance
sidebar_label: Performance
description: What the SDK loads and costs, measured, and how to keep a host fast.
---

# Performance and Lighthouse

What a MapCairn page costs to load, measured on 2026-11-11 on the reference site's product page and map, and what was tried and left alone so that nobody repeats an experiment. It is tracked in [#8](https://github.com/MapCairn/mapcairn/issues/8), then [#329](https://github.com/MapCairn/mapcairn/issues/329) for the product page and [#385](https://github.com/MapCairn/mapcairn/issues/385) for the map page.

## What to expect in your host

- **The engine is most of the cost.** `maplibre-gl.mjs` is 1.1 MB as MapLibre ships it, and its evaluation, style processing and first draws are about 70% of the start-up CPU time (total blocking time). The rest of the reference app's start-up JavaScript is about 0.5 s unthrottled on the test machine, most of it rendering the chrome.
- **Largest contentful paint waits for the map.** On a first visit the welcome card is the largest text, and it appears only once the engine's first `idle` event has fired, after the first view's tiles and glyphs. The wait is deliberate: the card must never show over `MapUnavailable` (plan 0004).
- **Layout does not shift.** CLS is 0 in every run, because the server-rendered skeleton holds the chrome's boxes.
- **Another language costs nothing until it is used.** A language other than the host's default loads the first time a visitor uses it (`LanguageCatalogue.load` may return a promise). The default is in the main bundle. While another loads, the interface keeps showing the previous one, so a slow connection never shows blank text. The reference host's `hostLanguages.ts` imports `af.ts` and `afLayerTemplates.ts` only when Afrikaans is requested. Nothing in the repository measures the bundle's size yet, so this is a loading boundary held to by the code, not a checked budget.
- **Keep the engine out of a server bundle.** The reference Worker only renders pages, so `vite.config.ts` answers the engine's imports with an empty module in the Worker's environment, and `workerBundle.test.ts` fails when a Worker bundle holds a MapLibre file. This took the Worker bundle from 3.9 MB in 13 files to 2.5 MB in 11.
- **A page without the map is much lighter.** The product page builds no services and loads no layer definition, engine code or engine styles, opens no connection to another host of its own, and draws its artwork as inline SVG. Moving the services off `/` and marking the map package's style modules as its only side effects took it from 870 KB of JavaScript and 72 KB of CSS (uncompressed, as built) to 510 KB and 27 KB.

## How it was measured

Lighthouse 13.4.1 against the production build served as CI serves it (`npm run preview -w @mapcairn/web`), mobile (the CI preset) five runs and desktop three runs per state, medians with the range, and the same tool against the production site, three runs each, with the analytics beacon blocked so audit runs are not counted as visits. The local machine is slower than Lighthouse's reference device, so compare states, not machines.

| Where                        | Performance   | LCP           | TBT           | FCP   | Speed Index | CLS |
| ---------------------------- | ------------- | ------------- | ------------- | ----- | ----------- | --- |
| CI, `main`, 3 runs (mobile)  | 33, 42, 42    | 9.7 to 10.0 s | 2.05 to 7.3 s |       |             | 0   |
| Local preview, mobile median | 27 (26 to 27) | 21.8 s        | 7.8 s         | 6.2 s | 9.4 s       | 0   |
| Local preview, desktop       | 36            | 4.4 s         | 2.0 s         | 1.3 s | 3.9 s       | 0   |
| Production, mobile median    | 29 (28 to 29) | 19.2 s        | 5.3 s         | 5.5 s | 6.8 s       | 0   |
| Production, desktop median   | 51 (40 to 52) | 3.4 s         | 0.7 s         | 1.1 s | 2.1 s       | 0   |

Accessibility, best practices and SEO are 100 everywhere, with 24 requests to the site itself and about 46 in all.

Two things to know when you read an audit of your own host:

- Byte counts overstate transfer. The local preview server and, for the installed Chrome used here, Cloudflare's edge send script and style bodies uncompressed (`x-content-encoding-over-network`), while other clients receive zstd or Brotli (`react-vendor` is 219 KB raw and 71 KB as zstd). A change that only saves bytes looks larger in the audit than it is.
- Stylesheets block the first paint. Four do: the shared component sheet (60 KB raw, 7.7 KB compressed), root, home and the error page's sheet (under 1 KB, loaded because the root error boundary imports it). All but the last are needed to draw the server-rendered skeleton, and the production CSP forbids inlining them.

## What was tried

Fix measured causes only, one change at a time, with before and after numbers. A change that does not move the numbers is reverted. Neither change below was kept.

1. **Engine preload.** `MapAdapterFactory` gained an optional `preload`, called at the top of the app's first render, so `maplibre-gl` downloaded while the chrome rendered. A first comparison, taken an hour apart on a shared machine, suggested observed LCP fell from 5.1 s to 3.7 s. Interleaved on one machine (main, change, main, change; 3 mobile runs each), it was 3.6 s (2.9 to 4.1) against 3.3 s (2.9 to 3.9) in the clean round. On the CI runner, performance was 39, 41 and 40 with the change against 33, 42 and 42 on `main`. The scores moved by a point or two either way, and TBT could not fall from starting a download earlier.
2. **Hydrating inside `startTransition`**, as React Router's default client entry does. FCP did not move, and mobile LCP (21.5 s) and TBT (7.9 s) were no better.

What is left is the engine itself, the first view's tiles and glyphs, and byte savings the audit overstates. A real gain would need a different design, such as showing the tour card before the map has loaded, which plan 0004 rules out, or a lighter engine, which is out of scope.

## The product page

Lighthouse CI audits both `/`, the product page, and `/map` (`packages/web/lighthouserc.json`), with the same assertions for each. The figures above are the map's.

### Script preloads on the product page (2026-11-19)

The product page's mobile score was 90 (first contentful paint 2.7 s, largest contentful paint 3.0 s). React Router writes one `modulepreload` link for every script the page needs into the head, about twenty and 190 KB compressed, and they compete with the stylesheets and font for the first paint. The route's `handle` now sets `modulePreload: "end"`, and `entry.server.tsx` moves those links, in order, from the head to just before `</body>` (`app/modulePreload.ts`). The map and privacy pages keep theirs in the head.

Four variants were measured against a production build served as CI serves it. The first row is Lighthouse 13.4.1, mobile, simulated throttling, 3 runs. The rest are a real Chrome run through the DevTools protocol with the same throttling as Lighthouse's DevTools method (1.6 Mbps, 150 ms round trip, 4x CPU), 3 runs, served uncached over HTTP/1.1. "Hydrated" is when the copy-code button gets its React props, so when the page first responds to a click.

| Variant                               | Lighthouse performance | First paint  | Hydrated     | Last script done |
| ------------------------------------- | ---------------------- | ------------ | ------------ | ---------------- |
| Links in the head (before)            | 90, 90, 90             | 2.6 s        | 4.3 s        | 4.2 s            |
| Links removed                         | 98 to 99               | 1.9 s        | 5.7 s        | 5.7 s            |
| Only the entry and route scripts kept | not measured           | 2.0 to 2.3 s | 4.5 to 4.9 s | 4.4 to 4.8 s     |
| Links moved to the end (kept)         | 90, 93, 93             | 1.9 s        | 4.0 to 4.1 s | 3.9 s            |

Removing the links scored best in the audit but delayed hydration by 1.4 s, because the script graph was then discovered one level at a time, so it was not kept. Moving them keeps the flattened script graph and lets the stylesheets and font go first: first paint is 0.7 s earlier and hydration is slightly earlier too. The audit's own gain is smaller (90 to 93), because it counts the bytes requested before the first paint whatever their priority, so this does not reach the 0.95 target alone and #329 stays open. The local server speaks HTTP/1.1, and Cloudflare's edge speaks HTTP/2 and HTTP/3 with its own prioritisation, so the field gain may be smaller; check the next Lighthouse CI run on `main`.

Also measured and not kept: no font preload (no change), one merged stylesheet (within the spread), and `fetchpriority="low"` on the preloads (one point).

### The map page

On `/map`: mobile 55 to 71 locally and 38 to 44 in CI, desktop 90 to 91. About 25% of the score depends on the first view's tiles, sprite and 14 glyph ranges coming over the throttled link. The same build moved from 59 to 69 on one machine under load (total blocking time 160 to 370 ms), so a difference between two builds in CI is noise. Preloading the basemap style, a merged stylesheet, the font preload and removing the preloads did not separate from it. What is left needs a decision on plan 0004's rule about the tour card, and is tracked in #385.

## Decided not to do

- Show the tour card before the map has loaded. It would move LCP without making anything faster, and it breaks plan 0004's rule.
- Change the compression, protocol or throttling of the audit server. That would change the audit, not the site.
- `modulepreload` the MapLibre chunk in the head. It competes with the first chunks for bandwidth before the first paint (see the comment in `vite.config.ts`).
- Lazy-load the error page. It saves under 2 KB, and an error page that has to load more code can fail when the network has.
- Split the sheet's panels into chunks loaded on first open. The saving is mainly bytes, which the audit overstates, and opening a panel would then wait on the network.
- Move or remove the script preloads on `/map`. The score did not move, and the map is the page.
- Raise the CI performance threshold. The CI assertion stays a warning at 0.95, and the scores stay far below it, which the engine and tiles make out of reach without tricks.
