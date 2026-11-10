# AGENTS.md

Guidance for humans and AI working in this repository. `CLAUDE.md` imports this file with `@AGENTS.md` and adds its own workflow rules. `ARCHITECTURE.md` and `DESIGN.md` are the source of truth for architecture and design; this file imports them below and does not repeat them.

@ARCHITECTURE.md
@DESIGN.md

## About

Karta is a reusable SDK for public-interest map platforms, with a reference host. Four SDK packages (`core`, `map`, `react`, `theme`) provide the map ports and pure logic, the map user interface, generic React hooks and the typed design tokens. `packages/web` is an SSR host: basemaps, place search, distance and area measurement, drawing and editing shapes, directions (a public routing server, used only when asked), a pin, theme and unit settings, and open data layers defined as data in `packages/web/src/layers/definitions` (plan 0001). Every layer is off until turned on; the browser then fetches it from its public provider. `docs/plans/` holds plans for larger work; do not describe a planned feature as existing.

MapLibre GL JS is the only map engine. The app follows ports and adapters, described in `ARCHITECTURE.md`. The design system is tokens only, with IBM Plex Sans, Lucide icons and vanilla-extract, described in `DESIGN.md`. The app is English only (British English, `lang="en-GB"`), with its copy written inline in components.

The published host runs on Cloudflare Workers. It has no accounts and no tracking beyond cookieless page views. Client error reports are logged as described in `PRIVACY.md`.

The repository, `packages/web` and the SDK packages (`core`, `map`, `react`, `theme`) are AGPL-3.0, and each SDK package carries its own `LICENSE` file. No commercial licence is on offer yet, but other terms for closed-source use can be discussed with the author, so the SDK packages must not contain anything that needs a licence agreement of its own, such as a provider's terms or non-commercial data.

## Commands

Use Node 24 or newer and npm 11 or newer. `.node-version` selects Node 24, `engines` in `package.json` requires `node >=24` and `npm >=11`, and `packageManager` pins `npm@11.19.1`. Cloudflare Workers Builds installs the `packageManager` version and ignores `engines.npm`.

```bash
npm install
npm run dev
npm test
npm run test:coverage
npm run typecheck
npm run lint
npm run format
npm run build
npm run start
npm run e2e
npm run a11y
npm run check
```

- `dev` runs the Vite SSR dev server on port 5173. It never touches Cloudflare.
- `test` runs Vitest across `packages/*`. Run one file with `npx --no-install vitest run path/to/file.test.ts`.
- `test:coverage` enforces 95% for statements, branches, functions and lines in `core`, `map`, `react` and `theme`. `packages/web` has lower floors (70% statements and lines, 65% functions, 50% branches), because its layout and touch-gesture code is covered by Playwright. Aim for 100% behavioural coverage.
- `typecheck` checks every workspace, including web route types and the Playwright project.
- `lint` runs Biome, dependency-cruiser and the harmony scanner (`scripts/harmony`, see `DESIGN.md`). Pre-commit runs the same three on staged files, but not typecheck, tests or coverage.
- `build` builds every workspace. The web build then checks that the production bundle holds no browser test seam.
- `start` builds the e2e-mode bundle and serves it on port 4173 (or `KARTA_E2E_PORT`) through wrangler, with `wrangler.e2e.jsonc`. This build keeps the test seam, so it is not the production bundle. `wrangler.e2e.jsonc` omits production routes, so the old-hostname redirect is not exercised.
- `check` runs lint, typecheck, unit tests, build, e2e and a11y in sequence.

CI checks lint, typecheck, coverage and build. Playwright and Lighthouse have separate workflows.

### Browser tests

```bash
npm run playwright:install -w @karta/web
npm run e2e
npm run a11y
```

`e2e` runs every Playwright test except those tagged `@a11y`, and `a11y` runs only those. Playwright starts `npm run start` itself and reuses a server already running on that port (4173, or `KARTA_E2E_PORT`, which lets two checkouts run suites side by side). Page objects live in `packages/web/e2e/pages`, and shared helpers in `packages/web/e2e/support`. Locators use role and accessible name first, then `data-testid` (the configured `testIdAttribute`). The suite mocks basemap tiles, styles and Nominatim, so no test depends on a third-party service, and tests script geolocation, search, the clipboard, storage and the system theme through the test seam described in `ARCHITECTURE.md`.

