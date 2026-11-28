---

title: Performance
sidebar_label: Performance
description: What the SDK loads and costs, measured, and how to keep a host fast.
---

# Performance and Lighthouse

What a MapCairn page costs to load, measured on the reference site's product page and map, and what was tried and left alone so that nobody repeats an experiment. It is tracked in [#8](https://github.com/MapCairn/mapcairn/issues/8), then [#329](https://github.com/MapCairn/mapcairn/issues/329) for the product page and [#385](https://github.com/MapCairn/mapcairn/issues/385) for the map page.

## What to expect in your host

- **The engine is most of the cost.** `maplibre-gl.mjs` is 1.1 MB as MapLibre ships it, and its evaluation, style processing and first draws are about 70% of the start-up CPU time (total blocking time). The rest of the reference app's start-up JavaScript is about 0.5 s unthrottled on the test machine, most of it rendering the chrome.
- **Largest contentful paint waits for the map.** On a first visit the welcome card is the largest text, and it appears only once the engine's first `idle` event has fired, after the first view's tiles and glyphs. The wait is deliberate: the card must never show over `MapUnavailable` (plan 0004), and showing it sooner was measured and does not lift the mobile score (see "The map page").
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

## Ground rules

Improve the Lighthouse scores where the cause is real, and stop where the remaining gains would need tricks.

- Fix measured causes only, one change at a time, with before and after numbers. A change that does not move the numbers is reverted.
- Do not defer content a visitor needs to hide its cost, remove a feature, or change what visitors see.
- Do not change how the audit is served or throttled, and do not lower a threshold.

### Comparing two builds

`packages/web/scripts/speed/measureSpeed.ts` times two builds of the playground by those rules, in Chromium with the processor four times slower than the machine's and a Pixel 7 viewport: first contentful paint, when the interface is drawn, when the map settles, and from a click until the sheet is open, a layer is on and Settings is open, each until a frame has followed. It runs the two builds in turn on one machine, swapping which goes first each round, and prints each measure's median and range. Basemap styles and tiles come from the browser tests' mocks, so the map's figure leaves the network and most of the engine's drawing out. Serve each build from its own checkout, on a port of its own, then compare them:

```bash
MAPCAIRN_E2E_PORT=<port> npm run start -w @mapcairn/web
npm run measure:speed -w @mapcairn/web -- --base <address> --change <address> --rounds 11
```

It finds the page by role, accessible name and `data-testid`, so the same command compares any two commits that keep them. The move of the interface to Lit (plan 0019) is measured with it against `193343e3`, the last commit in which nothing imports Lit.

## What was tried

Neither change below was kept.

1. **Engine preload.** The engine's `import("maplibre-gl")` starts in the map's mount effect, which runs only after the whole app has rendered, so the download and the first render run one after the other. `MapAdapterFactory` gained an optional `preload`, called at the top of the app's first render, so `maplibre-gl` downloaded while the chrome rendered. A first comparison, taken an hour apart on a shared machine, suggested observed LCP fell from 5.1 s to 3.7 s. Interleaved on one machine (main, change, main, change; 3 mobile runs each), it was 3.6 s (2.9 to 4.1) against 3.3 s (2.9 to 3.9) in the clean round. On the CI runner, performance was 39, 41 and 40 with the change against 33, 42 and 42 on `main`. The scores moved by a point or two either way, and TBT could not fall from starting a download earlier.
2. **Hydrating inside `startTransition`**, as React Router's default client entry does. FCP did not move, and mobile LCP (21.5 s) and TBT (7.9 s) were no better.

What is left is the engine itself, the first view's tiles and glyphs, and byte savings the audit overstates. A real gain would need a lighter engine, which is out of scope. Showing the tour card before the map has loaded was measured too, and moves only the desktop score by a few points ("The map page").

## The product page

Lighthouse CI audits `/`, the product page, and `/map` (`packages/web/lighthouserc.json`). The two have their own assertions: `/` must score 0.95 or more for performance and 1 for accessibility, best practices and SEO, each failing the run, and `/map` keeps a looser budget (the next section). The figures above are the map's.

### The page runs no framework script

The product page's mobile score was 65 on the preview build, three runs in CI and locally alike (largest contentful paint 5.9 s, first contentful paint 4.8 s, total blocking time near 0). Everything it needs to read is server-rendered HTML and CSS, but React Router still sent it about 640 KB of script (uncompressed, as the audit counts it): React, the map package's components, the Phosphor icons and the root and route modules, each listed in a `modulepreload` link.

Lighthouse's mobile score is simulated from one unthrottled trace. The simulation counts every request that was made before the trace's first paint, scripts included, whatever their priority, and replays them over the 1.6 Mbit/s link. So script that starts loading with the document delays the simulated first paint, though the real first paint waits for the stylesheets and font only. Moving the preload links to the end of the body only reordered them. Variants measured against the same production build, three mobile runs each:

