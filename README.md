# Karta

Karta is an SDK for public-interest map layer platforms. It provides a domain-agnostic layer model, React map components, hooks and typed design tokens.

`packages/web` is an empty-map reference host. It includes basemaps, place search, distance and area measurement and theme settings. No datasets or domain-specific overlays are bundled. The site has no accounts and no tracking beyond cookieless page views.

## Documentation

| Document | Covers |
|---|---|
| [`docs/building-a-domain.md`](docs/building-a-domain.md) | Supplying a layer configuration to the SDK |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Layers, ports and adapters, the map adapter |
| [`DESIGN.md`](DESIGN.md) | Tokens, layout slots and accessibility contracts |
| [`docs/design-system.md`](docs/design-system.md) | Colours, typography, shape and map styling |
| [`packages/core/README.md`](packages/core/README.md) | Layer model, registry, geodata utilities and measurement |
| [`packages/map/README.md`](packages/map/README.md) | Map components and UI primitives |
| [`packages/react/README.md`](packages/react/README.md) | Generic React hooks |
| [`packages/theme/README.md`](packages/theme/README.md) | Typed design-token contract |

## Stack

- Five npm workspaces: `@karta/core`, `@karta/map`, `@karta/react`, `@karta/theme` and `@karta/web`.
- React, TypeScript, React Router framework mode, Vite, Leaflet and MapLibre.
- Vanilla-extract styling and self-hosted fonts.
- Cloudflare Workers for server rendering and static assets.

## Development

Use Node 24.22.1 or newer (Node 24 is tested) and npm 11 or newer.

```bash
npm install
npm run dev
```

| Script | Does |
|---|---|
| `npm run dev` | Dev server with hot reload at http://localhost:5173 |
| `npm start` | Builds, then serves the production build locally at http://localhost:4173 |
| `npm run build` | Production build of every workspace |
| `npm run lint` | Biome and dependency-cruiser (layer and import rules) |
| `npm run typecheck` | Type checks every workspace |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Playwright end-to-end tests, without the accessibility subset |
| `npm run a11y` | The accessibility subset of the Playwright tests, tagged `@a11y` |
| `npm run check` | Lint, typecheck, unit tests, build, e2e and a11y in sequence |

Playwright starts its own server with `npm start` and reuses one that is already running on port 4173. Install browsers once with `npm run playwright:install -w @karta/web`.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for checks and conventions, [`SECURITY.md`](SECURITY.md) for private vulnerability reporting and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for community expectations.

## Licence

Licensed under [AGPL-3.0](LICENSE). If you host a modified version, you must publish its source. See [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) for software and basemap credits and [`PRIVACY.md`](PRIVACY.md) for the privacy policy.
