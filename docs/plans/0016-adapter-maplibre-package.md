# 0016: The MapLibre adapter as an SDK package

Status: done: all six steps are done and `@mapcairn/adapter-maplibre` was released with `0.1.0-rc.3`. Tracking issue: [#43](https://github.com/MapCairn/mapcairn/issues/43).

## Goal

A host that installs `@mapcairn/sdk` gets a real map, not only the chrome on the SDK's fakes: one install, one stylesheet import, one import line for the components from `@mapcairn/sdk`, one for `createMapLibreMapAdapter` from `@mapcairn/sdk/adapter-maplibre`, and one option that tells the adapter where the engine's worker is. The adapter moves out of the reference host into `@mapcairn/adapter-maplibre`, which takes `maplibre-gl` as a peer, so `core`, `map`, `react` and `theme`, and the umbrella's root, stay free of the engine. The reference host imports the package and behaves exactly as it does today. Both new packages are released in `0.1.0-rc.3`.

## Ground rules

- Decided on 2026-11-20, on #43: the package is `@mapcairn/adapter-maplibre`, in `packages/adapter-maplibre`; `maplibre-gl` is a peer dependency, so no SDK package takes a runtime dependency on it; it ships in `rc.3` with the umbrella (#538), and the umbrella re-exports it. Whether the name is free on npm is checked at step 1 of the `rc.3` checklist.
- #24 split the adapter into small modules (#567): only `engineLoader.ts` imports `maplibre-gl` at run time, and every other module imports its types only.
- The reference host does not change behaviour: the same worker, the same same-origin worker URL with its cache key, the same lazy engine chunk and stylesheet, the same engine styles, the same production Content Security Policy. `packages/web/public/_headers` and `src/constants/securityHeaders.ts` do not change.
- Nothing switches on a basemap, layer or provider id. The adapter makes no request until `mount` is given a basemap.
- Steps 1 and 2 do not wait for #541 (the umbrella joins the release set). Step 3 does, because it edits the same lists. #541 has since landed (#568) and emptied `UNRELEASED_SDK_PACKAGES`. The package is private in that list until step 3, so it builds after `sdk` meanwhile, which is harmless because the umbrella does not depend on it until step 3.
- An agent never runs `npm publish`, `npm trust` or `npm dist-tag`, and never approves a deployment (`AGENTS.md`, "Boundaries"). The first upload of each new package is the maintainer's.
- Adding a runtime dependency to an SDK package is the maintainer's call. This plan adds only workspace packages as dependencies; `maplibre-gl` is a peer, decided on #43.

## Design

### What depends on the host today

Read from the imports of every file in `packages/web/src/adapters/maplibre`:

- `engineLoader.ts` imports `withCacheKey` from `packages/web/src/constants/workerCacheKey.ts`, and the worker as `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url`. That query is Vite's, so a published module holding it works only in Vite, and Vite's dependency pre-bundling is not known to handle it inside a package.
- `MapLibreMapAdapter.ts` imports `Emitter` from `packages/web/src/adapters/shared/emitter.ts`. Nothing else imports `Emitter`.
- `imageExport.ts`, `markerImages.ts`, `patternImages.ts` and `shapeLayers.ts` import `tokenValues` from `@mapcairn/theme`. Every other import is `@mapcairn/core`, `maplibre-gl` (types, apart from the loader) or a sibling module.
- `packages/web/src/adapters/mapEngine.css.ts` restyles the engine inside `MapView`: it hides engine controls, sets the type and background from tokens, removes engine focus rings and lets cursors inherit. Every rule starts from `[data-map-host]`, which `MapView` in `@mapcairn/map` sets. `createServices.ts` imports it for its side effects.

### Boundary

Options: 1. Move the folder as it is and keep the `?worker&url` import in the package. Smallest, but the published package works only in Vite. 2. First make the adapter take its worker URL from the host (step 1, inside `packages/web`), then move the folder unchanged (step 2). 3. Option 2 plus a Vite-only subpath that supplies the worker URL for Vite hosts. It saves a host one line and adds an entry point that needs Vite's pre-bundling to work.

Choice: 2. The move is then only a move, and the package works with any bundler that resolves `exports` and handles a CSS import, which is what `sites/docs/docs/guides/serving-from-iis.md` already asks of a host.

Moves to `packages/adapter-maplibre/src` (with `git mv`, so history follows): every file in `packages/web/src/adapters/maplibre` except the host's new `workerUrl.ts`, `Emitter` and its test (moved into the adapter folder in step 1), and `mapEngine.css.ts` as `styles.css.ts`. The test engine `maplibreTestEngine.ts` moves with the tests and is not exported. `imageExport.ts` (700 lines) moves as it is: it imports nothing from the host, and splitting it during a move would hide the move in the diff. Splitting it, and the pending-load lifecycle in `MapLibreMapAdapter.ts`, stays a separate refactor if one is wanted.

Stays in `packages/web`: `createServices()`, `workerCacheKey.ts`, the new `src/adapters/maplibre/workerUrl.ts` (the Vite worker import and the cache key), the `keepBrowserEngineOutOfWorker` plugin and the `maplibre-gl` dependency of the host, the app copy, routes, headers and the Playwright specs.

The package depends on `@mapcairn/core` and `@mapcairn/theme` at the exact workspace version, as `map` does. Theme is needed for the colours the adapter draws (handles, markers, patterns, shape defaults, the exported image) and for the engine styles. The alternative, passing those colours in as options, would add a large option object to the public API to remove a dependency on a package with no runtime dependency of its own. It does not import `@mapcairn/map`, `@mapcairn/react` or React.

### Public API

`@mapcairn/adapter-maplibre`:

```ts
export interface MapLibreMapAdapterOptions {
  /** Resolves to the URL of `maplibre-gl/dist/maplibre-gl-worker.mjs` as the host serves it. */
  readonly loadWorkerUrl: () => Promise<string>;
}
export function createMapLibreMapAdapter(options: MapLibreMapAdapterOptions): MapAdapter;
/** How long a tile layer may load before the adapter reports it slow. */
export const TILE_LAYER_SLOW_MS: number;
```

and `@mapcairn/adapter-maplibre/styles.css`, the compiled engine styles. `loadWorkerUrl` is a function so that the host's worker import stays a dynamic import, fetched only when a map mounts, as it is today. It is required: a bundled host without it gets a map that never draws, which a type error is a better way to learn about. A host that serves the file itself writes `loadWorkerUrl: async () => "/maplibre-gl-worker.mjs"`.

Not exported: the class `MapLibreMapAdapter` (a host constructs the adapter through the factory, so the class can change), `loadEngine` and `MapLibreModule`, `dataLayerEngineIds`, the other timing constants, and the test options (`workerFailureGraceMs`, `imageTilesWaitMs`, `tileLayerSlowMs`), which become a second, internal constructor argument the package's own tests use. `TILE_LAYER_SLOW_MS` stays public because a host's browser tests step a clock past it, as `packages/web/e2e/support/timers.ts` does. The rolled-up declarations must not import `maplibre-gl`, so a host that type-checks without the engine installed is not broken; step 2 checks the built `index.d.ts`.

### How the engine styles ship

`scripts/buildPackage.mjs` compiles `.css.ts` files into the package's stylesheet only when the package exports a `.css` file and the JavaScript build meets them through an import; `mapEngine.css.ts` exports nothing and is imported only by `createServices.ts`. So the module that holds the factory (`src/MapLibreMapAdapter.ts`) imports `./styles.css` (the `.css.ts` file) for its side effects. It is not the entry module: step 2 found that the host's production build drops an entry module's own imports when the module only re-exports, because the manifest's `sideEffects` does not list it, and the engine then loses its styles. The package's `sideEffects` lists `**/*.css` and `**/*.css.ts` as `map`'s manifest does, and the build writes `dist/styles.css`, which `./styles.css` in `exports` names.

A `.css` export has no `@mapcairn/source` condition, so a host that imported `@mapcairn/adapter-maplibre/styles.css` inside this repository would read `dist` and depend on a fresh build in dev and tests. The reference host does not import it. It resolves the package's source, as it does for `map`, and its own vanilla-extract plugin compiles the styles when `createServices.ts` imports the factory through the entry module. A host outside the repository imports `@mapcairn/adapter-maplibre/styles.css` once (or `@mapcairn/sdk/styles.css`, which includes it). Step 2 adds a host browser test that the engine container still has the map background from the tokens (`mapOverlayTokens.background`) and that the engine's controls are hidden, which fails if the styles stop reaching the page.

The host's change, Before and After:

```ts
// Before (packages/web/src/composition/createServices.ts)
import "../adapters/mapEngine.css";
import { createMapLibreMapAdapter } from "../adapters/maplibre/MapLibreMapAdapter";
createMapLibreMapAdapter({ workerCacheKey: WORKER_CACHE_KEY });
// After
import { createMapLibreMapAdapter } from "@mapcairn/adapter-maplibre";
import { loadWorkerUrl } from "../adapters/maplibre/workerUrl";
createMapLibreMapAdapter({ loadWorkerUrl });
```

### `maplibre-gl` as a peer

- Range `^6.18.0`, the version the repository installs and tests (`packages/web/package.json`). The adapter uses MapLibre 6 options such as the constructor-only `reduceMotion`, and the engine styles were checked against 6.17.0. A lower bound is lowered only with a test against that version.
- Licence: BSD-3-Clause. A walk of `package-lock.json` from `maplibre-gl` over its dependencies and required peers found 25 packages: MIT, ISC, BSD-2-Clause, BSD-3-Clause, and `@maplibre/mlt` under `MIT OR Apache-2.0`, which passes on either side. All are on `scripts/sdkLicences.allowlist.json`. That walk was the only evidence before step 3: `npm run licence:sdk` listed an SDK package's own peers without judging them, and did not walk a workspace link to another SDK package, so the adapter's peer was not judged through the umbrella, although npm installs it for every umbrella install. Step 3 changed the check to judge the required peers of an SDK package that another SDK package depends on, with a test, so `maplibre-gl` and its tree are judged from then on (so are the `react` and `react-dom` peers of `map` and `react`).
- ESM only, as `maplibre-gl` 6 is (`"type": "module"`, an `import` condition only) and as the SDK packages are.
- The engine's own stylesheet stays a dynamic import inside `loadEngine`, beside the engine, so it reaches the page only when a map mounts, as today. A host's bundler must handle a CSS import from JavaScript; the consumer leg in step 4 proves plain Vite does. The package's `styles.css` is static and small, and every selector is one attribute more specific than the engine rule it overrides, so the two can load in either order.
- Size. The adapter's non-test source is about 155 kB with its comments. The tarball's ceiling in `SIZE_CEILINGS` is set in step 3 at about one and a half times the size measured then, as for the other packages. The engine is not in the tarball; in the reference host it is an async chunk of about 300 kB gzipped (`packages/web/vite.config.ts`), unchanged by this plan.

### Worker, Content Security Policy and iOS

Behaviour does not change; the contract is written down for other hosts.

- MapLibre 6 runs a module worker. Without `setWorkerUrl` it looks for `maplibre-gl-worker.mjs` beside its own module (`import.meta.url`), which inside a bundle names the wrong chunk, so the worker never starts (maplibre/maplibre-gl-js#8002). Hence `loadWorkerUrl`. The adapter calls `setWorkerUrl` before any map exists.
- A same-origin worker URL needs `worker-src 'self'`. For a worker on another origin, the engine starts it from a `blob:` URL that imports it, which needs `worker-src blob:` and the worker's origin in `script-src`; and on a page whose origin is `null` it uses a `data:` URL. Read from the engine's 6.18.0 source; the browser leg in step 4 checks the same-origin case.
- A worker enforces the policy of its own response, and the engine fetches styles, tiles and glyphs inside it, so each basemap and layer origin goes in `connect-src` as well as `img-src` (`sites/docs/docs/guides/content-security-policy.md`). A host whose worker file is cached as immutable adds a cache key to the URL when its policy changes, as the reference host does with `withCacheKey`; that stays the host's code.
- iOS: the reference host's worker is a self-contained same-origin file, which works on iPhone today, and nothing about it changes. A host that serves the worker another way needs its own real-device check; the WebKit Playwright project cannot reproduce an iPhone GPU.
- Privacy: importing the package, calling the factory and server rendering make no request. On the first `mount` the adapter fetches the engine chunk, its stylesheet and the worker from the host (whatever URLs the host's bundler gave them), then the style and tiles of the basemap the host gave it, and nothing else. The adapter has no default basemap and no origin of its own, so `PRIVACY.md` does not change.

### Rules and checks

- **dependency-cruiser.**
  - `ENGINE_ADAPTERS` becomes `^packages/(adapter-maplibre/src/|web/src/adapters/maplibre/workerUrl\.ts$)`, anchored to the one host file, so only the package and `workerUrl.ts` may import the engine.
  - A new rule, `adapter-package-imported-by-composition-only`, scoped to the host: `from` is `^packages/web/` less `^packages/web/src/composition/`, and `to` is `^packages/adapter-maplibre/`. So inside the host only `createServices.ts` may import the package; `workerUrl.ts` imports the engine, not the package. `adapters-are-imported-by-composition-only` is left as it is: its `from` is every package outside the host's adapters and composition root, so adding the package to its `to` would refuse the package's imports between its own files and the umbrella's subpath file. Without the new rule any host file could import the adapter unnoticed.
  - New rules: `core`, `react`, `theme` and `map` may not import `packages/adapter-maplibre`; the package may import only `core` and `theme` among MapCairn packages (no `map`, no `react`, no `web`). In step 3 the umbrella rule's `FOUR_PACKAGE_ENTRY_POINTS` gains the package's entry module and stylesheet, and only the umbrella's subpath file may import them, not its root.
- **Harmony scanner.** The `EXEMPT_SURFACES` entry in `scripts/harmony/config.mjs` and the `engine-selector` message in `scripts/harmony/rules.mjs` point at `packages/adapter-maplibre/src/styles.css.ts`. `ADAPTER_WIRING_DIRS` in `config.mjs` gains `packages/adapter-maplibre/src/`, so the moved files keep the `service-singleton` exemption they have today inside `packages/web/src/adapters/`. The package's other files are scanned like any package source.
- **Licence headers** on every moved file are unchanged; `packages/adapter-maplibre/LICENSE` is the AGPL text.
- **Coverage.** The package gets the SDK floor, 95% for each measure. The adapter folder measured 99.43% statements, 96.51% branches, 100% functions and 99.42% lines on 2026-11-20 (`vitest run src/adapters/maplibre` in `packages/web`, with coverage over that folder and `emitter.ts`, leaving out the tests and `maplibreTestEngine.ts`). The root `vitest.config.ts` leaves the test engine out of coverage the same way, or branches fall to 95.52%: coverage is a setting of the root run, which a package's own Vite config cannot change.
- **Name.** `adapter-maplibre` is the first folder name with a hyphen. The release scripts build names as `@mapcairn/<folder>` and tarballs as `mapcairn-<folder>-<version>.tgz`; `findTarballs` matches `^mapcairn-<folder>-\d`, so `map` does not match `mapcairn-adapter-maplibre-…`, and the `notesCheck.mjs` pattern ends each name with `(?![\w-])`. `parseArguments` in `plan.mjs` checks the prerelease word, not a name. Step 3's release tests run the full set with the new name.

### The umbrella

Options for how `@mapcairn/sdk` carries the adapter:

1. A subpath only (`@mapcairn/sdk/adapter-maplibre`), with `maplibre-gl` an optional peer. The root stays engine-free, but a real map needs a manual install of the engine on top of the umbrella.
2. The root (`export *`) with `maplibre-gl` an optional peer. Rejected: a bundler resolves every import in the module graph before it shakes the tree, and an `export *` must load the adapter's modules to know their names, so a host without the engine would fail to build on `import("maplibre-gl")` even if it never calls the factory. Reasoned from how Rollup and webpack build a module graph, not tried.
3. The root and a mirrored subpath, with `maplibre-gl` a required peer. One import line, but `import("maplibre-gl")` is then in the module graph of every app that imports the umbrella, and a server or Worker build that follows it bundles about 1.4 MB of engine it never runs (`packages/web/vite.config.ts`, `keepBrowserEngineOutOfWorker`).
4. A subpath only, `@mapcairn/sdk/adapter-maplibre`, with `maplibre-gl` a required peer of the umbrella. npm (7 and later) and pnpm install required peers by default, so `npm install @mapcairn/sdk` brings the engine; strict pnpm and Yarn ask the host to list it, as they do for React. The root stays engine-free, and only an app that imports the subpath has the engine in its module graph.

Choice: 4, decided on 2026-11-20 by the agent coordinating the work as code owner, after the design review of this plan; the maintainer can reverse it before `rc.3` is published. One install gives everything, the quickstart has two import lines (the root for the interface, the subpath for the adapter), and an app that draws no map pays nothing in its page or its server bundle. What it costs: every umbrella install downloads `maplibre-gl`. A host that wants no engine at all installs the four packages it needs, as the umbrella README already says.

The umbrella gains `src/adapterMaplibre.ts` (`export * from "@mapcairn/adapter-maplibre"`), the export `./adapter-maplibre`, a dependency at the exact version, `maplibre-gl` in `peerDependencies` at the adapter's range, and a third line in `src/styles.css`: `@import "@mapcairn/adapter-maplibre/styles.css";`. The root `src/index.ts` does not change, so the adapter's names cannot collide with the root's. The drift tests learn the fifth package as a subpath: the exports-map check in `packages/core/src/lint/umbrella.test.ts` mirrors the adapter's `.` entry as `./adapter-maplibre`, its source pattern allows that one `export *`, the runtime check in `packages/sdk/src/umbrella.test.ts` compares the subpath's namespace with the adapter's and checks that the root's names do not include it, and `sdkDist.test.ts` expects three `@import` lines. `examples/embed` stays on the four packages and on fakes.

Step 3 measures, as slice 1 of plan 0015 did: a one-off Vite client build of a copy of `examples/embed` through the umbrella's root emits no MapLibre chunk and no worker, and, on every `npm run consumer:check` (through `bundleGraph.mjs`), the client, server and Worker builds of the consumer fixture's umbrella app through the root hold no MapLibre code. The figures go in this plan.

Measured on 2026-11-20, with Vite 8. A client build of a scratch copy of `examples/embed` with its imports rewritten to the umbrella's root (nothing committed) emits one 909 kB JavaScript chunk, holds no module of `maplibre-gl` or the adapter and emits no worker. The consumer fixture's umbrella app (an app that lists only `@mapcairn/sdk` and the engine, built from the packed tarballs) is measured on every `npm run consumer:check` through `bundleGraph.mjs`: its client, server and Worker builds through the root hold no module of the engine or the adapter and emit no file named for the engine (JavaScript emitted: 726 kB client, 365 kB server, 1,414 kB Worker). Two control builds of one file that imports the adapter through the subpath do hold both: 1,426 kB for a client library build and 1,538 kB for a Worker build, almost all of it the engine. A control that holds the engine is part of the check, so a detector that sees nothing fails it. These checks read the modules a build kept after tree-shaking, so they prove what an app that does not call the factory ships and not that the root has no import path to the adapter: with `export * from "@mapcairn/adapter-maplibre"` added to the umbrella's root as a test, the `examples/embed` build was the same size (909,441 bytes), because the unused factory is dropped. The dependency-cruiser rule `umbrella-root-has-no-adapter`, the drift tests and `sdkDist.test.ts` hold the root's imports.

### Release

`SDK_PACKAGES` becomes `core`, `react`, `theme`, `map`, `adapter-maplibre`, then `sdk` (after its dependencies, before the umbrella). The lists that keep literal names gain it, with the tests that check them: the two `for name in` loops in `release.yml` and the dist folders in `repeatable-build.yml` (`sdkPackagesWorkflow.test.ts`), the `ci.yml` path filter, `SDK_BUILD_ORDER` in `buildSdk.test.ts`, the package lists in `publishGuardWorkflows.test.ts`, and `SIZE_CEILINGS` in `packCheck.mjs`. `setReleaseInManifest` sets its version and exact internal ranges like the others.

A new package cannot be published by the `npm` job: a trusted publisher is linked on the package's settings page, which exists only after a first publish. In `rc.3` both `@mapcairn/adapter-maplibre` and `@mapcairn/sdk` are new, and neither `core`, `react`, `theme` nor `map` depends on either, so the job skips no dependent (it skips a package that depends on a new one, and publishes the rest): it publishes the four, then fails naming the two. The adapter's tarball is created by the merge and pins `core@0.1.0-rc.3`, so it cannot be uploaded before the merge, and it does not need to be. The upload order is the adapter first, because the umbrella pins it. In a later release in which the adapter is new and the umbrella is already on npm, the job publishes the packages the adapter pins, skips the umbrella and fails naming both (#569).

The job's error annotation for a `new` package and `docs/guides/releasing.md` ("A package npm does not have yet") tell the maintainer to link the trusted publisher before re-running the failed jobs. A link made then expires unused if the next release is more than two days away, and the re-run does not need it, because it skips what npm has. Step 3 rewords both: upload by hand, require two-factor authentication, re-run the failed jobs, and link the publisher when the next Release pull request is ready.

### rc.3 checklist (the maintainer's steps)

This replaces the `rc.3` checklist in plan 0015 for the two new packages. An agent opens the Release pull request with the `release` skill, lists these steps and waits. The run's artifact is kept for 14 days and the re-run in step 6 reads it, so steps 3 to 6 finish within 14 days of the merge.

1. Before the merge: check that `@mapcairn/adapter-maplibre` and `@mapcairn/sdk` are not on npm (`npm view <name>` answers 404). Only the organisation can publish under the scope, so a 404 means the name is free.
2. Merge the Release pull request with the subject `chore(release): v0.1.0-rc.3 (#<number>)`, and approve the deployment of the `npm` job. It publishes `core`, `react`, `theme` and `map` under `next` with provenance, then fails naming the two new packages. That red run is expected.
3. Download all six tarballs from the GitHub Release into an empty folder (`verifyRelease.mjs tarballs` fails on a folder that lacks one). Check `mapcairn-adapter-maplibre-0.1.0-rc.3.tgz` and `mapcairn-sdk-0.1.0-rc.3.tgz` each with `gh attestation verify <tarball> --repo MapCairn/mapcairn --signer-workflow MapCairn/mapcairn/.github/workflows/release.yml --source-ref refs/heads/main --source-digest <tag commit> --deny-self-hosted-runners` and the folder with `node scripts/release/verifyRelease.mjs tarballs 0.1.0-rc.3 <folder>`; check that the tag commit is on `main`, and that the four are on npm at `0.1.0-rc.3`.
4. Signed in with two-factor authentication, publish the adapter first: `npm publish <absolute path>/mapcairn-adapter-maplibre-0.1.0-rc.3.tgz --access public --tag next`. Then the umbrella: `npm publish <absolute path>/mapcairn-sdk-0.1.0-rc.3.tgz --access public --tag next`. Neither has provenance, as `rc.1` had none, and npm gives each first version `latest` as well as `next`, as it did for `rc.1`.
5. On each new package's settings page, under Publishing access, require two-factor authentication and disallow tokens. Run `npm logout`.
6. Re-run the failed jobs ("Re-run failed jobs", never "Re-run all jobs"). The job finds all six on npm and ends green.
7. An agent runs `npm run release:verify-published -- 0.1.0-rc.3 --no-provenance`, which says for each package whether it has provenance: the four should, the two hand uploads will not. The flag applies to the whole set, so the agent reads the four lines itself rather than relying on the exit code.
8. Link the two trusted publishers when the next Release pull request (`rc.4` or `0.1.0`) is ready, not earlier, because a link expires after 2 days unused: for each of `@mapcairn/adapter-maplibre` and `@mapcairn/sdk`, organisation `MapCairn`, repository `mapcairn`, workflow `release.yml`, environment `npm`, allowed action `npm publish`. That release then publishes all six from CI.

## Tests

Each step starts with the failing tests named here.

- [unit] Step 1, `MapLibreMapAdapter.workerUrl.test.ts`: the engine's `setWorkerUrl` gets what `loadWorkerUrl` resolves to, before the first map is built; a rejected `loadWorkerUrl` rejects the mount and is called again on the next mount; the engine is loaded once for two adapters. `workerUrl.test.ts` in the host: the URL carries `WORKER_CACHE_KEY`. Fails today because the option does not exist. `createServices.test.ts` stops asserting `toBeInstanceOf(MapLibreMapAdapter)` (lines 24 and 133), because the class will not be exported: it mocks the factory's module and asserts that `createServices()` calls `createMapLibreMapAdapter` once with a `loadWorkerUrl` that resolves to the host's worker URL, and that the map factory returns what it returned.
- [contract suite] `runMapAdapterContract` runs against the package's adapter over the scripted engine, as `MapLibreMapAdapter.contract.test.ts` does now, and against `FakeMapAdapter` in core as before. happy-dom has no WebGL, so the real engine is covered by the host's Playwright specs.
- [property] Step 2: for the fake basemaps, `styleFor`, `composeHybrid` and `omitSaveDataLayers` give the same result when the basemap's `id` is replaced by any string (fast-check, as `packages/core` uses it), which shows that no code reads the id.
- [unit, `packages/map`] Step 2: a `MapView` test that the map region carries `data-map-host` and a `data-projection` equal to the settings' projection. The engine styles select on both, and the test lives where the attributes are set, so a change in `map` fails in `map`.
- [lint tests] Step 2: the package in `manifests.test.ts` (dependencies declared, `maplibre-gl` a peer, exports are entry points only), `packageReadmes.test.ts`, `apiReports.test.ts`, `sdkDist.test.ts` (`dist/styles.css` is built and holds the engine rules, the declarations do not import `maplibre-gl`) and `sdkPackages.test.ts`; dependency-cruiser cases for each new rule (an import of the package from `map`, of `map` from the package, of the package from a host file outside `composition/`, of the engine from a host file in `src/adapters/maplibre/` other than `workerUrl.ts`).
- [browser] Step 2: the host's Playwright suites run unchanged on the host that now imports the package, the full `npm run e2e` and `npm run a11y`, because the engine moves. A new assertion in `basemap.spec.ts`: the engine container's computed background is the token's map background and no engine control is visible. `workerBundle.test.ts` still finds no MapLibre file in the Worker bundle.
- [build output] Step 3: the release tests with six packages (`releaseApply`, `releaseCheck`, `releaseTarballs`), the workflow list tests named under "Release", the `packCheck` ceiling, the drift tests with the subpath, a `sdkLicences.test.ts` case in which a required peer with a licence off the list, reached through one SDK package's dependency on another, fails the check, and the two measured builds through the umbrella's root.
- [consumer check, browser] Step 4: a leg whose app names only `@mapcairn/sdk` among MapCairn packages (with the peers `react`, `react-dom` and `maplibre-gl` at the root lockfile's versions), imports the interface from `@mapcairn/sdk` and `createMapLibreMapAdapter` from `@mapcairn/sdk/adapter-maplibre`, and passes `loadWorkerUrl` from a Vite `?worker&url` import. The leg builds it with plain Vite, serves it on a free local port with the policy that `buildContentSecurityPolicy` in `examples/embed` builds as a header, and drives it with the repository's Playwright Chromium. Every request off the local origin is refused, except a made-up style origin answered with a minimal style (a background layer and one inline GeoJSON point, which makes the engine start its worker, as `packages/web/e2e/support/network.ts` does). It passes when the mount resolves, the worker came from the page's origin, a pixel in the map region has the style's background colour, no request was made before the page gave a basemap, and no policy violation was reported. Unit tests in `consumerCheck.test.ts` and `consumerLegs.test.ts` cover its manifest, its skip rule and the pixel check. Rejected: a check in plain Node or jsdom, which cannot draw WebGL and would only show that the factory is exported, which the existing render leg shows once the app imports it.
- Where the browser leg runs, said plainly. On a developer's machine it skips with a warning when Playwright or Chromium is missing, as the workerd leg does without Miniflare. When `GITHUB_ACTIONS` is set it fails instead of skipping, so CI cannot pass it by accident; the CI `SDK packages` job installs Chromium for it. That job is a required check on `main` (decided on 2026-11-21), so a pull request cannot merge with the leg red, but the release workflow's `check` job installs nothing (`release.yml`, the `check` job runs `consumerCheck.mjs --tarballs release` with no `npm ci`), so a release run does not draw a real map. The leg is therefore a go/no-go item in the `release` skill: the agent runs `npm run consumer:check` with Chromium before opening a Release pull request and reports the result. Making it required, by making the `SDK packages` job a required check, is a ruleset change and the maintainer's (open question 1).
- No new accessibility test: no interface changes. iOS stays a real-device check.

## Order of work

Each step is one pull request, build green, `Part of #43`.

1. **[#571](https://github.com/MapCairn/mapcairn/issues/571): the worker URL from the host.** The `loadWorkerUrl` option, `workerCacheKey` removed from the options, the host's `workerUrl.ts`, `Emitter` moved into the adapter folder, the re-exports narrowed, the test options moved to an internal argument, and `createServices.test.ts` asserting the factory call. Files: `packages/web/src/adapters/maplibre/*`, `packages/web/src/adapters/shared/emitter*.ts`, `packages/web/src/composition/createServices*.ts`, `packages/web/src/e2eTimers.test.ts`.
2. **[#572](https://github.com/MapCairn/mapcairn/issues/572): the private package (merged).** After step 1. `packages/adapter-maplibre` with the moved files, `styles.css.ts` imported by `MapLibreMapAdapter.ts`, manifest (`private`, `maplibre-gl` peer, `core` and `theme` exact, `sideEffects`, `./styles.css`), `LICENSE`, `README.md` with its **Status** line, Vite config, the 95% thresholds and the test engine's coverage exclusion in the root `vitest.config.ts`, the package in `UNRELEASED_SDK_PACKAGES`, the rules above, the `MapView` attribute test in `map`, the host's background assertion, the API report, a real `npm install` with the lockfile and `npm ci --ignore-scripts` in a disposable clone. The host imports it.
3. **[#573](https://github.com/MapCairn/mapcairn/issues/573): the release set and the umbrella subpath (merged).** After step 2 and #541. The package joins `SDK_PACKAGES`, loses `private`, and joins the literal lists and `SIZE_CEILINGS`; the umbrella gains the subpath, the peer and the stylesheet line; the drift tests cover the subpath; the licence check judges the adapter's peer through the umbrella; the two measured builds; the reworded error annotation and guide. The umbrella now has a required peer, and a strict pnpm install refuses a missing required peer whatever the app imports, so the consumer check's umbrella leg lists `maplibre-gl` in its app manifest and `maplibre-gl` joins `LOCKED_TOOLS` here. Only an app that imports the subpath has the engine in its module graph.
4. **[#574](https://github.com/MapCairn/mapcairn/issues/574): the consumer check draws a real map (merged).** After step 3. The browser leg, its CI step and the `release` skill's go/no-go item. Built as the plan says, with two differences. The leg skips with a warning, even on GitHub Actions, where Playwright is not installed at all, so the release workflow's `check` job, which installs nothing, stays green; it fails on GitHub Actions only when Playwright is installed and its Chromium is not. And the policy is a copy of what `buildContentSecurityPolicy` builds for the leg's one basemap, kept equal by a unit test, because the leg is plain JavaScript and cannot import the TypeScript function.
5. **[#575](https://github.com/MapCairn/mapcairn/issues/575): the quickstart shows a real map.** After step 4. README and guides. The README's whole-app snippet is `packages/web/src/product/embedExample.tsx` character for character (a test keeps them equal, and the product page shows the file). That file is compiled and rendered in `packages/web`, where the umbrella may not be imported and the adapter package only from the composition root, and `readme.test.ts` checks the snippet's imports against `examples/embed`, which stays on fakes. So the whole-app snippet keeps its fakes, and the real map goes in the README's short install-and-import block above it, which is not tied to that file: the subpath import and `createMapLibreMapAdapter({ loadWorkerUrl })`.
6. **`v0.1.0-rc.3`.** With #541, through the `release` skill and the checklist above.

## Documents to update

- Step 1: `ARCHITECTURE.md` ("The map adapter": the loader takes the worker URL from the host; "Adding an adapter": the shared emitter line), `sites/docs/docs/guides/content-security-policy.md` (worker section).
- Step 2: `ARCHITECTURE.md` (the diagram, a row for the package in "Layers and dependency rules", "The map adapter", "Adding an adapter", "Building the SDK packages"), `DESIGN.md` (the engine style file's path under "Exempt surfaces"), `AGENTS.md` ("About" and the package boundaries), `packages/adapter-maplibre/README.md` (new), `sites/docs/docs/guides/extending.md` (the reference adapter's path).
- Step 3: `docs/guides/releasing.md` (six packages, two first uploads in order, the publisher linked when the next release is ready), `sites/docs/docs/guides/public-api.md`, `packages/sdk/README.md` (the subpath and the peer), `docs/plans/0014-sdk-release.md` and plan 0015's `rc.3` checklist (pointing here), `ARCHITECTURE.md` (the umbrella row).
- Step 4: `sites/docs/docs/guides/public-api.md` (what the consumer check proves, and where the browser leg runs), `sites/docs/docs/guides/content-security-policy.md` (what was checked in a browser), `.claude/skills/release/SKILL.md` (the go/no-go item, then `npm run agents:sync`).
- Step 5: `README.md` (quickstart with two import lines, and the Packages table), `sites/docs/docs/guides/extending.md`, `sites/docs/docs/guides/serving-from-iis.md`.
- This pull request: `docs/plans/README.md` lists this plan.
- `ROADMAP.md`, `PRIVACY.md`, `ATTRIBUTIONS.md`: no change. The work is in the "First release" milestone, adds no origin and no data, and MapLibre is already credited.

## Risks

- **Public API.** `loadWorkerUrl` decides how every host integrates the engine. It is one required function, which a later option can sit beside without a break. Exporting the factory and not the class keeps the class free to change. The umbrella's subpath is a second name for the same entry point; moving it to the root later is an addition, not a break.
- **Content Security Policy.** A host that serves the worker from another origin needs `blob:` in `worker-src`, which its policy may not allow, and gets a blank map. Contained by the guide, by `buildContentSecurityPolicy` in `examples/embed`, and by the step 4 leg, the first check of the policy contract in a browser.
- **iOS.** Unchanged for the reference host. Another host's worker set-up is not checked on a device; the guide says so.
- **Worker in other bundlers.** Only Vite is checked. A host on another bundler supplies the URL its bundler gives the worker file, or copies the file and names it. The dynamic CSS import needs a bundler that handles CSS imports. Contained by saying exactly what was checked, and by #44 (a prebuilt browser bundle) for pages without a bundler.
- **Engine styles keyed on `MapView`'s attributes.** `styles.css` selects `[data-map-host]` and `[data-projection]`, which `@mapcairn/map` sets. They stay internal hooks, not public API. The two packages are released in lockstep, the `MapView` test in `map` fails if either attribute goes, and the host's browser assertion fails if the styles stop applying.
- **The real-map check is not in the release workflow.** The browser leg runs in the `SDK packages` job, which is a required check on `main` (decided on 2026-11-21), but not in the release workflow. Contained by failing on CI when Chromium is missing and by the `release` skill's go/no-go item.
- **Install size.** Every umbrella install downloads `maplibre-gl`. The page and the server bundle of an app that does not import the subpath carry none of it, which step 3 measures. Hosts that want no engine at all install the four packages.
- **A host that renders on a server and imports the subpath.** Its server bundle follows `import("maplibre-gl")` and may bundle the engine, about 1.4 MB that runs nothing, as the reference host's Worker build would without its `keepBrowserEngineOutOfWorker` plugin. Contained by a note in `sites/docs/docs/guides/extending.md`.
- **Release.** Two new packages in one candidate, two hand uploads within the artifact's 14 days, two links to make late. Contained by the checklist above and by the job's per-package states; the run is red until both uploads are done.
- **Tile providers and privacy.** No change: the adapter has no provider of its own, and a host's basemaps decide every origin.
- **Licence.** `maplibre-gl` and its tree pass the allowlist today, by a walk of the lockfile. A new dependency of a later `maplibre-gl` is caught by `npm run licence:sdk` once step 3 makes it judge the adapter's peer through the umbrella.

## Decided and open

Decided on 2026-11-20, on #43: the name, the peer, `rc.3` with the umbrella, and the umbrella re-exporting the adapter.

Decided on 2026-11-21: the real-map leg is required. The `SDK packages` job that runs it is a required check on `main` (ruleset `main-pull-requests`). The `release` skill's go/no-go item still covers releases, because the release workflow does not run the leg. The cost is a longer required path on every pull request that touches the SDK packages.

Decided on 2026-11-20 by the agent coordinating the work, as code owner, after the design review of this plan; the maintainer can reverse any of them before `rc.3` is published:

- The umbrella carries the adapter at the subpath `@mapcairn/sdk/adapter-maplibre`, not at its root, and `maplibre-gl` is a required peer of the umbrella. The root stays engine-free; the quickstart shows two import lines.
- `examples/embed` stays on the four packages and on fakes, so it still proves each package's own entry points with no network. The real map is proved by the step 4 leg through the umbrella.
- `data-map-host` and `data-projection` stay internal hooks; the adapter package is their only other reader, and it ships in lockstep.
- Whether the name is free on npm is checked at step 1 of the `rc.3` checklist.

Decided in this plan (proposed until the plan merges):

- The host supplies the worker URL through a required `loadWorkerUrl`; the package never imports the worker.
- The package depends on `core` and `theme`. It exports the factory, its options type, `TILE_LAYER_SLOW_MS` and `./styles.css`, and nothing else. Its factory module imports its styles, and the reference host gets them through source.
- `imageExport.ts` and the pending-load lifecycle move without a split.
- The engine's stylesheet stays a lazy import beside the engine.
- The `maplibre-gl` peer range is `^6.18.0`.
