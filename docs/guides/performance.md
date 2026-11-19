# Performance and Lighthouse

What was measured on 2026-11-11, what was tried and what was left alone, so the same experiments are not repeated. Tracked in [#8](https://github.com/MapCairn/mapcairn/issues/8), then [#329](https://github.com/MapCairn/mapcairn/issues/329) for the product page and [#385](https://github.com/MapCairn/mapcairn/issues/385) for the map page.

## Ground rules

Improve the Lighthouse scores where the cause is real, and stop where the remaining gains would need tricks.

- Fix measured causes only, one change at a time, each with before and after numbers. A change that does not move the numbers is reverted.
- Do not defer content a visitor needs to hide its cost, remove a feature, or change what visitors see, the basemap, privacy or accessibility behaviour.
- Do not change how the audit is served or throttled. The CI performance assertion stays a warning at 0.95, and no threshold is lowered.
- The map is the page. MapLibre and the first view's tiles and glyphs are the cost of showing it.

## How it was measured

Lighthouse 13.4.1 against the production build served as CI serves it (`npm run preview:e2e`), mobile (the CI preset) five runs and desktop three runs per state, medians with the range. The same tool against the production site, three runs each, with the analytics beacon blocked so audit runs are not counted as visits. The latest CI run on `main` (b97b21ce) for reference. The local machine is slower than Lighthouse's reference device, so local mobile figures are worse than CI's; compare states, not machines.

## Findings

| Where                        | Performance   | LCP           | TBT           | FCP   | Speed Index | CLS |
| ---------------------------- | ------------- | ------------- | ------------- | ----- | ----------- | --- |
| CI, `main`, 3 runs (mobile)  | 33, 42, 42    | 9.7 to 10.0 s | 2.05 to 7.3 s |       |             | 0   |
| Local preview, mobile median | 27 (26 to 27) | 21.8 s        | 7.8 s         | 6.2 s | 9.4 s       | 0   |
| Local preview, desktop       | 36            | 4.4 s         | 2.0 s         | 1.3 s | 3.9 s       | 0   |
| Production, mobile median    | 29 (28 to 29) | 19.2 s        | 5.3 s         | 5.5 s | 6.8 s       | 0   |
| Production, desktop median   | 51 (40 to 52) | 3.4 s         | 0.7 s         | 1.1 s | 2.1 s       | 0   |

Accessibility, best practices and SEO are 100 everywhere. 24 requests to the site itself and about 46 in all.

1. **LCP is the first-visit tour card, and the card waits for the map.** Lighthouse runs as a first visit, so the welcome card is the largest text. It appears once `MapContext.loading` is false (plan 0004: it must never show over `MapUnavailable`), and `loading` stays true until the engine's first `idle`, after the first view's tiles and glyphs. LCP therefore measures "the map has loaded". The gate stays.
2. **MapLibre is most of the main-thread work.** `maplibre-gl.mjs` is 1.1 MB as MapLibre ships it, and its evaluation, style processing and first draws are about 70% of the start-up CPU time (TBT). The rest of the app's own start-up JavaScript is about 0.5 s on this machine unthrottled, most of it rendering the chrome.
3. **The engine starts downloading late.** `import("maplibre-gl")` starts in the map's mount effect, which runs only after the whole app has rendered. The download and the app's first render run one after the other when they could overlap.
4. **Byte counts in the audit are not what most visitors receive.** Wrangler's local server and, for the installed Chrome used here, Cloudflare's edge send script and style bodies uncompressed (`x-content-encoding-over-network`), while other clients receive zstd or Brotli (`react-vendor` is 219 KB raw and 71 KB as zstd). The audit therefore overstates transfer costs, and a change that only saves bytes looks larger in it than it is.
5. **Render-blocking CSS.** Four stylesheets block the first paint: the shared component sheet (60 KB raw, 7.7 KB compressed), root, home and the error page's sheet (under 1 KB, loaded because the root error boundary imports it). All but the last are needed to draw the server-rendered skeleton, and the production CSP forbids inlining them.
6. **No layout shift.** CLS is 0 in every run; the server-rendered skeleton holds the chrome's boxes.

## What was tried

1. Start the engine download during the app's first render (finding 3), through an optional `preload` on the map adapter factory, so the ui still never imports the engine. Measure against `main`, interleaved, and keep it only if it separates.
2. Try hydrating in a transition. Measure the same way.
3. Stop if the next candidates would only save bytes the audit overstates, or would delay something visible.

## Results

Neither change tried was kept, because neither moved the numbers beyond run-to-run spread.

1. **Engine preload** (finding 3). `MapAdapterFactory` gained an optional `preload`, called at the top of the app's first render, so `maplibre-gl` downloaded while the chrome rendered. A first comparison, taken an hour apart on a machine shared with other work, suggested observed LCP fell from 5.1 s to 3.7 s. Checked properly, the gain did not hold:
   - Interleaved on one machine (main, change, main, change; 3 mobile runs each), observed LCP was 4.3 s against 3.0 s in the first round and 3.6 s (2.9 to 4.1) against 3.3 s (2.9 to 3.9) in the clean second round. One more round failed to load and was discarded.
   - On the CI runner, performance was 39, 41 and 40 with the change against 33, 42 and 42 on `main`, and observed LCP 1.5 to 1.9 s against 1.2 to 2.0 s.
   - The scores moved by a point or two either way, and TBT could not fall from starting a download earlier.

   Reverted.
2. **Hydrating inside `startTransition`**, as React Router's default client entry does. FCP did not move, and mobile LCP (21.5 s) and TBT (7.9 s) were no better. Reverted.

One test fix came out of the work: the basemap outage end-to-end test checked that a basemap whose provider is down stayed selected, which races the fallback that takes the choice back. It failed on `main` one run in three on mobile Chromium.

That is where this plan stops. What is left is the engine itself, the first view's tiles and glyphs, and byte savings the audit overstates. A real gain would need a different design: for example, showing the tour card before the map has loaded, which plan 0004 rules out, or a lighter engine, which is out of scope.

## The product page

Since the map moved to `/map`, Lighthouse CI audits both `/`, the product page, and `/map` (`packages/web/lighthouserc.json`), with the same assertions for each, and the summary names the page of every run. The figures above are the map's. The product page sits outside the app layout, so it builds no services and loads no layer definition, engine code or engine styles, and no adapter but the small browser clipboard behind its copy button; it opens no connection to another host of its own (the tile host's preconnect is on the map's route only; in production the host's cookieless page-view counter loads on every page) and draws its artwork as inline SVG, so its cost is the shared stylesheets, the fonts and React's hydration of a static page. Moving the services off `/` and marking the map package's style modules as its only side effects took the product page from 870 KB of JavaScript and 72 KB of CSS (uncompressed, as built) to 510 KB and 27 KB.