| Variant                                            | Performance | First paint  | Largest paint |
| -------------------------------------------------- | ----------- | ------------ | ------------- |
| Scripts and preloads as shipped before             | 65, 65, 69  | 4.8 to 5.4 s | 5.1 to 5.9 s  |
| No font preload                                    | 64, 64, 64  | 5.7 s        | 5.9 s         |
| One merged stylesheet                              | 63, 66, 66  | 5.3 to 5.6 s | 5.6 to 6.5 s  |
| No `modulepreload` links, scripts still loaded     | 77, 79, 72  | 2.9 to 3.5 s | 4.5 to 5.6 s  |
| Scripts loaded after the page's `load` event       | 79, 88, 97  | 1.8 to 2.9 s | 2.3 to 4.6 s  |
| No script at all                                   | 98, 98, 98  | 1.7 s        | 2.0 s         |
| No script, one merged stylesheet                   | 99, 99, 99  | 1.2 s        | 2.0 s         |
| No script, one merged stylesheet, no favicon links | 99, 99, 99  | 1.2 s        | 1.8 s         |

The font preload and the stylesheet count did not move the score while the scripts were there, so they were left alone. Loading the scripts after the `load` event moved it by anything from 14 to 32 points between identical runs, because whether the download counts depends on how the trace's paint and load timestamps fall, so it is noise and not a fix.

What shipped is the "no script" row. The route's `handle` sets `scripts: "none"` (`app/scriptlessPage.ts`): `root.tsx` leaves out `<Scripts>` and `<ScrollRestoration>`, and React Router renders its `modulepreload` links from `<Scripts>`, so they go too. The page is plain anchors, native `details` and native radios, so nothing but the copy buttons needed script. Those are server-rendered `hidden`, and one fixed inline script (`app/copyCodeScript.ts`, allowed by its own SHA-256 in the content security policy) shows and wires them: it copies with the browser's clipboard and falls back to `execCommand("copy")`, shows the outcome on the button, and announces it in the page's own live regions. The score is 98, three runs in a row, with the audit's accessibility, best practices and SEO at 100. A page that reads without script had no use for the framework's script. A visitor with script loses nothing they could see: the copy buttons appear as soon as the document is parsed instead of after React hydrates. The page no longer installs the client error reporting (`entry.client.tsx`), so a script error on it is not reported; its only scripts are the two fixed ones.

What is left is bytes. The document is 64 KB, the eight stylesheets 49 KB and the font 47 KB, all uncompressed in the audit because the preview server sends them as they are. One merged stylesheet raises the score to 99 (measured by merging the eight in front of the build). 100 took two further changes together: the contour lines are 23 KB of the document, drawn twice (the hero motif and the closing strip, 11 KB of path data each), and with one merged stylesheet and no path data at all, the document at 38 KB, it scored 100 (first contentful paint 1.1 s, largest 1.8 s). Neither alone is enough: with the paths removed and the eight stylesheets kept it is 99 (FCP 1.5 s), with one stylesheet and the second copy of the contours removed and the rest as relative one-decimal coordinates (46 KB) it is 99, and merging only the five smallest stylesheets, with or without the paths, is 99. The audit's link allows six connections to one origin, so the number of files matters as much as their bytes. Neither half is a small change: the build splits CSS along its script chunks, which the map page shares, so one stylesheet for `/` means regrouping chunks the map depends on (a single stylesheet for the whole build would send the map's styles to the product page), and the contours are the page's picture, which cannot go without a design decision. So `/` stays at 98 and its budget is 0.95, an error, three points below the measured score.

Any new script on the page raises the same cost: a framework script put back on `/` takes the score back to the 60s, and the assertion fails the run.

### The documentation site

Lighthouse CI also audits two documentation pages, a guide and an API page (`sites/docs/lighthouserc.json`), served from the build as the Worker serves it. Three runs each: performance 95, accessibility 100, best practices 100 and SEO 100 on both (largest contentful paint 2.8 to 2.9 s, total blocking time 70 to 110 ms), where best practices had been 96 because every page asked for `/favicon.svg`, which the documentation site did not serve (a 404 in the console). The file is now in `sites/docs/static`, and the build check fails when a built page links a file that was not built, icons and stylesheets included, not only anchors.

