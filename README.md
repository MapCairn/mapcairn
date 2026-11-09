# Karta

Karta is a reusable SDK for public-interest map platforms, with a reference host. The SDK is built on ports and adapters: the interface and the pure logic depend on small interfaces, and one place wires in the map engine and the browser services. MapLibre GL JS is the only map engine.

`packages/web` is the reference host, an empty map with basemaps, place search, distance and area measurement, a pin, and theme and unit settings. No datasets or domain-specific overlays are bundled. The site has no accounts and no tracking beyond cookieless page views. [`docs/plans/`](docs/plans/README.md) holds plans for work that is not built yet, such as the first data layers.

## Documentation

| Document | Covers |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Layers, ports and adapters, the map adapter, adding an adapter |
| [`DESIGN.md`](DESIGN.md) | Tokens, layout slots, accessibility contracts and the lint rules. The living style guide is at `/design` in development and e2e builds only |
| [`docs/plans/`](docs/plans/README.md) | Numbered plans for work not yet built |
| [`packages/core/README.md`](packages/core/README.md) | Ports, pure logic, basemaps, fakes and contract suites |
| [`packages/map/README.md`](packages/map/README.md) | Map user interface, `MapView` and the services provider |
| [`packages/react/README.md`](packages/react/README.md) | Generic React hooks |
| [`packages/theme/README.md`](packages/theme/README.md) | Design tokens |
| [`AGENTS.md`](AGENTS.md) | Guidance for people and AI working in the repository |

## Stack

- Five npm workspaces: `@karta/core`, `@karta/map`, `@karta/react`, `@karta/theme` and `@karta/web`.
- React, TypeScript, React Router framework mode, Vite and MapLibre GL JS.
- Vanilla-extract styling, IBM Plex Sans (self-hosted) and Lucide icons.
- Cloudflare Workers for server rendering and static assets.
- English only (British English).

## Development

Use Node 24 or newer and npm 11 or newer. `.node-version` selects Node 24.

```bash
npm install
npm run dev
```

| Script | Does |
|---|---|
| `npm run dev` | Vite SSR dev server with hot reload at http://localhost:5173. It never touches Cloudflare |
| `npm start` | Builds the e2e-mode bundle, then serves it through wrangler at http://localhost:4173. This is the server the end-to-end tests use |
| `npm run build` | Production build of every workspace |
| `npm run lint` | Biome, dependency-cruiser (layer and import rules) and the harmony scanner (style and markup rules) |
| `npm run typecheck` | Type checks every workspace |
| `npm test` | Unit tests (Vitest) |
| `npm run test:coverage` | Unit tests with coverage thresholds |
| `npm run e2e` | Playwright end-to-end tests, without the accessibility subset |
| `npm run a11y` | The accessibility subset of the Playwright tests, tagged `@a11y` |
| `npm run check` | Lint, typecheck, unit tests, build, e2e and a11y in sequence |

## How to

### Run the tests

```bash
npm test                                  # unit tests, all packages
npx --no-install vitest run path/to/file.test.ts   # one file
npm run playwright:install -w @karta/web  # once, to install the browsers
npm run e2e                               # end-to-end tests
npm run a11y                              # accessibility tests
```

Playwright starts `npm start` itself and reuses a server already running on port 4173. The tests mock basemap tiles, styles and place search, so they need no network.

### Add a basemap

1. Add a `BasemapDefinition` to `BASEMAPS` in `packages/core/src/basemaps/basemaps.ts`. A `raster` source is a tile URL template with 256 px tiles, and a `vector` source is a MapLibre style URL. Set the zoom limits, the provider credits and `appearance`.
2. Allow the provider's origins in the Content Security Policy in `packages/web/public/_headers` (`img-src` and `connect-src`).
3. Render its picker preview with `node scripts/generateBasemapThumbnails.mjs <id>` and commit the image in `packages/web/public/basemaps/`.
4. Record the provider in `ATTRIBUTIONS.md` and in the map tiles section of the privacy page (`packages/web/src/app/PrivacyPage.tsx`) and `PRIVACY.md`.
5. Update the basemap constants in `packages/web/e2e/support/basemaps.ts` and the tests that count basemaps.

Liberty is the default basemap in both themes; the basemap never follows the light or dark theme. To change the default, change `DEFAULT_BASEMAP_ID` and `DEFAULT_BASEMAP_BACKGROUND` (the new style's `background` layer colour) in `basemaps.ts`, and the matching `liberty` backdrop in `packages/theme/src/tokenValues.ts`. A test in `packages/web` fails until the two colours agree.

### Add an adapter

Define the port, write its fake and contract suite, write the real adapter in `packages/web/src/adapters` and register it in `createServices()`. [`ARCHITECTURE.md`](ARCHITECTURE.md#adding-an-adapter) has the steps.

## Contributing, security and conduct

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for checks and conventions, [`SECURITY.md`](SECURITY.md) for private vulnerability reporting and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for community expectations.

## Licence

Karta is licensed in two parts.

| Part | Licence |
|---|---|
| SDK packages: `packages/core`, `packages/map`, `packages/react`, `packages/theme` | [Apache-2.0](packages/core/LICENSE), so you can use them in open or closed source projects |
| Reference host: `packages/web` and the rest of the repository | [AGPL-3.0](LICENSE). If you host a modified version, you must publish its source |

See [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) for software and basemap credits and [`PRIVACY.md`](PRIVACY.md) for the privacy policy.
