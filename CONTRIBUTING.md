# Contributing to MapCairn

MapCairn provides a reusable mapping SDK and a reference web host. Contributions to map tools, accessibility, ports and adapters, and documentation are welcome. Read [`README.md`](README.md) and follow [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). [`GOVERNANCE.md`](GOVERNANCE.md) says who decides what and how, and [`ROADMAP.md`](ROADMAP.md) says what the project intends to do and what it will not.

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
```

`npm run check` runs lint, typecheck, unit tests, build, e2e and a11y in sequence. Run one unit test file with `npx --no-install vitest run path/to/file.test.ts`. Coverage must reach 95% for statements, branches, functions and lines in `core`, `map`, `react` and `theme`. Aim for complete behavioural coverage rather than exclusions.

For UI or map changes, run the Playwright specs that cover the change (`npm run test:e2e -w @mapcairn/web -- <spec name>`, which includes that spec's accessibility tests), and run the full `npm run e2e` and `npm run a11y` when the change is to layout, the map engine, the test seam or a component's colour, focus or semantics. CI runs the full suites. Install the browsers once with `npm run playwright:install -w @mapcairn/web`. Playwright starts `npm start` itself, an e2e-mode build served on port 4173 (or `MAPCAIRN_E2E_PORT`), and the tests mock basemap tiles and place search. Basemap changes also need a real iPhone check, because WebKit emulation cannot reproduce its GPU.

The pre-commit hook runs Biome, dependency-cruiser and the harmony scanner, not typecheck or tests. CI runs lint, typecheck, coverage and build. Separate workflows run Playwright and Lighthouse.

## Architecture

- `packages/core`: the ports (interfaces), pure logic, basemap definitions, fakes and contract suites.
- `packages/map`: the map user interface and the `MapView` host, built on core, react and theme.
- `packages/react`: generic React hooks, independent of mapping and host state.
- `packages/theme`: the design tokens.
- `packages/web`: the SSR host, which holds the adapters and the composition root, with no bundled datasets.

[`ARCHITECTURE.md`](ARCHITECTURE.md) describes the layers and the dependency rules, and how to add an adapter. `npm run lint` enforces the rules, so supply services through the composition root and `ServicesProvider` rather than importing an adapter or an engine into the user interface. [`DESIGN.md`](DESIGN.md) describes the tokens and the accessibility contracts. The [extending guide](docs/guides/extending.md) has short how-tos for adding a basemap, a data layer, a routing provider and an adapter.

## Conventions

- Write a failing test before implementing a feature or bug fix.
- Keep changes focused. Prefer SOLID, DRY, KISS and YAGNI over speculative abstractions.
- Document exported APIs with JSDoc. Add code comments only for non-obvious constraints or invariants.
- Use expanded, braced `if` statements.
- Use semantic HTML, keyboard navigation, visible focus states and WCAG 2.2 AA contrast in both themes. Every gesture needs a keyboard or single-tap equivalent.
- Use British English in user-facing copy and docs. Keep prose plain and specific. Use an em dash only where it reads naturally, not as a habit.
- Use the tokens in [`DESIGN.md`](DESIGN.md), not ad hoc colours, fonts or icons.
- Use Conventional Commits for commit messages.

## Code style

The coding standard is what the tools enforce, not a separate guide.

- **Formatting and linting:** [Biome](https://biomejs.dev), configured in [`biome.jsonc`](biome.jsonc), formats and lints the code with the recommended rules plus the project's accessibility, complexity and restricted-import rules. Warnings fail the build (`--error-on-warnings`). Run `npm run format` to format and `npm run lint` to check.
- **Licence header:** every source file starts with `// SPDX-License-Identifier: AGPL-3.0-only` and `// Copyright MapCairn contributors`. `npm run licence:write` adds the two lines to a new file, and `npm run lint` fails without them.
- **TypeScript:** the strict settings in [`tsconfig.base.json`](tsconfig.base.json) apply to every package: `strict`, `noUncheckedIndexedAccess` and `forceConsistentCasingInFileNames`. Run `npm run typecheck`.
- **Project rules:** dependency-cruiser enforces the package and layer boundaries, and the harmony scanner in `scripts/harmony` enforces the design tokens, markup and wiring rules described in [`DESIGN.md`](DESIGN.md).
- **Enforcement:** the pre-commit hook runs Biome, dependency-cruiser, the harmony scanner, the licence header check and the agent files check, and CI runs `npm run lint` and `npm run typecheck` on every pull request, so a change that breaks the standard cannot merge. The conventions below cover what the tools cannot check.

The style in one example: TSDoc on the export, a braced early return, a named constant instead of a magic number, and one job for the function.

```ts
/** The map's own default zoom, used when a stored value is not a number. */
const FALLBACK_ZOOM = 2;

/** Clamps a zoom to the range the map allows, falling back when it is not a number. */
export function clampZoom(zoom: number, min: number, max: number): number {
  if (Number.isNaN(zoom)) {
    return FALLBACK_ZOOM;
  }
  return Math.min(Math.max(zoom, min), max);
}
```

