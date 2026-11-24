---

title: Serving MapCairn from IIS
sidebar_label: Serve from IIS
description: Serve a MapCairn build, or a page that hosts the SDK, from IIS with the right headers.
---

# Serving the SDK from IIS and server-rendered pages

Put a MapCairn map in a page that IIS serves, with no Node on the server, including a page the server renders for each request, such as a Razor page. The policy a page needs is in [Content Security Policy](content-security-policy.md), and the app side of embedding is in [Extending MapCairn](extending.md#embed-the-sdk-in-an-app-of-your-own).

**What was checked.** This guide was written on a machine with no Windows, IIS or ASP.NET. Every IIS and ASP.NET claim was checked against the Microsoft Learn page linked beside it, and none was run, so the `web.config` and Razor samples have not been loaded by a server. The build claims were checked by running the build. A claim without a link and without a file named beside it is a recommendation, not a finding. "What was not tested" at the end lists the open points.

## What exists today

There is no prebuilt bundle and no `mountMap` function for a page without React ([#44](https://github.com/MapCairn/mapcairn/issues/44)). A page builds a small entry of its own that imports the SDK packages and calls React's `createRoot`, as [`examples/embed`](https://github.com/MapCairn/mapcairn/blob/main/examples/embed/README.md) does.

An app that builds its own entry installs `@mapcairn/sdk`, which holds the whole SDK. A real map needs the adapter, `@mapcairn/adapter-maplibre` (also at `@mapcairn/sdk/adapter-maplibre`), with `maplibre-gl` and a URL for the engine's worker that your server serves; [Show a real map](extending.md#show-a-real-map) has the steps. `examples/embed` runs on the SDK's fakes and draws no map.

The packages are ESM only. `@mapcairn/theme/tokens.css` and `@mapcairn/map/styles.css` are plain CSS files, so no vanilla-extract plugin is needed, and React 19 and `react-dom` are peer dependencies of `@mapcairn/map`.

## Build the bundle

Any bundler that follows the `exports` map and handles a CSS import works; `examples/embed` uses Vite, and this guide covers only that. Build once on a machine that has Node and copy the output to the server.

The entry file below follows `examples/embed/src/main.tsx`, but mounts into an element the Razor page provides, not `#root`. [Extending MapCairn](extending.md#embed-the-sdk-in-an-app-of-your-own) lists the base styles a page sets itself.

```tsx no-check
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@mapcairn/theme/tokens.css";
import "@mapcairn/map/styles.css";
import { createRoot } from "react-dom/client";
import { MapApp } from "./MapApp";

const container = document.getElementById("map-root");
if (container) {
  createRoot(container).render(<MapApp />);
}
```

`MapApp` is your component. It holds what `extending.md` says an app provides: `ServicesProvider`, `LiveRegionProvider` and `TooltipProvider` around `MapView`, `FocusRegistryProvider` around `MapChrome`, and services of your own in place of `createFakeServices()` (the [README](https://github.com/MapCairn/mapcairn/blob/main/README.md#embed-a-map) has the setup). The map adapter you write also loads the engine's stylesheet: the reference adapter imports `maplibre-gl/dist/maplibre-gl.css`. Use `createRoot`, not `hydrateRoot`: the server sends an empty element, so there is nothing to hydrate.

### What the build emits

A production Vite 8.3.8 build of `examples/embed` wrote one HTML file and, under `assets`, one JavaScript file, one CSS file and six `.woff2` fonts, each with a hash in its name. A scratch build of an entry that imports MapLibre GL JS 6.18.0 and its worker with `?worker&url`, as the reference host's adapter does, added the worker as another `.js` file and no `.wasm`.

Serve `.js`, `.css` and `.woff2`, and `.map` if you enable source maps. Glyphs, sprites and tiles come from the origins your basemaps and layers name, so they need no IIS settings of yours.

### Put the output under the web root

Vite writes absolute URLs from `/`. If the map lives in a sub-application or virtual directory, set Vite's `base` option or pass `--base=/maps/`: a build with `--base=/maps/` wrote `/maps/assets/index-Cczki1Ig.js` into its HTML.

A Razor page needs the hashed file names. With `build.manifest` on, Vite writes `manifest.json` in a `.vite` folder inside the output folder. For `examples/embed`, the `index.html` entry in it holds `file` (the JavaScript), `css` (the stylesheets) and `assets` (the fonts). A build step or a small helper in your project reads those names and writes them into the page; the C# for that was not written or run. If you cannot read the manifest, serve fixed file names and revalidate them instead (see "Cache lifetimes").

## Serve the files from IIS

This section is for IIS serving the files itself, as in classic ASP.NET MVC and static files in a plain site. For ASP.NET Core, read "ASP.NET Core" below first.

A `web.config` can appear at the site, application, virtual directory or physical path level, and its settings override the server defaults ([introduction to `applicationHost.config`](https://learn.microsoft.com/en-us/iis/get-started/planning-your-iis-architecture/introduction-to-applicationhostconfig)). Most IIS sections are locked by default, and an administrator allows one to be overridden with a `location` element and `overrideMode="Allow"`. If a setting in a `web.config` has no effect or the site reports a configuration lock, ask the server's administrator to allow the section.

### Media types

IIS returns only the file types listed in `staticContent` ([`mimeMap`](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/staticcontent/mimemap/)), and each extension must be unique. Request each file type and look at the status and `Content-Type`, or open MIME Types in IIS Manager, and add only the ones that are missing:

```xml
<configuration>
  <system.webServer>
    <staticContent>
      <remove fileExtension=".js" />
      <mimeMap fileExtension=".js" mimeType="text/javascript" />
      <remove fileExtension=".woff2" />
      <mimeMap fileExtension=".woff2" mimeType="font/woff2" />
    </staticContent>
  </system.webServer>
</configuration>
```

Each `remove` comes before its `mimeMap`: two entries for one extension make IIS reject the whole configuration file with a "duplicate collection entry" error (general IIS knowledge; the `mimeMap` page does not say this). Add `.css` as `text/css` and `.map` as `application/json` the same way if they are missing. `.js` matters most, because a browser refuses a module script whose `Content-Type` is not a JavaScript type.

### Compression

Static compression is on by default ([`urlCompression`](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/urlcompression/): `doStaticCompression` is true), and so is dynamic compression in IIS 7.5 and later. Leave both on: turning dynamic compression off would also stop compression of the Razor page. The compression role service must be installed on the server ([`httpCompression`](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/httpcompression/) lists the steps). The default static types include `text/*` and `application/javascript`, so scripts and stylesheets are covered. The default list does not include `application/json`, so a JSON file is not compressed unless you add it.

### Cache lifetimes

A file with a hash in its name never changes, so it can be cached for a year, and a page that names new hashes after each deploy then reaches people at once. Do not cache the Razor page itself this way.

[`clientCache`](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/staticcontent/clientcache/) adds `Cache-Control: max-age=<n>` when `cacheControlMode` is `UseMaxAge`, and `cacheControlMaxAge` takes a time span (its default, one day, is `1.00:00:00`). Put it in a `web.config` inside the folder that holds the hashed files, so it does not reach anything else. This sample is a whole file; the other XML samples are fragments to put inside the `system.webServer` element of a `web.config` you already have:

```xml
<configuration>
  <system.webServer>
    <staticContent>
      <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="365.00:00:00" />
    </staticContent>
  </system.webServer>
</configuration>
```

`cacheControlCustom` holds custom directives, which is where `immutable` would go. The page does not say how it combines with `max-age`, so request one file after you set it and read the header. The folder rule also covers the map's worker script if it sits in the same folder, and a year-long lifetime on that file affects the policy: see the worker point under "Content security policy".

The reference host sends `Cache-Control: public, max-age=31536000, immutable` for its hashed `/assets/*` files (`packages/web/public/_headers`). If you serve fixed names instead, use `DisableCache`, which adds `Cache-Control: no-cache`; `setEtag` defaults to true, so the browser can revalidate with the ETag.

### Response headers

[`customHeaders`](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/httpprotocol/customheaders/) adds a header to every response the site sends, not only the page. That matters for the Content Security Policy, because the map's worker script enforces the policy of its own response. The server's default configuration also adds `X-Powered-By`.

## ASP.NET Core

An ASP.NET Core app hosted in IIS has every request, static files included, forwarded to the app by the ASP.NET Core Module, and the IIS static file handler is not used ([static files](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/static-files)). So the `mimeMap` and `clientCache` settings above do not decide how this app's files are served. The app does:

- Put the build output in `wwwroot`, the default web root. `MapStaticAssets` (.NET 9 or later) or `UseStaticFiles` (.NET 8 or earlier) serves it.
- With `UseStaticFiles`, add a missing media type with a `FileExtensionContentTypeProvider` set as the `ContentTypeProvider` of the `StaticFileOptions` passed to `app.UseStaticFiles(new StaticFileOptions { ... })`, using `provider.Mappings[".ext"] = "type"`. Set the mappings once at startup.
- With `UseStaticFiles`, set `Cache-Control` for the hashed files in the `OnPrepareResponse` option of the same `StaticFileOptions`, by appending the header to the response.
- `MapStaticAssets` takes neither option. It works from metadata captured at build time for compression, caching and fingerprinting, and sets `ETag`, `Last-Modified` and `Content-Type` for the assets it knows, with `immutable` for fingerprinted ones. How it treats a file your own Vite build puts in `wwwroot` was not checked, so read the response headers there.

## Content security policy

[Content Security Policy](content-security-policy.md) is the reference: which directives the map needs and why. `buildContentSecurityPolicy` in `examples/embed/src/contentSecurityPolicy.ts` builds the header from the basemaps and layers your page offers. Send the result with `customHeaders`, replacing the elided value with the string the function returns:

```xml
<system.webServer>
  <httpProtocol>
    <customHeaders>
      <add name="Content-Security-Policy" value="default-src 'self'; ..." />
    </customHeaders>
  </httpProtocol>
</system.webServer>
```

For ASP.NET Core, set the header in your own middleware instead.

Avoid inline scripts, and then no nonce is needed:

- Pass the map's settings as data attributes on the container element (`data-lat`, `data-lng` and `data-zoom`, say) or fetch them as JSON from an endpoint of your own, and read them in the entry file. Razor writes attributes without any script.
- The one inline script the SDK offers is the optional theme bootstrap, which sets the theme and, if asked, `lang` and `dir` before first paint. `buildThemeBootstrapScript` from `@mapcairn/core` returns its text, so write it to a file at build time and load it from `'self'`. Run in Node beside the build, this wrote a 999 character file that passes `node --check`:

```js
import { writeFileSync } from "node:fs";
import { buildThemeBootstrapScript } from "@mapcairn/core";

writeFileSync("theme-bootstrap.js", buildThemeBootstrapScript());
```

Load the file from the head with a plain `<script src="/maps/theme-bootstrap.js"></script>` (no `async`, no `type="module"`), so it runs before the page paints, and copy it to the web root with the rest. Putting the text inline instead needs a `sha256-` hash of the exact string in `script-src`, which breaks whenever the string changes (see "script-src" in the policy guide).

Two points from the policy guide apply on IIS:

- The worker takes its policy from its own response, and a hashed file is cached for a year, so a worker fetched before a policy change keeps the old policy. The reference host puts a key derived from the policy in the worker's URL (`packages/web/src/constants/workerCacheKey.ts`). With `customHeaders` applying to every response, do the same, or keep the worker's cache lifetime short.
- `buildContentSecurityPolicy` throws on a definition URL that is not `https`, so serve the page over HTTPS. A tile, feed or identify provider on another origin has to send `Access-Control-Allow-Origin` ([Serving layers to MapCairn](serving-layers.md)).

## A server-rendered page

The SDK's chrome renders on a server (`scripts/release/consumer/plain.mjs` calls `renderToString`, and `entryWorker.tsx` beside it calls `renderToReadableStream`, in Node or a Worker, on the SDK's fakes), but neither runs on IIS without Node, and MapLibre needs a browser, so the map is drawn on the client whatever the server does. A Razor page therefore serves a static shell: it names the stylesheets and the script, and the script mounts the app into an empty element. Nothing needs a Node process at request time.

### A minimal page

This Razor Pages sample is not tested. It uses `@page`, a layout and sections as the [layout page](https://learn.microsoft.com/en-us/aspnet/core/mvc/views/layout) describes. In the layout, add a styles section to the head and keep the scripts section at the end of the body:

```cshtml
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>@ViewData["Title"]</title>
  @RenderSection("Styles", required: false)
</head>
<body>
  @RenderBody()
  @RenderSection("Scripts", required: false)
</body>
```

In the page, with the hashed names from the manifest in place of the example ones:

```cshtml
@page
@{
    ViewData["Title"] = "Map";
}
@section Styles {
  <link rel="stylesheet" href="/maps/assets/index-CE3Pe79b.css" />
}
<div id="map-root" data-lat="-33.92" data-lng="18.42" data-zoom="11"></div>
@section Scripts {
  <script type="module" src="/maps/assets/index-Cczki1Ig.js"></script>
}
```

A stock layout may load Bootstrap and jQuery from `ajax.aspnetcdn.com`, which a policy of `default-src 'self'` blocks, so give it its own copies on your origin or allow that origin. Classic ASP.NET MVC follows the same shape, a view with a layout. Link the SDK's built files as they are: do not pass them through a bundler that minifies or reorders them again.

### Page styles

The SDK ships no base stylesheet, so the page gives `html`, `body` and the container a height and removes the body margin ([Extending MapCairn](extending.md#embed-the-sdk-in-an-app-of-your-own)).

An existing site stylesheet is a risk. The SDK's primitives sit in a cascade layer, so an unlayered rule in the page, such as a framework's `button` rule or a reset, beats them whatever its specificity or position ([Overriding a primitive](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#overriding-a-primitive)). Put the page's own base styles in an `@layer` declared before `@mapcairn/map/styles.css`. For a stylesheet you cannot edit, CSS can import a file into a named layer (`@import url("site.css") layer(base);`), which was not tried here. Check the buttons and the focus outline in a browser after you add the map to an old page.

### Language and direction

Set `lang` and `dir` on `<html>` in the Razor layout from the page's language, for example `<html lang="en-GB" dir="ltr">`, as the [translation guide](translate-the-sdk.md) says. `data-fixed-language` on `<html>` matters only if the theme bootstrap script is given a list of offered languages (`buildThemeBootstrapScript(offeredLanguages)`): that script then sets `lang` and `dir` from a stored choice unless the attribute is present. The call shown above passes none, so its script never touches `lang` or `dir` (`packages/core/src/theme/themeBootstrap.ts`).

### Layers, login and what stays on the server

A feed or query layer's request carries no cookies and no referrer ([Serving layers to MapCairn](serving-layers.md)), so a layer endpoint that needs the signed-in user's cookie does not work yet. The request policy that would allow it is [#195](https://github.com/MapCairn/mapcairn/issues/195), and the wider case of a host behind a login is [#45](https://github.com/MapCairn/mapcairn/issues/45). A layer catalogue that follows the user's rights is possible: `createRuntimeLayerCatalogue` loads the catalogue from a function you write, which can call your own endpoint ([Extending MapCairn](extending.md#supply-layers-at-runtime)). Serve data the user may see from endpoints that need no cookie, or wait for #195.

Spatial queries and reports stay on your server. The optional `FeatureQuery` and `RoutingProvider` ports, and the map adapter's image export, are where a server plugs in ([`ARCHITECTURE.md`](https://github.com/MapCairn/mapcairn/blob/main/ARCHITECTURE.md), "Ports"); the SDK ships no `FeatureQuery`.

### Browsers without WebGL

MapLibre needs WebGL. When it is missing, an adapter rejects with a `MapEngineError` whose reason is `webgl-unavailable` (`packages/core/src/ports/errors.ts`). The message catalogue has the text (`app.webgl.title` and `app.webgl.advice` in `packages/core/src/messages/en-GB.ts`), but the screen that shows it is in the reference host, so your app shows the message itself.

## What was not tested

- Nothing ran on IIS, IIS Express, ASP.NET Core or classic ASP.NET. The `web.config` and Razor samples, the section lock behaviour, the effect of `cacheControlCustom` and the response headers were not observed.
- No page loaded the real map, a layer endpoint or the policy, and no page used a mount function, because [#44](https://github.com/MapCairn/mapcairn/issues/44) does not exist yet.
- Mounting in a server-rendered view is not covered: keeping the container outside any region a partial postback replaces, and destroying the map when the page unloads.
- Range requests for a single-file tile archive ([#192](https://github.com/MapCairn/mapcairn/issues/192)), which the issue asks this guide to cover. [#221](https://github.com/MapCairn/mapcairn/issues/221) stays open for this and for the server trial.
- Whether the `@import ... layer()` form fixes a framework's rules, and whether `immutable` can be sent from `clientCache`.

When you try this on a server, record what failed and how you fixed it, and send it back as a change to this guide.
