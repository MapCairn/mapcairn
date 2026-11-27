---

title: A map on a server-rendered page, without React
sidebar_label: Server-rendered page, no React
description: Serve the files of @mapcairn/sdk/browser from your own site and draw a map with mountMap or the mapcairn-map element, with no React and no build step.
---

# A map on a server-rendered page, without React

Put a map with the SDK's interface on a page that has no React and no build step: a plain HTML page, or a page your server renders. The page links a stylesheet and a module script, then calls `mountMap(element)` or writes a `<mapcairn-map>` tag. The files come from the `@mapcairn/sdk` package, at `@mapcairn/sdk/browser`.

`@mapcairn/sdk/browser` is not in `0.2.0` or any earlier release, so installing one of those gives you none of the files below.

An app written in React uses the components at the root of `@mapcairn/sdk` instead ([Embed a map](embed-a-map.md)). To keep an interface of your own and use only the map, read [Build a map without React](without-react.md).

## What you get

With no option, you get a map of the world on the built-in Bright basemap (Fiord in the dark theme), following the device's colour scheme, with zoom, a compass, the credits and the scale. You can add these tools, and your own basemaps, layers and languages: search, Map options, measuring, Locate me and settings. There is no directions tool.

Search and Locate me need a provider that your page writes. The reference site's own search, location, sharing and feed adapters are not part of the SDK.

Settings and the view are kept in the page's memory. The map stores nothing on the device and never changes the page's address, so a reload starts again.

## Get the files

Install the package in a folder on the machine where you prepare your site:

```bash
npm install @mapcairn/sdk
```

The page serves `browser.css`, `browser.js` and every `browser-*.js` file in `node_modules/@mapcairn/sdk/dist`, all from one folder on the page's own origin:

```bash
mkdir -p wwwroot/mapcairn
cp node_modules/@mapcairn/sdk/dist/browser.css node_modules/@mapcairn/sdk/dist/browser.js node_modules/@mapcairn/sdk/dist/browser-*.js wwwroot/mapcairn/
```

- Copy all of them. The modules load each other, and the map's engine is loaded from the same folder when the first map is drawn.
- Some names hold a hash and change between versions, so empty the folder and copy again when you upgrade. Do not cache `browser.js`, `browser-element.js` or `browser.css` for longer than you can wait for an upgrade to arrive: their names stay the same.
- Serve the `.js` files with a JavaScript media type. A browser refuses a module script with any other.
- Serve the files as they are, without minifying or joining them again.
- `THIRD-PARTY-NOTICES.md`, at the root of the package, holds the licences of the third-party code in these files. Keep it with what you distribute. Serving the files to people's browsers distributes the SDK, so read [what the licence means for your project](licence.md).

The files are ES modules. There is no classic script, so load them with `<script type="module">`.