## Dependencies

After changing a manifest, run a real `npm install` and include the root lockfile. Do not use `--package-lock-only` as the normal update procedure. Pin prerelease versions exactly.

Prove a lockfile change with one real `npm ci --ignore-scripts` under npm 11 in a disposable clone. Do not install into a working tree another person or agent is using. See [`AGENTS.md`](AGENTS.md) for more.

## Pull requests

Work is tracked in [GitHub Issues](https://github.com/MapCairn/mapcairn/issues), and every change reaches `main` through a pull request. Open an issue first for large changes, use the bug and feature forms, and link the issue from the pull request (`Fixes #123`). Branch from `main`, name the branch for the change (`feat/...`, `fix/...`, `docs/...`), use a Conventional Commit as the pull request title, and merge once the `build` and `e2e` checks pass. Keep each pull request to one logical change and explain why it is needed. For a visible change, describe what you saw at phone, tablet and desktop sizes, in both themes, and attach the screenshots to the pull request. Run the checks above and report anything skipped or failing. If you use a coding agent, whichever one, the same rules apply: it follows [`AGENTS.md`](AGENTS.md). The project skills (`create-issue`, `plan-change`, `split-plan`, `pick-up-issue`, `land-pr`, `visual-check`, `review-ui` and `playwright-tests`) walk through this with the `gh` CLI, and the `implementer`, `fresh-eyes-reviewer` and `ui-verifier` agents wrap them. [`docs/guides/working-with-agents.md`](docs/guides/working-with-agents.md) lists what Claude Code, Codex, opencode, GitHub Copilot, Antigravity, Cursor and Qwen Code read (checked against their documentation), how to start (tell the agent which skill to follow), what only works in Claude Code and what has not been tried. Edit skills and agents under `.claude/` and run `npm run agents:sync`; `npm run lint` fails when the copies for other tools are stale. When an agent may merge is set out in [`AGENTS.md`](AGENTS.md) ("Boundaries").

The host intentionally starts without datasets. Adding a real dataset is a separate, explicitly scoped change requiring source provenance, publication rights and privacy review. Plans for larger changes live in [`docs/plans/`](docs/plans/README.md). Never contribute identifying or household-level data.

Do not deploy the production Worker without explicit permission.

## Review and acceptance

Before a pull request is merged:

- The `build` and `e2e` checks must pass. The repository ruleset requires them. `build` runs lint, typecheck, the unit tests with the coverage floors and the production build, and `e2e` runs the Playwright suites.
- The `CLA` check must show that the author and every commit author have agreed to [`CLA.md`](CLA.md).
- The maintainer reads the diff and the description, and checks the items in the pull request template: the checks above passed, the copy is in British English, the documents match the change and anything the change sends over the network is in `PRIVACY.md`. For a visible change the description says what was seen at each size and theme, and the maintainer can ask for the screenshots when they are missing.
- A new feature or a bug fix has tests. The tests are written first (see the conventions above) and a change that adds or changes behaviour is not accepted without them, unless the pull request says why none are needed, for example a documentation change.
- Review threads are resolved. A change can be declined, or sent back for changes, with a reason.

The project has one maintainer, so the maintainer's own pull requests are checked by the same required checks and the template, and have no second reviewer. See [`GOVERNANCE.md`](GOVERNANCE.md).

## Security and licence

Report suspected vulnerabilities privately through [`SECURITY.md`](SECURITY.md). MapCairn is licensed under [AGPL-3.0](LICENSE), and its author may agree other licence terms by arrangement.

### Contributor licence agreement

You keep the copyright in what you contribute, and you agree to [`CLA.md`](CLA.md), which lets the owner distribute it under both licences. Add the comment given at the end of that file to your first pull request, from your own account and with the sentence on a line of its own. A pull request is not merged until it is there.

The `CLA` workflow (`.github/workflows/cla.yml`) checks this on every pull request. It needs an agreement from the pull request author and from every commit author, so commit with an email address linked to your GitHub account, or the check cannot find you. Repository administrators (the check asks GitHub for each person's permission on the repository) and bots such as Dependabot are exempt. The `CLA` status turns green shortly after the comment, and your agreement is recorded in `signatures.json` on the `cla-signatures` branch, so you only comment once. If the check is stuck after you fix an email address, close and reopen the pull request or push a commit. Type or paste the sentence as its own comment: a quote reply to the bot's comment does not count, and nor does a sentence inside a code block. GitHub gives Dependabot's runs a read-only token, so Dependabot pull requests get no `CLA` status, and the run ends with a notice instead of a failure. For that reason `CLA` must not be made a required status on `main` until Dependabot pull requests are handled, for example by a ruleset bypass for Dependabot or a different required-check design. The decision logic is in `scripts/cla`, with its tests in `packages/core/src/lint`, and it runs only from the default branch, never from a pull request's own code.