Projects cover desktop Chromium, mobile Chromium (Pixel 7) and iPhone WebKit. WebKit runs only the basemap, keyboard, sheet and app-shell specs, because MapLibre worker startup and the bottom sheet can behave differently on iOS. Emulation cannot reproduce an iPhone GPU; basemap changes still need a real-device check.

## Engineering principles

- Test first. Write a failing behavioural test, observe the intended failure, then implement the change. Do not weaken assertions or exclude code to satisfy coverage.
- Follow SOLID, including the open-closed principle. Depend on ports, not engines or browser APIs. Pass configuration through props and context. Add behaviour by adding a definition, an adapter or a module, not by editing a branch in code that already works: a new layer is a new definition, a new provider a new adapter, a new tour a new `TourGuide`, and nothing switches on an id, a provider or a kind.
- Write clean code. One job for each function and component, names that say what they do, no flag arguments that make a function do two things, no dead code or commented-out code, no magic numbers outside the tokens and named constants, and nesting kept shallow with early returns. Prefer a small, well-named function to a comment that explains a long one.
- Follow DRY, KISS and YAGNI. Reuse shared logic and tokens, but do not build speculative features. Add an interface only where a boundary has at least two implementations, counting the fake.
- Stay on task. Avoid unrelated refactoring and formatting.
- Treat accessibility as part of implementation: semantic HTML, keyboard support, visible focus and WCAG 2.2 AA contrast in both themes. Every gesture needs a keyboard or single-tap equivalent.

## Conventions

### Code and writing

- Add TSDoc-compatible JSDoc to every exported function, constant, type, interface, class and component. Explain non-obvious behaviour rather than repeating names.
- Add code comments only for a non-obvious constraint, workaround or invariant.
- Use expanded, braced `if` statements. Do not disable Biome's `useBlockStatements`.
- Use British English in user-facing copy and docs, not code identifiers.
- Write plain, specific prose. Avoid em dashes, puffery, uppercase eyebrows and repetitive closing summaries. Use sentence-case headings.
- Use Conventional Commits: `<type>[optional scope][!]: <description>`. Explain breaking changes in the body or a `BREAKING CHANGE:` footer.
- Do not add assistant attribution to commits, pull requests or issues: no `Co-Authored-By` trailer naming an AI tool and no "Generated with" line. When a squash merge would carry such a trailer from earlier commits, give the merge an explicit body.

### Dependencies and lockfiles

The npm workspaces share one root `package-lock.json`.

- After a manifest change, run a real `npm install` in an isolated working copy and include the manifest and lockfile together. Do not use `--package-lock-only` as the normal update procedure; stale nested entries can survive.
- Check the result with one real `npm ci --ignore-scripts` under npm 11 in a disposable clone. A dry run is insufficient.
- If `npm ls` reports invalid nested entries after a range change, remove those stale lockfile entries and run a real install again. Never hand-edit dependency versions.
- Pin prerelease versions exactly.
- Dependabot owns its own lockfile changes. Change one only when a real install fails.
- Do not install into a working tree another person or agent is using.
- Run existing tools through `npm run` or `npx --no-install`, so missing binaries cannot fetch unrelated packages.
- Keep one Dependabot entry per ecosystem and directory. Use groups to split updates; duplicate directories invalidate the whole configuration.

## Architecture

`ARCHITECTURE.md` has the layers, the ports table, the map adapter and how to add an adapter. The package boundaries are:

- `packages/core` (`@karta/core`): the port interfaces, pure logic (surface state machine, sheet snapping, zoom, scale, formatting, announcements, URL hash, theme resolution, measurement), the basemap definitions, fakes and contract suites. It must not import other Karta packages, React or a browser global.
- `packages/react` (`@karta/react`): generic React hooks. It must not import other Karta packages.
- `packages/theme` (`@karta/theme`): the typed token contract, `focusRing`, `zLayer` and the token values with their contrast maths. It must not import other Karta packages.
- `packages/map` (`@karta/map`): the map user interface (chrome, sheet, panels, tools, primitives), the `MapView` host and `ServicesProvider`. It builds on core, react and theme, never web, and never imports an adapter or an engine.
- `packages/web` (`@karta/web`): the SSR host. It owns the adapters (MapLibre, Nominatim, Valhalla routing, geolocation, storage, clipboard, URL hash, theme), the composition root `createServices()`, the engine CSS, app copy, routes and headers.

