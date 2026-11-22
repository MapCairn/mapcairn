---

title: Serving MapCairn from IIS
sidebar_label: Serve from IIS
description: Serve a MapCairn build, or a page that hosts the SDK, from IIS with the right headers.
---

# Serving the SDK from IIS and server-rendered pages

This page is for a developer at a company that runs IIS, and possibly ASP.NET Core or classic ASP.NET MVC, with no Node on the server. By the end you will have a MapCairn map in a page that a Windows web server serves, including a page the server renders for each request, such as a Razor page. The architecture behind the SDK is in [ARCHITECTURE.md](https://github.com/MapCairn/mapcairn/blob/main/ARCHITECTURE.md), the policy a page needs is in [Content Security Policy](content-security-policy.md), and the app side of embedding is in [Extending MapCairn](extending.md#embed-the-sdk-in-an-app-of-your-own).

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository.

**What was checked.** This guide was written on 2026-11-20 on a machine with no Windows, IIS or ASP.NET. Every IIS and ASP.NET claim was checked against the Microsoft Learn page linked beside it, and none was run. The `web.config` and Razor samples are taken from those pages' shapes and were not loaded by a server. The build claims were checked by running the build, as "What was tested" says. A claim without a link and without a file named beside it is a recommendation, not a finding.

## What exists today

One thing a page needs is not built yet:

- There is no prebuilt bundle and no `mountMap` function for a page without React ([#44](https://github.com/MapCairn/mapcairn/issues/44)). A page builds a small entry of its own that imports the SDK packages and calls React's `createRoot`, as [`examples/embed`](https://github.com/MapCairn/mapcairn/blob/main/examples/embed/README.md) does.

An app that builds its own entry installs `@mapcairn/sdk`, which holds the whole SDK; the individual packages that the samples below name are the advanced option, for a host that wants fewer dependencies, and the umbrella re-exports them. The map adapter is a package, `@mapcairn/adapter-maplibre`, also at `@mapcairn/sdk/adapter-maplibre`. A real map needs it, with `maplibre-gl` and a URL for the engine's worker that your server serves; [Show a real map](extending.md#show-a-real-map) has the steps. `examples/embed` runs on the SDK's fakes and draws no map.

What the SDK packages ship, from their manifests:

- ESM only: each sets `"type": "module"` and exports `dist` files. The `@mapcairn/source` condition in the exports points at TypeScript source and is for this repository's own tools; an app does not turn it on.
- `@mapcairn/theme/tokens.css` and `@mapcairn/map/styles.css` are plain CSS files in the `exports` map. No vanilla-extract plugin is needed, and the JavaScript imports no CSS itself.
- React 19 and `react-dom` are peer dependencies of `@mapcairn/map`.

## Build the bundle

Any bundler that follows the `exports` map and handles a CSS import works; `examples/embed` uses Vite, and this guide covers only that. Build it once on a machine that has Node, and copy the output to the server. The server never needs Node.

The entry file below follows `examples/embed/src/main.tsx` in its imports and differs from it in where it mounts: into an element the Razor page provides, not `#root`. It leaves out the example's `page.css`, its `StrictMode` wrapper and the code that sets the body's font and colours from `tokens`; [Extending MapCairn](extending.md#embed-the-sdk-in-an-app-of-your-own) lists the base styles a page sets itself.

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

`MapApp` is your component. It holds what `extending.md` says an app provides: `ServicesProvider`, `LiveRegionProvider` and `TooltipProvider` around `MapView`, `FocusRegistryProvider` around `MapChrome`, and services of your own in place of `createFakeServices()` (the [README](https://github.com/MapCairn/mapcairn/blob/main/README.md#embed-a-map) has the setup). The map adapter you write also loads the engine's stylesheet: the reference adapter imports `maplibre-gl/dist/maplibre-gl.css` beside the engine and has styles of its own in `packages/adapter-maplibre/src/styles.css.ts`, which `extending.md` names as the reference. Use `createRoot`, not `hydrateRoot`: the server sends an empty element, so there is nothing to hydrate.

### What the build emits

A production Vite 8.3.8 build of `examples/embed` wrote one HTML file and, under `assets`, one JavaScript file, one CSS file and six `.woff2` fonts, each with a hash in its name, such as `index-BQuCVsyb.js`. The six fonts are the subsets of the one font package that the example imports; a build of your entry with the font import above emits the same kind of files. A scratch build of an entry that imports MapLibre GL JS 6.18.0 and its worker with `?worker&url`, as the reference host's adapter does, added the worker as another `.js` file under `assets`, and no `.wasm`. Source maps are written only if you turn them on. Fonts come from the font package the example imports, `@fontsource-variable/ibm-plex-sans`.

The extensions to serve are therefore `.js`, `.css` and `.woff2`, and `.map` if you enable source maps. Glyphs, sprites and tiles are not built files: they come from the origins your basemaps and layers name, so they are served by those providers and need no IIS settings of yours.

### Put the output under the web root

Vite writes absolute URLs from `/`. If the map lives in a sub-application or virtual directory, set Vite's `base` option, or pass `--base=/maps/` on the command line. A build with `--base=/maps/` wrote `/maps/assets/index-Cczki1Ig.js` into its HTML, and the same output with the default base wrote `/assets/...`.

A Razor page needs the hashed file names. With `build.manifest` on, Vite writes a manifest file, named `manifest.json`, in a `.vite` folder inside the output folder. For `examples/embed`, the `index.html` entry in it holds `file` (the JavaScript), `css` (a list of stylesheets) and `assets` (the fonts the stylesheet loads). A build step or a small helper in your project reads those names and writes them into the page. The C# for that was not written or run here.

If you cannot read the manifest, serve fixed file names and revalidate them instead (see "Cache lifetimes").

## Serve the files from IIS

This section is for IIS serving the files itself, which is the case for classic ASP.NET MVC and for static files in a plain site. For ASP.NET Core, read "ASP.NET Core" below first.

A `web.config` can appear at the site, application, virtual directory or physical path level, and its settings override the server defaults ([introduction to `applicationHost.config`](https://learn.microsoft.com/en-us/iis/get-started/planning-your-iis-architecture/introduction-to-applicationhostconfig)). The same page says most IIS sections are locked by default and that an administrator unlocks one with a `location` element and `overrideMode="Allow"`. Which of the sections below are locked on your server was not checked: if a setting in a `web.config` has no effect or the site reports a configuration lock, ask the server's administrator to unlock the section.

### Media types

IIS returns only the file types listed in `staticContent` ([`mimeMap`](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/staticcontent/mimemap/)). The page requires each extension to be unique and does not give the list the server starts with, so this guide cannot say which of the extensions above your server lacks. Request each one and look at the status and `Content-Type`, or open MIME Types in IIS Manager, and add only the ones that are missing:

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

Each `remove` comes before its `mimeMap`. Two entries for one extension make IIS reject the whole configuration file (general IIS knowledge, a "duplicate collection entry" error on a type a parent configuration already defines; the `mimeMap` page does not say this), and a `remove` for an extension that is not defined is, to the best of this guide's knowledge, harmless. That was not observed. Add `.css` as `text/css` and `.map` as `application/json` the same way if they are missing. A module script is refused by the browser when its `Content-Type` is not a JavaScript type, which is why `.js` matters most.

### Compression

Static compression is on by default: the [`urlCompression`](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/urlcompression/) page gives `doStaticCompression` a default of true, so the site needs no setting for it. The same page says dynamic compression, which `doDynamicCompression` controls, is on by default in IIS 7.5 and later (IIS 7.0 left it off because of processor use); turning it off would also stop compression of the Razor page itself, so this guide leaves it alone. The compression role service must be installed on the server ([`httpCompression`](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/httpcompression/) lists the steps). The server's default static types include `text/*` and `application/javascript`, so scripts and stylesheets served as `text/javascript` and `text/css` are covered without a change. That page's default list does not include `application/json`, so a JSON file you serve is not compressed unless you add it, and this guide does not edit `httpCompression`.

### Cache lifetimes

A file with a hash in its name never changes, so it can be cached for a year; a page that names new hashes after each deploy then reaches people at once. Do not cache the Razor page itself this way.

[`clientCache`](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/staticcontent/clientcache/) adds `Cache-Control: max-age=<n>` when `cacheControlMode` is `UseMaxAge`, and its `cacheControlMaxAge` takes a time span (its default, one day, is written `1.00:00:00`). Put it in a `web.config` inside the folder that holds the hashed files, so it does not reach anything else. This sample is a whole file; the earlier and later XML samples are fragments to put inside the `system.webServer` element of a `web.config` you already have:

```xml
<configuration>
  <system.webServer>
    <staticContent>
      <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="365.00:00:00" />
    </staticContent>
  </system.webServer>
</configuration>
```

The same page describes `cacheControlCustom` as custom cache control directives, which is where `immutable` would go. It does not say how the custom value combines with `max-age`, so request one file after you set it and read the header that comes back. The folder rule also covers the map's worker script if it sits in the same folder, and a year-long lifetime on that file has a side effect on the policy: see the worker point under "Content security policy".

The reference host sends `Cache-Control: public, max-age=31536000, immutable` for its hashed `/assets/*` files (`packages/web/public/_headers`). If you serve fixed names instead, use `DisableCache`, which adds `Cache-Control: no-cache`; `setEtag` defaults to true, so the browser can revalidate with the ETag.

### Response headers

[`customHeaders`](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/httpprotocol/customheaders/) adds a header to every response the site sends, not only the page. It matters for the Content Security Policy, below, because the map's worker script enforces the policy of its own response. The page also shows that the server's default configuration adds `X-Powered-By`.

## ASP.NET Core

The [static files page](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/static-files) says an ASP.NET Core app hosted in IIS has every request, static files included, forwarded to the app by the ASP.NET Core Module, and that the IIS static file handler is not used. So the `mimeMap` and `clientCache` settings above do not decide how this app's files are served. The app does:

- Put the build output in `wwwroot`, the default web root. The page names `MapStaticAssets` for .NET 9 or later and `UseStaticFiles` for .NET 8 or earlier as the calls that serve it.
- With `UseStaticFiles`, add a missing media type with a `FileExtensionContentTypeProvider` set as the `ContentTypeProvider` of the `StaticFileOptions` passed to `app.UseStaticFiles(new StaticFileOptions { ... })`. The page shows `provider.Mappings[".ext"] = "type"` and warns that the mappings are meant to be set once at startup.
- With `UseStaticFiles`, set `Cache-Control` for the hashed files in the `OnPrepareResponse` option of the same `StaticFileOptions`. The page shows appending `Cache-Control` to the response headers there.
- `MapStaticAssets` is a different call and takes neither option. The page says it works from metadata captured at build time for compression, caching and fingerprinting, and that the `ETag`, `Last-Modified` and `Content-Type` headers are set for the assets it knows, with an `immutable` directive for fingerprinted ones. This guide did not read how it treats a file your own Vite build puts in `wwwroot`, so check the response headers there.

This guide does not say which ASP.NET Core version your project needs, or whether `MapStaticAssets` serves the font and worker files correctly.

## Content security policy

[Content Security Policy](content-security-policy.md) is the reference: which directives the map needs and why, and `buildContentSecurityPolicy` in `examples/embed/src/contentSecurityPolicy.ts` builds the header from the basemaps and layers your page offers. This guide does not repeat the origin lists. Send the result with `customHeaders`:

```xml
<system.webServer>
  <httpProtocol>
    <customHeaders>
      <add name="Content-Security-Policy" value="default-src 'self'; ..." />
    </customHeaders>
  </httpProtocol>
</system.webServer>
```

Replace the elided value with the string the function returns. For ASP.NET Core, set the header in your own middleware instead; the pages read for this guide give no nonce code, so none is shown.

Avoid inline scripts, and then no nonce is needed:

- Pass the map's settings as data attributes on the container element (`data-lat`, `data-lng` and `data-zoom`, say) or fetch them as JSON from an endpoint of your own, and read them in the entry file. Razor writes attributes without any script.
- The one inline script the SDK offers is the theme bootstrap, which sets the theme and, if asked, `lang` and `dir` before first paint. It is optional. `buildThemeBootstrapScript` from `@mapcairn/core` returns its text, so write it to a file at build time and load it from `'self'`. This script, run in Node beside the build, wrote a 999 character file that passes `node --check`:

```js
import { writeFileSync } from "node:fs";
import { buildThemeBootstrapScript } from "@mapcairn/core";

writeFileSync("theme-bootstrap.js", buildThemeBootstrapScript());
```

Load the file from the head with a plain `<script src="/maps/theme-bootstrap.js"></script>` (no `async`, no `type="module"`), so it runs before the page paints. Copy it to the web root with the rest. Putting the text inline instead needs a `sha256-` hash of the exact string in `script-src`, which breaks whenever the string changes (see "script-src" in the policy guide).

Two points from the policy guide apply on IIS:

- The worker takes its policy from its own response, and a hashed file is cached for a year, so a worker fetched before a policy change keeps the old policy. The reference host puts a key derived from the policy in the worker's URL (`packages/web/src/constants/workerCacheKey.ts`). With `customHeaders` applying to every response, do the same, or keep the worker's cache lifetime short.
- `buildContentSecurityPolicy` throws on a definition URL that is not `https`, so serve the page over HTTPS. A script, stylesheet or font on your own origin needs no CORS header. A tile, feed or identify provider on another origin has to send `Access-Control-Allow-Origin` ([Serving layers to MapCairn](serving-layers.md)).

## A server-rendered page

### What runs where

The SDK's chrome (the search pill, the sheet, the controls) renders on a server: `scripts/release/consumer/plain.mjs` calls `renderToString` on it, and `entryWorker.tsx` beside it calls `renderToReadableStream`, both in Node or a Worker, on the SDK's fakes. Neither runs on IIS without Node. MapLibre itself needs a browser, so the map is drawn on the client whatever the server does.

A Razor page therefore serves a static shell and the browser does the rest: the page is rendered by Razor, it names the stylesheets and the script, and the script mounts the app into an empty element. Nothing about this needs a Node process at request time.

### A minimal page

This Razor Pages sample shows the shape, with `@page`, a layout and sections as the [layout page](https://learn.microsoft.com/en-us/aspnet/core/mvc/views/layout) describes (a section is rendered where the layout calls `RenderSection`). It is not tested.

In the layout, add a styles section to the head. The scripts section stays at the end of the body, where the layout page's own sample puts it:

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

The layout page's own sample loads Bootstrap and jQuery from `ajax.aspnetcdn.com`; a policy of `default-src 'self'` blocks those, so a stock layout needs its own copies of them on your origin or an allowance for that origin in the policy. Classic ASP.NET MVC follows the same shape, a view with a layout. This guide read no page about its view engine or its bundling, so it says nothing about either, and nothing about .NET script and style bundling: do not pass the SDK's built files through a bundler that minifies or reorders them again. Link them as they are.

### Page styles

The SDK ships no base stylesheet, so the page gives `html`, `body` and the container a height and removes the body margin ([Extending MapCairn](extending.md#embed-the-sdk-in-an-app-of-your-own)).

An existing site stylesheet is a risk. The SDK's primitives sit in a cascade layer, so an unlayered rule in the page, such as a framework's `button` rule or a reset, beats them whatever its specificity or position ([Overriding a primitive](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#overriding-a-primitive)). The remedy there is to put the page's own base styles in an `@layer` declared before `@mapcairn/map/styles.css`. For a stylesheet you cannot edit, CSS can import a file into a named layer (`@import url("site.css") layer(base);`), but that was not tried here. Check the buttons and the focus outline in a browser after you add the map to an old page.

### Language and direction

Set `lang` and `dir` on `<html>` in the Razor layout from the page's language, for example `<html lang="en-GB" dir="ltr">`, as the [translation guide](translate-the-sdk.md) says (the reference host renders its default on the server and keeps both in step on the client). `data-fixed-language` on `<html>` matters only if the theme bootstrap script is given a list of offered languages (`buildThemeBootstrapScript(offeredLanguages)`): that script then sets `lang` and `dir` from a stored choice unless the attribute is present. The call shown above passes none, so its script never touches `lang` or `dir` and the attribute changes nothing (`packages/core/src/theme/themeBootstrap.ts`).

### Layers, login and what stays on the server

A feed or query layer's request carries no cookies and no referrer ([Serving layers to MapCairn](serving-layers.md)), so a layer endpoint that needs the signed-in user's cookie does not work yet. The request policy that would allow it is [#195](https://github.com/MapCairn/mapcairn/issues/195), and the wider case of a host behind a login is [#45](https://github.com/MapCairn/mapcairn/issues/45). A layer catalogue that follows the user's rights is possible: `createRuntimeLayerCatalogue` loads the catalogue from a function you write, which can call your own endpoint ([Extending MapCairn](extending.md#supply-layers-at-runtime)). Serve data the user may see from endpoints that need no cookie, or wait for #195.

Spatial queries and reports stay on your server. The optional `FeatureQuery` and `RoutingProvider` ports, and the map adapter's image export, are where a server plugs in ([`ARCHITECTURE.md`](https://github.com/MapCairn/mapcairn/blob/main/ARCHITECTURE.md), "Ports"); the SDK ships no `FeatureQuery`.

### Browsers without WebGL

MapLibre needs WebGL. When it is missing, an adapter rejects with a `MapEngineError` whose reason is `webgl-unavailable` (`packages/core/src/ports/errors.ts`). The SDK's message catalogue has the text for it (`app.webgl.title` and `app.webgl.advice` in `packages/core/src/messages/en-GB.ts`), but the screen that shows it, `MapUnavailable.tsx`, is in the reference host, so your app shows the message itself. The repository states no supported browser list, and this guide gives none.

## What was tested

- `npm run build` of `examples/embed` with Vite 8.3.8: the file types and hashed names listed under "What the build emits", and the manifest shape.
- The same build with `--base=/maps/`: the asset URLs in the HTML.
- A scratch Vite build of an entry importing MapLibre GL JS 6.18.0, its stylesheet and its worker: the output file types.
- Running `buildThemeBootstrapScript` from the built `@mapcairn/core` in Node, as shown above.

## What was not

- Nothing ran on IIS, IIS Express, ASP.NET Core or classic ASP.NET. The `web.config` and Razor samples, the section lock behaviour, the effect of `cacheControlCustom` and the response headers were not observed.
- No page loaded the real map, a layer endpoint or the policy. The mount function from [#44](https://github.com/MapCairn/mapcairn/issues/44) does not exist, so no page used it.
- Mounting in a server-rendered view: keeping the container outside any region a partial postback replaces, and destroying the map when the page unloads. Nothing here covers either.
- Range requests for a single-file tile archive ([#192](https://github.com/MapCairn/mapcairn/issues/192)), which the issue asks the guide to cover. #221 stays open for this and for the server trial.
- Whether the `@import ... layer()` form fixes a framework's rules, and whether `immutable` can be sent from `clientCache`, are open until someone tries them on a server.

When you try this on a server, record what failed and how you fixed it, and send it back as a change to this guide.