Accessibility, best practices and SEO are asserted at 1 and fail the run. Performance is asserted at 0.95 and only warns: CI measures 79 to 93 (total blocking time of 150 to 540 ms, which moves with the runner's load), where the local server measures 95, so a warning there is not a regression by itself. What holds it is the Docusaurus runtime, about 270 KB of gzip script that the page needs to navigate, search and switch theme. With every script removed from a guide page the score is 98, not 100 (first contentful paint 1.8 s), so the runtime is not the only cost. A documentation site that is fast without its runtime would be a different site, so the budget stays where it is and the score is not forced.

### The map page

On `/map`: mobile 55 to 71 locally and 38 to 44 in CI, desktop 90 to 91. The same build moved from 59 to 69 on one machine under load (total blocking time 160 to 370 ms), so a difference between two builds in CI is noise. Preloading the basemap style, a merged stylesheet, the font preload and removing the preloads did not separate from it.

Measured for #385 against the production build served as CI serves it, Lighthouse 13.4.1, mobile preset, 3 runs on `main`: performance 57 (49 to 59 over the runs, the low one a cold first run), first contentful paint 6.2 to 7.7 s, largest contentful paint 17.7 s, total blocking time 60 to 70 ms, layout shift 0, the other three categories 100. Desktop, 3 runs: 77, 77 and 80, largest contentful paint 3.1 to 3.2 s.

What the mobile score is made of: layout shift (25%) and total blocking time (30%) score full marks, first contentful paint (10%) and largest contentful paint (25%) score 0, and speed index (10%) scores 0.24. First contentful paint is 7.7 s in the simulation though it is 73 ms as observed, because the simulation counts every script and stylesheet requested before the first paint (about 1 MB, uncompressed as the audit counts it) over the 1.6 Mbit/s link, the same effect as on the product page. The largest contentful paint element is the welcome card's paragraph.

**Showing the welcome card before the map's first `idle`.** An upper bound: the card shown as soon as there is no engine error, without waiting for the map to stop loading (only `map.loading` dropped from the card's condition in `AppChrome`), interleaved with `main`, three pairs each:

| State                             | Mobile performance | Mobile LCP | Desktop performance | Desktop LCP  |
| --------------------------------- | ------------------ | ---------- | ------------------- | ------------ |
| `main`, card after the first idle | 57 (49 to 59)      | 17.7 s     | 77 to 81            | 3.0 to 3.2 s |
| Card shown without waiting        | 57 (57 to 60)      | 14.1 s     | 81 to 84            | 2.3 to 2.5 s |

On mobile the score does not move, because both metrics stay at 0: the card cannot paint before the scripts that render it have arrived over the throttled link, and that is most of 14 s. On desktop the score rises by about three points, and the two ranges touch at 81. That is too thin to decide on, and the change was not kept for a reason that holds whatever the numbers: the first moment the app knows that WebGL is missing is after the engine's code has loaded and its constructor has thrown. A card shown on "no error yet" would be announced and drawn on such a device, then withdrawn when `MapUnavailable` takes its place, which breaks plan 0004's rule in practice and announces the card for nothing. A gate that is safe needs a signal that the engine has started and its style has loaded. The map context does not expose one (`adapter` and `loaded` arrive when the basemap's own sources are in), so keeping it means a new event on the `MapAdapter` port, its fake, the contract suite and the public API, for about three points on desktop. The rule stands.

**Fewer glyph ranges or a smaller sprite.** The first view asked for 10 Noto Sans Regular ranges in these runs (Latin, Greek, Cyrillic, Georgian, Ethiopic, punctuation and presentation forms, about 450 KB) and the 2x sprite (119 KB, because the audit emulates a high pixel ratio). The ranges come from the basemap's own labels: the symbol layers' `text-field` is `name:latin` and `name:nonlatin`, so every script that has a label at the world view needs its range. Leaving ranges out changes which labels draw, a smaller sprite or a 1x pixel ratio blurs the icons, and `localIdeographFontFamily` serves CJK only, which is not among them. All of that changes what visitors see, which the ground rules rule out. It would also gain nothing: the whole of the tiles, glyphs and sprite is the 3.6 s that showing the card without waiting removed from the largest contentful paint, and that moved no score. The remaining mobile score is bounded by the script before the first paint.

## Decided not to do

- Show the tour card before the map has loaded. Measured, it lifts the mobile score by nothing and the desktop score by about three points, and it needs a new engine-started signal on the port to avoid showing the card on a device without WebGL ("The map page").
- Ask the first view for fewer glyph ranges or a smaller sprite. It changes the basemap's labels or icons and, measured, would not move the score.
- Change the compression, protocol or throttling of the audit server. That would change the audit, not the site.
- `modulepreload` the MapLibre chunk in the head. It competes with the first chunks for bandwidth before the first paint (see the comment in `vite.config.ts`).
- Lazy-load the error page. It saves under 2 KB, and an error page that has to load more code can fail when the network has.
- Split the sheet's panels into chunks loaded on first open. The saving is mainly bytes, which the audit overstates, and opening a panel would then wait on the network.
- Move or remove the script preloads on `/map`. The score did not move, and the map is the page.
- Raise the CI performance threshold on `/map`. Its assertion stays a warning at 0.95, and the scores stay far below it, which the engine and tiles make out of reach without tricks.
- Start a page's scripts after its first paint to hide their cost from the audit. Whether the download counts depends on how the trace's timestamps fall, so the score moves by tens of points between identical runs and the page is no faster for a visitor.
