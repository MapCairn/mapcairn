# 0015: One umbrella package for the SDK

Status: proposed. Tracking issue: [#538](https://github.com/MapCairn/mapcairn/issues/538).

## Goal

A newcomer installs `@mapcairn/sdk`, imports from it and renders the map chrome, without first learning which of `core`, `map`, `react` and `theme` to install. The four packages stay as they are for hosts that want less: `core` stays free of React and browser globals, and `theme` stays installable without the UI. The umbrella holds no code of its own beyond re-exports, and a test fails when it drifts from the four packages' public API. It is released with the other four from `0.1.0-rc.3`.

## Ground rules

- One name, `@mapcairn/sdk`, in `packages/sdk`, decided on 2026-11-20. On that day the registry returned 404 for both `@mapcairn/sdk` and the unscoped `mapcairn`. Only the organisation can publish under the scope.
- Lockstep: one version for all five packages. `readSdkState`, `verifyRelease.mjs` and the "keeps the four SDK versions equal" test in `manifests.test.ts` all assume one version, and an umbrella that pins the others exactly gains nothing from its own.
- Built now and released in `0.1.0-rc.3`, after `rc.2` (decided on 2026-11-20). The `npm` job used to skip the whole set unless every name in it was on npm (the `on-npm` output of `verifyRelease.mjs`, removed in #539), so a new package in the `rc.2` set would have made it skip all five, and `rc.2` exists to prove staging and provenance for the four.
- The first version of a package cannot have a trusted publisher, which is set on the package's settings page after a first publish (`0014-sdk-release.md`, "What was checked on 2026-11-19"). The first `@mapcairn/sdk` is therefore published by hand from its attested tarball, under `next`, as `rc.1` was. An agent never runs `npm publish`, `npm trust` or `npm dist-tag` (`AGENTS.md`, "Boundaries").
- The reference host stays on the four packages, and so does `examples/embed`, which keeps proving that each package's own entry points work. The README snippet may use the umbrella, and `readme.test.ts` accepts either form.
- No runtime dependency outside `scripts/sdkLicences.allowlist.json`. The umbrella's only production dependencies are the four workspace packages. No new origin, no stored data, no copy and no catalogue keys.
- A MapLibre adapter (#43) is not part of this plan. Until it ships as a package, the acceptance criterion is "renders the map chrome on the SDK's fakes". "Renders a real map" is added when it does.
- Plain steps, one pull request each, build green. Nothing here adds a dataset or changes the licence.

## Design

### Name

Options: 1. `@mapcairn/sdk`. It fits every place that already lists the packages: `SDK_NAMES` in `scripts/release/workspaces.mjs` is `"@mapcairn/" + folder`, `findTarballs` in `packCheck.mjs` matches `^mapcairn-<folder>-\d`, the `npm` job in `release.yml` stages `release/mapcairn-$name-$VERSION.tgz` as `@mapcairn/$name`, and `notesCheck.mjs` uses the same shape. 2. The unscoped `mapcairn`. It is the shorter command, but it packs as `mapcairn-<version>.tgz`, which the `^mapcairn-<name>-` pattern cannot tell from the others, so about six places need a special case, and anyone can register the name until it is published.

Choice: 1, because it adds one word to lists that already exist and nothing branches on a name. The unscoped name could later be a second, thin alias of `@mapcairn/sdk`; whether to hold it now is open below.

### Export shape

The four packages export about 1,120 names. A scan of the committed reports (`packages/*/api/index.api.md`) found two collisions, no default exports and no star exports:

- `ScaleBar`: an interface in `core` and a component in `map`.
- `ReadingDirection`: the same `"ltr" | "rtl"` type, declared separately in `core` and `react`.

A plain `export *` of all four fails `tsc` with TS2308 (an ambiguous star export), and in JavaScript an ambiguous value name is silently dropped. Options:

1. Subpaths only, no root. No collisions, but a host still needs two or more imports, which misses "one import".
2. A curated root. Someone keeps the list by hand, every new export becomes a decision, and the list drifts.
3. A flat root plus mirrored subpaths. The root does `export *` from the four packages, then explicit re-exports for the collisions (`export { ScaleBar } from "@mapcairn/map"`, `export type { ReadingDirection } from "@mapcairn/core"`). An explicit export wins over star exports in TypeScript and JavaScript, and nothing is renamed. Subpaths `./core`, `./core/contracts`, `./map`, `./react` and `./theme` each do `export *` from the matching entry point, so `core`'s `ScaleBar` stays reachable at `@mapcairn/sdk/core`.

Choice: 3. A new export reaches the root with no edit, and the only hand-written lines are the tie-breaks. Rules that come with it:

- **Tie-breaks.** A new collision fails `tsc` until a tie-break is written. The name the root already exports keeps its binding, so the root never changes meaning, and the newcomer is reachable on its own subpath. Changing which package wins a tie-break is a breaking change for the umbrella.
- **No test code at the root.** `core/contracts` imports `vitest`, so it is reachable only at `./core/contracts`, and the umbrella repeats `core`'s optional `vitest` peer.
- **Declarations** stay `export * from "@mapcairn/<pkg>"` and are never inlined copies, so a type from the umbrella is the same type as one from the package. Mixing the umbrella with a direct package import is safe when the host's direct dependency is at the umbrella's version.
- **Tree-shaking.** `sideEffects: ["**/*.css"]`. The umbrella's JavaScript is pure re-exports of packages that are already `sideEffects: false`. Measure and do not assume: compare a build of `examples/embed` through the umbrella and through the four packages (step 3 of slice 1). Slice 1 result: a plain Vite build of `examples/embed` through the umbrella and through the four packages gave the same stylesheet byte for byte and a script that differed by 57 bytes of 909 kB.
- **CSS.** An `exports` target cannot point into another package, so the umbrella ships `./styles.css`: `@import "@mapcairn/theme/tokens.css";` then `@import "@mapcairn/map/styles.css";`, in that order. A host writes one line, `import "@mapcairn/sdk/styles.css"`. The imports resolve from the umbrella's own folder, so they work under strict pnpm. The umbrella's JavaScript imports no CSS, because the consumer check renders in plain Node. If the plain-Vite leg cannot resolve the imports, the fallback is a copy of the two built files made by the umbrella's build and checked by a test. A host that serves stylesheets with `<link>` and no bundler keeps the per-package files.
- **Declaration merging.** A host adds a service by augmenting `declare module "@mapcairn/core"` (`scripts/release/consumer/src/merging.ts`). An augmentation through a re-exporting module is expected not to merge with the original interface; slice 1 verifies this, and the docs tell a host that merges to list `@mapcairn/core` as a direct dependency at the umbrella's version and augment it there. Slice 1 result: a local check with TypeScript 6.0 and 7.0 against the built declarations found that an augmentation of `@mapcairn/sdk` did merge into `@mapcairn/core`'s `Services`. The docs still tell a host to augment `@mapcairn/core`, because the consumer check (slice 2) is what covers it across installers and `moduleResolution` settings.
- **Server rendering and Workers.** No module state and no browser global, so nothing changes. The workerd leg of the consumer check covers it.
- **API report.** How API Extractor reports `export * from "<external package>"` is unknown (it may keep the line and list no names). It is a spike in slice 1, not a claim, and the drift test does not depend on it. Slice 1 result: API Extractor keeps each `export * from "<package>"` line and the two tie-breaks in `packages/sdk/api/*.api.md` and lists no names, so the umbrella's report does not show a name added to a package (that shows in the package's own report, and the drift tests see it). `scripts/apiReports.mjs` links the repository's `node_modules` into its scratch folder so API Extractor can resolve the packages.

The entry points are `.`, `./core`, `./core/contracts`, `./map`, `./react`, `./theme` and `./styles.css`.

### Versioning and the release set

`setReleaseInManifest` already sets the version of each name in `SDK_NAMES` and every internal range to the exact version (`internalRange`), so adding `sdk` to `SDK_PACKAGES` (`scripts/sdkPackages.mjs`) carries it through `release:plan`, `release:apply`, `release:check`, `verifyRelease.mjs` and `verifyPublished.mjs`. The umbrella goes last wherever order matters, so a published umbrella never names a package that is missing: `SDK_BUILD_ORDER` (`scripts/buildSdk.mjs`), `PACKAGES` and `SIZE_CEILINGS` (`packCheck.mjs`) and the two `for name in core react theme map` loops in `release.yml` (the `rehearse` dry run and the real `npm` job).

Everything else reads `SDK_PACKAGES` in `scripts/sdkPackages.mjs`, so adding `sdk` there carries it to the lint tests, the `notesCheck.mjs` patterns, the sentence in `check.mjs`, `SDK_PACKAGE_PATHS` in `sdkLicences.mjs`, the roots in `scripts/depcruise.mjs`, `SDK_BUILD_ORDER` and `PACKAGES`. The loops in `release.yml` and `repeatable-build.yml` and the path filter in `ci.yml` keep literal lists, which `sdkPackages.test.ts` checks against it. Issue #540 gave them one source before the umbrella joins. `publishGuard` is unaffected, since it matches commands and not package names.

### Boundary rules

- **dependency-cruiser.** The rules for `core`, `react`, `theme` and `map` list their forbidden targets, so `packages/sdk/src` is added to each list. A new rule `nothing-imports-the-umbrella` stops `packages/*`, including `web`, from importing `packages/sdk`. A new rule `umbrella-reexports-entry-points-only` limits `packages/sdk/src` to `SDK_ENTRY_POINTS` (the four packages by name, no npm package). `SDK_ENTRY_POINTS` gains the umbrella's entry files so `examples/embed` may import them. Rejected: leaving the umbrella out of dependency-cruiser and relying on the drift test, because nothing would then stop `web` or a package from importing it.
- **The SDK licence check.** `packages/sdk` joins `SDK_PACKAGE_PATHS`. Its production dependencies are the four workspace links, which the walk already follows. Its peers (`react`, `react-dom` `^19.0.0` and the optional `vitest`) are listed and never fail.
- **The harmony scanner.** Not applicable: no style, markup or wiring code.
- **No code of its own.** A lint test parses `packages/sdk/src/*.ts` with the TypeScript compiler (already a dev dependency) and fails on any statement that is not `export … from "@mapcairn/<core|map|react|theme>[/contracts]"`.

### Drift test

Options: 1. Diff the umbrella's API report against the four, rejected while the report's shape for star re-exports is unknown. 2. The checks below, which read manifests, committed reports, source and runtime namespaces. Checks 1, 3 and 4 read files only and live in `packages/core/src/lint/umbrella.test.ts`. Check 2 imports `@mapcairn/map` under the source condition, which needs the vanilla-extract plugin and happy-dom, so it lives in `packages/sdk/src/umbrella.test.ts` with a Vite config modelled on `packages/map/vite.config.ts`.

1. **Exports map.** The umbrella's `exports` keys equal `.` and `./styles.css`, plus `./<pkg>` and `./<pkg>/<sub>` for each export of the four manifests that carries the `@mapcairn/source` condition (what `entryPointsOf` in `scripts/buildPackage.mjs` selects, so `theme`'s `./tokens.css` and `map`'s `./styles.css` are not mirrored).
2. **Runtime names.** Under `@mapcairn/source`, `Object.keys(sdk)` equals the union of the four namespaces, and `sdk[name] === pkg[name]` for each name (a tie-broken name from the package its tie-break names).
3. **Type collisions.** The collisions computed from the four committed API reports equal the explicit tie-breaks in `packages/sdk/src/index.ts`. This catches a type-only collision the runtime check cannot see, and a stale tie-break.
4. **Source holds only re-exports** (the boundary rule above).
5. **`tsc`** fails with TS2308 on a collision with no tie-break.
6. **Stylesheet.** `sdkDist.test.ts` checks that `dist/styles.css` holds exactly the two `@import` lines, tokens first.

### Timing and slices

Options for timing: 1. Join `rc.2`. That needs a workflow change and a hand publish inside the 2-day window of a new trusted-publisher link, and it would stop `rc.2` testing what it is for. 2. Build now, release in `0.1.0-rc.3`. 3. Release in `0.1.0`, which would make the umbrella's first version a hand publish without provenance on a stable release. Choice: 2, decided on 2026-11-20.

- **Slice 1** adds `packages/sdk` with `"private": true`, outside `SDK_PACKAGES`, with its re-exports, stylesheet, tests, boundary rules, README and API report. Its licence check entry is added in slice 2 (#541), with `sdk` joining `SDK_PACKAGES`: the check covers published packages, and the umbrella's only dependencies are the four workspace packages. Nothing about the release changes. One constraint: `release:apply` sets the version only for names in `SDK_NAMES` but rewrites the internal ranges in every workspace, so after the `rc.2` apply the umbrella would keep an `rc.1` version with `rc.2` ranges. Recommendation: land slice 1 after the `rc.2` Release pull request merges and set the umbrella to that version then; if it must land earlier, keep `sdk` out of the equal-versions test until slice 2.
- **Slice 2** (#541) follows the `rc.2` merge, the per-package registry gate (#539) and the single package list (#540): `sdk` joins the release lists and loses `private`, the consumer check gains an umbrella leg, and the quickstart is rewritten. `rc.3` then releases five packages. The four existing packages publish from CI under `next` with provenance (the per-package gate leaves the umbrella, because it is not on npm yet, and the job then fails naming it, as "Trusted publishing" below decides), and the umbrella is published by hand, after which the failed jobs are re-run.

### Trusted publishing

One more link: `@mapcairn/sdk`, repository `MapCairn/mapcairn`, workflow `release.yml`, environment `npm`, allowed action `npm publish` (as for the other four in `0014-sdk-release.md`, maintainer step 4). The link is made on the package's settings page, which exists only after the first publish, and it expires after 2 days unused. If npm later allows a link before the first publish, the hand step falls away.

What the `npm` job does with a package npm does not have (decided in #539): it cannot publish it, because there is no trusted publisher to exchange the OIDC token with, and it holds no token. Options: 1. Skip it with a notice and end green, as the first draft of #539 proposed. The run then looks complete while the umbrella is missing, and nothing says what to do next. 2. Fail before publishing anything. The four stay unpublished until the maintainer has uploaded the umbrella, which is the wrong order, because the umbrella pins the four. 3. Publish the packages npm has, leave the new one, and then fail with an error naming it and the steps. Choice: 3, with one refusal: the job reads every package state before it publishes anything, and when a `new` package is an internal dependency of a package it would publish, it publishes nothing and fails naming both (the dependents would pin a version nobody can install). The documented upload order stays as the rule and the job enforces it as a backstop. The run is red until the maintainer has uploaded the package by hand, linked its trusted publisher and re-run the failed jobs, which then find it on npm and end green. A rehearsal reports the same state with a warning and stays green, since it publishes nothing, and `release:check` lists which packages npm has and which it does not. The state is read per package with `package-state` (`published`, `missing`, `new`), never from a failed publish, and an answer that is neither found nor not found still stops the job, so an outage is not taken for a first publish.

## Tests

Each step starts with the failing tests named under it; `design-tests` levels in brackets.

- [lint test, files only] `umbrella.test.ts` checks 1, 3 and 4 above: fails today because `packages/sdk` does not exist; proved by adding a subpath to a package, a collision to a report, and a statement of its own to the umbrella source, each of which must fail.
- [unit, source condition] `packages/sdk/src/umbrella.test.ts`, check 2: the runtime names equal the union of the four namespaces, and the two named collisions resolve to `map`'s `ScaleBar` and `core`'s `ReadingDirection`.
- [lint tests] `sdk` added to the lists in `manifests.test.ts`, `packageReadmes.test.ts`, `apiReports.test.ts` and `sdkDist.test.ts` (and, in slice 2, `releaseApply`, `releaseCheck` and `releaseTarballs` with five packages, and a `packCheck` ceiling).
- [dependency-cruiser cases] a fixture import of `packages/sdk` from `web`, and of an npm package from `packages/sdk/src`, each fail the new rules.
- [build output] `sdkDist.test.ts` check 6, and `pack:check` with the umbrella's `files`.
- [consumer check, slice 2] a new leg whose app manifest names only `@mapcairn/sdk` and takes the four tarballs through `overrides`: npm and strict pnpm installs, a render in plain Node importing only from the umbrella, a plain Vite build with `import "@mapcairn/sdk/styles.css"`, `tsc` under `bundler`, `node16` and `nodenext`, and the declaration-merging case. This is the acceptance test: it renders the map chrome on the SDK's fakes.
- [unit, step run with a fake `npm` and registry] #539: one package new and three present publishes the three, fails, and names the new one with the steps to take; none new and all present publishes nothing and passes; no package on npm publishes nothing and names every package; a half-published set is finished; `rehearse` warns and stays green, and `release:check` reports the same per-package state.
- [lint test] #540: a test fails when a public workspace is missing from the one list, or a listed one does not exist.
- No browser or accessibility test: the umbrella adds no interface.

## Order of work

Each step is one pull request. `Part of #538` unless another issue is named.

1. **One package list, [#540](https://github.com/MapCairn/mapcairn/issues/540).** Make `SDK_PACKAGES` the source for the lint tests, `check.mjs`, `ci.yml`, `release.yml`, `depcruise.mjs` and `sdkLicences.mjs`, with its completeness test. It must separate the packages that are released from the ones that exist, so slice 1 can add a private `sdk` without joining the release set. Files: the scripts and workflows named above, `packages/core/src/lint/`.
2. **Per-package registry gate, [#539](https://github.com/MapCairn/mapcairn/issues/539).** Make the registry gate per package: the `npm` job reads each package, publishes the ones npm has, and fails naming one it does not ("Trusted publishing" below). `verifyRelease.mjs` loses `readRegistryState` and the `on-npm` output, and `package-state` prints `published`, `missing` or `new`. Files: `scripts/release/verifyRelease.mjs`, `check.mjs`, `.github/workflows/release.yml`, `docs/guides/releasing.md`, `docs/plans/0014-sdk-release.md`, tests. It touches the workflow changed in #536, so it follows that.
3. **Slice 1, private `packages/sdk` (this issue, #538). In progress: its pull request is open.** After the `rc.2` Release pull request merges (see "Timing and slices"):
   1. The failing tests above (drift checks, list entries, dependency-cruiser cases).
   2. `packages/sdk`: `package.json` (exact ranges on the four, peers, `sideEffects`, `files: ["dist", "!dist/.built"]`, the same metadata as the four, `"private": true`), `src/index.ts` and one file per subpath, `src/styles.css`, `tsconfig.json`, `LICENSE`, `README.md` with its `**Status:**` line, the SPDX header on each source file.
   3. The Vite config with the SDK's 95% coverage thresholds, and the tree-shaking measurement on `examples/embed`.
   4. Build: `sdk` last in `SDK_BUILD_ORDER`. `buildPackage.mjs` copies the stylesheet and must not treat a `.css` export with no `.css.ts` sources as a compiled stylesheet. Spike how API Extractor reports star re-exports, then `npm run api:update` and commit `packages/sdk/api/`.
   5. Boundaries: `.dependency-cruiser.cjs`, `scripts/depcruise.mjs`, `scripts/sdkLicences.mjs`.
   6. A real `npm install` for the new workspace with the lockfile, then `npm ci --ignore-scripts` in a disposable clone.
4. **Slice 2, [#541](https://github.com/MapCairn/mapcairn/issues/541).** After steps 1 and 2 and the `rc.2` merge:
   1. The failing tests: the five-package release tests, the `packCheck` ceiling and the consumer-check leg.
   2. `sdk` joins `SDK_PACKAGES`, `PACKAGES`, `SIZE_CEILINGS`, the `release.yml` loops, the `notesCheck` patterns, the `ci.yml` filter and the `check.mjs` sentence; `private` comes off.
   3. The documents under "Documents to update".
5. **`v0.1.0-rc.3`.** An agent opens the Release pull request with the `release` skill, and the maintainer works through the checklist below. The agent then runs the post-release check.

### rc.3 release checklist (the maintainer's steps)

An agent lists these and waits. Values match `docs/guides/releasing.md` and maintainer steps 3 and 4 of `0014-sdk-release.md`.

1. Merge the `rc.3` Release pull request with the squash subject the guide gives. The GitHub Release appears with five attested tarballs. The `npm` job stages the four packages that are on npm, with a notice that `@mapcairn/sdk` is skipped.
2. Approve the four staged packages on npmjs.com with two-factor authentication (they publish under `next`).
3. Publish `@mapcairn/sdk` by hand. Download `mapcairn-sdk-0.1.0-rc.3.tgz` from the GitHub Release, check it with `gh attestation verify <tarball> --repo MapCairn/mapcairn`, then, signed in with two-factor, run `npm publish <absolute path to the tarball> --access public --tag next`. This version has no provenance, as `rc.1` had none. Check that the other four are already on npm first, so the umbrella never names a missing package.
4. Link the trusted publisher for `@mapcairn/sdk` (package settings → Trusted Publisher → GitHub Actions): organisation `MapCairn`, repository `mapcairn`, workflow `release.yml`, environment `npm`, allowed action `npm publish`. The link expires after 2 days unused, so make it when the `0.1.0` Release pull request is ready, not earlier.
5. On the package's settings, set "Require two-factor authentication and disallow tokens".
6. After `0.1.0`: move `next` to it for the umbrella too (`npm dist-tag`, the maintainer's step, as for the four).

## Documents to update

All in step 4 (slice 2), apart from the first two, which are in step 3.

- `packages/sdk/README.md` (new), and one line in each of the four package READMEs pointing to it.
- `docs/guides/public-api.md`: five packages, the tie-break rule, "augment `@mapcairn/core` directly", the umbrella's report.
- `README.md`: "Embed a map" becomes one install, `import "@mapcairn/sdk/styles.css"` and one import, and the "Packages" table gets five rows, keeping the per-package install. `readme.test.ts` accepts either form.
- `docs/guides/extending.md`: "Embed the SDK in an app of your own" and the licence-check sentence.
- `docs/guides/releasing.md`: five packages, the fifth trusted-publisher link, the umbrella's first publish by hand, the umbrella last, and the per-package gate (step 2).
- `ARCHITECTURE.md`: a row for the umbrella in "Layers and dependency rules", and five packages in "Building the SDK packages".
- `AGENTS.md`: "Four SDK packages" in "About" and the package boundaries list.
- `docs/plans/0014-sdk-release.md`: record that the set is five packages from `rc.3` (in step 2 for the per-package gate, in step 4 for the set). It is not changed in the pull request that adds this plan, because it is still true for `rc.1` and `rc.2`.
- `docs/plans/README.md`: this plan is listed under open plans.
- `ROADMAP.md`, `PRIVACY.md`, `ATTRIBUTIONS.md`: no change. The work sits in the existing "First release" milestone and adds no data, origin or credit.

## Risks

- **Public API.** A root of about 1,120 names. A collision is caught by `tsc` and by the drift test, and the tie-break rule keeps the root's meaning stable. A host that mixes the umbrella with a direct `@mapcairn/map` at another version gets two copies and two React contexts, so the docs say to keep direct dependencies at the umbrella's version. Declaration merging through the umbrella was seen to work with TypeScript 6 and 7 in slice 1, but stays unsupported until the slice 2 consumer check covers both forms (augmenting `@mapcairn/core` and augmenting `@mapcairn/sdk`); the docs say to augment `@mapcairn/core`.
- **Release.** A new package in a lockstep set can stall a release. The per-package gate (#539) and the hand publish contain it, and `rc.3` is the rehearsal. The trusted-publisher link expiring unused is handled by making it late (checklist step 4).
- **Security and supply chain.** One more name to protect (the scope covers it), one more link, and one hand publish without provenance under `next`. The tarball is attested and digest-checked like the others. No new origin and no runtime code. A signed-in npm session remains a path around the GitHub gate, as `0014-sdk-release.md` says; step 5 of the checklist is what closes it.
- **Performance.** Tree-shaking through re-exports is measured, not assumed (slice 1).
- **Privacy.** Not applicable: nothing leaves the device and nothing is stored.

## Decided and open

Decided on 2026-11-20, by the maintainer in the design record on #538:

- The package is `@mapcairn/sdk`, in `packages/sdk`, in lockstep with the four.
- It is built now and released in `rc.3`, after `rc.2`.
- The README snippet uses the umbrella; `examples/embed` stays on the four packages and `readme.test.ts` accepts either form. The new consumer-check leg exercises the umbrella.
- The acceptance criterion is "renders the map chrome on the SDK's fakes" until a MapLibre adapter ships as a package.
- Follow-ups are #539, #540 and #541, and the adapter package (#43). An adapter package joins the umbrella through the same drift test: its entry point is mirrored as a subpath, and a collision gets a tie-break. Whether the umbrella depends on an engine at all is decided in #43, since it would add `maplibre-gl` to a package that today has no runtime dependency of its own.

Decided on 2026-11-20, on the three questions that were open:

1. **The unscoped `mapcairn` name is not held now.** The cost is a placeholder publish and a second package to keep in step; revisit if the name is wanted for the product page.
2. **Slice 1 lands after the `rc.2` Release pull request merges**, which removes the version-skew constraint. If `rc.2` is delayed, it lands earlier with `sdk` kept out of the equal-versions test.
3. **`./core/contracts` stays on the umbrella as its own subpath.** It is test code with an optional `vitest` peer; a host that writes an adapter needs it, and the cost is one export line.
