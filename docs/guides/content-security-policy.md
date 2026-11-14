# A content security policy for a host

What a page that embeds the SDK must allow in its Content Security Policy, and why. The map engine, MapLibre GL JS, loads styles, tiles and images from the origins its definitions name, fetches its label glyphs like other data, and runs a worker; a host's own adapters fetch from the providers its definitions name. A strict policy must allow every one of those origins and still let the engine work.

The reference host is the worked example. Its policy is `packages/web/public/_headers` for responses served straight from static assets, and `packages/web/src/constants/securityHeaders.ts` for everything else; a test keeps the two in step. The architecture behind the adapter is in [`ARCHITECTURE.md`](../../ARCHITECTURE.md) ("The map adapter"), and adding the basemaps, layers and adapters a policy names is in [`extending.md`](extending.md).

## The shape of the policy

The reference host sends one strict policy on every response, in two copies: the static one in `_headers` for the responses served straight from assets, and a per-request one with a nonce added for the pages it renders (`entry.server.tsx`). Development relaxes `style-src` and `connect-src` (see below). The directives:

- `default-src 'self'`, so anything not named below falls back to the site's own origin and fails closed.
- `script-src`, `style-src 'self'`, `img-src`, `font-src 'self'`, `connect-src` and `worker-src`, covered one by one below.
- `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'` and `frame-ancestors 'none'`, the closing set.

Two of the closing set carry a detail worth copying. `frame-src 'none'` is written out, not inherited, so it does not fall back to `child-src`, which also governs workers (`securityHeaders.ts`). And the worker section of the policy is not idle: a worker script enforces the Content Security Policy of its own response, so the origin lists below reach the engine's fetching inside the worker too.

Besides the policy itself the host sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a referrer policy, a Permissions-Policy that keeps camera and microphone off and geolocation on the same origin, `Strict-Transport-Security: max-age=31536000; includeSubDomains` and the cross-origin headers (`_headers`). The policy sets neither `upgrade-insecure-requests` nor a reporting directive, and no file in the repository records a decision about either.

## script-src

Three kinds of source, each for a reason:

- `'self'`, for the app's own scripts, which the build emits as files.
- One exact `sha256-` hash, for the single inline script the host runs: the theme bootstrap, which sets the theme before the page hydrates so it does not flash (`root.tsx`, source in `src/app/themeBootstrap.ts`). Its hash is written into both copies of the policy, and a test recomputes it whenever the script's source changes (`securityHeaders.ts`). Any other inline script needs its own hash or a nonce; production permits no `'unsafe-inline'`.
- The script origin of any third-party script the host chooses to run. The reference host allows only its analytics beacon's script origin; a host without analytics has no entry for a third-party script.

In development the policy is relaxed in `style-src` and `connect-src` by the `development` option of `buildContentSecurityPolicy`, because the Vite dev server injects its own styles and opens a hot-reload socket. Production never sets it (`securityHeaders.ts`).

## style-src

`'self'` only, in production. Everything the page styles with comes from files the build emits: the app's stylesheets and the token stylesheet are module imports, and the adapter imports the engine's stylesheet, `maplibre-gl.css`, beside the engine (`MapLibreMapAdapter.ts`).

Without `'unsafe-inline'`, two things a host might otherwise reach for are blocked: a `<style>` element and a `style=""` attribute written into markup. Styling through the CSS object model still works. The adapter sizes the hidden container it builds an image-export map in by assigning to `element.style`, which the production policy allows, unlike a `style` attribute (`imageExport.ts`).

The SDK keeps style attributes out of server-rendered markup for this reason, and its tests require it: the map host, the chrome, the sheet, the readout and the served pages are each asserted to render none (`MapView.tsx`, `MapChrome.test.tsx`, `Sheet.test.tsx`, `MapReadout.test.tsx` and `ChromeSkeleton.test.tsx` in `packages/map`; `root.test.tsx`, `home.test.tsx` and the e2e `design.spec.ts` in `packages/web`). The one React style prop in the SDK, the fill custom property of the slider track (`Slider.tsx`), reaches the page only in the browser: the sections that hold it are not server-rendered, and the server sends a decorative skeleton in their place (`home.test.tsx`). How React applies a style prop in the browser was not checked.

## img-src

`'self'`, then `data:`, then `blob:`, then one origin per tile provider the host serves. The reference policy lists the tile hosts of its basemaps here, and its definition loop test requires a tile layer's origin in `img-src` as well as in `connect-src` and names the file to add it to (`layers.test.ts`). The repository does not say why the engine needs both, so treat both lists as required.

The two URL schemes are for the engine's own image handling: it decodes some images from data URLs and loads others from blob object URLs it creates itself. Both uses are in the engine's source, not in this repository's files, and they were not checked in a running browser; a host that trims them should watch its console for a report saying an image was refused.

Leave a tile origin out of `img-src` and those tiles do not load. That consequence was reasoned from the policy, not checked in a browser; the loop test requires the origin in this list and in `connect-src` and names the files to add it to (`layers.test.ts`).

