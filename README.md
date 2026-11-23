<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/logo-mark-dark.svg">
    <img src="docs/brand/logo-mark-light.svg" alt="The MapCairn logo: a stack of four uneven stones" width="96" height="96">
  </picture>
</p>

# MapCairn

[![CI](https://github.com/MapCairn/mapcairn/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MapCairn/mapcairn/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/release/MapCairn/mapcairn)](https://github.com/MapCairn/mapcairn/releases)
[![npm version](https://img.shields.io/npm/v/@mapcairn/sdk)](https://www.npmjs.com/package/@mapcairn/sdk)
[![Licence: AGPL-3.0-only](https://img.shields.io/badge/licence-AGPL--3.0--only-blue)](LICENSE)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/16543/badge)](https://www.bestpractices.dev/projects/16543)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/MapCairn/mapcairn/badge)](https://scorecard.dev/viewer/?uri=github.com/MapCairn/mapcairn)

**MapCairn is an open-source React SDK for maps that serve the public.** It is for teams building public-interest map applications, such as open data and hazard maps, who would rather spend their time on the data than on the interface around it. MapCairn supplies that interface on top of MapLibre GL JS: search, measuring and drawing tools, a layers panel and a design system, built to be accessible and private. Open data layers are written as data, and every service the map talks to sits behind a small interface, so it can be replaced or faked in a test.

This repository also holds the playground, a reference site built from the SDK's packages.

```bash
npm install @mapcairn/sdk react react-dom maplibre-gl
```

That needs React 19, `maplibre-gl` 6.18 or later and an ESM bundler that handles CSS imports (tested with Vite), and a TypeScript `moduleResolution` of `bundler`, `node16` or `nodenext`. [Embed a map](#embed-a-map) shows a whole app.

<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/playground-dark.png">
    <img src="docs/images/playground-light.png" alt="The playground showing Africa with the earthquakes layer turned on for the past week and a straight line measured from the south of the continent to Kenya, about 4,000 kilometres, with the map credits open at the bottom right" width="100%">
  </picture>
</p>

The playground in its light and dark themes, with the earthquakes layer on and a distance measured. Map data and tile credits are in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).

**Status:** pre-1.0. While the version starts with `0.`, a minor release (the middle number) can contain a breaking change to the public API and a patch release (the last number) is not meant to, so a `^0.1.0` range takes patch releases but not the next minor release. The [changelog](CHANGELOG.md) names each breaking change the release finds, and [what counts as the public API](https://mapcairn.timothybrits.co.za/docs/guides/public-api/) says what is covered.

## Embed a map

The install command at the top of this page installs `@mapcairn/sdk`. It is the one package most apps need: it holds the whole SDK, with one stylesheet and two import paths, the interface from the root and the MapLibre adapter that draws the map from a subpath. React is a peer dependency and `maplibre-gl` is a required peer, because the adapter needs the engine, so a strict package manager wants both listed in that command.

`@mapcairn/sdk` re-exports `core`, `map`, `react` and `theme` from its root, and the MapLibre adapter at `@mapcairn/sdk/adapter-maplibre`. Its root never imports the engine, so an app that does not import the subpath carries none. Its stylesheet is the three the packages ship, in order: tokens, the map's, the engine's. The individual packages are the advanced option, for a host that wants fewer dependencies: `core` has no React or browser dependency, `theme` installs without the interface, and the adapter is a package of its own (see [Packages](#packages)). [`packages/sdk/README.md`](packages/sdk/README.md) lists the entry points and says how to keep one copy of a package when you also list it directly.

A map that shows is three files in a Vite and React project: the page, a style sheet that gives the map a height, and the entry file. Together they are a whole app. It mounts the map with the SDK's interface around it and a search box at the top, and builds its services with the MapLibre adapter. The adapter needs the URL of the engine's worker file, which in a Vite app is the bundler's own worker URL import.

`index.html`:

```html
<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My map</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/page.css`. The SDK ships no base stylesheet, so the page gives the map its height and removes the body margin; without these the map is zero pixels high and nothing shows:

```css
html,
body,
#root {
  height: 100%;
  margin: 0;
}
```

`src/main.tsx`:

```tsx
/// <reference types="vite/client" />
import "@mapcairn/sdk/styles.css";
import "./page.css";
import {
  createFakeServices,
  defaultBasemapFor,
  FocusRegistryProvider,
  LiveRegionProvider,
  MapChrome,
  MapView,
  SearchPill,
  ServicesProvider,
  TooltipProvider,
  useBasemaps,
  useMap,
  useTheme,
} from "@mapcairn/sdk";
import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";
import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";

const services = createFakeServices({
  createMapAdapter: () =>
    createMapLibreMapAdapter({
      loadWorkerUrl: async () => {
        const worker = await import(
          "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
        );
        return worker.default;
      },
    }),
});

function App() {
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <TooltipProvider>
          <MapScreen />
        </TooltipProvider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
}

function MapScreen() {
  const basemaps = useBasemaps();
  const { resolved } = useTheme();
  return (
    <MapView
      initialView={{
        center: { lat: -33.92, lng: 18.42 },
        zoom: 11,
        bearing: 0,
      }}
      basemap={defaultBasemapFor(basemaps, resolved)}
      chrome={(background) => <Chrome background={background} />}
    />
  );
}

function Chrome({ background }: { readonly background: ReactNode }) {
  const map = useMap();
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <MapChrome
        background={background}
        modal={false}
        topStart={
          <SearchPill
            onSelect={(result) =>
              map.adapter?.setView({ center: result.centre, zoom: 14 })
            }
          />
        }
      />
    </FocusRegistryProvider>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("The page has no #root element.");
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

The first line of `main.tsx`, `/// <reference types="vite/client" />`, gives TypeScript the types of the `?worker&url` import and of a plain CSS import. Vite's `react-ts` template (`npm create vite@latest -- --template react-ts`, whose `index.html` and `src/main.tsx` you replace with the two above) already lists `vite/client` in its `tsconfig` types, so the line is only needed when your project does not. Without the types, `tsc --noEmit` reports TS2307 for the worker import, always, and TS2882 for `import "./page.css"` when `noUncheckedSideEffectImports` is on, as it is by default in the TypeScript 7.0 checked here.

Search and the rest of the interface run on the SDK's in-memory fakes, so search shows sample results until you add a search adapter, and nothing but the map is requested. Another bundler must serve `maplibre-gl/dist/maplibre-gl-worker.mjs` as a same-origin file and resolve `loadWorkerUrl` to its address. The adapter makes no request until a map mounts, and then asks only for what the basemap you pass `MapView` names. The basemap shown follows the theme: `defaultBasemapFor(basemaps, resolved)` gives the built-in catalogue's Bright in the light theme and Fiord in the dark theme, so the map and its placeholder colour agree in both. Both are served by a public tile provider (OpenFreeMap), so choose the basemap whose terms and privacy you accept. To show one basemap in every theme, pass `basemaps.resolve(id)` instead and leave `useTheme` out; an id the catalogue does not hold gives the catalogue's default, Bright in the built-in one.

Under a strict Content Security Policy, this page needs only the default basemaps' origin (Bright and Fiord share it), `https://tiles.openfreemap.org`, in `connect-src` and `img-src`, with the worker served from the page's own origin. A policy line to start from. The release's consumer check builds this page from the blocks above as written and runs it in Chromium under exactly this line, with the default basemap's real Bright style document and stand-in tiles, sprite and glyphs answered locally. It fails on any violation, and fails if the page still draws with `https://tiles.openfreemap.org` taken out of `connect-src` or `'self'` out of `worker-src`. The `img-src` entry is not proved by it: Bright's layers load no raster tiles and taking the origin out raised no violation, so it stays for a basemap that does.

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tiles.openfreemap.org; font-src 'self'; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:
```

[Content Security Policy](https://mapcairn.timothybrits.co.za/docs/guides/content-security-policy/) says what each directive is for, including when `worker-src` needs `blob:`. A Vite 8 build prints 18 `"use client"` warnings (`MODULE_LEVEL_DIRECTIVE`) from the Radix UI packages that `@mapcairn/map` depends on; they are expected and harmless.

What is tested, and what is not, is in [Extending MapCairn](https://mapcairn.timothybrits.co.za/docs/guides/extending/#show-a-real-map): a test compiles `main.tsx` as written, and the release's consumer check builds this page's blocks as written and draws the map from them in Chromium under the policy line above.

[`examples/embed`](examples/embed/README.md) is the full version of this app, on the fakes and written against the four packages directly, so that CI proves each package's own entry points. It has the end stack of controls, the sheet, the measure tool, layers and a search provider of its own, and a test fails if the app above uses an import, a component or a prop that the example does not (an import from `@mapcairn/sdk` counts as the package it re-exports; the adapter's import is checked by compiling the block instead). [Extending MapCairn](https://mapcairn.timothybrits.co.za/docs/guides/extending/) lists what an app provides around it, including the font, which the app above leaves to the system. Whether the SDK should ship base styles or stable alias properties for theming is not decided.

The SDK does not depend on the playground's framework. The playground is a server-rendered React 19 app on React Router, Vite and Cloudflare Workers, but the SDK packages import neither React Router nor MapLibre, the two that use React (`map` and `react`) take it as a peer, and `examples/embed` is a plain Vite and React app. The SDK's styles are compiled to plain stylesheets, so it needs no vanilla-extract plugin and should render in any React 19 app whose bundler handles a CSS import, though no other framework has been tried here. There is no prebuilt bundle for pages without React yet. [Serving MapCairn from IIS](https://mapcairn.timothybrits.co.za/docs/guides/serving-from-iis/) covers serving a build you make yourself from IIS and a server-rendered page; it was checked against Microsoft's documentation and not run on a Windows server.

## Try the playground

The playground at [mapcairn.timothybrits.co.za/map](https://mapcairn.timothybrits.co.za/map) is a complete map built from the SDK's packages, and it is where the SDK is shown working and where its browser tests run. Search for a place, measure a distance or draw a shape, turn on an open data layer such as earthquakes or rainfall, switch the interface between English and Afrikaans in Settings, and open Help to find the About block that links back here. The recording below searches for a place, turns on the earthquakes layer for the past week, measures a distance and opens the map credits.

<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/playground-demo-dark.gif">
    <img src="docs/images/playground-demo.gif" alt="A recording of the playground: a search box suggests places, the earthquakes layer is turned on for the past week in Map options, a distance is measured across Africa and the map credits are opened" width="100%">
  </picture>
</p>

## What the SDK adds to a map renderer

**A finished interface.** Search with optional suggestions as you type, zoom and compass controls, a bottom sheet that becomes a side panel on wide screens, measuring, drawing and editing shapes with GeoJSON, CSV and WKT import and export, directions through your own routing provider, a layers panel with keys, feature cards, saving the map as an image, and links that carry the view, the basemap, the layers and drawn shapes.

**Layers as data.** A layer is one definition: a feed, raster or vector tiles, a heatmap, or a query for what is in view. The SDK draws it, builds its key, card and list, keeps words beside every colour, and validates the definition. A host can list its layers or load them at runtime, and a runtime definition that fails validation is left out with the reasons. See [A layer is data](#a-layer-is-data) below.

**Accessibility.** WCAG 2.2 AA is the target in both themes, every gesture has a keyboard or single-tap equivalent, announcements go through one live region, and the layout mirrors for right-to-left languages.

**Privacy.** Apart from the basemap, nothing is requested until a person asks: a layer loads when it is turned on, a search when it is submitted, an address or a route when one is asked for. The exception is search suggestions, which a host may turn on and which send the text typed so far. The SDK has no accounts and no tracking, and the panels that say what is sent to a provider take the host's own wording, with neutral defaults that name no provider.

**Ports and fakes.** The interface never imports MapLibre or an adapter, and reaches a browser service only through a port. Search, suggestions, routing, geolocation, storage, the clipboard, URL state, layers and the map engine are small interfaces (ports), each with an in-memory fake and a shared contract suite. You can test the whole interface without WebGL or a network, and check your own adapter against the same suite as the fake.

**A design system.** Typed tokens only, light and dark themes, one accent, IBM Plex Sans and Phosphor icons. The contrast of every token pair is calculated in a test, and a style scanner rejects raw colours, off-scale spacing and unnamed controls.

**Translation.** The interface's text is looked up by key in a message catalogue, so a host can translate or replace it, in a language written left to right or right to left. A host can also translate its layer templates, unit symbols, coordinate words and its own definition labels. The SDK sets the page direction from the language tag, formats numbers, lists and days for the language, reads coordinates typed with other digits, isolates coordinates and names inside right-to-left text, and adjusts type tracking and line height for non-Latin scripts. The SDK ships British English and the reference site offers Afrikaans; a host supplies its own catalogue for any other language, and a font for a script IBM Plex Sans does not cover. Settings offers a choice when a host offers more than one language. The [translation guide](https://mapcairn.timothybrits.co.za/docs/guides/translate-the-sdk/) says what the SDK supplies, what a host supplies and what is not covered.

**Server rendering.** The map host, chrome, sheet and readout are tested to render no style attributes on the server, so a server-rendered page can keep a Content Security Policy with no `unsafe-inline`. The playground renders its page and a placeholder of the chrome on the server and hydrates; the map itself is drawn in the browser. The [Content Security Policy guide](https://mapcairn.timothybrits.co.za/docs/guides/content-security-policy/) lists what a host page needs.

**Pure, tested logic.** Geometry, measurement, formatting, URL state and the surface state machine are plain functions with no DOM, and the readers of untrusted text (WKT, shape files, coordinates and share links) have property-based tests.

## A layer is data

This is a whole raster tile layer. The key, the opacity control, the credit and the privacy and Content Security Policy checks come from it.

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

Feeds, polygons and lines with patterns, heatmaps, vector tiles and queries for what is in view work the same way: see [Extending MapCairn](https://mapcairn.timothybrits.co.za/docs/guides/extending/). [Serving layers to MapCairn](https://mapcairn.timothybrits.co.za/docs/guides/serving-layers/) has worked layers for OGC API Features, WMS and WMTS services.

## When MapCairn fits, and when it does not

It fits a team that:

- builds in React and wants a complete, accessible map interface rather than a blank canvas;
- shows open data from providers the browser can reach directly, and wants each layer requested only when a person turns it on;
- wants to test its map interface without a browser or WebGL, against fakes;
- can offer its app's source, under AGPL-3.0-only (which allows commercial use), to the people who use it (see [Licence](#licence)).

It is not the right choice today if you need:

- a hosted service, a dataset or accounts. MapCairn is code: you choose each provider (tiles, search, routing) and its terms, and you host the app;
- GIS analysis. MapCairn is not a GIS analysis engine: it measures, draws and has geometry helpers, but does no overlay analysis or geoprocessing;
- a map engine other than MapLibre GL JS, or tilt, terrain and 3D buildings;
- to mount it in a page without React, or to reach layers behind a login;
- your own font, or colours beyond the 14 interface roles, clustering of dense points or offline use.

A map renderer on its own leaves every interface decision to you, which is the better choice when your interface has little in common with a map application. The [capability matrix](https://mapcairn.timothybrits.co.za/docs/guides/capability-matrix/) lists what MapCairn has, partly has and lacks, with the issue for each gap that has one, and [`ROADMAP.md`](ROADMAP.md) says what comes next.

## Run the playground from source

This is for working on MapCairn itself, not for using it in an app. You need Node 24 or newer and npm 11 or newer, which the repository's `engines` require.

```bash
git clone https://github.com/MapCairn/mapcairn.git
cd mapcairn
npm install
npm run dev
```

`npm run dev` serves the playground on port 5173. `npm run dev -w @mapcairn/example-embed` runs the example app instead, and `npm run dev -w @mapcairn/docs` serves the documentation site on port 4410. [`CONTRIBUTING.md`](CONTRIBUTING.md) lists the checks.

## How it is checked

- **The playground** is built from the SDK packages and is what the browser tests run against, on desktop and mobile Chromium, with the basemap, keyboard, sheet and app-shell tests also on iPhone WebKit and in a right-to-left layout, and the core specs on desktop Firefox in an advisory job.
- **The example app** imports the SDK by package name only. It is type-checked, built and tested on every pull request, so a missing export or build step fails CI.
- **Coverage floors:** `npm run test:coverage` fails below 95% of statements, branches, functions and lines across the SDK packages.
- **Contract suites:** each port has one suite, run against its fake and, where the playground has one, its real adapter, so they cannot drift apart.
- **Accessibility:** automated axe checks for WCAG 2.0 A and AA and WCAG 2.1 and 2.2 AA run in the required `e2e` check on every pull request.
- **Security and licences:** CodeQL, a secret scan, OpenSSF Scorecard, and a lint check that every production dependency of an SDK package has a permissive licence.

## Packages

Most apps install only `@mapcairn/sdk`. The packages inside it are published on their own too, and each is the advanced option, for a host that wants fewer dependencies or only one piece.

| Package                                                             | Provides                                                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@mapcairn/sdk`](packages/sdk/README.md)                           | Recommended. Everything below from one install and one import, with one stylesheet. It holds no code of its own                               |
| [`@mapcairn/core`](packages/core/README.md)                         | Inside the SDK. The port interfaces, pure logic, basemap definitions, fakes and contract suites. No React, no browser globals                 |
| [`@mapcairn/map`](packages/map/README.md)                           | Inside the SDK. The map interface: chrome, sheet and panels, tools, `MapView` and the services provider                                       |
| [`@mapcairn/react`](packages/react/README.md)                       | Inside the SDK. Generic React hooks                                                                                                           |
| [`@mapcairn/theme`](packages/theme/README.md)                       | Inside the SDK. The typed design tokens and their contrast calculations                                                                       |
| [`@mapcairn/adapter-maplibre`](packages/adapter-maplibre/README.md) | Inside the SDK, at `@mapcairn/sdk/adapter-maplibre`. The MapLibre GL JS map adapter and its engine styles. `maplibre-gl` is a peer dependency |

`packages/web` is the playground, called the reference host in the rest of the documentation.

## Documentation

The [documentation site](https://mapcairn.timothybrits.co.za/docs/) is built from [`sites/docs`](sites/docs) and served at `/docs/` on the reference site ([plan 0017](docs/plans/0017-documentation-site.md)). Start with its [Get started](https://mapcairn.timothybrits.co.za/docs/get-started/) page. It also holds a page for each common task, the API reference generated from the packages, the roadmap, a changelog page for each release and a troubleshooting page, and it searches its own text in the browser. Its pages are available as Markdown, one file each, in [`/docs/llms.txt`](https://mapcairn.timothybrits.co.za/docs/llms.txt) and [`/docs/llms-full.txt`](https://mapcairn.timothybrits.co.za/docs/llms-full.txt), and as data in [`/docs/pages.json`](https://mapcairn.timothybrits.co.za/docs/pages.json) and [`/docs/api.json`](https://mapcairn.timothybrits.co.za/docs/api.json). The guides for people who use or extend the SDK or the reference site are its pages, and the links below go to them; the site builds its Architecture and Design system pages from `ARCHITECTURE.md` and `DESIGN.md`, which stay in the repository. The rows with a file name are files in the repository.

| Document                                                                                              | Covers                                                                                                     |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                                                                  | Layers, ports and adapters, the map adapter, adding an adapter                                             |
| [`DESIGN.md`](DESIGN.md)                                                                              | Tokens, layout slots, accessibility contracts and the lint rules                                           |
| [The public API](https://mapcairn.timothybrits.co.za/docs/guides/public-api/)                         | What counts as the SDK's public API beyond its exports, the API reports and how a change is classed        |
| [Embed a map](https://mapcairn.timothybrits.co.za/docs/guides/embed-a-map/)                           | The whole embedding app, file by file, with what each part does; the product page links it                 |
| [Extending MapCairn](https://mapcairn.timothybrits.co.za/docs/guides/extending/)                      | Embedding the SDK, and adding a basemap, each kind of data layer, a search or routing provider, an adapter |
| [What the AGPL means for your project](https://mapcairn.timothybrits.co.za/docs/guides/licence/)      | What the AGPL means for your project, for people who know MIT, Apache-2.0 and GPL-3.0                      |
| [Translate the SDK](https://mapcairn.timothybrits.co.za/docs/guides/translate-the-sdk/)               | Another language, a choice of languages, translating definitions, your own message-format library          |
| [Serving layers to MapCairn](https://mapcairn.timothybrits.co.za/docs/guides/serving-layers/)         | Which layer kind to serve from your own server, what each costs, and OGC API Features, WMS and WMTS layers |
| [Content Security Policy](https://mapcairn.timothybrits.co.za/docs/guides/content-security-policy/)   | The Content Security Policy a page hosting the SDK needs, and why                                          |
| [Serving MapCairn from IIS](https://mapcairn.timothybrits.co.za/docs/guides/serving-from-iis/)        | Serving a build of the SDK from IIS and from a server-rendered page such as a Razor page                   |
| [Using the reference site](https://mapcairn.timothybrits.co.za/docs/guides/using-the-reference-site/) | Using the playground: search, saving the map, choosing between features, drawing, import and export        |
| [Capability matrix](https://mapcairn.timothybrits.co.za/docs/guides/capability-matrix/)               | What a GIS application needs, what MapCairn has, partly has or lacks, and the issue for each gap           |
| [Performance](https://mapcairn.timothybrits.co.za/docs/guides/performance/)                           | What was measured for Lighthouse, what was tried and what was left alone                                   |
| [`docs/guides/product-captures.md`](docs/guides/product-captures.md)                                  | How the product page's pictures of the playground are taken again, their budgets and their credits         |
| [`docs/guides/working-with-agents.md`](docs/guides/working-with-agents.md)                            | Using a coding agent on this repository: what each one reads and how to start                              |
| [`docs/guides/personal-preferences.md`](docs/guides/personal-preferences.md)                          | Keeping your own working style for a coding agent in a git-ignored file, not in the shared rules           |
| [`docs/plans/`](docs/plans/README.md)                                                                 | Numbered plans for work not yet built                                                                      |
| [`GOVERNANCE.md`](GOVERNANCE.md)                                                                      | The maintainer role, how decisions are made, and what is not yet covered                                   |
| [`ROADMAP.md`](ROADMAP.md)                                                                            | What the project intends to do in the next twelve months, and what it will not do                          |
| [`docs/assurance-case.md`](docs/assurance-case.md)                                                    | Security requirements, trust boundaries, threat model and the evidence for each                            |
| [`AGENTS.md`](AGENTS.md)                                                                              | Working rules for people and AI changing the code                                                          |

## Contributing, security and conduct

Ask a question in [Discussions](https://github.com/MapCairn/mapcairn/discussions), and report a bug or propose a change in the [issue tracker](https://github.com/MapCairn/mapcairn/issues). Report a security problem privately, as [`SECURITY.md`](SECURITY.md) explains, not in an issue.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for checks and conventions, [`GOVERNANCE.md`](GOVERNANCE.md) for who decides what, [`ROADMAP.md`](ROADMAP.md) for what is planned and what is not, [`SECURITY.md`](SECURITY.md) for private vulnerability reporting (with the [assurance case](docs/assurance-case.md)) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for community expectations.

Everyone is welcome to use the coding agent they prefer, and the same rules in [`AGENTS.md`](AGENTS.md) apply to all of them. [`docs/guides/working-with-agents.md`](docs/guides/working-with-agents.md) lists what Claude Code, Codex, OpenCode, GitHub Copilot, Antigravity, Cursor and Qwen Code read, as checked against their documentation, how to start, and what has not been tried.

## Licence

MapCairn is licensed under [AGPL-3.0-only](LICENSE), an open-source licence that allows commercial use, and each SDK package (`packages/core`, `packages/map`, `packages/react`, `packages/theme`, `packages/adapter-maplibre` and `packages/sdk`) carries its own copy. If you distribute an app that includes the SDK, including by serving it to people's browsers, you must offer them the corresponding source of the code you combine with the SDK and serve with it, under the same licence. If you modify the SDK and let people interact with your modified version over a network, you must offer them its corresponding source. [What the licence means for your project](https://mapcairn.timothybrits.co.za/docs/guides/licence/) says it in plain words and is not legal advice.

The SDK packages depend only on permissively licensed packages (MIT, BSD, Apache-2.0, ISC and similar), and `npm run lint` fails when a new production dependency of one has any other licence.

See [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) for software and basemap credits and [`PRIVACY.md`](PRIVACY.md) for the privacy policy.