### Script preloads on the product page (2026-11-19)

On the product page the mobile score was 90 (first contentful paint 2.7 s, largest contentful paint 3.0 s, the same locally and in Lighthouse CI on `main`). React Router writes one `modulepreload` link for every script the page needs into the head, about twenty and 190 KB compressed, and they compete with the stylesheets and font for the first paint. The product page's route `handle` now sets `modulePreload: "end"`, and `entry.server.tsx` moves those links, in order, from the head to just before `</body>` (`app/modulePreload.ts`). The map and privacy pages keep theirs in the head.

Four variants were measured against a production build served as CI serves it. The first row is Lighthouse 13.4.1, mobile, simulated throttling, 3 runs. The rest are a real Chrome run through the DevTools protocol with the same throttling as Lighthouse's DevTools method (1.6 Mbps, 150 ms round trip, 4x CPU), 3 runs, the pages served uncached, over HTTP/1.1. "Hydrated" is the time at which the copy-code button gets its React props, so it is when the page first responds to a click.

| Variant                               | Lighthouse performance | First paint  | Hydrated     | Last script done |
| ------------------------------------- | ---------------------- | ------------ | ------------ | ---------------- |
| Links in the head (before)            | 90, 90, 90             | 2.6 s        | 4.3 s        | 4.2 s            |
| Links removed                         | 98 to 99               | 1.9 s        | 5.7 s        | 5.7 s            |
| Only the entry and route scripts kept | not measured           | 2.0 to 2.3 s | 4.5 to 4.9 s | 4.4 to 4.8 s     |
| Links moved to the end (kept)         | 90, 93, 93             | 1.9 s        | 4.0 to 4.1 s | 3.9 s            |