[`examples/browser`](https://github.com/MapCairn/mapcairn/tree/main/examples/browser) is a whole page, and its `copyFiles.mjs` does the copy.

A page that has a bundler but no React can import `@mapcairn/sdk/browser` instead of copying, with the stylesheet `@mapcairn/sdk/browser/styles.css`, or `@mapcairn/sdk/browser/element` for the tag alone. Vite needs no setting for it. With webpack and no CSS loader, link the stylesheet from the page.

### The packages that install beside them

`npm install @mapcairn/sdk` also installs the other MapCairn packages, and `react`, `react-dom` and `maplibre-gl`, which are peers of the SDK. The peers install but are never loaded by your page: it loads only the files you copied, and you serve nothing else from `node_modules`.

In a folder used for nothing else, `npm install @mapcairn/sdk --omit=peer` leaves the three peers out. Do not use the flag in an existing project: it removes every package's peers, not only these, and the next plain `npm install` puts them back.

The flag does not skip npm's version check. In a project that already depends on React 18, `npm install @mapcairn/sdk` stops with `ERESOLVE`, with or without `--omit=peer`, because the SDK's peer range is React and React DOM `^19.0.0`. Install into a separate folder, and copy the files from there.

## Draw the map

With a tag, the page needs no script of its own:

```html
<link rel="stylesheet" href="/mapcairn/browser.css" />
<link rel="stylesheet" href="/map-page.css" />
<script type="module" src="/mapcairn/browser-element.js"></script>
<mapcairn-map></mapcairn-map>
```

Or call `mountMap` from a script file of your own. A strict Content Security Policy blocks an inline script, so keep the call in a file:

```html
<link rel="stylesheet" href="/mapcairn/browser.css" />
<link rel="stylesheet" href="/map-page.css" />
<div id="map"></div>
<script type="module" src="/map-page.js"></script>
```

```js
// map-page.js
import { mountMap } from "/mapcairn/browser.js";

const map = mountMap(document.getElementById("map"), {
  view: { center: { lat: -33.92, lng: 18.42 }, zoom: 11, bearing: 0 },
  tools: ["measure", "settings"],
});
```

Your server renders only the empty element (or the tag), and the browser draws the map. Anything you put inside the element, such as a sentence for a reader without script, is replaced when the map is drawn. `mountMap` needs a browser: importing the module on a server does nothing, and calling `mountMap` there throws a `MountMapError`.

### Give it a height

The element needs a height in CSS, or nothing shows. `mountMap` logs a warning when the element has none. The stylesheet makes `<mapcairn-map>` a block, and the height is still yours to set:

```css
#map,
mapcairn-map {
  height: 100vh;
}
```

Give an embedded map room. It chooses between its narrow and wide layouts from the size of the browser window, not of its own element, so a small map on a wide page gets the wide layout.

### Name each of several maps

Give each of several maps on a page its own `label`, as an option or an attribute:

```html
<mapcairn-map label="Depots"></mapcairn-map>
<mapcairn-map label="Deliveries"></mapcairn-map>
```

The label is added to the names of the map's landmarks, such as "Map (Depots)", so a screen reader user can tell the maps apart, and it starts what the map announces. A map mounted without a label logs a warning when another map without one is already on the page.

Load one copy of the files on a page. Two copies, from two folders or two versions, have error classes of their own, so a provider written against one is misunderstood by a map from the other.

## Options, attributes and events

`mountMap(element, options)` takes `view`, `basemaps`, `basemap`, `layers`, `languages`, `language`, `theme`, `label`, `tools` and `services`, all optional. It returns a handle with `ready`, `getView`, `setView`, `update`, `on` and `destroy`. The events are `viewchange`, `click`, `featuretap` and `error`. The [package README](https://github.com/MapCairn/mapcairn/blob/main/packages/sdk/README.md#a-page-with-no-react) describes the element's attributes, properties and events, and its TypeScript and JSX types.

A mistake in a call, such as a tool name that is not one, throws a `MountMapError` whose message says what to change. The element sends it as a `mapcairn-error` event and logs it once.

- **Tools.** `tools` names any of `"search"`, `"map-options"`, `"measure"`, `"locate"` and `"settings"`; the attribute separates them with spaces. A tool whose provider is missing is left out, with a warning that names the fix.
- **Providers.** `services` takes `search`, `suggestions`, `location` and `layerSource`. A provider throws and reads the SDK's error classes, so import them from the same file as the map: `import { SearchError, LocationError, LayerError, PortAbortError, MapEngineError } from "/mapcairn/browser.js";`. [Write a search provider](extending.md#write-a-search-provider) says what each method returns. Allow the provider's origin in `connect-src`.
- **Layers.** `layers` is a list of [layer definitions](layer-definitions.md), or a function that loads them. They are listed in Map options, so name `"map-options"` in `tools`. A feed, query or heatmap layer, and a tile layer with `identify`, needs `services.layerSource`.
- **Languages.** Each entry of `languages` has a `tag`, a `label`, `messages` by [message key](translate-the-sdk.md) and, if you need it, a `direction`. A key you leave out reads in English, and a key this version does not have is ignored with a warning. A layer's own text is shown as written. The module does not export the English messages.
- **Basemaps.** With `"map-options"`, a person can choose any built-in basemap, and they come from more than one provider ([`ATTRIBUTIONS.md`](https://github.com/MapCairn/mapcairn/blob/main/ATTRIBUTIONS.md)). Pass `basemaps` to offer only your own [definitions](extending.md#add-a-basemap); the first is then the default in both themes.

## What the map contacts

The map contacts the origins that its basemap and layer definitions name, and those a basemap's style names for its sprites, glyphs and tiles. A layer's are contacted once it is turned on. Your providers contact whatever you wrote them to call. The default Bright and Fiord basemaps come from `tiles.openfreemap.org`, so a visitor's browser contacts it as soon as the map draws. The other built-in basemaps use that host, `tile.openstreetmap.org` or `tiles.versatiles.org`, and are contacted only when chosen. The reference site's privacy policy does not cover your page: say in your own what your visitors' browsers contact, and read each provider's terms.

## Content Security Policy and the worker

The map runs under a strict policy with no inline script or style. [The browser route](content-security-policy.md#the-browser-route) has the policy, directive by directive.

The map's engine runs in a worker that starts from a `blob:` URL made by your own page. There is no worker file to serve and no option to set one, and the policy needs `blob:` in `worker-src`. That needs Safari 15.5 or later; a page that must support an older Safari adds `child-src blob:`. A page that enforces Trusted Types (`require-trusted-types-for 'script'`) cannot run the worker.

## Fonts and colours

The files hold no IBM Plex Sans. The stylesheet asks for `"IBM Plex Sans Variable"` and falls back to a metric-matched local face, then the system's. To use Plex, serve the font file yourself and declare it under that name. The `@fontsource-variable/ibm-plex-sans` package has the file (its licence is the SIL Open Font Licence 1.1):

```css
@font-face {
  font-family: "IBM Plex Sans Variable";
  src: url("/fonts/ibm-plex-sans-latin-wght-normal.woff2") format("woff2");
  font-weight: 100 700;
  font-display: swap;
}
```

That file covers Latin; add the package's other subsets if your text needs them. A font from another origin needs that origin in `font-src`, and a stylesheet from one needs it in `style-src`.

For your own colours or another typeface, see [Theme a mounted map](extending.md#theme-a-mounted-map).

## Your page's own styles

The map's elements are part of your page, so your stylesheet can reach them. `browser.css` resets rules that name elements, such as `button`, `svg` or `*`, for everything inside the map. These still reach it:

- attribute selectors, such as `[type="button"]`;
- any rule of equal or higher specificity that loads later, such as `.page button`;
- a rule on the map's element by its id;
- inherited properties on the map's element that the interface does not set itself, such as `text-transform`, `letter-spacing` and `text-align`.

Check the buttons and the focus outline in a browser after you add the map to an existing page.

## Known limit: right-to-left pages

The map sets `lang` and `dir` on its element from the language it speaks, unless you set `dir` on that element yourself, and its layout follows. Some behaviour takes the direction from `dir` on `<html>` only, such as the arrow keys of the sliders and of the rows of choices in Settings. When the map reads right to left, set `dir="rtl"` on `<html>` too.

## Removing a map

Call `destroy()` on the handle, or remove the element from the page. The map and what it added to its element go, and calling `destroy()` again does nothing. In Chromium and WebKit, the engine's worker is ended when the last map is destroyed. A few listeners on `window` and `document` that load once stay, and a second pair of maps added none. The engine's code stays loaded.

Moving a `<mapcairn-map>` within the page keeps its map.

## Serving from a CDN or another origin

The files find each other by relative address and make the worker themselves, so nothing in them names the folder they are served from. Serving them from your own origin is the route that is checked: no check loads them from a CDN or any other origin. If you try it, the other origin must send `Access-Control-Allow-Origin`, because a browser loads a module script from another origin with CORS; your policy must list it in `script-src` and `style-src`; and its operator sees your visitors' requests.

## What was checked

The release's consumer check packs the SDK, installs it, serves `examples/browser` from a plain static server under the policy above and draws the map in Chromium and WebKit, and in Firefox where it is installed. Firefox is not a [supported browser](supported-versions.md). It also imports `@mapcairn/sdk/browser` in an app that it builds, and draws it from a Vite development server, a Vite build and a webpack build. No server framework was run, and no front-end framework was tried with the element.
