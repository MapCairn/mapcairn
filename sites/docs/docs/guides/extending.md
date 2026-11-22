---

title: Extending MapCairn
sidebar_label: Extend the SDK
description: How-tos for embedding the SDK in your own app and for adding a basemap, a data layer, a search provider, a routing provider or an adapter.
---

# Extending MapCairn

This page is for a developer who embeds the SDK in an app of their own, or adds to the SDK and its reference host. By the end you will know how to show a real map, theme the interface and add a basemap, a data layer of each kind, layers supplied at runtime, a search provider, a routing provider or an adapter. The architecture behind these how-tos is in [ARCHITECTURE.md](https://github.com/MapCairn/mapcairn/blob/main/ARCHITECTURE.md), and the design rules are in [DESIGN.md](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md). The Content Security Policy a host page needs is in [Content Security Policy](content-security-policy.md), serving a build from IIS or a server-rendered page is in [Serving MapCairn from IIS](serving-from-iis.md), and translating the interface or offering a choice of languages is in [Translate the SDK](translate-the-sdk.md).

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository.

## Embed the SDK in an app of your own

An app of your own installs `@mapcairn/sdk`, the one package that holds the whole SDK: it re-exports `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme` from its root, the MapLibre adapter at `@mapcairn/sdk/adapter-maplibre`, and has one stylesheet (`import "@mapcairn/sdk/styles.css"`). The individual packages are the advanced option, for a host that wants fewer dependencies or only one piece, such as `@mapcairn/core` for the ports and the pure logic with no React. The consumer check proves an app that lists only the umbrella ([The public API](public-api.md), "The umbrella package").

`examples/embed` is a one-page Vite and React app that uses the SDK the way an outside app does: it imports `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme` by package name and nothing else from this repository. The umbrella is for apps outside the repository, so the `nothing-imports-the-umbrella` rule in `.dependency-cruiser.cjs` keeps everything in `packages/`, the playground included, off it. The example stays on the four packages so that CI proves each package's own entry points. Run it with `npm run dev -w @mapcairn/example-embed` (add `-- --port <port>` to pick a port).

It runs on the SDK's fakes (`createFakeServices()`), so it requests nothing and loads no map engine, and the map region shows only its background colour under the real chrome: the search pill, the end stack, the sheet with its basemap, pin, layers and settings sections, the measure toolbar, the scale bar and the credits, with the zoom level under the scale bar in the side panel layout (`MapReadout` leaves it out in the sheet layout unless `showZoom` is set). It adds one layer of its own (`src/cairnsLayer.ts`), answered from memory, a search provider and a suggestion provider of its own over a few invented places held in memory (see [Write a search provider](#write-a-search-provider)), three more that a sample mapper makes from a made-up server's layer metadata (see [Supply layers at runtime](#supply-layers-at-runtime)), a `ThemeSource` that writes the chosen theme onto the page, the fakes' `MemoryFeatureSelection`, which it passes through `useFeatureSelection` and `SelectionProvider` (nothing reads the selected set yet), a WebMCP tool through `useModelContextTool`, and the SDK's built-in basemaps as they are, which name no preview image (the files belong to the host that serves them), so its picker shows a plain swatch for each.

What it proves, on every pull request: `npm run typecheck` and `npm run build` fail if an entry point stops exporting what an app needs or a built package stops working without a style plugin (the example's Vite config registers none), its Vitest test mounts the app and uses it, dependency-cruiser refuses an import from `examples/` into a file inside a package, into the reference host or by a relative path, and any import of an example from a package, and a test in `packages/core/src/lint/manifests.test.ts` checks that each SDK package declares every package its source imports, exports only its entry points, takes React as a peer and declares `vitest` as an optional peer of core for the contract suites, which the hoisted workspace would otherwise hide.

The SDK must also allow commercial use, which reaches its dependencies. `npm run lint` runs `scripts/sdkLicences.mjs`, which reads `package-lock.json` and the SDK `package.json` files, with no network request, and fails when a production dependency of any SDK package (`core`, `react`, `theme`, `map`, `adapter-maplibre` or `sdk`), direct or transitive, has a licence that is not on the permissive list in `scripts/sdkLicences.allowlist.json`. The message names the package, its licence and that file. An SPDX `OR` expression passes when one side is allowed and `AND` needs both. LGPL, MPL and a missing licence fail until the maintainer adds the licence, or that one package, to the file with a reason. The dev dependencies of the SDK packages are listed and never fail the check, and nor do the peers of a package that no other SDK package depends on. The required peers of an SDK package that another one depends on are judged with their trees, as are the required peers of every other dependency, because npm installs them: today that is `react` and `react-dom` (peers of `map` and `react`) and `maplibre-gl` (the adapter's peer), which is how the engine is judged through the umbrella. The host and `examples/embed` are not held to the check. The umbrella `@mapcairn/sdk` is checked like the others: its dependencies are the five workspace packages, which the walk follows without judging their own licence.

What an app of your own provides:

- The compiled stylesheets, imported once at the top of its entry file: `import "@mapcairn/theme/tokens.css";` then `import "@mapcairn/map/styles.css";` (`src/main.tsx`), or the one line `import "@mapcairn/sdk/styles.css";`, which is those two and then the engine styles, in that order. No bundler plugin is needed, and none is registered in the example's Vite config: any bundler that handles a CSS import works, or the two files can be linked from the page. The packages' source stays in this repository for its own tools, behind the `@mapcairn/source` condition, which an outside app does not turn on: a published package holds `dist` only. The custom property names in `tokens.css` are generated and are not public API, so a plain stylesheet does not name them; to give the SDK your own colours, see [Theme the SDK with your own colours](#theme-the-sdk-with-your-own-colours) (and [How the CSS ships](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#how-the-css-ships)).
- Its base styles and resets in a cascade layer declared before the two imports. The primitives' styles sit in a layer of their own, so an unlayered rule in your app (an element rule such as `button { background: transparent; border: 0; padding: 0 }`, or `:focus-visible { outline: none }`) beats them whatever its specificity or position. Declare your reset layer first, for example `@layer reset, base;` at the top of your entry stylesheet, and import `@mapcairn/map/styles.css` after it. This is a known trade-off, decided on 2026-11-20 and revisited if an adopter reports a problem (see [Overriding a primitive](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#overriding-a-primitive)).
- Its own base styles. The SDK ships no base stylesheet, so a page sets these itself:
  - A height on `html`, `body` and the root element, and no body margin (the browser's 8px margin shows otherwise). The example does this in `src/page.css`.
  - The page's font, text colour and background colour, if it wants the theme's. The example reads them from `tokens` in `@mapcairn/theme` and sets them on the body from JavaScript in `src/main.tsx`. That runs only in the browser, after the script loads, so a server-rendered page shows the browser's default font and colours until then, and the chrome's wrappers inherit them (the default font is a serif).

  Whether the SDK should ship a base stylesheet, or stable alias properties a stylesheet can name, is not decided (see [How the CSS ships](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#how-the-css-ships)); the generated token property names are not public and are not something to write by hand: use `createThemeStylesheet` for colours.
- The IBM Plex Sans Variable font the tokens name, for example from `@fontsource-variable/ibm-plex-sans`. Without it the type falls back to the system font.
- Its own wording for what the SDK's panels say about a provider. Settings shows a privacy statement and the pin card says what "Look up address" sends and to whom. Both have neutral defaults that name no provider, and a host replaces them with `privacyNote` on `SheetContent` and `lookupNote` on `PinCard` (the reference host's are in the `host.notes.*` entries of the message catalogue (English in `packages/core/src/messages/en-GB.ts`, Afrikaans in `packages/web/src/i18n/af.ts`); the example passes a one-line `privacyNote`). The Directions panel's `note` and credits work the same way. `Attribution` takes two optional props for a host with more on the first screen: `aboutLink` (`{ href, label }`, a site path or an http or https address) adds a link to the host's About page after the credits, and `introHeld` holds the credits' first showing back while the host has another card on the map (the reference host holds it while its tour is on screen); the hold ends on the first zoom or map move, or after `ATTRIBUTION_HOLD_MAX_MS`, and opening the credits by hand counts as the first showing. Help has an optional About block, `about` on `SheetContent` (`{ heading, text, link: { href, label }, homeLink?: { href, label } }`), for a host that wants to point to its source or licence; without it Help shows none. `link` opens in a new tab and must be an http or https address; `homeLink`, a host's own page about the site, opens in the same tab and may also be a path on the site (`/`).
- `ServicesProvider`, `LiveRegionProvider` and `TooltipProvider` around `MapView`, and `FocusRegistryProvider` around `MapChrome`.
- The services. Fakes are enough to see the interface; a real app writes an adapter for each port it needs. For the map, `@mapcairn/adapter-maplibre` is the adapter, and `@mapcairn/sdk/adapter-maplibre` re-exports it: [Show a real map](#show-a-real-map) says how to use it. `runMapAdapterContract` from `@mapcairn/core/contracts` checks an adapter of your own against the port, and `packages/adapter-maplibre/src/MapLibreMapAdapter.ts` is the reference to read.

## Show a real map

The package and its release status are in `packages/adapter-maplibre/README.md`; the README's "Embed a map" and [Embed a map](embed-a-map.md) have a whole app that draws a map: `index.html`, a style sheet and `main.tsx`. The steps, for an app that installs `@mapcairn/sdk`:

1. List `react`, `react-dom` and `maplibre-gl` beside the umbrella. `maplibre-gl` (`^6.18.0`) is a required peer of the umbrella because the subpath needs it; npm installs peers itself, and strict pnpm and Yarn want them listed.
2. Import `@mapcairn/sdk/styles.css` once. It includes the engine styles, which only style a map that `MapView` hosts.
3. Build the services with `createMapAdapter: () => createMapLibreMapAdapter({ loadWorkerUrl })`, importing the adapter from `@mapcairn/sdk/adapter-maplibre` and everything else from `@mapcairn/sdk`. `createFakeServices({ createMapAdapter })` is the smallest form; every other port stays a fake until you write its adapter.
4. Resolve `loadWorkerUrl` to the engine's worker. MapLibre 6 runs a module worker and, inside a bundle, looks for it beside the wrong file, so the map stays blank without this URL. In Vite the URL is the bundler's worker import, `(await import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url")).default`, which emits a same-origin file and needs no plugin. TypeScript needs the types of that import and of a plain CSS import from `vite/client`: start the entry file with `/// <reference types="vite/client" />`, or list `vite/client` under `types` in `tsconfig.json`, or `tsc --noEmit` reports TS2307 for the worker import and TS2882 for the CSS import. With another bundler, emit that file as a static same-origin asset and return its address. A page with a Content Security Policy must allow it in `worker-src` (see [Content Security Policy](content-security-policy.md#worker-src)), and a worker served with a long cache lifetime needs a key in its URL when the policy changes.
5. Pass `MapView` a basemap. The adapter makes no request until a map mounts, has no default basemap and no origin of its own, so the basemap you pass decides which provider the visitor's browser contacts. The definitions in `@mapcairn/core` name public tile providers.
6. Give the page a height and remove the body margin, as the README's `page.css` does: the SDK ships no base stylesheet, and a map in a zero-height container shows nothing.
7. Under a strict Content Security Policy, the page in the README needs `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `font-src 'self'`, `img-src 'self' data: blob: https://tiles.openfreemap.org`, `connect-src 'self' https://tiles.openfreemap.org` and `worker-src 'self' blob:`; the README has the policy as one line. `https://tiles.openfreemap.org` is the origin of the default basemap's style. The consumer check's browser leg runs under the same directives with a mocked style, so the default basemap's real style has not been run under them. `worker-src 'self'` is what a worker from the page's own origin needs, and `blob:` is the engine's fallback (see [Content Security Policy](content-security-policy.md#worker-src)). A Vite 8 build prints 18 `"use client"` warnings (`MODULE_LEVEL_DIRECTIVE`) from the Radix UI packages that `@mapcairn/map` depends on; they are expected and harmless.

What is tested: the README's whole `main.tsx` compiled as an outside app writes it, with its own `/// <reference types="vite/client" />` line and against the SDK's source declarations (through the `@mapcairn/source` condition), and again without that line to see it fail, and the consumer check's real-map leg for the packed packages. The type-check reads source declarations, not the packed ones, and the leg builds a similar app (`scripts/release/consumer`, which has its own `css.d.ts` and a fixed worker URL), not the README's file. The leg builds an app that lists only the umbrella with plain Vite and draws the map in Chromium under the strict policy with a mocked style ([The public API](public-api.md), "The umbrella package"). It runs in the `SDK packages` job, which is a required check on `main`, and the release `check` job does not draw a map, so the `release` skill makes the leg, run with Chromium, a go/no-go item. Plain Vite and Chromium only: other bundlers and browsers are not tried.

### Server and Worker builds that import the adapter

A host that renders on a server, or builds a Worker, and imports `@mapcairn/sdk/adapter-maplibre` from code that build follows may bundle the map engine into the server or Worker build. It runs nothing there, and it is large: a Worker build of a file that imports the adapter measured 1,538 kB of JavaScript, almost all of it the engine (`docs/plans/0016-adapter-maplibre-package.md`). Import the subpath only in code that runs in the browser (a client-only module or a dynamic import behind it), and keep the root `@mapcairn/sdk` for the code both sides share: the root never imports the adapter or the engine. The reference host does this with the `keepBrowserEngineOutOfWorker` plugin in `packages/web/vite.config.ts`.

## Theme the SDK with your own colours

`createThemeStylesheet` in `@mapcairn/theme` makes the stylesheet that gives the SDK's interface your own colours, and refuses a theme that is below WCAG 2.2 AA. It covers the 14 interface colour roles (`surface`, `surfaceRaised`, `text`, `textMuted`, `accent`, `accentTint`, `accentContrast`, `hairline`, `controlBoundary`, `danger`, `dangerTint`, `scrim`, `focusRing`, `focusRingInner`), in light and dark. It does not change the font, the page background, the map overlay colours or the data palette.

1. Put a wrapper with a class or an id that you own around the `MapView` and its chrome. The SDK adds no markup or attribute for this. The scope is matched as a descendant of `:root`, so a class on `<html>` itself does nothing: use the `:root` scope to theme the whole page.
2. Generate the stylesheet in your build, a script or a route, from the same installed `@mapcairn/theme` that provides `tokens.css`. The custom property names it writes are generated and private, so the two must come from one version:

   ```ts
   import { createThemeStylesheet } from "@mapcairn/theme";

   const result = createThemeStylesheet(
     {
       colour: {
         light: { accent: "#0b5c3a", accentTint: "#d9efe4" },
         dark: { accent: "#7fd9aa", accentTint: "#17382a" },
       },
     },
     { scope: ".brand" },
   );
   if (!result.ok) {
     // result.findings holds every pair, with the ones that fail marked
     // `passes: false`; result.invalid and result.invalidScope say what could
     // not be used. There is no CSS to serve.
     throw new Error("The theme is below WCAG 2.2 AA or unusable");
   }
   // Write result.css to a file your site serves, such as /brand-theme.css.
   ```

3. Serve the file from your own origin and link it after the SDK's stylesheets: `<link rel="stylesheet" href="/brand-theme.css">`. It is a plain stylesheet, so a policy with `style-src 'self'` accepts it (see [A content security policy for a host](content-security-policy.md#style-src)), it needs no nonce and it shows no flash.

What to know:

- The scope is `:root`, `#id` or `.class` with an ASCII name. Anything else, including a selector list, is refused. Two maps with different themes are two wrappers, two scopes and two calls.
- The rules read `data-theme` on `<html>` (`light` or `dark`), or the system's colour scheme when it is not set. A `ThemeSource` of your own must set that attribute, as the one in `examples/embed` does.
- The theme is skipped in high-contrast (`prefers-contrast: more`) and forced-colours modes, which keep the SDK's own values. The rules use negated media conditions, such as `(not (prefers-contrast: more))`. A browser that does not understand one treats it as false and so skips the theme, which falls back to the SDK's own colours; the project's browser policy is under "Code style" in [`CONTRIBUTING.md`](https://github.com/MapCairn/mapcairn/blob/main/CONTRIBUTING.md).
- Where the surface is translucent, the stylesheet also sets an opaque surface for browsers without `backdrop-filter` and for reduced transparency, and sets the inner focus ring to it unless you chose one. The check covers those values.
- A tooltip renders in a portal under `body`, outside your wrapper. It takes the colours of the control it belongs to when it opens, so your theme reaches it under any scope, with nothing to add. The colours are read once, as the tooltip opens.
- Each colour must be hex, `rgb()`/`rgba()` or `oklch()`, and is written back as hex. `checkThemeContrast` reports the same findings without producing CSS, for a test of your own.

## Add a basemap

Defining a basemap in the SDK and offering it on a host are separate. `BASEMAPS` holds every basemap the SDK defines (seven today). The reference site does not offer them all: `packages/web/src/basemaps/hostBasemaps.ts` lists the ids it offers, in picker order (six today), and builds its catalogue from them. Defining a basemap does not put it on the site.

1. Add a `BasemapDefinition` to `BASEMAPS` in `packages/core/src/basemaps/basemaps.ts`. Its `name` is a `DefinitionText`: a `MessageKey` (`basemap.<id>.name`, with the English in `EN_GB_CATALOGUE`, so a language can translate it) a `HostText` (`{ key, text }`, translated from `MessageCatalogue.definitionTexts`) or a plain string, which is shown as written and is what a basemap of your own host can use. A `raster` source is a tile URL template with 256 px tiles, and a `vector` source is a MapLibre style URL. Set the zoom limits, the provider credits and `appearance`. For a heavy layer that a vector style can do without (a shaded-relief raster, say), list its style layer id in `saveDataOmitLayers`; Save data mode then leaves it, and any source only it uses, out of the style. The SDK's basemap test lists the tile origins whose terms allow commercial use with no agreement; it fails for a new origin until you have read that provider's terms and added the origin there with the reason.

A host of your own builds a catalogue from `BASEMAPS`, or from its own definitions, and needs nothing more from this repository. To offer the basemap on the reference site as well:

1. Add its id to `HOST_BASEMAP_IDS` in `packages/web/src/basemaps/hostBasemaps.ts`, where you want it in the picker. It fails at start-up, with the id in the message, if the SDK defines no such basemap.
2. Allow the provider's origins in the Content Security Policy (`img-src` and `connect-src`) in `packages/web/src/constants/securityHeaders.ts` and, identically, `packages/web/public/_headers`; a test keeps the two in step. Read the style and its tile sets to find every host they request (sprite, glyphs, terrain), and add only those.
3. Add its id and preview path to `BASEMAP_THUMBNAILS` in `packages/web/src/basemaps/basemapThumbnails.ts`, render the preview with `node scripts/generateBasemapThumbnails.mjs <id>` and commit the image in `packages/web/public/basemaps/`. A basemap with no entry shows the picker's plain swatch.
4. Record the provider in `ATTRIBUTIONS.md` and in the map tiles section of the privacy page (`packages/web/src/app/PrivacyPage.tsx`) and `PRIVACY.md`.
5. Update the basemap constants in `packages/web/e2e/support/basemaps.ts` (`BASEMAP_COUNT` and the rest) and the tests that count basemaps, and the backdrop per basemap in `packages/web/src/basemaps/chromeLegibility.test.ts`. A spec that needs a basemap the site does not offer (the SDK's Colorful, say) runs on a host that offers the SDK's whole list, through `scriptBasemaps` in `packages/web/e2e/support/services.ts`.

To take a basemap off the site while keeping it in the SDK, remove its id from `HOST_BASEMAP_IDS`, its origin from the Content Security Policy, its entry in `BASEMAP_THUMBNAILS` and its preview image, and its provider from `ATTRIBUTIONS.md`, `PRIVACY.md` and the privacy page, if nothing else the site offers uses them. A saved or linked id the site no longer offers opens on Bright.

A provider whose licence the reusable SDK packages must not carry, or whose volunteer-run server should not be sent the traffic of every app built on the SDK, or that asks to be told of use, is not added to `BASEMAPS`. Define it in the host instead. The reference host defines none today: it removed Topographic (a volunteer-run server with no availability guarantee) and Satellite (imagery licensed for non-commercial use only), and a host that needs one writes it as a `BasemapDefinition` of its own, passes it to `createBasemapCatalogue` with the SDK's definitions it offers, and sets `nonCommercial: true` if the licence bars commercial use, which keeps it out of the WebMCP basemap tool. The host's catalogue is built with `createBasemapCatalogue` and passed by the composition root as `Services.basemaps` (see `ARCHITECTURE.md`, host-supplied basemaps). Its preview would be an entry in `BASEMAP_THUMBNAILS`, like the SDK basemaps' (the definition itself names none); leave the entry out when you have no right to a preview image (set `swatch`, a hex colour of your own, so its picker tile does not look like the default).

The default basemap follows the theme until a visitor chooses one: Bright in the light theme and Fiord in the dark theme. A host sets its own with `createBasemapCatalogue(basemaps, defaultId, { light, dark })`: `defaultId` is the fallback and a theme left out uses it. To change the reference site's defaults, change `DEFAULT_BASEMAP_ID` and `DEFAULT_DARK_BASEMAP_ID` with their land colours `DEFAULT_BASEMAP_BACKGROUND` and `DEFAULT_DARK_BASEMAP_BACKGROUND` (the new style's `background` layer colour) in `basemaps.ts`, and the matching `defaultBasemap` and `defaultDarkBasemap` backdrops in `packages/theme/src/tokenValues.ts`, which the `mapBackground` token reads for each theme. A test in `packages/web` fails until they agree. `Settings.basemapId` is `null` until the visitor picks a basemap; read the basemap to draw with `resolveBasemapFor(catalogue, id, theme)`.

## Add a data layer

A layer is data, not code: one definition file, one recorded fixture (feeds only) and the provider's origins in the Content Security Policy. Nothing in the code names a layer, a provider or a response shape. [Serving layers to MapCairn](serving-layers.md) says which kind fits which server, what each costs it, and how to point a layer at an OGC API Features, WMS or WMTS service ([worked examples](serving-layers.md#services-that-speak-open-standards)).

1. Add `packages/web/src/layers/definitions/<id>.ts` with a default export of a `LayerDefinition` (types in `packages/core/src/layers/definition.ts`). It is picked up by `import.meta.glob`, so no list needs editing. A feed names its decoder (`geojson`, or one you register in `packages/web/src/layers/index.ts`), maps fields by dotted path, and describes its style, card and list with templates such as `{time|relative}`. A colour rule needs a shape, a size or the field named on the card, so colour is never the only signal. A tile layer needs no code for a date or time its provider has no tiles for: when the map settles with none of the layer's tiles loaded, the layer's status says no imagery was found for the chosen date or time, beside its control, and says it once through the live region. The status goes when the control changes, or when a tile of the layer loads later, and the live region says so once.
2. For a feed, record a small sample response in `packages/web/src/layers/fixtures/` and add it to `manifest.json` with the number of features it should decode to (and a detail fixture if the layer has `detail`).
3. Add the provider's origins to `public/_headers` and `src/constants/securityHeaders.ts`: feeds in `connect-src`, tiles in `connect-src` and `img-src`.
4. Add the provider's credit to `ATTRIBUTIONS.md` and name the provider in the privacy page and `PRIVACY.md`.

On the reference site, adding a dataset is the maintainer's decision. The `review-layer` skill (`.claude/skills/review-layer/SKILL.md`) is the checklist for a proposed or changed layer: the provider's terms and attribution wording, direct browser access, what the provider learns about a visitor, the origins, failure behaviour and the text. It prepares the review and the questions for the maintainer; it does not add a layer.

The text a person reads in a definition (`name`, `description`, `group`, `dataCost`, `disclaimer`, `emptyText`, control and option labels, the labels of a style's classes, sort labels, the card's link label and the detail source's `label` and `dataCost`) is a `MessageKey`, a `HostText` or a plain string. A plain string is shown as written, which is all a layer of your own host needs; a host that wants its own text translated writes `{ key, text }` and supplies `definitionTexts` in its catalogue (see the [translation guide](translate-the-sdk.md)), with `text` as the source and fallback. The reference host's definitions use keys, so each key is added to `MessageKey`, `EN_GB_CATALOGUE` (with the exact English) and `EXPECTED_PLACEHOLDERS` in `packages/core/src/lint/messages.test.ts`, and to each of the site's translations (`packages/web/src/i18n/af.ts`), which typecheck holds complete.

Card titles and lines, list secondary lines, feed polygon and line labels, and range and interval units use `LayerTemplate`: the existing plain string or an object with a host-defined `key` and source `text`. The optional `MessageCatalogue.layerTemplates` record holds a translation by key; `createMessageCatalogue` accepts it as its fourth argument. A translation may reorder placeholders but must preserve every source field and formatter, including duplicates. If the key is missing or the placeholders differ, the source text is used. A unit includes its own spacing, such as ` per km²`. Vector-tile labels remain plain property names because the map engine reads them directly, and credits in `attribution` are never translated.

Run `npx --no-install vitest run packages/web/src/layers`: the definition-loop test checks the schema, the fixture, the CSP and the credit, and names the line to add for anything missing. A minimal tile layer:

```ts
import type { TileLayerDefinition } from "@mapcairn/core";

const example: TileLayerDefinition = {
  id: "example-overlay",
  name: "Example overlay",
  description: "What the overlay shows, in one sentence.",
  group: "Imagery",
  dataCost: "about 100 KB per screen",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [{ kind: "opacity", id: "opacity", label: "Opacity", default: 0.8 }],
  source: {
    kind: "tiles",
    tiles: "https://tiles.example.org/{z}/{x}/{y}.png",
    tileSize: 256,
    maxzoom: 12,
  },
};

export default example;
```

If the provider fills the part of the world it has no data for with opaque or noisy tiles, add `bounds: [west, south, east, north]` (degrees) to the source, and the map asks for no tile that lies wholly outside the box (a tile that straddles an edge is still drawn whole, so check what the provider returns there). The box must have west less than east, so it cannot cross the antimeridian. This matters most near the poles: on a globe the map stretches the edge row of tiles over the pole, so filler there shows as wedges meeting at the pole. The population layer stops at 60 degrees south for this reason.

### Offer a date and a time

A product the provider names by timestamp, such as one image per half hour, takes a `datetime` control. Its value is the slot's start in UTC, written `YYYY-MM-DDtHHMM` so it fits a link, and the URL template receives it as an ISO instant (`2026-11-11T14:30:00Z`). Set `max` and `default` to the provider's latency with `{ minutesAgo }`, so times that are not out yet are never offered, and say the latency in the description. The ui shows a date input and a list of the times that exist on that day, both in UTC, with the slot shown and the newest one in words. From the half-hourly rainfall layer:

```ts
{
  kind: "datetime",
  id: "time",
  label: "Half hour shown",
  description: "A few half hours have no data. If tiles fail to load, try another time.",
  stepMinutes: 30,
  min: "1998-01-01t0000",
  max: { minutesAgo: 420 },
  default: { minutesAgo: 420 },
}
```

with a tile URL such as `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate_30min/default/{time}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`. Validation refuses a step that does not divide a day, a fixed bound off the step and a default outside fixed bounds. Find the latency by probing the provider's tiles over a few hours rather than trusting a capabilities document, which can lag.

## Style polygons and lines

A feed of polygons or lines uses a `shapes` style. Colour is a rule over one field: `fixed`, `category`, `steps` (explicit class breaks) or `intervals` (equal classes between a `min` and a `max`, one ordinal colour per class). Each class may also set a `pattern` (`stripes`, `dots`, `crosshatch`), a `dash` and a `width`, and a label template draws text with a halo. The key is derived from the style, and the Layers section and the map key (`MapKey`, in `MapChrome`'s `mapKey` slot) both draw it, so a layer needs nothing extra to appear in either. Colour is never the only signal, so validation asks for a different pattern, width or dash in every class, or a label that names the field. The colour names a palette slot, never a value.

```ts
import type { FeedLayerDefinition, ShapeStyle } from "@mapcairn/core";

const districts: FeedLayerDefinition<ShapeStyle> = {
  id: "example-districts",
  name: "Districts by density",
  description: "Example districts shaded by people per square kilometre.",
  group: "Boundaries",
  dataCost: "about 60 KB",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: {
    kind: "feed",
    url: "https://data.example.org/districts.geojson",
    decoder: "geojson",
    fields: {
      id: "properties.code",
      title: "properties.name",
      density: "properties.density",
    },
  },
  style: {
    kind: "shapes",
    geometry: "area",
    colour: {
      kind: "intervals",
      field: "density",
      min: 0,
      max: 300,
      ramp: ["ordinal-1", "ordinal-3", "ordinal-5"],
      unit: " per km²",
      patterns: ["solid", "dots", "crosshatch"],
    },
    label: { template: "{title}", minzoom: 6 },
  },
  card: { title: "{title}", lines: ["About {density|number} per km²"] },
  list: {
    secondary: "About {density|number} per km²",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "No districts could be shown.",
};

export default districts;
```

Labels need a basemap with a glyph source, which the vector basemaps have. On a raster basemap the map draws the fills, patterns and outlines without text, and the list and card keep the words. `world-countries.ts` is a working example, from Natural Earth country outlines.

## Add a heatmap

A `heatmap` layer draws point density from a feed (or a query) and has no cards or list. The radius and intensity come from `range` controls so people can tune it, and the legend names each step of the ramp with a word.

```ts
import type { HeatmapLayerDefinition } from "@mapcairn/core";

const density: HeatmapLayerDefinition = {
  id: "example-density",
  name: "Event density",
  description: "How dense the example events are.",
  group: "Density",
  dataCost: "about 40 KB",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [
    { kind: "range", id: "radius", label: "Radius", min: 4, max: 80, step: 2, default: 20, unit: " px" },
    { kind: "range", id: "intensity", label: "Intensity", min: 0.1, max: 5, step: 0.1, default: 1 },
    { kind: "opacity", id: "opacity", label: "Opacity", default: 0.8 },
  ],
  source: {
    kind: "feed",
    url: "https://data.example.org/events.geojson",
    decoder: "geojson",
    fields: { id: "id", title: "properties.name", weight: "properties.size" },
  },
  heatmap: {
    weightField: "weight",
    radius: { control: "radius" },
    intensity: { control: "intensity" },
    ramp: ["ordinal-1", "ordinal-3", "ordinal-5"],
    words: ["Sparse", "Moderate", "Dense"],
  },
  emptyText: "No events to show.",
};

export default density;
```

## Add vector tiles

A `vector-tiles` layer names a tile URL, a zoom window for the layer, and a style per source layer. Rules read tile properties by name, and a label template may name one property, such as `{name}`. A source layer can also be a `heatmap`. The source's `minzoom` and `maxzoom` are the tile levels the service has; the layer's and each source layer's `minzoom` and `maxzoom` are the zoom levels they are visible at, from `minzoom` up to but not including `maxzoom`. Features stay in the tiles, so the layer has a key and no cards. When the map is outside the layer's own `minzoom` and `maxzoom`, its status line names the level to zoom to: "Zoom in to level 5 or closer to load this layer." or "Zoom out below level 12 to see this layer." A layer without a window says nothing about zoom, and the source's `maxzoom` does not count as one.

```ts
import type { VectorTileLayerDefinition } from "@mapcairn/core";

const parks: VectorTileLayerDefinition = {
  id: "example-areas",
  name: "Parks and water",
  description: "Example areas and roads from vector tiles.",
  group: "Boundaries",
  dataCost: "about 100 KB per screen",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: { kind: "vector-tiles", tiles: "https://tiles.example.org/{z}/{x}/{y}.pbf", maxzoom: 14 },
  minzoom: 3,
  sourceLayers: [
    {
      sourceLayer: "areas",
      style: {
        kind: "shapes",
        geometry: "area",
        colour: {
          kind: "category",
          field: "kind",
          categories: [
            { value: "park", label: "Park", colour: "bluish-green", pattern: "dots" },
            { value: "water", label: "Water", colour: "sky-blue", pattern: "stripes" },
          ],
          other: { label: "Other area", colour: "orange" },
        },
      },
    },
    {
      sourceLayer: "roads",
      minzoom: 8,
      style: {
        kind: "shapes",
        geometry: "line",
        colour: {
          kind: "steps",
          field: "rank",
          steps: [
            { min: 0, label: "Minor road", colour: "ordinal-2", width: 1.5 },
            { min: 5, label: "Major road", colour: "ordinal-4", width: 4, dash: "dashed" },
          ],
        },
      },
    },
  ],
};

export default parks;
```

Tile origins go in `connect-src` and `img-src`, as for raster tiles.

## Identify features on a raster layer

A raster tile layer is a picture, so the tiles themselves have no features. To give a tap a card, add an `identify` block to the layer's definition. It names an `https` URL that answers, in JSON, what is at one point. The browser asks only when someone taps the plain map, or presses `I` for the centre of the map, and only while the layer is on. Hover, movement and a layer that is off send nothing.

```ts
import type { IdentifiableLayerDefinition } from "@mapcairn/core";

const floodDepth: IdentifiableLayerDefinition = {
  id: "example-flood",
  name: "Flood depth",
  description: "Example modelled flood depth, with the depth at a tap.",
  group: "Imagery",
  dataCost: "about 200 KB per screen",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [
    {
      kind: "segmented",
      id: "period",
      label: "Return period",
      options: [
        { value: "20", label: "1 in 20 years" },
        { value: "100", label: "1 in 100 years" },
      ],
      default: "20",
    },
  ],
  source: {
    kind: "tiles",
    tiles: "https://tiles.example.org/flood/{period}/{z}/{y}/{x}.png",
    tileSize: 256,
    maxzoom: 12,
  },
  identify: {
    url: "https://api.example.org/identify/{period}?lng={lng}&lat={lat}&bbox={bbox}&width={width}&height={height}&i={x}&j={y}&zoom={zoom}",
    tolerance: 12,
    decoder: "geojson",
    fields: { id: "id", title: "properties.name", depth: "properties.depth" },
    card: { title: "{title}", lines: ["{depth} m deep"] },
  },
};

export default floodDepth;
```

The `card` sits inside `identify`, not on the layer, and its `lines` list is required, though it may be empty. Check a definition with `validateLayerDefinition(definition, { decoders: createDecoderRegistry(), formatters: createFormatterRegistry() })` from `@mapcairn/core`, passing the registries your host uses. It returns a list of problems, empty when the definition is valid, and each names its path, such as `identify.fields.id`. A layer a catalogue loads goes through the same check, and is skipped with its problems when it fails.

While a layer with an `identify` block is on and showing imagery, its Layers section entry says "Tap the map to see details for this layer." after its legend, and the section adds "Only the first 4 layers are asked on one tap." when more than 4 such layers are on. The section cannot know where a tap will land or whether your host calls `identifyAt`, so it says this for every such layer, including one whose `bounds` miss the tapped place. If a tap takes longer than 400 ms to answer, a "Looking up what is here" line shows at the bottom of the map until the answer comes, or until Escape or the line's Dismiss button ends the lookup. The line says itself to a screen reader once when it appears, and the result is said once when it arrives. A host that builds its own chrome shows that line with `useIdentifyFeedback(layers.identifying)` and `<IdentifyStatus onCancel={layers.cancelIdentify} />` from `@mapcairn/map`, and calls `identifyAt` from its map click and its `I` key (`packages/web/src/app/useMapApp.ts` is the reference).

### Placeholders

The URL is filled for each tap. Every value is encoded, so a comma goes out as `%2C`, and the server decodes it like any query string.

| Placeholder           | Value                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `{lng}`, `{lat}`      | The tapped place in WGS 84 degrees, to six decimal places.                                |
| `{bbox}`              | The box as `minx,miny,maxx,maxy` in EPSG:3857 metres, around the tap.                     |
| `{width}`, `{height}` | The box's size in pixels, which is 2 × tolerance + 1.                                     |
| `{x}`, `{y}`          | The tapped pixel's position in the box, which is the tolerance, so the middle of the box. |
| `{zoom}`              | The map's zoom level, to three decimal places.                                            |
| A control's id        | The layer's control value, as in its tile URL. `{period}` above.                          |

The URL must use `{lng}` and `{lat}`, or all of `{bbox}`, `{width}`, `{height}`, `{x}` and `{y}`. The scheme, host and port must be fixed text, with no placeholder in them. A control or derived variable may not be named `lng`, `lat`, `bbox`, `width`, `height`, `x`, `y` or `zoom`.

`tolerance` is a whole number of pixels from 1 to 20, and the default is 12. The box is a square of 2 × tolerance + 1 pixels at the map's zoom, centred on the tap. For a tap at 0, 0 at zoom 10 with the default tolerance, the request is:

```text
https://api.example.org/identify/20?lng=0&lat=0&bbox=-1910.926%2C-1910.926%2C1910.926%2C1910.926&width=25&height=25&i=12&j=12&zoom=10
```

The box is neither clamped nor shifted at the edges of the world. A tap's longitude is wrapped to -180 up to 180 first, so a tap at 179.9999 gives a box that runs past the edge of the world. Near a pole, `{bbox}` is centred on latitude 85.0511, the limit of Web Mercator, while `{lat}` keeps the tapped latitude. The server decides what to answer for either, and an answer with nothing in it is read as nothing found.

### What the answer may hold

The answer must be JSON, at most 1 MiB, and it is read in one of two shapes:

- **GeoJSON**, with `decoder: "geojson"`. It has a `features` list, and each feature's `fields` are read by dotted path. Coordinates are `[longitude, latitude]` in WGS 84 degrees. A feature with a position beyond 180 in longitude or 90 in latitude is dropped, so a server that answers in its own coordinate system reads as nothing found. A position inside those limits but in another unit would be drawn in the wrong place, so the server must answer in WGS 84. A feature with a missing or `null` geometry, as a server sends for a raster pixel value, is placed at the tap. A document with no `features` list is no features.
- **A JSON list**, with `records` naming its dotted path, such as `results`. `decoder` is still required with `records` and must name a registered decoder, and `geojson` is the usual choice. Each item becomes the properties of a feature at the tap, so a field reads `properties.name`. A path that is not a list is no features.

Without `records`, a decoder other than the built-in `geojson` gets the answer as it came. XML or GML, HTML, plain text (the default `GetFeatureInfo` formats on some servers), JSONP and a POST are not read. A server that cannot send JSON needs a small proxy that asks it and answers in JSON.

### Ids

`id` and `title` are required fields. Map `fields.id` to an attribute the service keeps stable, such as its own identifier. A feature with a missing, `null` or empty id takes its position in the answer. That is unique within one answer but can differ from one tap to the next, so it is not a stable id, and a host should avoid relying on it.

### Limits

A tap asks at most 4 tile layers, in catalogue order. A layer is asked only when it is on, has an `identify` block, covers the tapped place, and the map has not reported that it has no imagery. Any further layers are not asked, and the message says how many were, for example "Asked 4 of 6 layers.". Each request has 8 seconds to answer, and a layer that does not answer in time is named in the message. A layer shows at most 20 features from one answer, and the rest are dropped.

One feature opens its card. Several open a list to choose from. Nothing found says "Nothing found here.", and a layer that did not answer is named in the same message.

### Requests and the page

The request is a `GET` over `https` with no cookies and no referrer, in CORS mode. Its answer is not cached, whatever its `Cache-Control`, because a tap's URL never repeats.

- **Content Security Policy.** The request is a `fetch`, so the host page's `connect-src` must list the identify origin. When it is the same origin as the layer's tiles, that origin is already in `connect-src` and `img-src` and nothing more is needed. A separate API origin goes in the host's policy, as the [Content Security Policy guide](content-security-policy.md) describes.
- **CORS.** The identify endpoint must send `Access-Control-Allow-Origin` for the host's origin. A server that sends it for its tiles may not send it for an identify endpoint, and the browser then refuses the answer, which the layer reports as "did not answer".

## Ask only for what is in view

For a dataset too large to fetch whole, use a `query` source in place of a `feed`. The layer asks for the features inside the current view, after the map has been still for a moment, and asks again only when the view leaves the area it last asked for. A view across the antimeridian is asked for as two boxes, one on each side of the line, each inside -180 to 180, so it costs two requests to the provider instead of one; the answers are joined and a feature in both (the same id and geometry) is kept once. If either request fails the layer shows its error and nothing partial, and each half can return up to `maxFeatures` plus one, so such a view can fetch up to twice the data. It draws at most `maxFeatures`, says "Showing the first N. Zoom in to see more." when there are more, and below `minzoom` asks for nothing and says "Zoom in to level 9 or closer to load this layer.", naming the normalised zoom level the map readout shows. The URL must use `{west}`, `{south}`, `{east}` and `{north}`, and may use `{limit}`, which is `maxFeatures` plus one so the response shows that more exist.

```ts
import type { FeedLayerDefinition, PointStyle } from "@mapcairn/core";

const places: FeedLayerDefinition<PointStyle> = {
  id: "example-places",
  name: "Places in view",
  description: "Example places, requested for the part of the map in view.",
  group: "Places",
  dataCost: "a few KB per screen",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: {
    kind: "query",
    url: "https://api.example.org/places?bbox={west},{south},{east},{north}&limit={limit}",
    decoder: "geojson",
    fields: { id: "id", title: "properties.name", kind: "properties.kind" },
    maxFeatures: 500,
    minzoom: 9,
  },
  style: { colour: { kind: "fixed", colour: "blue", label: "Place" } },
  card: { title: "{title}", lines: ["{kind}"] },
  list: {
    secondary: "{kind}",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "No places in view.",
};

export default places;
```

## Supply layers at runtime

A host with a server of its own usually holds its layer metadata in that server's format, not as MapCairn definitions. `examples/embed/src/mapServerLayers.ts` is a sample of turning the one into the other, and [Serving layers to MapCairn](serving-layers.md) covers what a host's server should serve and how `createRuntimeLayerCatalogue` behaves. The sample's server is made up: `src/serverMetadata.ts` types what it says, and `src/sampleServerLayers.ts` is its answer, a constant, so nothing is requested. `createExampleCatalogue` in `src/exampleServices.ts` passes `createRuntimeLayerCatalogue` a `load` that returns the example's own layer and the mapper's output, and the fake layer source answers for the feed layers.

What `mapServerLayers` maps, using only what the SDK already offers:

- **A field list** becomes the field map, the card and the list. The first object id (`oid`) identifies a feature and the first text field titles it. A card line shows each other field as `Label: {name}`, through the built-in `number` formatter for an integer or a double and `date` for a date. A field of another type (a blob) is left out, as is one whose name a template cannot read. A field called `id` or `title` that is not the identifier or the title is kept under `id-field` or `title-field`, so it cannot replace them, and a style, a filter or a sort that names it follows. The list's second line is the first card line (the feature's title when there is none), with a sort by title and one by each number. A layer's `visibleValues` becomes `source.filter`. A layer with no object id is skipped with `source.fields.id: is required`, and one with no text field with `source.fields.title: is required` and `card.title: {title} is not a field`.
- **A renderer** becomes a style, and `legendFor` derives the legend from it, so nothing maps a legend by hand. Unique values become a `category` rule, class breaks `steps` and equal intervals `intervals`. The SDK's point styles take `steps` and no `intervals`, so equal intervals map for polygons and lines only. Colours come from the palette in order and never from the server: the palette has five ordinal colours and seven categorical ones, so a rule has at most five classes, or six values and the class for every other value, and equal intervals need at least two classes. A rule over the limit is skipped with the class that has no colour (`style.colour.ramp[5]: must name a palette colour`, for example), however many classes the server claims. A polygon or line coloured by a field also gets a label that names that field, because the SDK needs a second signal beyond colour.
- **A tile service** becomes a raster layer whose legend is the server's, on the ordinal colours, so the legend has at most five entries (a sixth is skipped with `legend[5].colour: must name a palette colour`).
- **An id** such as `Huts_2024` becomes `huts-2024`, since a definition's id is lowercase letters, digits and hyphens. Braces are taken out of a label so a server cannot open a template placeholder.

The mapper does not check what it makes. A layer it cannot use becomes a candidate the catalogue skips, as `partitionDefinitions` does for any definition, and `onSkipped` gets the layer's id and each problem as a `path: message` line. In the sample, `survey-notes` has no text field, so the catalogue skips it with `source.fields.title: is required` and `card.title: {title} is not a field`, and the example writes one console line for it (`logSkippedLayers`). The checks stay in core. A layer whose metadata the mapper cannot read at all (no `credit`, no field list, an id that is not text) becomes a value that is not an object, which the catalogue skips with `definition: must be an object` and no id, and the layers around it are unaffected. The mapper's input is typed `ServerLayerList`, and only the layers inside the list are read defensively: a host that receives raw JSON checks that it is an object with a `layers` array before it maps it.

No mapping helper was added to `@mapcairn/core`. The sample needs only `CATEGORICAL_SLOTS`, `ORDINAL_SLOTS` and the runtime catalogue, and restates two rules core keeps to itself, the name a template placeholder may have (`PLACEHOLDER` in `packages/core/src/layers/template.ts`) and the form of a layer id (`ID` in `packages/core/src/layers/validateSupport.ts`), in a comment in `mapServerLayers.ts`. A host with a differently shaped server writes its own mapper, with the same tests: its payload to the definitions it expects, and a payload it cannot map to the problems the catalogue reports (`mapServerLayers.test.ts` does both).

## Add a routing provider

The Directions tool appears only when `services.routing` exists, and the SDK ships no provider. To offer directions, write one adapter and pass it as `routing` in the `Services` your app builds, as "Register it" under "Write a search provider" shows. The steps name the reference site's folders (`packages/web/...`); in your own app, read each as the matching place in your code, and read the reference site's adapter as an example, not as something to import.

1. Implement `RoutingProvider` from `@mapcairn/core` in `packages/web/src/adapters/routing`. `route({ stops, mode, signal })` returns one line feature for each leg with its distance in metres and time in seconds, and `reachableArea({ origin, minutes, mode, signal })` returns polygon features. Reject only with `RoutingError` (`network`, `invalid`, `no-route`, `rate-limited`, `aborted`, `unsupported`), and honour the `AbortSignal`. Keep to the service's usage limits inside the adapter, for example with `RequestSpacer` from `adapters/shared`, and send no cookies. Send a referrer only where the service's terms ask for one, and then only the site's origin, with the maintainer's decision and the privacy page and `PRIVACY.md` updated to say so: `ValhallaRoutingProvider` sets `referrerPolicy: "strict-origin"` for the public Valhalla server, which asks for a valid Referer, and a browser never puts the address fragment (where the map view and the pin are kept) in a Referer.
2. Run `runRoutingProviderContract` against it with a scripted `fetch`, as `ValhallaRoutingProvider.test.ts` does, and add recorded sample responses as fixtures. Read every body, an error body included, through a bounded reader like `readJsonWithin` with a limit that fits the service, and make the contract subject lower it so `respondWithOversizeAnswer()` stays small: an answer over the limit must fail as `invalid`.
3. Register it as `routing` in the `Services` your app builds (in the reference site, `createServices()`). Nothing else in the app names it.
4. Allow its origin in `connect-src` in `packages/web/public/_headers` and `constants/securityHeaders.ts`, name the service on the privacy page and in `PRIVACY.md` and `ATTRIBUTIONS.md`, and pass its credit and a note about what a request sends to the Directions panel (`routingCredits` in `packages/web/src/constants/routingCredits.ts`, which takes the link text for Fix the map from the catalogue, and the `host.notes.routing` message).

The SDK ships no routing provider and carries none of these terms. The reference site uses the public Valhalla server run by FOSSGIS, under [its usage terms](https://fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen) (in German), and that server needs: OpenStreetMap attribution and a link to <https://www.openstreetmap.org/fixthemap>, no more than one request a second, a contact address for the site, a User-Agent that identifies the application (an unmodified browser's is enough) and, where possible, a Referer. It may not be used for bulk downloads or by a high-traffic site, commercial use is allowed only when routing is not a substantial part of the offering, and it has no availability guarantee and may change or end without notice. A host that is commercial, has high traffic or needs the service to stay up should run its own [Valhalla](https://github.com/valhalla/valhalla) (MIT licensed) or pay for a routing service, and pass that address as `endpoint` to `ValhallaRoutingProvider`, or write its own adapter.

Leave `routing` out and the Directions button, panel and overlays are never mounted, so a host without a service carries no dead controls.

## Write a search provider

The search pill, the address lookup on the pin card and the map's move to a result all work on two ports from `@mapcairn/core`, and the SDK ships no adapter for a named service, because a service's terms must not travel inside an SDK package. A host writes its own, over a geocoder it runs or is allowed to use, or over an index it owns. `examples/embed` does this over a few invented places held in memory: `src/placeSearch.ts` holds the two providers, `src/samplePlaces.ts` the data and `src/placeSearch.test.ts` the contract suites. It requests nothing, because its `fetch` is a local function that answers from that list, and the providers run their real request, mapping and error code against it.

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

Moving the map is the host's job, not the provider's or the pill's: the pill calls its `onSelect` prop with the picked result. The reference host fits `bounds` when there are some and otherwise centres at a fixed zoom (`flyTo` in `packages/web/src/app/useMapApp.ts`), and the example does the same in `src/showResult.ts`. A host that only reads `centre` still works, but frames a glen or a lake as a point.

### What the pill and the provider each do

The pill (`useSearch` in `packages/map/src/tools/SearchPill`) searches only when the person submits, for at least two characters after trimming. It answers a typed coordinate pair itself, without the provider, and aborts the request before a new one starts, so a provider never needs to track which answer is current. When a search finds exactly one place, `SearchPill` goes straight to it (`UseSearchOptions.onPick`, which a host using `useSearch` alone may pass; it returns `false` to decline, and the single result then shows as a list), as long as the search box still has focus, and announces "Showing {label} on the map." instead of the count. It passes `bias` only when the host gives `SearchPill` a `getBias` function, so a provider can ignore `bias` and a host that sends it must say so in its privacy text.

The provider owns what is particular to its service: building the request, mapping the answer, and keeping to the service's usage limits (such as a minimum time between requests), since every caller shares them. For a blank query it resolves `[]` or rejects with a `SearchError`; the contract accepts either, and resolving `[]` without a request is simpler and sends nothing.

### Errors and cancellation

Reject only with these two, and do not let a raw `TypeError` or `SyntaxError` escape:

- `SearchError`, with a `kind`: `offline` (the request could not be made because the device has no connection), `rate-limited` (the service answered HTTP 429, or its equivalent) or `failed` (anything else, including a bad status, a body that is not what the service documents and a timeout). The pill shows a message for each kind and a Retry button, and treats any other error as `failed`.
- `PortAbortError`, when the `AbortSignal` fires. The pill ignores it: an aborted request never changes what is shown or reaches the live region.

To honour the signal, throw `PortAbortError` at the start if `signal.aborted` is already true, pass the signal to `fetch`, and turn the `AbortError` that `fetch` rejects with (or any failure after `signal.aborted` became true) into `PortAbortError`. `getJson` in the example's `placeSearch.ts` does all three, and tells `offline` from `failed` with `navigator.onLine`. The reference adapters take an `isOnline` function instead, which `createServices()` feeds from `DevicePreferences.online`, so there is one source of the signal.

### Map an answer to results

Keep the mapping in small functions that take the service's raw item and return a `SearchResult` or `null`, and drop an item that has no usable position instead of failing the whole answer.

A service that returns a GeoJSON `FeatureCollection`, as several open geocoders do, puts the point in `geometry.coordinates` as `[longitude, latitude]` and, when it has one, the extent in `bbox` as `[west, south, east, north]` (RFC 7946). Some services use a different order for their own extent field, so read the service's documentation and test with a recorded answer.

```ts
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

A plain JSON endpoint is the same job with that endpoint's names. The example's service sends `{ results: [{ id, name, area, lat, lon, box }] }`, with `box` as `[south, west, north, east]`, and `toSearchResult` in `src/placeSearch.ts` maps one item. Check each field's type before you use it, since the body comes from outside your code.

### Test it with the contract suite

The SDK's contract suites check what the ports promise: the shape of a result, an empty array for no match, each `SearchError` kind, `PortAbortError` before and during a request, and `null` from `reverse` when there is no place. Run them against your adapter with the network scripted, as `NominatimSearchProvider.test.ts` and the example's `placeSearch.test.ts` do:

```ts
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

`create` is called for each test, so every test gets a fresh provider. `willReturn` makes every later `search` return those results and `reverse` return the first, or `null` for an empty list; `hold` keeps the next request pending until its signal aborts, so the double must reject with an `AbortError` when `init.signal` fires. `respondWithOversizeAnswer` makes every later request read an answer larger than the limit your provider puts on the size of an answer (lower the limit in the subject so the answer stays small), and the suite requires the request to fail as `failed`. `runSuggestionProviderContract` takes the same controls. Read the body through a bounded reader like `readJsonWithin` in the reference host's `adapters/shared` (the helper is private to the host, so a host of its own writes one), so a service cannot make the page hold an answer of any size. In this repository `packages/core/src/lint/bodyReads.test.ts` fails when any source file reads a body another way. The suites import `vitest`, which `@mapcairn/core` declares as an optional peer, so the host installs it with its tests. The contract does not check your mapping of a real answer, so also test it with recorded answers from the service, a bad item, a body that is not JSON and an HTTP error.

### Register it

Pass the provider in the `Services` the app is built from. A host that builds its own `Services` sets `search` and, if it has one, `suggestions`; the example starts from the fakes and replaces the two parts:

```ts
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

The words are the host's. `PinCard` takes a `lookupNote` for the line under "Look up address", `SheetContent` and `SettingsSection` take a `privacyNote` for Settings, and the defaults name no service because the SDK does not know which one a host uses. The reference host fills them from `host.notes.pinLookup` and `host.notes.privacy` in its catalogues and mirrors the text in [`PRIVACY.md`](https://github.com/MapCairn/mapcairn/blob/main/PRIVACY.md); that file describes the reference site only.

## Add search suggestions

The search pill suggests places as the person types only when `services.suggestions` exists, and the SDK ships no provider, because a service built for typing has its own terms. To offer suggestions, write one adapter and register it, as for routing:

1. Implement `SuggestionProvider` from `@mapcairn/core` in `packages/web/src/adapters/search`. `suggest(query, { limit, signal })` resolves `SearchResult`s, each with a centre and optionally an extent, so picking one needs no second lookup. Reject only with `SearchError` (`offline`, `rate-limited`, `failed`) or `PortAbortError`, give each request a timeout, keep to the service's usage limits inside the adapter with `RequestSpacer`, and send no cookies or referrer. `PhotonSuggestionProvider` is the example.
2. Run `runSuggestionProviderContract` against it with a scripted `fetch`, as `PhotonSuggestionProvider.test.ts` does.
3. Register it as `suggestions` in `createServices()`. Leave it out and the pill keeps submit-only search.
4. Allow its origin in `connect-src`, and say on the privacy page and in `PRIVACY.md`, `ATTRIBUTIONS.md` and the host's Settings note (`host.notes.privacy` in `EN_GB_CATALOGUE` and each language's catalogue) that the text typed so far goes to it as the person types. That is more than a submitted search sends, so the text must say it plainly.

When to ask is not the adapter's job. `useSuggestions` waits for a pause in typing, asks for at least three characters, cancels what a newer keystroke supersedes, stops for a cooldown after repeated failures and announces once that suggestions are unavailable.

**Self-host Photon for commercial use.** The reference host points at the public Photon server, `https://photon.komoot.io`. Its operator states only that clients should be fair and publishes no terms for commercial use. A host that is commercial, or that expects real traffic, should run its own Photon server on OpenStreetMap data and pass its address to the adapter, `new PhotonSuggestionProvider({ endpoint: "https://photon.example.org/api/" })`, with that origin in `connect-src`. The SDK packages do not name the public server and carry no terms of it.

## Add an adapter

Define the port, write its fake and contract suite, write the real adapter in `packages/web/src/adapters` and register it in `createServices()`. A host that builds its own `Services` may supply any adapter that passes the port's contract suite (the suites import `vitest`, which `@mapcairn/core` declares as an optional peer, so the host installs it with its tests). `fileOpener` and `suggestions` are optional, as `routing` is: leave it out and the Shapes section has no Import control, or supply one, for example a native app's own picker, that passes `runFileOpenerContract`. [`ARCHITECTURE.md`](https://github.com/MapCairn/mapcairn/blob/main/ARCHITECTURE.md#adding-an-adapter) has the steps.
