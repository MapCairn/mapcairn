# AGENTS.md

Guidance for humans and AI working in this repository. `CLAUDE.md` imports this file with `@AGENTS.md` and adds its own workflow rules.

## About

Karta is a reusable SDK for public-interest geospatial layer platforms. Four SDK packages provide a domain-agnostic layer model, map rendering, React hooks and a typed design-token contract. `packages/web` is an SSR reference host with an empty map: basemaps, place search, distance and area measurement and theme settings. No datasets or domain-specific overlays are bundled.

The published host runs on Cloudflare Workers. It has no accounts and no tracking beyond cookieless page views. Client error reports are logged as described in `PRIVACY.md`.

## Commands

Use Node 24.22.1 or newer (Node 24 is tested) and npm 11 or newer. `.node-version` selects Node 24; `package.json` pins the package manager to npm 11.

```bash
npm install
npm test
npm run test:coverage
npm run typecheck
npm run build
npm run lint
npm run format
npm run dev -w @karta/web
```

`npm test` runs Vitest across `packages/*`. Coverage thresholds are 95% for statements, branches, functions and lines in `core`, `map`, `react` and `theme`. `packages/web` has lower floors (about 70% statements and lines), because its layout and touch-gesture code is covered by Playwright. Aim for 100% behavioural coverage. Run one file with `npx --no-install vitest run path/to/file.test.ts`.

`typecheck` checks every workspace, including web route types. `lint` runs Biome and dependency-cruiser. Pre-commit runs Biome on staged files and dependency-cruiser, but does not run typecheck, tests or coverage.

CI checks lint, typecheck, coverage and build. Lighthouse and Playwright have separate workflows.

### Browser tests

```bash
npm run playwright:install -w @karta/web
npm run test:e2e -w @karta/web
npm run test:e2e:local -w @karta/web
npm run test:e2e:mobile -w @karta/web
```

Playwright builds and starts the preview itself on port 4173. `wrangler.e2e.jsonc` omits production routes so the old-hostname redirect is not exercised locally. The suite mocks basemap requests to avoid depending on external tile services.

Projects cover desktop Chromium, mobile Chromium and iPhone WebKit. WebKit runs the vector-basemap spec because MapLibre worker startup can fail differently on iOS. Emulation cannot reproduce an iPhone GPU; basemap changes still need a real-device check.

## Engineering principles

- Test first. Write a failing behavioural test, observe the intended failure, then implement the change. Do not weaken assertions or exclude code to satisfy coverage.
- Follow SOLID. Keep SDK contracts domain-agnostic and pass configuration through props and context. New consumer layer ids must not require id-based branches in SDK code.
- Follow DRY, KISS and YAGNI. Reuse shared logic and tokens, but do not build speculative features.
- Stay on task. Avoid unrelated refactoring and formatting.
- Treat accessibility as part of implementation: semantic HTML, keyboard support, visible focus and WCAG 2.2 AA contrast in both themes.

## Conventions

### Code and writing

- Add TSDoc-compatible JSDoc to every exported function, constant, type, interface, class and component. Explain non-obvious behaviour rather than repeating names.
- Add code comments only for a non-obvious constraint, workaround or invariant.
- Use expanded, braced `if` statements. Do not disable Biome's `useBlockStatements`.
- Use British English in user-facing copy and docs, not code identifiers.
- Write plain, specific prose. Avoid em dashes, puffery, uppercase eyebrows and repetitive closing summaries. Use sentence-case headings.
- Use Conventional Commits: `<type>[optional scope][!]: <description>`. Explain breaking changes in the body or a `BREAKING CHANGE:` footer.

### Dependencies and lockfiles

The npm workspaces share one root `package-lock.json`. Both npm 10 and npm 11 must accept it.

- After a manifest change, run a real `npm install` in an isolated working copy and include the manifest and lockfile together. Do not use `--package-lock-only` as the normal update procedure; stale nested entries can survive.
- Check lockfile changes with real `npm ci --ignore-scripts` installs under npm 10 and npm 11 in separate disposable clones. A dry run is insufficient.
- If npm 10 rejects a lockfile with missing entries, regenerate with `npx -y npm@10 install --package-lock-only --ignore-scripts`, then repeat real installs under both majors.
- If `npm ls` reports invalid nested entries after a range change, remove those stale lockfile entries and run a real install again. Never hand-edit dependency versions.
- Pin prerelease versions exactly.
- Dependabot owns its own lockfile changes. Change one only when a real npm 10 or npm 11 install fails.
- Do not install into a working tree another person or agent is using.
- Run existing tools through `npm run` or `npx --no-install`, so missing binaries cannot fetch unrelated packages.
- Keep one Dependabot entry per ecosystem and directory. Use groups to split updates; duplicate directories invalidate the whole configuration.

## Architecture

### Package boundaries

