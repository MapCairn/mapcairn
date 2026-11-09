# Karta

Karta is an SDK for public-interest map layer platforms. It provides a domain-agnostic layer model, React map components, hooks and typed design tokens.

`packages/web` is an empty-map reference host. It includes basemaps, place search, distance and area measurement, theme settings and language selection. No datasets or domain-specific overlays are bundled. The site has no accounts and no tracking beyond cookieless page views.

## Documentation

| Document | Covers |
|---|---|
| [`docs/building-a-domain.md`](docs/building-a-domain.md) | Supplying a layer configuration to the SDK |
| [`docs/adding-a-locale.md`](docs/adding-a-locale.md) | Adding a UI language to the web host |
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
npm run dev -w @karta/web
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for checks and conventions, [`SECURITY.md`](SECURITY.md) for private vulnerability reporting and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for community expectations.

## Licence

Licensed under [AGPL-3.0](LICENSE). If you host a modified version, you must publish its source. See [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) for software and basemap credits and [`PRIVACY.md`](PRIVACY.md) for the privacy policy.