Removing the links scored best in the audit but delayed hydration by 1.4 s, because the script graph was then discovered one level at a time; that is the trade the audit cannot see, and it was not kept. Moving them keeps the flattened script graph and lets the stylesheets and font go first: first paint is 0.7 s earlier and hydration is slightly earlier too, not later. The audit's own gain is smaller (90 to 93), because it counts the bytes requested before the first paint whatever their priority, so this change does not reach the 0.95 target on its own and #329 stays open. The 92 in Lighthouse CI on the first version of this change (links removed) is not the figure for the kept variant.

The local server speaks HTTP/1.1, and Cloudflare's edge speaks HTTP/2 and HTTP/3 with its own prioritisation, so the field gain may be smaller than these figures; check the next Lighthouse CI run on `main` rather than assuming it.

Also measured and not kept: no font preload (no change), one merged stylesheet (within the spread), and `fetchpriority="low"` on the preloads (one point).

### The map page

On `/map`: mobile 59 to 71 locally and 43 to 44 in CI, desktop 90 to 91, accessibility, best practices and SEO 100. The largest contentful paint is the tour card, which waits for the map's first `idle`, so about 25% of the score depends on the first view's tiles, sprite and 14 glyph ranges coming over the throttled link. Run to run, the same build moved from 59 to 69 on one machine under load (total blocking time 160 to 370 ms), and a build of `main` and a build of this branch requested identical files of identical sizes and scored inside that range, so a difference between them in CI is noise. Preloading the basemap style, a merged stylesheet, the font preload and removing the preloads did not separate from it. What is left needs a decision on plan 0004's rule about the tour card (see "Decided not to do"), and is tracked in #385.

## Language weight

A language other than the host's default is loaded when a visitor first uses it, so a visitor who never chooses it does not download its text (`LanguageCatalogue.load` may return a promise). The default language is in the main bundle and loads synchronously. While another language loads, the interface keeps showing the previous one, so a slow connection never shows blank text. The reference host's `hostLanguages.ts` imports `af.ts` and `afLayerTemplates.ts` only when Afrikaans is requested, so the layer-template wording shares that lazy-loading boundary. Nothing in the repository measures the bundle's size yet, so this is a loading boundary held to by the code, not a checked size budget.

## Decided not to do

- Show the tour card before the map has loaded. It would move LCP without making anything faster, and it breaks plan 0004's rule.
- Change the compression, protocol or throttling of the audit server. That would change the audit, not the site.
- `modulepreload` the MapLibre chunk in the head. It competes with the first chunks for bandwidth before the first paint (see the comment in `vite.config.ts`).
- Lazy-load the error page. It saves under 2 KB, and an error page that has to load more code can fail when the network has.
- Split the sheet's panels into chunks loaded on first open. The saving is mainly bytes, which the audit overstates (finding 4), and opening a panel would then wait on the network.
- Move or remove the script preloads on `/map`. The score did not move, and the map is the page, so its scripts start with the head.
- Raise the CI performance threshold. The scores stay far below 0.95, which the map's engine and tiles make out of reach without the tricks above.
