# MapCairn

[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/16543/badge)](https://www.bestpractices.dev/projects/16543)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/MapCairn/mapcairn/badge)](https://scorecard.dev/viewer/?uri=github.com/MapCairn/mapcairn)

**MapCairn is an open-source React SDK for map applications that need to be accessible and private, with a finished interface.** It is built on MapLibre GL JS and is meant for teams building public-interest map applications, such as open data and hazard maps. It gives them the parts a map renderer leaves to them: the whole interface around the map, open data layers written as data, measuring and drawing tools, a design system, and small interfaces that keep every service replaceable and testable.

**Status:** the SDK is usable from this repository, but the packages are not on npm yet. Publishing them is part of the First release milestone in [`ROADMAP.md`](ROADMAP.md).

## Try the playground

The playground at [mapcairn.timothybrits.co.za/map](https://mapcairn.timothybrits.co.za/map) is a complete map built from the SDK's four packages, and it is where the SDK is shown working and where its browser tests run. Search for a place, measure a distance or draw a shape, turn on an open data layer such as earthquakes or rainfall, switch the interface between English and Afrikaans in Settings, and open Help to find the About block that links back here.

## Embed a map

This is a whole app. It mounts the map with the SDK's interface around it and a search box at the top:

```tsx
import { createFakeServices } from "@mapcairn/core";
import {
  FocusRegistryProvider,
  LiveRegionProvider,
  MapChrome,
  MapView,
  SearchPill,
  ServicesProvider,
  TooltipProvider,
  useBasemaps,
  useMap,
} from "@mapcairn/map";
import { type ReactNode, useState } from "react";

export function App() {
  const [services] = useState(createFakeServices);
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
  return (
    <MapView
      initialView={{
        center: { lat: -33.92, lng: 18.42 },
        zoom: 11,
        bearing: 0,
      }}
      basemap={basemaps.resolve(basemaps.defaultId)}
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
```

`createFakeServices()` runs the interface on the SDK's in-memory fakes, so it requests nothing and draws no map tiles. A real map swaps in a `MapAdapter` over MapLibre GL JS: the playground's adapter is the reference today, and it is not yet shipped as a package of its own.

[`examples/embed`](examples/embed/README.md) is the full version of this app, with the end stack of controls, the sheet, the measure tool, layers and a search provider of its own, and a test in `packages/core/src/lint/readme.test.ts` fails if this snippet uses an import, a component or a prop that the example does not. [`docs/guides/extending.md`](docs/guides/extending.md) lists what an app provides around it (the vanilla-extract Vite plugin, base styles and the font).

The SDK does not depend on the playground's framework. The playground is a server-rendered React 19 app on React Router, Vite and Cloudflare Workers, but the SDK packages import neither React Router nor MapLibre, the two that use React (`map` and `react`) take it as a peer, and `examples/embed` is a plain Vite and React app. The SDK should therefore render in any React 19 app whose bundler compiles vanilla-extract styles (the example uses its Vite plugin), though no other framework has been tried here. There is no prebuilt bundle for pages without React yet, and no guide yet for serving the SDK bundle from a Windows web server or a server-rendered page.

## What the SDK adds to a map renderer

**A finished interface.** Search with optional suggestions as you type, zoom and compass controls, a bottom sheet that becomes a side panel on wide screens, measuring, drawing and editing shapes with GeoJSON, CSV and WKT import and export, directions through your own routing provider, a layers panel with keys, feature cards, saving the map as an image, and links that carry the view, the basemap, the layers and drawn shapes.

**Layers as data.** A layer is one definition: a feed, raster or vector tiles, a heatmap, or a query for what is in view. The SDK draws it, builds its key, card and list, keeps words beside every colour, and validates the definition. A host can list its layers or load them at runtime, and a runtime definition that fails validation is left out with the reasons. See [A layer is data](#a-layer-is-data) below.

**Accessibility.** WCAG 2.2 AA is the target in both themes, every gesture has a keyboard or single-tap equivalent, announcements go through one live region, and the layout mirrors for right-to-left languages.

**Privacy.** Apart from the basemap, nothing is requested until a person asks: a layer loads when it is turned on, a search when it is submitted, an address or a route when one is asked for. The exception is search suggestions, which a host may turn on and which send the text typed so far. The SDK has no accounts and no tracking, and the panels that say what is sent to a provider take the host's own wording, with neutral defaults that name no provider.

**Ports and fakes.** The interface never imports MapLibre or an adapter, and reaches a browser service only through a port. Search, suggestions, routing, geolocation, storage, the clipboard, URL state, layers and the map engine are small interfaces (ports), each with an in-memory fake and a shared contract suite. You can test the whole interface without WebGL or a network, and check your own adapter against the same suite as the fake.

**A design system.** Typed tokens only, light and dark themes, one accent, IBM Plex Sans and Lucide icons. The contrast of every token pair is calculated in a test, and a style scanner rejects raw colours, off-scale spacing and unnamed controls.

**Translation.** The interface's text is looked up by key in a message catalogue, so a host can translate or replace it. The SDK ships British English; a host can add languages, and Settings then offers a choice. The [translation guide](docs/guides/translate-the-sdk.md) covers it.

**Server rendering.** The map host, chrome, sheet and readout are tested to render no style attributes on the server, so a server-rendered page can keep a Content Security Policy with no `unsafe-inline`. The playground renders its page and a placeholder of the chrome on the server and hydrates; the map itself is drawn in the browser. The [Content Security Policy guide](docs/guides/content-security-policy.md) lists what a host page needs.

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

Feeds, polygons and lines with patterns, heatmaps, vector tiles and queries for what is in view work the same way: see [`docs/guides/extending.md`](docs/guides/extending.md). [`docs/guides/serving-layers.md`](docs/guides/serving-layers.md) has worked layers for OGC API Features, WMS and WMTS services.

## When MapCairn fits, and when it does not

It fits a team that:

- builds in React and wants a complete, accessible map interface rather than a blank canvas;
- shows open data from providers the browser can reach directly, and wants each layer requested only when a person turns it on;
- wants to test its map interface without a browser or WebGL, against fakes;
- can publish its source under AGPL-3.0, or will discuss other terms (see [Licence](#licence)).

It is not the right choice today if you need:

- a hosted service, a dataset or accounts. MapCairn is code: you choose each provider (tiles, search, routing) and its terms, and you host the app;
- GIS analysis. MapCairn is not a GIS analysis engine: it measures, draws and has geometry helpers, but does no overlay analysis or geoprocessing;
- a map engine other than MapLibre GL JS, or tilt, terrain and 3D buildings;
- to `npm install` it, to mount it in a page without React, or to reach layers behind a login;
- your own colours and font with contrast checked, clustering of dense points or offline use.

A map renderer on its own leaves every interface decision to you, which is the better choice when your interface has little in common with a map application. The [capability matrix](docs/guides/capability-matrix.md) lists what MapCairn has, partly has and lacks, with the issue for each gap that has one, and [`ROADMAP.md`](ROADMAP.md) says what comes next.

## Quick start

You need Node 24 or newer and npm 11 or newer.

```bash
git clone https://github.com/MapCairn/mapcairn.git
cd mapcairn
npm install
npm run dev
```

`npm run dev` serves the playground on port 5173. `npm run dev -w @mapcairn/example-embed` runs the example app instead. [`CONTRIBUTING.md`](CONTRIBUTING.md) lists the checks.

## How it is checked

- **The playground** is built from the four packages and is what the browser tests run against, on desktop and mobile Chromium, with the basemap, keyboard, sheet and app-shell tests also on iPhone WebKit and in a right-to-left layout.
- **The example app** imports the SDK by package name only. It is type-checked, built and tested on every pull request, so a missing export or build step fails CI.
- **Coverage floors:** `npm run test:coverage` fails below 95% of statements, branches, functions and lines across the four SDK packages.
- **Contract suites:** each port has one suite, run against its fake and, where the playground has one, its real adapter, so they cannot drift apart.
- **Accessibility:** automated axe checks for WCAG 2.0 A and AA and WCAG 2.1 and 2.2 AA run in the required `e2e` check on every pull request.
- **Security and licences:** CodeQL, a secret scan, OpenSSF Scorecard, and a lint check that every production dependency of an SDK package has a permissive licence.

## Packages

| Package                                       | Provides                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`@mapcairn/core`](packages/core/README.md)   | The port interfaces, pure logic, basemap definitions, fakes and contract suites. No React, no browser globals |
| [`@mapcairn/map`](packages/map/README.md)     | The map interface: chrome, sheet and panels, tools, `MapView` and the services provider                       |
| [`@mapcairn/react`](packages/react/README.md) | Generic React hooks                                                                                           |
| [`@mapcairn/theme`](packages/theme/README.md) | The typed design tokens and their contrast calculations                                                       |

`packages/web` is the playground, called the reference host in the rest of the documentation.

## Documentation

| Document                                                                             | Covers                                                                                                     |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                                                 | Layers, ports and adapters, the map adapter, adding an adapter                                             |
| [`DESIGN.md`](DESIGN.md)                                                             | Tokens, layout slots, accessibility contracts and the lint rules                                           |
| [`docs/guides/extending.md`](docs/guides/extending.md)                               | Embedding the SDK, and adding a basemap, each kind of data layer, a search or routing provider, an adapter |
| [`docs/guides/translate-the-sdk.md`](docs/guides/translate-the-sdk.md)               | Another language, a choice of languages, translating definitions, your own message-format library          |
| [`docs/guides/serving-layers.md`](docs/guides/serving-layers.md)                     | Which layer kind to serve from your own server, what each costs, and OGC API Features, WMS and WMTS layers |
| [`docs/guides/content-security-policy.md`](docs/guides/content-security-policy.md)   | The Content Security Policy a page hosting the SDK needs, and why                                          |
| [`docs/guides/using-the-reference-site.md`](docs/guides/using-the-reference-site.md) | Using the playground: search, saving the map, choosing between features, drawing, import and export        |
| [`docs/guides/capability-matrix.md`](docs/guides/capability-matrix.md)               | What a GIS application needs, what MapCairn has, partly has or lacks, and the issue for each gap           |
| [`docs/guides/performance.md`](docs/guides/performance.md)                           | What was measured for Lighthouse, what was tried and what was left alone                                   |
| [`docs/guides/working-with-agents.md`](docs/guides/working-with-agents.md)           | Using a coding agent on this repository: what each one reads and how to start                              |
| [`docs/plans/`](docs/plans/README.md)                                                | Numbered plans for work not yet built                                                                      |
| [`GOVERNANCE.md`](GOVERNANCE.md)                                                     | The maintainer role, how decisions are made, and what is not yet covered                                   |
| [`ROADMAP.md`](ROADMAP.md)                                                           | What the project intends to do in the next twelve months, and what it will not do                          |
| [`docs/assurance-case.md`](docs/assurance-case.md)                                   | Security requirements, trust boundaries, threat model and the evidence for each                            |
| [`AGENTS.md`](AGENTS.md)                                                             | Working rules for people and AI changing the code                                                          |

## Contributing, security and conduct

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for checks and conventions, [`GOVERNANCE.md`](GOVERNANCE.md) for who decides what, [`ROADMAP.md`](ROADMAP.md) for what is planned and what is not, [`SECURITY.md`](SECURITY.md) for private vulnerability reporting (with the [assurance case](docs/assurance-case.md)) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for community expectations.

Everyone is welcome to use the coding agent they prefer, and the same rules in [`AGENTS.md`](AGENTS.md) apply to all of them. [`docs/guides/working-with-agents.md`](docs/guides/working-with-agents.md) lists what Claude Code, Codex, OpenCode, GitHub Copilot, Antigravity, Cursor and Qwen Code read, as checked against their documentation, how to start, and what has not been tried.

## Licence

MapCairn is licensed under [AGPL-3.0](LICENSE), and each SDK package (`packages/core`, `packages/map`, `packages/react` and `packages/theme`) carries its own copy. If you ship the SDK in a product, or let people use a modified version over a network, you must publish the corresponding source under the same licence.

The SDK packages depend only on permissively licensed packages (MIT, BSD, Apache-2.0, ISC and similar), and `npm run lint` fails when a new production dependency of one has any other licence.

The author welcomes conversations about other terms for closed-source use. A commercial licence is not on offer yet, and any that is agreed would go towards the continued development of MapCairn. Contact the author at [mapcairn@timothybrits.co.za](mailto:mapcairn@timothybrits.co.za).

See [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) for software and basemap credits and [`PRIVACY.md`](PRIVACY.md) for the privacy policy.