`npm run lint` enforces these boundaries through dependency-cruiser (`.dependency-cruiser.cjs`), Biome and the harmony scanner.

### Web host and deployment

`wrangler.jsonc` declares only the static `ASSETS` binding, routes and observability. `workers/app.ts` forwards requests to the built React Router server. The route table in `src/routes.ts` has the map, the privacy page, the `robots.txt`, `sitemap.xml` and `llms.txt` resource routes and `log-error`.
`entry.client.tsx` installs client error reporting before hydration. Server rendering, the root error boundary and the Worker wrapper log server errors. `routes/log-error.ts` validates bounded client reports and logs them without a database.

The inline theme bootstrap in `root.tsx` (source in `src/app/themeBootstrap.ts`) prevents a flash before hydration. If its source changes, recompute its exact SHA-256 CSP hash in `public/_headers`. Keep font and app CSS as module imports so font fallback metrics are applied by the build.

Production CSP permits no `unsafe-inline` script or stylesheet source. New basemap or geocoder origins must be allowed in `public/_headers`; local development does not apply those headers. The MapLibre worker must stay compatible with iOS and the production CSP.

## Design system

`DESIGN.md` is the source of truth: tokens only, IBM Plex Sans, Lucide icons through the `Icon` component, one accent, and layout slots owned by `MapChrome`. Token values live in `packages/theme/src/tokens.css.ts` and `tokenValues.ts`. Components use vanilla-extract beside their implementations and may only use tokens. Use `tabular-nums` for figures. Do not introduce a second palette or arbitrary values. Do not add a Shadow DOM component library such as `@material/web`: its custom elements fail under Workers SSR.

SDK consumers must register `vanillaExtractPlugin()` in their Vite config. `@karta/theme` is side-effect free, so its token stylesheet reaches the page only through an import that is used, as `packages/web/src/global.css.ts` does.

## Issues and pull requests

Work is tracked in GitHub Issues, and every plan in `docs/plans/` has a tracking issue linked from its file. AI agents manage the issues: create one for any new piece of work worth tracking, label it (`map`, `search`, `layers`, `design-system`, `a11y`, `performance`, `privacy`, `plan`, plus `bug` or `enhancement`), put it in a milestone when one fits, tick its task list as steps land, and close it when the work is merged and verified. Do not file an issue for a gap that can be fixed in the same session; fix it. Issues are public, so write plain project facts only, never emails, keys or private details.

Changes reach `main` through pull requests: a branch named for the change, a Conventional Commit title, `Fixes #123` or `Part of #123` in the description, and the `build` and `e2e` checks green before merge. The repository ruleset requires both. Pushing straight to `main` is not the workflow.

## Definition of done

- Code changes: run `npm run lint`, `npm run typecheck`, `npm run test:coverage` and `npm run build`.
- Map or UI changes: also run `npm run e2e` and `npm run a11y`.
- Map or UI changes must also be confirmed visually. Look at the running app in screenshots at phone, tablet and desktop sizes, in both themes, and over more than one basemap where the map shows. The linters, the harmony scanner and the tests are stopgaps: they cannot tell you that something looks bad, is hard to use or breaks the harmony of the design. Say what looks wrong, fix it, and include the screenshots in the pull request. When you brief a sub-agent on UI work, tell it to do the same.
- Dependency changes: perform the real install and the `npm ci` check above.
- Report checks that failed or were skipped.

## Safety

Never deploy production without explicit user permission. Never access secrets or delete remote resources as part of local cleanup. The absence of a binding in source is not proof that a remote resource does not exist.

Adding a dataset is a separate, explicitly scoped decision. Do not reintroduce data sources or adapters as incidental examples. Never publish identifying or household-level data.

## Documentation

`README.md` is the entry point and links the guides. `ARCHITECTURE.md` covers layers, ports and adapters, and `DESIGN.md` covers tokens, layout and accessibility contracts. Each package has a short `README.md`. `docs/plans/` holds numbered plans for work not yet built. `CONTRIBUTING.md`, `SECURITY.md`, `ATTRIBUTIONS.md` and `PRIVACY.md` cover contribution, reporting, credits and privacy. `PRIVACY.md` mirrors the privacy page in `packages/web/src/app/PrivacyPage.tsx`; change both together.