## font-src

`'self'`, because the host serves its own type. The design tokens name IBM Plex Sans Variable, which the host bundles from its font package; the reference host preloads the Latin face from the same file its stylesheet names (`fontPreload.ts`). Map labels need no entry here: a label is drawn from glyph ranges the style's glyph server serves, which are fetched like other data, so the glyph host's origin goes in `connect-src`. The adapter draws labels only when the loaded style has a glyph source and a literal font stack, so a raster basemap asks for none (`MapLibreMapAdapter.ts`). A host that loads a font from a provider's origin adds that origin here.

Leave a font origin out and its font does not load, so the type falls back to the system font (`extending.md`).

## connect-src

`'self'`, then every origin anyone fetches from:

- Each tile origin, again: the reference host's loop test requires a tile origin in `connect-src` as well as `img-src` (`layers.test.ts`). The engine fetches inside its worker, whose policy is its own response's, so the same list has to cover the fetches as well as the image loads. Leave an origin out and the requests it carries are refused; reasoned from the policy, not checked in a browser.
- Each basemap's style hosts: a vector style URL is fetched, and a style brings its sprites, glyphs and terrain from hosts of its own. When you add a basemap, read the style and its tile sets for every host it requests and allow each in `connect-src` (`extending.md`). Leave a style's own host out and that basemap does not load: the adapter treats a style document that failed as a failed mount or basemap swap (`MapLibreMapAdapter.ts`).
- Each layer's feed, detail and identify origins (`layers.test.ts`).
- The origins of the host's own adapters: place search, suggestions and routing. The reference host allows one origin per adapter (`securityHeaders.ts`).
- The origins of any analytics the host runs. The reference host allows its analytics' two connect origins beside its script origin (`securityHeaders.ts`).

The reference host's list also includes the content delivery network one of its layer definitions serves its data file from (`world-countries.ts`). Every origin in the policy is named by something the host offers: a definition, an adapter or the analytics it chose. Nothing is allowed "in case".

## worker-src

`'self' blob:`, for the engine's worker. MapLibre runs its work in a web worker. The adapter points the engine at a worker file the build emits as a self-contained same-origin asset, so `'self'` covers it, including on iOS; the engine is told the worker's URL before any map exists, because without that it finds no worker inside a bundle and the map stays blank (`MapLibreMapAdapter.ts`). The `blob:` entry is kept because the engine can also start a worker from a blob URL, for example when the worker file is not on the page's origin; this path is in the engine's source and was not checked in a running browser.

The subtle part is caching. A worker script takes its policy from its own response, and the worker file is cached as immutable, so a copy fetched before the policy changed would keep enforcing the old one for as long as it is cached. The reference host adds a short cache key, derived from the policy, to the worker URL, so every policy change is a new address and no device is left on a stale policy (`workerCacheKey.ts`). A host building its own adapter should keep the worker same-origin and do the same.

Leave `worker-src` out and the engine's worker never loads, which the adapter treats as fatal, so the map stays blank (`MapLibreMapAdapter.ts`). Reasoned from the adapter's code, not checked in a browser.

## The nonce question

A host that server-renders React has inline scripts it cannot hash: the streaming and hydration scripts React injects change with every request. The reference host makes one nonce per request, adds it to `script-src` beside the static hash, passes it to the streaming renderer and to the router, so both reach the scripts they inject themselves, and sets the built policy on the response before rendering (`entry.server.tsx`). A nonce is 16 cryptographically random bytes, base64-encoded, and a fresh one is made for every response (`securityHeaders.ts`).

A host that renders only in the browser needs no nonce. Its scripts are all files under `'self'`, and its one fixed inline script, if it has one, is covered by a hash.

## Building the policy from your definitions

Work from what the host offers, in this order:

1. Start from the shape above: `default-src 'self'`, the closing set, and `'self'` in every list.
2. Add the hash or nonce your inline scripts need.
3. For each basemap: its tile origin in `img-src` and `connect-src`, and every host its style requests in `connect-src`.
4. For each layer: its tile origin in `img-src` and `connect-src`, and its feed, detail and identify origins in `connect-src`.
5. For each adapter: its origin in `connect-src`.
6. Keep the policy in the two places it is served from, and keep them in step with a test, as the reference host does (`securityHeaders.ts`).

Then test it. The reference host's loop test checks its own definitions against its own policy (`layers.test.ts`); a host's check is the host's own, and a host needs a test that its policy lists the origins its definitions request ([`serving-layers.md`](serving-layers.md)). Last, load the page with the browser console open: a policy that misses an origin says so there, with the directive to add it to.

## What this guide does not say

It was written from the repository's own files, named beside each claim above, and from the engine's source for the engine's internal behaviour it names: the `data:` and `blob:` image loads, the blob worker, and the fetching done inside the worker, glyph ranges included. The sentences about what breaks when a directive is missing were reasoned from the adapter's code and the tests, not checked in a browser. No page was loaded under a policy while writing it, and none of the origin lists is reproduced here: read your own policy from your own files.
