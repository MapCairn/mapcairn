# Contributing to Karta

Karta provides a reusable mapping SDK and an empty-map web host. Contributions to map tools, accessibility, SDK contracts and documentation are welcome. Read [`README.md`](README.md) and follow [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Getting set up

Use Node 24.22.1 or newer and npm 11 or newer. Node 24 is the tested major. `.node-version` and `package.json` record the supported versions.

```bash
npm install
npm test
npm run test:coverage
npm run typecheck
npm run lint
npm run build
npm run dev -w @karta/web
```

Run one test file with `npx --no-install vitest run path/to/file.test.ts`. Coverage must reach 95% for statements, branches, functions and lines. Aim for complete behavioural coverage rather than exclusions.

For UI or map changes, also run `npm run test:e2e -w @karta/web`. Playwright builds and starts the preview itself. Install its browsers once with `npm run playwright:install -w @karta/web`. Basemap changes also need a real iPhone check because WebKit emulation cannot reproduce its GPU.

The pre-commit hook runs Biome and dependency-cruiser, not typecheck or tests. CI runs lint, typecheck, coverage and build. Separate workflows run Playwright and Lighthouse.

## Architecture

- `packages/core`: layer contracts, classification, registry, GeoJSON utilities and distance/area measurement.
- `packages/map`: generic map rendering and controls, built on core, react and theme.
- `packages/react`: generic React hooks, independent of mapping and host state.
- `packages/theme`: typed design-token contract.
- `packages/web`: the SSR host, with no bundled datasets.

`.dependency-cruiser.cjs` enforces the SDK dependency direction. Supply configuration through props and context rather than importing host code into SDK packages. [`docs/building-a-domain.md`](docs/building-a-domain.md) describes the layer contract for consumers.

## Conventions

- Write a failing test before implementing a feature or bug fix.
- Keep changes focused. Prefer SOLID, DRY, KISS and YAGNI over speculative abstractions.
- Document exported APIs with JSDoc. Add code comments only for non-obvious constraints or invariants.
- Use expanded, braced `if` statements.
- Use semantic HTML, keyboard navigation, visible focus states and WCAG 2.2 AA contrast in both themes.
- Use British English in user-facing copy and docs. Keep prose plain and specific, without em dashes.
- Use the tokens in [`docs/design-system.md`](docs/design-system.md), not ad hoc colours or fonts.
- Use Conventional Commits for commit messages.

## Dependencies

After changing a manifest, run a real `npm install` and include the root lockfile. Do not use `--package-lock-only` as the normal update procedure. Pin prerelease versions exactly.

Prove lockfile changes with real `npm ci --ignore-scripts` installs under npm 10 and npm 11 in separate disposable clones. Do not install into a working tree another person or agent is using. See [`AGENTS.md`](AGENTS.md) for lockfile recovery guidance.

## Pull requests

Open an issue first for large changes. Keep each pull request to one logical change and explain why it is needed. Include light and dark screenshots for visual changes. Run the checks above and report anything skipped or failing.

The host intentionally starts without datasets. Adding a real dataset is a separate, explicitly scoped change requiring source provenance, publication rights and privacy review. Never contribute identifying or household-level data.

Do not deploy the production Worker without explicit permission.

## Security and licence

Report suspected vulnerabilities privately through [`SECURITY.md`](SECURITY.md). Contributions are licensed under [AGPL-3.0](LICENSE).
