# Contributing to Karta

Karta provides a reusable mapping SDK and an empty-map web host. Contributions to map tools, accessibility, ports and adapters, and documentation are welcome. Read [`README.md`](README.md) and follow [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Getting set up

Use Node 24 or newer and npm 11 or newer. `.node-version` selects Node 24, and `package.json` records the supported versions.

```bash
npm install
npm run dev
```

Before you open a pull request, run the checks:

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run e2e
npm run a11y
```

`npm run check` runs lint, typecheck, unit tests, build, e2e and a11y in sequence. Run one unit test file with `npx --no-install vitest run path/to/file.test.ts`. Coverage must reach 95% for statements, branches, functions and lines in `core`, `map`, `react` and `theme`. Aim for complete behavioural coverage rather than exclusions.

For UI or map changes, run the Playwright suites. Install the browsers once with `npm run playwright:install -w @karta/web`. Playwright starts `npm start` itself, an e2e-mode build served on port 4173 (or `KARTA_E2E_PORT`), and the tests mock basemap tiles and place search. Basemap changes also need a real iPhone check, because WebKit emulation cannot reproduce its GPU.

The pre-commit hook runs Biome, dependency-cruiser and the harmony scanner, not typecheck or tests. CI runs lint, typecheck, coverage and build. Separate workflows run Playwright and Lighthouse.

## Architecture

- `packages/core`: the ports (interfaces), pure logic, basemap definitions, fakes and contract suites.
- `packages/map`: the map user interface and the `MapView` host, built on core, react and theme.
- `packages/react`: generic React hooks, independent of mapping and host state.
- `packages/theme`: the design tokens.
- `packages/web`: the SSR host, which holds the adapters and the composition root, with no bundled datasets.

[`ARCHITECTURE.md`](ARCHITECTURE.md) describes the layers and the dependency rules, and how to add an adapter. `npm run lint` enforces the rules, so supply services through the composition root and `ServicesProvider` rather than importing an adapter or an engine into the user interface. [`DESIGN.md`](DESIGN.md) describes the tokens and the accessibility contracts. The [`README.md`](README.md#how-to) has short how-tos for running the tests, adding a basemap and adding an adapter.

## Conventions

- Write a failing test before implementing a feature or bug fix.
- Keep changes focused. Prefer SOLID, DRY, KISS and YAGNI over speculative abstractions.
- Document exported APIs with JSDoc. Add code comments only for non-obvious constraints or invariants.
- Use expanded, braced `if` statements.
- Use semantic HTML, keyboard navigation, visible focus states and WCAG 2.2 AA contrast in both themes. Every gesture needs a keyboard or single-tap equivalent.
- Use British English in user-facing copy and docs. Keep prose plain and specific, without em dashes.
- Use the tokens in [`DESIGN.md`](DESIGN.md), not ad hoc colours, fonts or icons.
- Use Conventional Commits for commit messages.

## Dependencies

After changing a manifest, run a real `npm install` and include the root lockfile. Do not use `--package-lock-only` as the normal update procedure. Pin prerelease versions exactly.

Prove a lockfile change with one real `npm ci --ignore-scripts` under npm 11 in a disposable clone. Do not install into a working tree another person or agent is using. See [`AGENTS.md`](AGENTS.md) for more.

## Pull requests

Work is tracked in [GitHub Issues](https://github.com/mooship/karta/issues), and every change reaches `main` through a pull request. Open an issue first for large changes, use the bug and feature forms, and link the issue from the pull request (`Fixes #123`). Branch from `main`, name the branch for the change (`feat/...`, `fix/...`, `docs/...`), use a Conventional Commit as the pull request title, and merge once the `build` and `e2e` checks pass. Keep each pull request to one logical change and explain why it is needed. Include light and dark screenshots for visual changes. Run the checks above and report anything skipped or failing.

The host intentionally starts without datasets. Adding a real dataset is a separate, explicitly scoped change requiring source provenance, publication rights and privacy review. Plans for larger changes live in [`docs/plans/`](docs/plans/README.md). Never contribute identifying or household-level data.

Do not deploy the production Worker without explicit permission.

## Security and licence

Report suspected vulnerabilities privately through [`SECURITY.md`](SECURITY.md). Contributions are licensed under the licence of the part they change: [Apache-2.0](packages/core/LICENSE) for `packages/core`, `packages/map`, `packages/react` and `packages/theme`, and [AGPL-3.0](LICENSE) for everything else.
