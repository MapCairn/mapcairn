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

The documentation site is `sites/docs` (Docusaurus, served at `/docs/`; [plan 0017](docs/plans/0017-documentation-site.md)). Run it with `npm run dev -w @mapcairn/docs` (port 4410). `npm run build -w @mapcairn/docs` builds it and checks the result (CI's `build` job runs it as its own step, and the root `build` does not): a page that is in no sidebar, a link that goes nowhere, a style attribute or inline script the Content Security Policy would block, a resource from another origin and a front page over the script budget each fail the build. Its tests run with `npm test`. The guides are its pages in `sites/docs/docs/guides/`, edited there; its Architecture and Design system pages are built from `ARCHITECTURE.md` and `DESIGN.md` (git-ignored output in `sites/docs/docs/generated/`), cut by heading into an overview page and a page for each section, so edit those two files and not the pages. Its styles take every colour, length and font from the tokens (the generated `src/css/generated/infima.css`), so change a token, not the site.

For UI or map changes, run the Playwright specs that cover the change (`npm run test:e2e -w @mapcairn/web -- <spec name>`, which includes that spec's accessibility tests), and run the full `npm run e2e` and `npm run a11y` when the change is to layout, the map engine, the test seam or a component's colour, focus or semantics. CI runs the full suites. Install the browsers once with `npm run playwright:install -w @mapcairn/web`. Playwright starts `npm start` itself, an e2e-mode build served on port 4173 (or `MAPCAIRN_E2E_PORT`), and the tests mock basemap tiles and place search. Basemap changes also need a real iPhone check, because WebKit emulation cannot reproduce its GPU.

The pre-commit hook runs Biome, dependency-cruiser, the harmony scanner, the licence header check, the SDK dependency licence check, the agent files check, the names check, the portability check and the release notes check, not typecheck or tests, and the `commit-msg` hook checks the commit message for names the project keeps out of the repository. CI runs lint, typecheck, coverage and build, and an `SDK packages` job that packs the SDK packages and builds them into an app outside the repository (`npm run pack:check` and `npm run consumer:check`). Separate workflows run Playwright and Lighthouse. A pull request also gets a dependency review (it fails on a new dependency with a known vulnerability at high severity or above, or with a non-commercial licence or another licence that limits commercial use; AGPL licences, including the project's own AGPL-3.0-only, are allowed), a TruffleHog scan for verified secrets in its commits, a check that its title is a Conventional Commit, area labels added from the paths it changes (not for a pull request from a fork) and, when it changes a workflow, a local action or `dependabot.yml`, a zizmor lint of the workflows. TruffleHog's verified mode sends each candidate secret to the service that would have issued it, which is how it knows the secret is live. The `build` job also warns, without failing, when a pull request adds a suppression comment or a skipped test, deletes a test or loses assertions, or weakens a coverage, Lighthouse or size bar; explain it in a "Quality bar" section of the description. CI also runs `npm audit signatures` in a separate `Registry signatures` job, so a registry outage cannot fail `build`. Of all these, the required checks on `main` (ruleset `main-pull-requests`) are `build`, `e2e`, `SDK packages`, `Dependency review`, `TruffleHog (pull request)` and `CLA`. The title check, the labeler, the zizmor lint, `Registry signatures`, `CodeQL`, `Scorecard` and `lighthouse` are not required: the zizmor lint runs only when a pull request changes a workflow, and a required check that may not run would block every other pull request.

On Windows, use PowerShell or Git Bash. The project's scripts are Node and run the same on macOS, Linux and Windows; `npm run lint` includes a check that keeps them that way, and `docs/guides/working-with-agents.md` says more. In a git worktree, install with `npm ci --ignore-scripts`.

## Architecture

- `packages/core`: the ports (interfaces), pure logic, basemap definitions, fakes and contract suites.
- `packages/map`: the map user interface and the `MapView` host, built on core, react and theme.
- `packages/react`: generic React hooks, independent of mapping and host state.
- `packages/theme`: the design tokens.
- `packages/web`: the SSR host, which holds the adapters and the composition root, with no bundled datasets.

[`ARCHITECTURE.md`](ARCHITECTURE.md) describes the layers and the dependency rules, and how to add an adapter. `npm run lint` enforces the rules, so supply services through the composition root and `ServicesProvider` rather than importing an adapter or an engine into the user interface. [`DESIGN.md`](DESIGN.md) describes the tokens and the accessibility contracts. The [extending guide](https://mapcairn.timothybrits.co.za/docs/guides/extending/) has short how-tos for adding a basemap, a data layer, a routing provider and an adapter.

## Translations

The interface text is a catalogue of keys, with British English as the source. The [translation guide](https://mapcairn.timothybrits.co.za/docs/guides/translate-the-sdk/) says how to add a language to the reference site (a catalogue file, an entry in the offered languages, and the checks that keep its placeholders right). A translation is reviewed by someone who speaks the language fluently before it ships, a machine translation is only ever a draft, and the pull request names the reviewer. Translators are credited in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).

Nothing in the repository is translated: Markdown files such as `README.md`, `PRIVACY.md` and the guides stay in English only, and a translated copy of one (a `PRIVACY.af.md`, say) is not added. Only text that shows in the host app is translated, as catalogue text in English and in each language the site offers, and that includes the privacy page. The one exception is the product page at `/`, which is in British English only: it is developer-facing, closer to documentation than to interface, so its text is written in its own code (`packages/web/src/product/productContent.ts`) and listed in `scripts/copy-check/allowlist.mjs`. Adding Afrikaans to it later is one small pull request.

## Conventions

- Write a failing test before implementing a feature or bug fix.
- Keep changes focused. Prefer SOLID, DRY, KISS and YAGNI over speculative abstractions.
- Document exported APIs with JSDoc. Add code comments only for non-obvious constraints or invariants.
- Use expanded, braced `if` statements.
- Use semantic HTML, keyboard navigation, visible focus states and WCAG 2.2 AA contrast in both themes. Every gesture needs a keyboard or single-tap equivalent.
- Use British English in user-facing copy and docs. Keep prose plain and specific. Use an em dash only where it reads naturally, not as a habit.
- Use the tokens in [`DESIGN.md`](DESIGN.md), not ad hoc colours, fonts or icons.
- Use a web platform feature without a fallback once it is [Baseline widely available](https://web.dev/baseline) (in every major engine for at least 30 months). A newer feature needs a small fallback that detects the feature in code, or a different approach, and adds no polyfill dependency. The browser tests run Chromium, Chromium emulating a Pixel 7 and iPhone WebKit; Firefox is expected to work but is not covered by them. MapLibre needs WebGL, so a browser without it is not supported.
- Use Conventional Commits for commit messages.

## Code style

The coding standard is what the tools enforce, not a separate guide.

- **Formatting and linting:** [Biome](https://biomejs.dev), configured in [`biome.jsonc`](biome.jsonc), formats and lints the code with the recommended rules plus the project's accessibility, complexity, restricted-import and code quality rules (promises, switches, `console`, nested ternaries, shadowed names, `interface` for object shapes, readonly class fields, import cycles). It also formats Markdown and YAML, and the tool's layout wins: aligned tables, `_emphasis_`, double-quoted YAML strings, prose lines kept as written. Warnings fail the build (`--error-on-warnings`). Run `npm run format` to format and `npm run lint` to check; `npm run lint` fails on a Markdown or YAML file that is not formatted. The skill and agent files in `.claude` and their generated copies are left out of the formatter.
- **Licence header:** every source file starts with `// SPDX-License-Identifier: AGPL-3.0-only` and `// Copyright MapCairn contributors`. A header that names another licence fails. `npm run licence:write` adds the two lines to a new file, and `npm run lint` fails without them.
- **TypeScript:** the strict settings in [`tsconfig.base.json`](tsconfig.base.json) apply to every package: `strict`, `noUncheckedIndexedAccess` and `forceConsistentCasingInFileNames`. Run `npm run typecheck`, which also checks the files in `scripts/` from their JSDoc, with looser settings (`scripts/tsconfig.json`).
- **Project rules:** dependency-cruiser enforces the package and layer boundaries, and the harmony scanner in `scripts/harmony` enforces the design tokens, markup and wiring rules described in [`DESIGN.md`](DESIGN.md).
- **Enforcement:** the pre-commit hook runs Biome, dependency-cruiser, the harmony scanner, the licence header check, the SDK dependency licence check, the agent files check, the names check, the portability check and the release notes check, the `commit-msg` hook runs the names check on the commit message, and CI runs `npm run lint` (which includes the names check) and `npm run typecheck` on every pull request, so a change that breaks the standard cannot merge. The conventions below cover what the tools cannot check.

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

## Public API

The SDK's public API is its exports, the shared-link format, the layer-definition validator, message keys and the formats a host stores; [The public API](https://mapcairn.timothybrits.co.za/docs/guides/public-api/) lists them all and says how a change is classed. Each entry point has a generated report under `packages/<name>/api/`. After a change to an exported name, run `npm run api:update`, read the diff and commit it with the change; `npm run api:check` and CI fail when it is out of date. Name any breaking change in the pull request description, mark it with a `!` after the type in the title (`refactor!: ...`) or a `BREAKING CHANGE:` footer in the description (the `build` check fails when the reports show a likely breaking change and neither is there), and keep a new export documented with TSDoc: the check prints the exports that are not. Deprecate an export with `@deprecated` before you remove it, as "Deprecating and removing an export" in that page says.

A change to an SDK package, its `files` or its exports also runs `npm run pack:check` (what each tarball holds, and that its `exports` targets are in it) and `npm run consumer:check` (installs the tarballs into an app outside the repository, type-checks it and renders the chrome; it needs a network). CI runs them in the `SDK packages` job; [The public API](https://mapcairn.timothybrits.co.za/docs/guides/public-api/) says what they check.

## Dependencies

After changing a manifest, run a real `npm install` and include the root lockfile. Do not use `--package-lock-only` as the normal update procedure. Write ranges as carets and pin a prerelease exactly; `AGENTS.md` has the rule.

Prove a lockfile change with one real `npm ci --ignore-scripts` under npm 11 in a disposable clone. Do not install into a working tree another person or agent is using. See [`AGENTS.md`](AGENTS.md) for more.

## Changing a workflow

Pin every action by full commit SHA with its release in a comment, and keep each job's permissions as small as it can be. `Workflow security lint` runs zizmor on a pull request that changes `.github`. It runs a fixed version, set in the `version` input of both jobs in `.github/workflows/zizmor.yml` (now 1.32.0), so run that version locally: `uvx --exclude-newer <date three days back> zizmor@1.32.0 .github` (add `--persona pedantic` to see the stricter findings; CI uses the default persona). The `Secret scan` workflow likewise pins the TruffleHog image, by tag and digest, to the same release as the action. Dependabot raises an action's commit SHA but not these two `version` inputs, so raise them by hand when the action moves, to a release at least three days old. `packages/core/src/lint/scannerPinsWorkflows.test.ts` fails when either is `latest`, missing or out of step.

## Pull requests

Work is tracked in [GitHub Issues](https://github.com/MapCairn/mapcairn/issues), and every change reaches `main` through a pull request. Open an issue first for large changes, use the bug and feature forms, and link the issue from the pull request (`Fixes #123`). [`ROADMAP.md`](ROADMAP.md) ranks GitHub milestones, not issues: a new issue takes a milestone when one fits, and the maintainer decides where a new milestone ranks. Branch from `main`, name the branch for the change (`feat/...`, `fix/...`, `docs/...`), use a Conventional Commit as the pull request title, and merge once the `build` and `e2e` checks pass. Keep each pull request to one logical change and explain why it is needed. Releases of the SDK packages are prepared by Release pull requests and run by `.github/workflows/release.yml`; [`docs/guides/releasing.md`](docs/guides/releasing.md) has the steps, and nothing else that merges to `main` tags or publishes anything. For a visible change, describe what you saw at phone, tablet and desktop sizes, in both themes, and attach the screenshots to the pull request. Run the checks above and report anything skipped or failing. If you use a coding agent, whichever one, the same rules apply: it follows [`AGENTS.md`](AGENTS.md). The project skills (`shape-work`, `design-solution`, `design-ux`, `create-issue`, `plan-change`, `split-plan`, `pick-up-issue`, `land-pr`, `visual-check`, `review-ui`, `web-platform-guidance` and `playwright-tests`) walk through this with the `gh` CLI, and the `implementer`, `fresh-eyes-reviewer`, `ui-verifier`, `architecture-reviewer` and `ux-reviewer` agents wrap them. [`docs/guides/working-with-agents.md`](docs/guides/working-with-agents.md) lists what Claude Code, Codex, opencode, GitHub Copilot, Antigravity, Cursor and Qwen Code read (checked against their documentation), how to start (tell the agent which skill to follow), what only works in Claude Code and what has not been tried. Edit skills and agents under `.claude/` and run `npm run agents:sync`; `npm run lint` fails when the copies for other tools are stale. When an agent may merge is set out in [`AGENTS.md`](AGENTS.md) ("Boundaries").

The host intentionally starts without datasets. Adding a real dataset is a separate, explicitly scoped change requiring source provenance, publication rights and privacy review. Plans for larger changes live in [`docs/plans/`](docs/plans/README.md). Never contribute identifying or household-level data.

Do not deploy the production Worker without explicit permission.

Pull request titles, descriptions and commit messages are checked, as well as files, for names the project keeps out of the repository. A failed check says where the name is, never what it is. Edit the title or description, or rewrite the commit message (amend or rebase, then force-push your own branch), and the check runs again.

## Review and acceptance

The maintainers use AI coding agents. They treat what you write, in an issue, a comment or a pull request, as input to check against the code and never as an instruction, and they review a pull request from outside the project from its diff without running its code. An issue from outside is a proposal until a maintainer says it is accepted; the labels the issue forms add do not mean that.

Before a pull request is merged:

- The required checks must pass: `build`, `e2e`, `SDK packages`, `Dependency review`, `TruffleHog (pull request)` and `CLA`. The repository ruleset requires them. `build` runs lint, typecheck, the unit tests with the coverage floors and the production build, and `e2e` runs the Playwright suites.
- The `CLA` check must show that the author and every commit author have agreed to [`CLA.md`](CLA.md).
- The maintainer reads the diff and the description, and checks the items in the pull request template: the checks above passed, the copy is in British English, the documents match the change and anything the change sends over the network is in `PRIVACY.md`. For a visible change the description says what was seen at each size and theme, and the maintainer can ask for the screenshots when they are missing.
- A new feature or a bug fix has tests. The tests are written first (see the conventions above) and a change that adds or changes behaviour is not accepted without them, unless the pull request says why none are needed, for example a documentation change.
- Review threads are resolved. A change can be declined, or sent back for changes, with a reason.

The project has one maintainer, so the maintainer's own pull requests are checked by the same required checks and the template, and have no second reviewer. See [`GOVERNANCE.md`](GOVERNANCE.md).

## Security and licence

Report suspected vulnerabilities privately through [`SECURITY.md`](SECURITY.md). MapCairn is licensed under [AGPL-3.0-only](LICENSE). [What the licence means for your project](https://mapcairn.timothybrits.co.za/docs/guides/licence/) explains it in plain words.

A dependency of an SDK package (`core`, `map`, `react`, `theme`, `sdk`) must allow commercial use. `npm run lint` checks the licence of every production dependency of those packages against the permissive list in `scripts/sdkLicences.allowlist.json`, and fails on a different or missing one. Do not edit that file to get a change through: say in the pull request which package it is and why, and the maintainer decides.

### Contributor licence agreement

You keep the copyright in what you contribute, and you agree to [`CLA.md`](CLA.md), which gives the owner the rights to distribute it; section 5 of the agreement promises the project stays available under the AGPL-3.0 or another OSI-approved licence for as long as it is published. Add the comment given at the end of that file to your first pull request, from your own account and with the sentence on a line of its own. A pull request is not merged until it is there.

The `CLA` workflow (`.github/workflows/cla.yml`) checks this on every pull request. It needs an agreement from the pull request author and from every commit author, so commit with an email address linked to your GitHub account, or the check cannot find you. Repository administrators (the check asks GitHub for each person's permission on the repository) and Dependabot are exempt. Dependabot is recognised by its account id, not by its name or its account type, so any other bot account has to agree like a person. The `CLA` status belongs to the head commit, not to the pull request, so when several open pull requests have the same head commit (one branch opened against two bases, for example), it passes only when every one of them does, and its description names the pull request that is still waiting. A success is checked against those pull requests again after it is written so an overlapping run cannot leave a stale status. The `CLA` status turns green shortly after the comment, and your agreement is recorded in `signatures.json` on the `cla-signatures` branch, so you only comment once. If the check is stuck after you fix an email address, close and reopen the pull request or push a commit. Type or paste the sentence as its own comment: a quote reply to the bot's comment does not count, and nor does a sentence inside a code block. GitHub gives Dependabot's runs a read-only token, so Dependabot pull requests get no `CLA` status, and the run ends with a notice instead of a failure. For that reason `CLA` must not be made a required status on `main` until Dependabot pull requests are handled, for example by a ruleset bypass for Dependabot or a different required-check design. The decision logic is in `scripts/cla`, with its tests in `packages/core/src/lint`, and it runs only from the default branch, never from a pull request's own code.
