# MapCairn

[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/16543/badge)](https://www.bestpractices.dev/projects/16543)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/MapCairn/mapcairn/badge)](https://scorecard.dev/viewer/?uri=github.com/MapCairn/mapcairn)

**An open-source SDK for building accessible, privacy-respecting map applications on MapLibre and React.** It gives a public-interest project the parts that are slow to get right: a complete map interface, open data layers defined as data, measuring and drawing tools, and a design system, all behind small interfaces so the map engine and every service stay replaceable.

## Why use MapCairn in your GIS project

- **A finished map interface, not a blank canvas.** Search with optional suggestions as you type, zoom and compass controls, a bottom sheet that becomes a side panel on wide screens, measuring, drawing and editing shapes with GeoJSON, CSV and WKT import and export, directions through your own routing provider, a layers panel, feature cards, saving the map as an image, and links that carry the view, the basemap and the layers.
- **Open data layers as data.** A layer is one definition: a feed, raster or vector tiles, a heatmap, or a query for what is in view. MapCairn draws it, builds the legend, the card and the list, keeps words beside every colour, and checks the definition, its fixture, its credit and your Content Security Policy in a test. There is no code per layer.
- **Accessible by construction.** WCAG 2.2 AA is the target in both themes, every gesture has a keyboard or single-tap equivalent, announcements go through one live region, and automated accessibility checks run in CI.
- **Private by design.** Nothing is requested until a person asks, except the search suggestions a host may turn on, which send the text typed so far. There are no accounts and no tracking, nothing is proxied, and every provider the app can contact is named in its privacy policy and credits.
- **Your services behind ports.** The interface never imports MapLibre or a browser API. Search, search suggestions, routing, storage, geolocation, the clipboard and the rest are small interfaces, each with a fake and a shared contract suite, so you can test the whole interface without WebGL and replace any service without touching the interface.
- **A design system you can trust.** Typed tokens only, light and dark, contrast calculations tested in CI, and one accent. A style scanner rejects raw colours, off-scale spacing and unnamed controls.
- **Pure, tested logic.** Geometry, measurement, formatting, URL state and the surface state machine are plain functions with no DOM, covered by unit tests with 95 percent coverage floors, and the parsers that read untrusted text by property-based tests.
- **Server-renderable.** The reference host runs on Cloudflare Workers under a strict Content Security Policy with no inline script except one hashed one.

What it is not: a hosted service, a dataset or a GIS analysis engine. MapLibre GL JS is the only map engine, and the interface is in English (British).

## A layer is data

This is a whole raster tile layer. The legend, the opacity control, the credit and the privacy and Content Security Policy checks come from it.

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

Feeds, polygons and lines with patterns, heatmaps, vector tiles and queries for what is in view work the same way: see [`docs/guides/extending.md`](docs/guides/extending.md).

## What is in the box

| Package | Provides |
|---|---|
| [`@mapcairn/core`](packages/core/README.md) | The port interfaces, pure logic, basemap definitions, fakes and contract suites. No React, no browser globals |
| [`@mapcairn/map`](packages/map/README.md) | The map interface: chrome, sheet and panels, tools, `MapView` and the services provider |
| [`@mapcairn/react`](packages/react/README.md) | Generic React hooks |
| [`@mapcairn/theme`](packages/theme/README.md) | The typed design tokens and their contrast calculations |

`packages/web` is the reference host: a complete map built from those four packages, running at [mapcairn.timothybrits.co.za](https://mapcairn.timothybrits.co.za). It shows what the SDK composes and is what the tests run against; it is a demonstration, not the product.

## Status

The packages are not published to npm yet; the work is tracked in the roadmap. Today you use the SDK from this repository. Run `npm install` and `npm run dev` for the reference host, and read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the checks.

## Documentation

| Document | Covers |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Layers, ports and adapters, the map adapter, adding an adapter |
| [`DESIGN.md`](DESIGN.md) | Tokens, layout slots, accessibility contracts and the lint rules |
| [`docs/guides/extending.md`](docs/guides/extending.md) | Embedding the SDK in an app of your own (with the example in `examples/embed`), and adding a basemap, a data layer of each kind, layers supplied at runtime, a routing provider or an adapter |
| [`docs/guides/serving-layers.md`](docs/guides/serving-layers.md) | Which layer kind to serve from your own server, from raster tiles to GeoJSON by bounding box, and what each costs the server |
| [`docs/guides/using-the-reference-site.md`](docs/guides/using-the-reference-site.md) | Searching by place name or coordinates, saving the map, choosing between features at one place, and drawing, importing and exporting shapes |
| [`docs/guides/performance.md`](docs/guides/performance.md) | What was measured for Lighthouse, what was tried and what was left alone |
| [`docs/guides/working-with-agents.md`](docs/guides/working-with-agents.md) | Using Claude Code, Codex, opencode, GitHub Copilot, Antigravity, Cursor or Qwen Code on this repository: what each reads, how to start, and what is Claude Code only |
| [`docs/plans/`](docs/plans/README.md) | Numbered plans for work not yet built |
| [`GOVERNANCE.md`](GOVERNANCE.md) | The maintainer role, how decisions are made, and what is not yet covered |
| [`ROADMAP.md`](ROADMAP.md) | What the project intends to do in the next twelve months, and what it will not do |
| [`docs/assurance-case.md`](docs/assurance-case.md) | Security requirements, trust boundaries, threat model and the evidence for each |
| [`AGENTS.md`](AGENTS.md) | Working rules for people and AI changing the code |

## Contributing, security and conduct

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for checks and conventions, [`GOVERNANCE.md`](GOVERNANCE.md) for who decides what, [`ROADMAP.md`](ROADMAP.md) for what is planned and what is not, [`SECURITY.md`](SECURITY.md) for private vulnerability reporting (with the [assurance case](docs/assurance-case.md)) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for community expectations.

Everyone is welcome to use the coding agent they prefer, and the same rules in [`AGENTS.md`](AGENTS.md) apply to all of them. [`docs/guides/working-with-agents.md`](docs/guides/working-with-agents.md) lists what Claude Code, Codex, opencode, GitHub Copilot, Antigravity, Cursor and Qwen Code read, as checked against their documentation, how to start, and what has not been tried.

## Licence

MapCairn is licensed under [AGPL-3.0](LICENSE), and each SDK package (`packages/core`, `packages/map`, `packages/react` and `packages/theme`) carries its own copy. If you ship the SDK in a product, or let people use a modified version over a network, you must publish the corresponding source under the same licence.

There is no commercial licence on offer yet, but the author is open to discussing other terms for closed-source use. Contact the author at [mapcairn@timothybrits.co.za](mailto:mapcairn@timothybrits.co.za).

See [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) for software and basemap credits and [`PRIVACY.md`](PRIVACY.md) for the privacy policy.