- `packages/core` (`@karta/core`): layer and classification contracts, Leaflet style configuration, registry, GeoJSON fetching/validation/merging and measurement helpers. It must not import other Karta packages.
- `packages/react` (`@karta/react`): generic React hooks. It must not import other Karta packages.
- `packages/theme` (`@karta/theme`): typed design-token contracts. It must not import other Karta packages.
- `packages/map` (`@karta/map`): map components, legend, basemap registry, search and measurement controls. It builds on core, react and theme, never web.
- `packages/web` (`@karta/web`): the SSR host, which supplies empty layer and group arrays to the SDK and owns app-specific copy, bootstrap and headers.

`.dependency-cruiser.cjs` mechanically enforces these boundaries through `npm run depcruise`, included in lint.

### Core and map

`DomainConfig` describes `Layer` and `LayerGroup` arrays without assuming any dataset. `createRegistry` exposes their read-only accessors. `DomainProvider` wraps this registry for React; every consumer of `useDomain()` must be below it.

`spatial/measurement.ts` contains generic geographic distance and area operations used by the measuring tool. The spatial terminology is intentional: it describes coordinate geometry, not an application domain. Keep generic APIs named for their function.

`MapView` takes bounds, accessible copy and popup rendering from its caller. Import it from `@karta/map/MapView`, not the main barrel, so lazy-loading preserves its module boundary. Map data remains caller-configured; the current web host supplies no overlays.

The basemap registry supports raster and vector definitions. Built-ins are OpenFreeMap Positron, Liberty and Dark, plus Esri Satellite and Topographic. UI theme and basemap choice are independent. Vector maps lazy-load MapLibre; its worker must remain compatible with iOS and the production CSP.

`LocationSearchControl` accepts a geocoder provider, defaulting to Nominatim. Hosts own provider coverage and CSP allowlisting. Selecting a result changes the input query, so the control suppresses the next debounced query to prevent reopening its dropdown.

### React and theme

`initTheme({ storageKey, colors })` runs before hydration. It configures the shared preference store and re-reads the configured storage key. `useResolvedDarkTheme` combines stored preference and the OS setting. `useLatestRef` lets long-lived external listeners read the current value.

`useModelContextTool` registers browser tools only where WebMCP is available. It reads current execution callbacks through a ref rather than re-registering on every render.

`@karta/theme` declares CSS variable contracts, not values. `packages/web/src/index.css` supplies light and dark values. Map-specific fallback tokens live in `packages/map/src/theme/mapTokens.ts`.

### Web host and deployment

The host provides basemap selection, search, measurement and settings with no bundled datasets. It does not need storage or remote data bindings. `wrangler.jsonc` declares only the static `ASSETS` binding, routes and observability.

`workers/app.ts` redirects the previous hostname to the current site and forwards requests to the built React Router server.

The app is English only (British English, `lang="en-GB"`). Its copy is written inline in components, with no string table or translation library. The site sets no cookies.

`entry.client.tsx` initialises theme and client error reporting before hydration. Server rendering, the root error boundary and the Worker wrapper log server errors. `routes/log-error.ts` validates bounded client reports and logs them without a database.

The inline theme bootstrap in `root.tsx` prevents a flash before hydration. If its source changes, recompute its exact SHA-256 CSP hash in `public/_headers`. Keep font and app CSS as module imports so font fallback metrics are applied by the build.

Production CSP permits no `unsafe-inline` script or stylesheet source. New basemap or geocoder origins must be allowed in `public/_headers`; local development does not apply those headers.

## Design system

Karta uses paper, ink and an ochre accent, with Source Serif 4 headings and Public Sans body text. Fonts are self-hosted. Use `tabular-nums` for figures.

Handwritten values live in `packages/web/src/index.css`. Keep its light and both dark token blocks in step. `--md-sys-*` names are the token contract; do not introduce a second palette or arbitrary values.

Components use vanilla-extract beside their implementations. SDK consumers must register `vanillaExtractPlugin()` and supply the theme variables. See `docs/design-system.md`.

## Definition of done

- Code changes: run `npm run lint`, `npm run typecheck`, `npm run test:coverage` and `npm run build`.
- Map or UI changes: also run `npm run test:e2e -w @karta/web`.
- Dependency changes: perform the real install and cross-major lockfile checks above.
- Report checks that failed or were skipped.

## Safety

Never deploy production without explicit user permission. Never access secrets or delete remote resources as part of local cleanup. The absence of a binding in source is not proof that a remote resource does not exist.

Adding a dataset is a separate, explicitly scoped decision. Do not reintroduce data sources or adapters as incidental examples. Never publish identifying or household-level data.

## Documentation

`README.md` indexes package guides, `docs/building-a-domain.md` and `docs/design-system.md`. `CONTRIBUTING.md`, `SECURITY.md`, `ATTRIBUTIONS.md` and `PRIVACY.md` cover contribution, reporting, credits and privacy.
