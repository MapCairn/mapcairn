---

title: Extending MapCairn
sidebar_label: Extend the SDK
description: What an app around the SDK provides, and how to add a basemap, a data layer, a search provider, a routing provider or an adapter of your own.
---

# Extending MapCairn

What an app of your own provides around the SDK, and how to theme the interface and add a basemap, a data layer (the kinds are on [Layer definitions](layer-definitions.md)), layers supplied at runtime, a search provider, a routing provider or an adapter. The first working map is in [Get started](../get-started.md).

Related guides: [Content Security Policy](content-security-policy.md) for the policy a host page needs, [Serving MapCairn from IIS](serving-from-iis.md) for a server-rendered page, [Translate the SDK](translate-the-sdk.md) for other languages, and [Add to the reference site](add-to-the-reference-site.md) for changing the reference site in this repository. The architecture is in [ARCHITECTURE.md](https://github.com/MapCairn/mapcairn/blob/main/ARCHITECTURE.md) and the design rules are in [DESIGN.md](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md).

## Embed the SDK in an app of your own

An app of your own installs `@mapcairn/sdk`, the one package that holds the whole SDK: it re-exports `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme` from its root, the MapLibre adapter at `@mapcairn/sdk/adapter-maplibre`, and has one stylesheet (`import "@mapcairn/sdk/styles.css"`). The individual packages are the advanced option, for a host that wants fewer dependencies or only one piece, such as `@mapcairn/core` for the ports and the pure logic with no React.

What an app of your own provides:

| Part                                               | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The stylesheets                                    | Imported once at the top of its entry file: `import "@mapcairn/sdk/styles.css";`, or with the individual packages `import "@mapcairn/theme/tokens.css";` then `import "@mapcairn/map/styles.css";`. No bundler plugin is needed: any bundler that handles a CSS import works, or the files can be linked from the page. A published package holds `dist` only. The custom property names in `tokens.css` are generated and are not public API, so a plain stylesheet does not name them; to give the SDK your own colours, see [Theme the SDK with your own colours](#theme-the-sdk-with-your-own-colours) (and [How the CSS ships](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#how-the-css-ships)). |
| Its reset styles in a cascade layer declared first | The primitives' styles sit in a layer of their own, so an unlayered rule in your app (an element rule such as `button { background: transparent; border: 0; padding: 0 }`, or `:focus-visible { outline: none }`) beats them whatever its specificity or position. Declare your reset layer first, for example `@layer reset, base;` at the top of your entry stylesheet, and import `@mapcairn/map/styles.css` after it. This is a known trade-off (see [Overriding a primitive](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#overriding-a-primitive)).                                                                                                                                              |
| Its own base styles                                | The SDK ships no base stylesheet, so a page sets a height on `html`, `body` and the root element, removes the body margin (the browser's 8px margin shows otherwise) and, if it wants the theme's font, text colour and background colour, sets them itself. Reading them from `tokens` in `@mapcairn/theme` and setting them from JavaScript runs only in the browser, so a server-rendered page shows the browser's default font and colours until then. The SDK ships no base stylesheet and no alias properties for theming, and adds one only for a named adopter that needs it. What a host can restyle is in [Theme the SDK with your own colours](#theme-the-sdk-with-your-own-colours).                  |
| The font                                           | The tokens name IBM Plex Sans Variable, for example from `@fontsource-variable/ibm-plex-sans` ([Get started](../get-started.md#add-the-font-optional) shows how). Without it the type uses the system font through the fallback stack, whose metric-matched face `tokens.css` already declares. To use another font, load it yourself and name it with `fontFamily` in `createThemeStylesheet`.                                                                                                                                                                                                                                                                                                                   |
| The providers                                      | `ServicesProvider`, `LiveRegionProvider` and `TooltipProvider` around `MapView`, and `FocusRegistryProvider` around `MapChrome`. [Embed a map](embed-a-map.md) says what each does.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| The services                                       | Fakes are enough to see the interface; a real app writes an adapter for each port it needs. For the map, `@mapcairn/adapter-maplibre` is the adapter, and `@mapcairn/sdk/adapter-maplibre` re-exports it: [Show a real map](#show-a-real-map) says how to use it. `runMapAdapterContract` from `@mapcairn/core/contracts` checks an adapter of your own against the port.                                                                                                                                                                                                                                                                                                                                         |
| Its own wording about a provider                   | Settings shows a privacy statement and the pin card says what "Look up address" sends and to whom. Both have neutral defaults that name no provider, and a host replaces them with `privacyNote` on `SheetContent` and `lookupNote` on `PinCard`. The Directions panel's `note` and credits work the same way.                                                                                                                                                                                                                                                                                                                                                                                                    |

A host with more on the first screen has three more optional pieces:

- `Attribution` takes `aboutLink` (`{ href, label }`, a site path or an http or https address), which adds a link to the host's About page after the credits.
- `Attribution` also takes `introHeld`, which holds the credits' first showing back while the host has another card on the map. The hold ends on the first zoom or map move, or after `ATTRIBUTION_HOLD_MAX_MS`, and opening the credits by hand counts as the first showing.
- `SheetContent` takes `about` (`{ heading, text, link: { href, label }, homeLink?: { href, label } }`) for an About block in Help, for a host that wants to point to its source or licence; without it Help shows none. `link` opens in a new tab and must be an http or https address. `homeLink`, a host's own page about the site, opens in the same tab and may also be a path on the site (`/`).

## Show a real map

[Get started](../get-started.md) has a whole app that draws a map, and [Embed a map](embed-a-map.md) says what each part of it does. In short, for an app that installs `@mapcairn/sdk`:

1. List `react`, `react-dom` and `maplibre-gl` beside the umbrella. `maplibre-gl` is a required peer of the umbrella because the subpath needs it; npm installs peers itself, and strict pnpm and Yarn want them listed.
2. Import `@mapcairn/sdk/styles.css` once. It includes the engine styles, which only style a map that `MapView` hosts.
3. Build the services with `createMapAdapter: () => createMapLibreMapAdapter({ loadWorkerUrl })`, importing the adapter from `@mapcairn/sdk/adapter-maplibre` and everything else from `@mapcairn/sdk`. `createFakeServices({ createMapAdapter })` is the smallest form; every other port stays a fake until you write its adapter.
4. Resolve `loadWorkerUrl` to the engine's worker. MapLibre 6 runs a module worker and, inside a bundle, looks for it beside the wrong file, so the map stays blank without this URL. In Vite the URL is the bundler's worker import, `(await import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url")).default`, which emits a same-origin file and needs no plugin. TypeScript needs the types of that import and of a plain CSS import from `vite/client`: start the entry file with `/// <reference types="vite/client" />`, or list `vite/client` under `types` in `tsconfig.json`, or `tsc --noEmit` reports TS2307 for the worker import and TS2882 for the CSS import. With another bundler, emit that file as a static same-origin asset and return its address.
5. Pass `MapView` a basemap. The adapter makes no request until a map mounts, has no default basemap and no origin of its own, so the basemap you pass decides which provider the visitor's browser contacts.
6. Give the page a height and remove the body margin: a map in a zero-height container shows nothing.
7. A page with a Content Security Policy must allow the worker in `worker-src` (see [Content Security Policy](content-security-policy.md#worker-src)), and a worker served with a long cache lifetime needs a key in its URL when the policy changes. [Embed a map](embed-a-map.md) has a policy line to start from.

### Server and Worker builds that import the adapter

A host that renders on a server, or builds a Worker, and imports `@mapcairn/sdk/adapter-maplibre` from code that build follows may bundle the map engine into the server or Worker build. It runs nothing there, and it is large. Import the subpath only in code that runs in the browser (a client-only module or a dynamic import behind it), and keep the root `@mapcairn/sdk` for the code both sides share: the root never imports the adapter or the engine.

What a server-rendered host may import:

- Every public entry point loads in plain Node with no `window` or `document`, the adapter and `maplibre-gl` included: loading one does not touch the browser. The consumer check imports each one that way, and builds them all with Vite and webpack, in the `SDK packages` check, which runs when a package, a release script or the lockfile changes.
- Rendering `MapChrome` on the server is supported: the consumer check renders it in plain Node and on a Worker runtime. Importing the adapter on the server is allowed, but it adds the engine to the server bundle for nothing, so the advice above still holds.
- `@mapcairn/core/contracts` (and `@mapcairn/sdk/core/contracts`) are test code. They need the optional `vitest` peer, so import them from tests only, never from code a server or a bundle follows.
- Style sheets (`tokens.css`, `styles.css`) are imported by the client entry, or by a server build whose bundler handles CSS; Node cannot import them.

## Put two maps on one page

Each map is its own `MapView` with its own chrome, under one `ServicesProvider`, one `LiveRegionProvider` and one `TooltipProvider`. The example in `examples/embed` shows two. What a page with two maps needs:

- Pass each `MapView` a `label`, in the language of the page, such as `label="Pine"`. It is added to the name of every landmark the interface draws: "Map (Pine)", "Search (Pine)", "Map tools (Pine)", "Map scale (Pine)", "Measurement (Pine)", "Drawing (Pine)" and "Map credits (Pine)". Without it two maps repeat those names, and a screen reader lists several landmarks with the same name. A page with one map leaves it out, and the names stay as they are. The pattern that joins the name and the label is the message `host.map.named`, which a language file translates. The same label starts every announcement the map makes ("Pine: 3 results"), so a screen reader user hears which map a message concerns even though the maps share the page's one live region; the pattern is the message `host.map.announcement`. An announcement from a map with no label is read as it is, and so is one made outside any `MapView`, such as your own `useAnnounce` at page level. Do not nest one `MapView` in another: the outer label would be added again. The maps share one throttle, so a plain message waiting from one map can be replaced by a later one from the other; send `keep` for the outcome of something a person did.
- Give each `Sheet` a `title` of its own, such as "Map options (Pine)": a sheet is named by its title, which your app writes.
- Pass `mainLandmark={false}` to each `MapChrome` and put your own `main` around the maps. A page has one `main` landmark, and `MapChrome` draws one around its map unless told not to.
- Give each `MapView` its own `id` if you set one, and each WebMCP tool its own name. The ids the SDK generates itself are unique across maps.
- `data-testid` values repeat across maps, so a test finds each map's controls inside that map's wrapper.

## Theme the SDK with your own colours

`createThemeStylesheet` in `@mapcairn/theme` makes the stylesheet that gives the SDK's interface your own colours, and refuses a theme that is below WCAG 2.2 AA. It covers the 14 interface colour roles (`surface`, `surfaceRaised`, `text`, `textMuted`, `accent`, `accentTint`, `accentContrast`, `hairline`, `controlBoundary`, `danger`, `dangerTint`, `scrim`, `focusRing`, `focusRingInner`), in light and dark. It takes one brand colour as `accent` (the tint, the text on the accent and the focus ring are derived, and a theme where it falls below AA gets the nearest passing lightness, with `derived` listing each value), the font family (`fontFamily`, a face you supply: the SDK bundles no font) and the corner style (`shape`). A role set under `colour` is used as written and never moved; a failing one is refused with the nearest passing colour named in `failures`. `resolveAccent` is the same resolver as a pure function. It does not change the page background, the map overlay colours or the data palette. Anything else is out until a named adopter needs it: per-component styling hooks, density, moving a slot, swapping an icon and a light or dark choice for one map alone. [Theme the interface](../tasks/theme-the-interface.md) has the code: generate the stylesheet in your build, serve it from your own origin and link it after the SDK's stylesheets, with a class that you own on an element around the `MapView` and its chrome.

What to know:

- The scope is `:root`, `#id` or `.class` with an ASCII name. Anything else, including a selector list, is refused. The scope is matched as a descendant of `:root`, so a class on `<html>` itself does nothing: use the `:root` scope to theme the whole page. Two maps with different themes are two wrappers, two scopes and two calls. See "Put two maps on one page" for the rest of what two maps need.
- The custom property names the stylesheet writes are generated and private, so generate it from the same installed `@mapcairn/theme` that provides `tokens.css`.
- The rules read `data-theme` on `<html>` (`light` or `dark`), or the system's colour scheme when it is not set. A `ThemeSource` of your own must set that attribute.
- The theme is skipped in high-contrast (`prefers-contrast: more`) and forced-colours modes, which keep the SDK's own values. The rules use negated media conditions, such as `(not (prefers-contrast: more))`. A browser that does not understand one treats it as false and so skips the theme, which falls back to the SDK's own colours.
- Where the surface is translucent, the stylesheet also sets an opaque surface for browsers without `backdrop-filter` and for reduced transparency, and sets the inner focus ring to it unless you chose one. The check covers those values.
- A tooltip renders in a portal under `body`, outside your wrapper. It takes the colours of the control it belongs to when it opens, so your theme reaches it under any scope, with nothing to add.
- Each colour must be hex, `rgb()`/`rgba()` or `oklch()`, and is written back as hex. `checkThemeContrast` reports the same findings without producing CSS, for a test of your own.

### Theme a mounted map

This is for the route without React, `@mapcairn/sdk/browser`. It is not in `0.2.0` or any earlier release.

A map drawn by `mountMap` or `<mapcairn-map>` ([the route without React](browser-route.md)) takes the same stylesheet. Put a class of your own on the element you pass to `mountMap`, or on the tag, use it as the scope, and link the generated file after `browser.css`. `createThemeStylesheet` is a function, so a page with no build step cannot call it: run it in Node when you prepare your site, importing it from `@mapcairn/sdk/theme` in the same installed version as the files you serve, and generate the file again when you upgrade. What follows was read from the stylesheet's selectors and the mount's code, and no themed mounted map was loaded in a browser.

- **Light and dark.** The stylesheet reads the theme from `<html data-theme>`, or from the device's setting when `<html>` has none. A mounted map writes its theme on its own element. Your colours match the map only while the two agree. To keep them in step, leave `theme` unset, so the map follows the device, leave `data-theme` off `<html>`, and leave `"settings"` out of `tools`, because a person can choose a theme there. For a map fixed to `"light"` or `"dark"`, set `data-theme` on `<html>` to the same value and leave `"settings"` out. In any other case the map can show your colours for one theme with the SDK's for the other.
- **Fonts.** The files hold no IBM Plex Sans. `fontFamily` names a face you supply with your own `@font-face`, served from your own origin or one your `font-src` allows. To use Plex without a theme, [declare it under the SDK's name](browser-route.md#fonts-and-colours).

## Add a basemap

`BASEMAPS` holds every basemap the SDK defines. A host builds a catalogue from `BASEMAPS`, or from its own definitions, with `createBasemapCatalogue`, and passes it as `Services.basemaps`. [Choose a basemap](../tasks/choose-a-basemap.md) has the picker and the credits. To define a basemap of your own, write a `BasemapDefinition`:

- Its `name` is a `DefinitionText`: a `MessageKey` (`basemap.<id>.name`, with the English in `EN_GB_CATALOGUE`, so a language can translate it), a `HostText` (`{ key, text }`, translated from `MessageCatalogue.definitionTexts`) or a plain string, which is shown as written and is what a basemap of your own host can use.
- A `raster` source is a tile URL template with 256 px tiles, and a `vector` source is a MapLibre style URL.
- Set the zoom limits, the provider credits and `appearance`.
- Allow the provider's origins in your page's Content Security Policy: read the style and its tile sets to find every host they request (sprite, glyphs, terrain), and add only those (see [Content Security Policy](content-security-policy.md)).

A provider whose licence the reusable SDK packages must not carry, or whose volunteer-run server should not be sent the traffic of every app built on the SDK, or that asks to be told of use, is not added to `BASEMAPS`. Define it in your host instead, pass it to `createBasemapCatalogue` with the SDK's definitions you offer, and set `nonCommercial: true` if the licence bars commercial use, which keeps it out of the WebMCP basemap tool. The picker shows a preview image from `thumbnail`, a root-relative path to a file your host serves; the SDK ships no image files. A basemap with none shows a plain swatch, so set `swatch`, a hex colour of your own, for one that is not light, so its picker tile does not look like the default.

The default basemap follows the theme until a visitor chooses one: Bright in the light theme and Fiord in the dark theme. A host sets its own with `createBasemapCatalogue(basemaps, defaultId, { light, dark })`: `defaultId` is the fallback and a theme left out uses it. `Settings.basemapId` is `null` until the visitor picks a basemap; read the basemap to draw with `resolveBasemapFor(catalogue, id, theme)`.

To add a basemap to the reference site in this repository, follow [Add to the reference site](add-to-the-reference-site.md#add-a-basemap).

## Add a data layer

A layer is data, not code: one `LayerDefinition`. [Layer definitions](layer-definitions.md) has a minimal example and the keys of each kind: tiles, feeds, polygons and lines, heatmaps, vector tiles, queries for what is in view and identify. [Add a layer](../tasks/add-a-layer.md) gives a definition to the services and turns it on. [Serving layers to MapCairn](serving-layers.md) says which kind fits which server, what each costs it, and how to point a layer at an OGC API Features, WMS or WMTS service ([worked examples](serving-layers.md#services-that-speak-open-standards)). To add a layer to the reference site in this repository, follow [Add to the reference site](add-to-the-reference-site.md#add-a-data-layer).

## Supply layers at runtime

A host with a server of its own usually holds its layer metadata in that server's format, not as MapCairn definitions. [Serving layers to MapCairn](serving-layers.md) covers what a host's server should serve and how `createRuntimeLayerCatalogue` behaves. To turn the server's format into definitions, a host writes a mapper. `examples/embed/src/mapServerLayers.ts` in this repository is a sample, for a made-up server whose answer is a constant, so nothing is requested.

The mapper builds definitions from what the SDK already offers, and meets these limits:

- **An id** is lowercase letters, digits and hyphens, so `Huts_2024` becomes `huts-2024`. Take braces out of a label so a server cannot open a template placeholder.
- **Colours** come from the palette in order and never from the server: the palette has five ordinal colours and seven categorical ones. A rule has at most five classes, or six values and the class for every other value, and equal intervals need at least two classes. The SDK's point styles take `steps` and no `intervals`, so equal intervals map for polygons and lines only.
- **A polygon or line coloured by a field** also needs a label that names that field, because the SDK needs a second signal beyond colour.
- **A tile service** becomes a raster layer whose legend is on the ordinal colours, so the legend has at most five entries.

The mapper does not check what it makes. A layer it cannot use becomes a candidate the catalogue skips, as `partitionDefinitions` does for any definition, and `onSkipped` gets the layer's id and each problem as a `path: message` line, for example `source.fields.title: is required`. The checks stay in core, and the layers around a skipped one are unaffected. The mapper's input should be typed, and a host that receives raw JSON checks that it is an object with a `layers` array before it maps it. Test the mapper with a payload it can map and one it cannot, as the sample's `mapServerLayers.test.ts` does.

## Add a routing provider

The Directions tool appears only when `services.routing` exists, and the SDK ships no provider. To offer directions, write one adapter and pass it as `routing` in the `Services` your app builds, as "Register it" under "Write a search provider" shows.

1. Implement `RoutingProvider` from `@mapcairn/core`. `route({ stops, mode, signal })` returns one line feature for each leg with its distance in metres and time in seconds, and `reachableArea({ origin, minutes, mode, signal })` returns polygon features. Reject only with `RoutingError` (`network`, `invalid`, `no-route`, `rate-limited`, `aborted`, `unsupported`), and honour the `AbortSignal`. Keep to the service's usage limits inside the adapter and send no cookies.
2. Run `runRoutingProviderContract` against it with a scripted `fetch`, and add recorded sample responses as fixtures. Read every body, an error body included, through a bounded reader with a limit that fits the service, and make the contract subject lower it so `respondWithOversizeAnswer()` stays small: an answer over the limit must fail as `invalid`.
3. Register it as `routing` in the `Services` your app builds. Nothing else in the app names it.
4. Allow its origin in your page's `connect-src` (see [Content Security Policy](content-security-policy.md)), and pass its credit and a note about what a request sends to the Directions panel (`note`).

Send a referrer only where the service's terms ask for one, and then only your site's origin: a browser never puts the address fragment in a Referer. The SDK carries no provider's terms. Read your provider's terms before you use a public server, and a host that is commercial, has high traffic or needs the service to stay up should run its own routing service. Leave `routing` out and the Directions button, panel and overlays are never mounted, so a host without a service carries no dead controls. To change the reference site's provider, follow [Add to the reference site](add-to-the-reference-site.md#add-a-routing-provider).

## Write a search provider

The search pill, the address lookup on the pin card and the map's move to a result all work on two ports from `@mapcairn/core`, and the SDK ships no adapter for a named service, because a service's terms must not travel inside an SDK package. A host writes its own, over a geocoder it runs or is allowed to use, or over an index it owns. `examples/embed/src/placeSearch.ts` in this repository is a sample over a few invented places held in memory.

### The two ports

`SearchProvider` is required (`Services.search`) and has two methods:

- `search(query, { bias, limit, signal })` resolves a `SearchResult[]`, best match first, empty when nothing matches.
- `reverse(position, { signal })` resolves the `SearchResult` at a position, or `null` when there is none.

`SuggestionProvider` is optional (`Services.suggestions`) and has one, `suggest(query, { limit, signal })`, which resolves `SearchResult[]` for text the person has only partly typed. It is a port of its own because a service that suits a submitted search often forbids a request on every keystroke. Leave it out and the pill keeps submit-only search; see [Add search suggestions](#add-search-suggestions). A provider that has nothing to suggest resolves `[]`, and the pill then lists nothing and still searches on Enter.

Every `SearchResult` has these fields (`packages/core/src/ports/search.ts`):

| Field            | Meaning                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | A string that names the place in this answer. The pill uses it as the option's key, so two results in one answer must not share one.               |
| `label`          | The place's short name, which the pill shows and puts in the box when the person picks it.                                                         |
| `secondaryLabel` | Optional. What helps tell places of one name apart, such as the parish or town.                                                                    |
| `centre`         | `{ lat, lng }`, in degrees. Required.                                                                                                              |
| `bounds`         | Optional `{ south, west, north, east }`. When present, a host that follows the reference site fits the map to it instead of centring on the point. |

Moving the map is the host's job, not the provider's or the pill's: the pill calls its `onSelect` prop with the picked result. The reference host fits the map to `bounds` when there are some and otherwise centres at a fixed zoom, and the sample's `src/showResult.ts` does the same. A host that only reads `centre` still works, but frames a glen or a lake as a point.

### What the pill and the provider each do

The pill (`useSearch` in `packages/map/src/tools/SearchPill`) searches only when the person submits, for at least two characters after trimming. It answers a typed coordinate pair itself, without the provider, and aborts the request before a new one starts, so a provider never needs to track which answer is current. When a search finds exactly one place, `SearchPill` goes straight to it (`UseSearchOptions.onPick`, which a host using `useSearch` alone may pass; it returns `false` to decline, and the single result then shows as a list), as long as the search box still has focus, and announces "Showing {label} on the map." instead of the count. It passes `bias` only when the host gives `SearchPill` a `getBias` function, so a provider can ignore `bias` and a host that sends it must say so in its privacy text.

The provider owns what is particular to its service: building the request, mapping the answer, and keeping to the service's usage limits (such as a minimum time between requests), since every caller shares them. For a blank query it resolves `[]` or rejects with a `SearchError`; the contract accepts either, and resolving `[]` without a request is simpler and sends nothing.

### Errors and cancellation

Reject only with these two, and do not let a raw `TypeError` or `SyntaxError` escape:

- `SearchError`, with a `kind`: `offline` (the request could not be made because the device has no connection), `rate-limited` (the service answered HTTP 429, or its equivalent) or `failed` (anything else, including a bad status, a body that is not what the service documents and a timeout). The pill shows a message for each kind and a Retry button, and treats any other error as `failed`.
- `PortAbortError`, when the `AbortSignal` fires. The pill ignores it: an aborted request never changes what is shown or reaches the live region.

To honour the signal, throw `PortAbortError` at the start if `signal.aborted` is already true, pass the signal to `fetch`, and turn the `AbortError` that `fetch` rejects with (or any failure after `signal.aborted` became true) into `PortAbortError`. `getJson` in the sample's `placeSearch.ts` does all three, and tells `offline` from `failed` with `navigator.onLine`.

### Map an answer to results

Keep the mapping in small functions that take the service's raw item and return a `SearchResult` or `null`, and drop an item that has no usable position instead of failing the whole answer.

A service that returns a GeoJSON `FeatureCollection`, as several open geocoders do, puts the point in `geometry.coordinates` as `[longitude, latitude]` and, when it has one, the extent in `bbox` as `[west, south, east, north]` (RFC 7946). Some services use a different order for their own extent field, so read the service's documentation and test with a recorded answer.

```ts check
import type { Bounds, SearchResult } from "@mapcairn/core";

interface GeocoderFeature {
  readonly geometry?: { readonly coordinates?: readonly number[] };
  readonly bbox?: readonly number[];
  readonly properties?: {
    readonly id?: string;
    readonly name?: string;
    readonly region?: string;
  };
}

function toBounds(bbox: readonly number[] | undefined): Bounds | undefined {
  if (bbox?.length !== 4) {
    return undefined;
  }
  const [west, south, east, north] = bbox as [number, number, number, number];
  return { south, west, north, east };
}

function toResult(feature: GeocoderFeature): SearchResult | null {
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const { id, name, region } = feature.properties ?? {};
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof lng !== "number" ||
    typeof lat !== "number"
  ) {
    return null;
  }
  const bounds = toBounds(feature.bbox);
  return {
    id,
    label: name,
    ...(region ? { secondaryLabel: region } : {}),
    centre: { lat, lng },
    ...(bounds ? { bounds } : {}),
  };
}
```

A plain JSON endpoint is the same job with that endpoint's names: the sample's service sends `{ results: [{ id, name, area, lat, lon, box }] }`, with `box` as `[south, west, north, east]`, and `toSearchResult` in its `placeSearch.ts` maps one item. Check each field's type before you use it, since the body comes from outside your code.

### Test it with the contract suite

The SDK's contract suites check what the ports promise: the shape of a result, an empty array for no match, each `SearchError` kind, `PortAbortError` before and during a request, and `null` from `reverse` when there is no place. Run them against your adapter with the network scripted:

```ts no-check
import {
  runSearchProviderContract,
  runSuggestionProviderContract,
} from "@mapcairn/core/contracts";

runSearchProviderContract("MySearchProvider", () => {
  const scripted = scriptedFetch(); // your test double for the service
  return {
    // A small limit keeps the oversize answer below small.
    provider: new MySearchProvider({ fetch: scripted.fetch, maxResponseBytes: 1024 }),
    controls: {
      willReturn: (results) => scripted.answerWith(results),
      willFail: (kind) => scripted.failWith(kind), // "offline", "rate-limited" or "failed"
      respondWithOversizeAnswer: () => scripted.answerWithBytes(2048),
      hold: () => scripted.holdUntilAborted(),
    },
  };
});
```

`create` is called for each test, so every test gets a fresh provider. `willReturn` makes every later `search` return those results and `reverse` return the first, or `null` for an empty list; `hold` keeps the next request pending until its signal aborts, so the double must reject with an `AbortError` when `init.signal` fires. `respondWithOversizeAnswer` makes every later request read an answer larger than the limit your provider puts on the size of an answer (lower the limit in the subject so the answer stays small), and the suite requires the request to fail as `failed`. `runSuggestionProviderContract` takes the same controls. Read the body through a bounded reader of your own, so a service cannot make the page hold an answer of any size. The suites import `vitest`, which `@mapcairn/core` declares as an optional peer, so the host installs it with its tests. The contract does not check your mapping of a real answer, so also test it with recorded answers from the service, a bad item, a body that is not JSON and an HTTP error.

### Register it

Pass the provider in the `Services` the app is built from. A host that builds its own `Services` sets `search` and, if it has one, `suggestions`; the example starts from the fakes and replaces the two parts:

```ts no-check
const services = createFakeServices({
  search: new MySearchProvider(),
  suggestions: new MySuggestionProvider(),
});
```

`ServicesProvider` takes the result as `services`, and nothing else in the app names the provider. If the service is on another origin, allow it in the page's `connect-src` (see the [Content Security Policy guide](content-security-policy.md)).

### Tell visitors what is sent

A search provider sends data to whatever its service is, so the host's privacy text must say so plainly. By default these requests are sent:

- A submitted search sends the query text to the service, and with it whatever the browser always sends, such as the visitor's IP address and user agent. With a `SuggestionProvider`, the text typed so far is sent as the person types, which is more than a submitted search sends, so the text must say that too.
- The address lookup on the pin card sends the pin's position, rounded to four decimal places (about 11 m) by `roundForLookup`, and only when the person asks for it.
- A `bias` box is sent only if the host gives `SearchPill` a `getBias` function and the provider passes it on, and it shows roughly which area the person is looking at.
- The visitor's language is sent only if the adapter sends it (see the [translation guide](translate-the-sdk.md)).

The words are the host's. `PinCard` takes a `lookupNote` for the line under "Look up address", and `SheetContent` and `SettingsSection` take a `privacyNote` for Settings. They also take `privacyHref` for the policy link (`/privacy` by default; an empty string draws none, for a page with no such route), and `SheetContent` and `HelpSection` take `hasSearch` (true by default) so Help can leave out the Search topic when there is no search box. `HelpSection` and `SheetContent` also take `shortcuts` (`pin`, `identify` and `drawing`, each true by default) and `MapView` takes `shortcuts` with `pin` and `identify`, so the keyboard help lists only the keys your page has wired. The defaults name no service because the SDK does not know which one a host uses.

## Add search suggestions

The search pill suggests places as the person types only when `services.suggestions` exists, and the SDK ships no provider, because a service built for typing has its own terms. To offer suggestions, write one adapter and register it, as for routing:

1. Implement `SuggestionProvider` from `@mapcairn/core`. `suggest(query, { limit, signal })` resolves `SearchResult`s, each with a centre and optionally an extent, so picking one needs no second lookup. Reject only with `SearchError` (`offline`, `rate-limited`, `failed`) or `PortAbortError`, give each request a timeout, keep to the service's usage limits inside the adapter, and send no cookies or referrer.
2. Run `runSuggestionProviderContract` against it with a scripted `fetch`.
3. Register it as `suggestions` in the `Services` your app builds. Leave it out and the pill keeps submit-only search.
4. Allow its origin in `connect-src`, and say in your privacy text that the text typed so far goes to the service as the person types. That is more than a submitted search sends.

When to ask is not the adapter's job. `useSuggestions` waits for a pause in typing, asks for at least three characters, cancels what a newer keystroke supersedes, stops for a cooldown after repeated failures and announces once that suggestions are unavailable. A public service has terms of its own: read them, and a host that is commercial, or that expects real traffic, should run its own server. To change the reference site's provider, follow [Add to the reference site](add-to-the-reference-site.md#add-search-suggestions).

## Add an adapter

Define the port, write its fake and contract suite, and write the real adapter. A host that builds its own `Services` may supply any adapter that passes the port's contract suite (the suites import `vitest`, which `@mapcairn/core` declares as an optional peer, so the host installs it with its tests). `fileOpener` and `suggestions` are optional, as `routing` is: leave it out and the Shapes section has no Import control, or supply one, for example a native app's own picker, that passes `runFileOpenerContract`. To add a port to the SDK or the reference site, [`ARCHITECTURE.md`](https://github.com/MapCairn/mapcairn/blob/main/ARCHITECTURE.md#adding-an-adapter) has the steps.
