# 0016: The MapLibre adapter as an SDK package

Status: proposed. Tracking issue: [#43](https://github.com/MapCairn/mapcairn/issues/43).

## Goal

A host that installs `@mapcairn/sdk` gets a real map, not only the chrome on the SDK's fakes: one install, one stylesheet import, one import of the components and of `createMapLibreMapAdapter`, and one line that tells the adapter where the engine's worker is. The adapter moves out of the reference host into `@mapcairn/adapter-maplibre`, which takes `maplibre-gl` as a peer, so `core`, `map`, `react` and `theme` stay free of the engine. The reference host imports the package and behaves exactly as it does today. Both new packages are released in `0.1.0-rc.3`.

## Ground rules

- Decided on 2026-11-20, on #43: the package is `@mapcairn/adapter-maplibre`, in `packages/adapter-maplibre`; `maplibre-gl` is a peer dependency, so no SDK package takes a runtime dependency on it; it ships in `rc.3` with the umbrella (#538), and the umbrella re-exports it. Whether the name is free on npm is checked by the maintainer (see "Decided and open").
- #24 split the adapter into small modules (#567): only `engineLoader.ts` imports `maplibre-gl` at run time, and every other module imports its types only.
- The reference host does not change behaviour: the same worker, the same same-origin worker URL with its cache key, the same lazy engine chunk and stylesheet, the same production Content Security Policy. `packages/web/public/_headers` and `src/constants/securityHeaders.ts` do not change.
- Nothing switches on a basemap, layer or provider id. The adapter makes no request until `mount` is given a basemap.
- Steps 1 and 2 do not wait for #541 (the umbrella joins the release set). Step 3 does, because it edits the same lists. The package is private in `UNRELEASED_SDK_PACKAGES`, ahead of `sdk` while that is still there, until step 3.
- An agent never runs `npm publish`, `npm trust` or `npm dist-tag`, and never approves a deployment (`AGENTS.md`, "Boundaries"). The first upload of each new package is the maintainer's.
- Adding a runtime dependency to an SDK package is the maintainer's call. This plan adds only workspace packages as dependencies; `maplibre-gl` is a peer, decided on #43.

## Design

### What depends on the host today

Read from the imports of every file in `packages/web/src/adapters/maplibre`:

- `engineLoader.ts` imports `withCacheKey` from `packages/web/src/constants/workerCacheKey.ts`, and the worker as `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url`. That query is Vite's, so a published module holding it works only in Vite, and Vite's dependency pre-bundling is not known to handle it inside a package.
- `MapLibreMapAdapter.ts` imports `Emitter` from `packages/web/src/adapters/shared/emitter.ts`. Nothing else imports `Emitter`.
- `imageExport.ts`, `markerImages.ts`, `patternImages.ts` and `shapeLayers.ts` import `tokenValues` from `@mapcairn/theme`. Every other import is `@mapcairn/core`, `maplibre-gl` (types, apart from the loader) or a sibling module.
- `packages/web/src/adapters/mapEngine.css.ts` restyles the engine inside `MapView`: it hides engine controls, sets the type and background from tokens, removes engine focus rings and lets cursors inherit. Every rule starts from `[data-map-host]`, which `MapView` in `@mapcairn/map` sets.

### Boundary

Options: 1. Move the folder as it is and keep the `?worker&url` import in the package. Smallest, but the published package works only in Vite. 2. First make the adapter take its worker URL from the host (step 1, inside `packages/web`), then move the folder unchanged (step 2). 3. Option 2 plus a Vite-only subpath that supplies the worker URL for Vite hosts. It saves a host one line and adds an entry point that needs Vite's pre-bundling to work.

Choice: 2. The move is then only a move, and the package works with any bundler that resolves `exports` and handles a CSS import, which is what `docs/guides/serving-from-iis.md` already asks of a host.

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

The host's change, Before and After:

```ts
// Before (packages/web/src/composition/createServices.ts)
import "../adapters/mapEngine.css";
createMapLibreMapAdapter({ workerCacheKey: WORKER_CACHE_KEY });
// After
import "@mapcairn/adapter-maplibre/styles.css";
import { createMapLibreMapAdapter } from "@mapcairn/adapter-maplibre";
import { loadWorkerUrl } from "../adapters/maplibre/workerUrl";
createMapLibreMapAdapter({ loadWorkerUrl });
```

### `maplibre-gl` as a peer

- Range `^6.18.0`, the version the repository installs and tests (`packages/web/package.json`). The adapter uses MapLibre 6 options such as the constructor-only `reduceMotion`, and the engine styles were checked against 6.17.0. A lower bound is lowered only with a test against that version.
- Licence: BSD-3-Clause. A walk of `package-lock.json` from `maplibre-gl` over its dependencies and required peers found 25 packages: MIT, ISC, BSD-2-Clause, BSD-3-Clause, and `@maplibre/mlt` under `MIT OR Apache-2.0`, which passes on either side. All are on `scripts/sdkLicences.allowlist.json`. That walk is the only evidence today: `npm run licence:sdk` lists an SDK package's own peers without judging them, and it does not walk a workspace link to another SDK package, so the adapter's peer is not judged through the umbrella either, although npm installs it for every umbrella install. Step 3 changes the check to judge the required peers of an SDK package that another SDK package depends on, with a test, so `maplibre-gl` and its tree are judged from then on.
- ESM only, as `maplibre-gl` 6 is (`"type": "module"`, an `import` condition only) and as the SDK packages are.
- The engine's own stylesheet stays a dynamic import inside `loadEngine`, beside the engine, so it reaches the page only when a map mounts, as today. A host's bundler must handle a CSS import from JavaScript; the consumer leg in step 4 proves plain Vite does. `@mapcairn/adapter-maplibre/styles.css` is static and small, and every selector is one attribute more specific than the engine rule it overrides, so the two can load in either order.
- Size. The adapter's non-test source is about 155 kB with its comments. The tarball's ceiling in `SIZE_CEILINGS` is set in step 3 at about one and a half times the size measured then, as for the other packages. The engine is not in the tarball; in the reference host it is an async chunk of about 300 kB gzipped (`packages/web/vite.config.ts`), unchanged by this plan.

### Worker, Content Security Policy and iOS

Behaviour does not change; the contract is written down for other hosts.

- MapLibre 6 runs a module worker. Without `setWorkerUrl` it looks for `maplibre-gl-worker.mjs` beside its own module (`import.meta.url`), which inside a bundle names the wrong chunk, so the worker never starts (maplibre/maplibre-gl-js#8002). Hence `loadWorkerUrl`. The adapter calls `setWorkerUrl` before any map exists.
- A same-origin worker URL needs `worker-src 'self'`. For a worker on another origin, the engine starts it from a `blob:` URL that imports it, which needs `worker-src blob:` and the worker's origin in `script-src`; and on a page whose origin is `null` it uses a `data:` URL. Read from the engine's 6.18.0 source; the browser leg in step 4 checks the same-origin case.
- A worker enforces the policy of its own response, and the engine fetches styles, tiles and glyphs inside it, so each basemap and layer origin goes in `connect-src` as well as `img-src` (`docs/guides/content-security-policy.md`). A host whose worker file is cached as immutable adds a cache key to the URL when its policy changes, as the reference host does with `withCacheKey`; that stays the host's code.
- iOS: the reference host's worker is a self-contained same-origin file, which works on iPhone today, and nothing about it changes. A host that serves the worker another way needs its own real-device check; the WebKit Playwright project cannot reproduce an iPhone GPU.
- Privacy: importing the package, calling the factory and server rendering make no request. On the first `mount` the adapter fetches the engine chunk, its stylesheet and the worker from the host (whatever URLs the host's bundler gave them), then the style and tiles of the basemap the host gave it, and nothing else. The adapter has no default basemap and no origin of its own, so `PRIVACY.md` does not change.

### Rules and checks

- **dependency-cruiser.** `ENGINE_ADAPTERS` becomes `^packages/(adapter-maplibre/src|web/src/adapters/maplibre)/`, so only the package and the host's `workerUrl.ts` may import the engine. New rules: `core`, `react`, `theme`, `map` and `sdk` (until step 3) may not import `packages/adapter-maplibre`; the package may import only `core` and `theme` among MapCairn packages (no `map`, no `react`, no `web`). `adapters-are-imported-by-composition-only` already covers the host. In step 3 the umbrella rule's `FOUR_PACKAGE_ENTRY_POINTS` gains the package's entry module and stylesheet.
- **Harmony scanner.** The `EXEMPT_SURFACES` entry and the `engine-selector` message in `scripts/harmony/rules.mjs` point at `packages/adapter-maplibre/src/styles.css.ts`. The package's other files are scanned like any package source.
- **Licence headers** on every moved file are unchanged; `packages/adapter-maplibre/LICENSE` is the AGPL text.
- **Coverage.** The package gets the SDK floor, 95% for each measure. The adapter folder measured 99.43% statements, 96.51% branches, 100% functions and 99.42% lines on 2026-11-20 (`vitest run src/adapters/maplibre` in `packages/web`, with coverage over that folder and `emitter.ts`, leaving out the tests and `maplibreTestEngine.ts`). The package's Vite config leaves the test engine out of coverage the same way, or branches fall to 95.52%.
- **Name.** `adapter-maplibre` is the first folder name with a hyphen. The release scripts build names as `@mapcairn/<folder>` and tarballs as `mapcairn-<folder>-<version>.tgz`; `findTarballs` matches `^mapcairn-<folder>-\d`, so `map` does not match `mapcairn-adapter-maplibre-…`, and the `notesCheck.mjs` pattern ends each name with `(?![\w-])`. `parseArguments` in `plan.mjs` checks the prerelease word, not a name. Step 3's release tests run the full set with the new name.

### The umbrella

Options for how `@mapcairn/sdk` carries the adapter:

1. A subpath only (`@mapcairn/sdk/adapter-maplibre`), with `maplibre-gl` an optional peer. A host that does not want MapLibre pays nothing and sees no peer warning, but a real map needs a second import and a manual install of the engine, which misses "one install, one import".
2. The root (`export *`) with `maplibre-gl` an optional peer. Rejected: a bundler resolves every import in the module graph before it shakes the tree, and an `export *` must load the adapter's modules to know their names, so a host without the engine would fail to build on `import("maplibre-gl")` even if it never calls the factory. Reasoned from how Rollup and webpack build a module graph, not tried.
3. The root and a mirrored subpath `./adapter-maplibre`, with `maplibre-gl` a required peer of the adapter and of the umbrella, as `react` is. npm (7 and later) and pnpm install required peers by default, so `npm install @mapcairn/sdk` brings the engine; strict pnpm and Yarn ask the host to list it, as they do for React.

Choice: 3, because it is the only one where one install and one import give a real map. What it costs: every umbrella install downloads `maplibre-gl`, whether or not the host draws a map. It must not cost bytes in the host's page: the umbrella's JavaScript stays pure re-exports, `sideEffects` stays `["**/*.css"]`, and the engine is reached only through the dynamic import in `loadEngine`. Step 3 measures, as slice 1 of plan 0015 did, that a Vite build of `examples/embed` through the umbrella, which does not call the factory, emits no MapLibre chunk and no worker. A host that wants no engine at all installs the four packages it needs, as the umbrella README already says.

The umbrella gains `export * from "@mapcairn/adapter-maplibre"`, a subpath file, a dependency at the exact version, `maplibre-gl` in `peerDependencies`, and a third line in `src/styles.css`: `@import "@mapcairn/adapter-maplibre/styles.css";`. The adapter's three exported names collide with none of the four packages' (checked against the committed reports in step 3; a collision fails `tsc` and the drift test, and gets a tie-break as plan 0015 says). The drift tests learn the fifth package: `PACKAGES` and the source pattern in `packages/core/src/lint/umbrella.test.ts`, the namespaces in `packages/sdk/src/umbrella.test.ts`, and `sdkDist.test.ts` for three `@import` lines. `examples/embed` stays on the four packages and on fakes (see "Decided and open").

### Release

`SDK_PACKAGES` becomes `core`, `react`, `theme`, `map`, `adapter-maplibre`, then `sdk` (after its dependencies, before the umbrella). The literal lists that `sdkPackages.test.ts` checks against it gain the name: the two `for name in` loops in `release.yml`, `repeatable-build.yml` and the `ci.yml` path filter; `SIZE_CEILINGS` gains its ceiling. `setReleaseInManifest` sets its version and exact internal ranges like the others.

A new package cannot be published by the `npm` job: a trusted publisher is linked on the package's settings page, which exists only after a first publish. In `rc.3` both `@mapcairn/adapter-maplibre` and `@mapcairn/sdk` are new, and neither `core`, `react`, `theme` nor `map` depends on either, so the job's refusal (it publishes nothing when a package it would publish depends on a new one) does not fire: it publishes the four, then fails naming the two. The adapter's tarball is created by the merge and pins `core@0.1.0-rc.3`, so it cannot be uploaded before the merge, and it does not need to be. The upload order is the adapter first, because the umbrella pins it. #569, which would let the job publish everything that does not depend on a new package, changes nothing here.

### rc.3 checklist (the maintainer's steps)

This replaces the `rc.3` checklist in plan 0015 for the two new packages. An agent opens the Release pull request with the `release` skill, lists these steps and waits.

1. Before the merge: check that `@mapcairn/adapter-maplibre` and `@mapcairn/sdk` are not on npm (`npm view <name>` answers 404).
2. Merge the Release pull request with the subject `chore(release): v0.1.0-rc.3 (#<number>)`, and approve the deployment of the `npm` job. It publishes `core`, `react`, `theme` and `map` under `next` with provenance, then fails naming the two new packages. That red run is expected.
3. Download all six tarballs from the GitHub Release into an empty folder (`verifyRelease.mjs tarballs` fails on a folder that lacks one). Check `mapcairn-adapter-maplibre-0.1.0-rc.3.tgz` and `mapcairn-sdk-0.1.0-rc.3.tgz` each with `gh attestation verify <tarball> --repo MapCairn/mapcairn --signer-workflow MapCairn/mapcairn/.github/workflows/release.yml --source-ref refs/heads/main --source-digest <tag commit> --deny-self-hosted-runners` and the folder with `node scripts/release/verifyRelease.mjs tarballs 0.1.0-rc.3 <folder>`; check that the tag commit is on `main`, and that the four are on npm at `0.1.0-rc.3`.
4. Signed in with two-factor authentication, publish the adapter first: `npm publish <absolute path>/mapcairn-adapter-maplibre-0.1.0-rc.3.tgz --access public --tag next`. Then the umbrella: `npm publish <absolute path>/mapcairn-sdk-0.1.0-rc.3.tgz --access public --tag next`. Neither has provenance, as `rc.1` had none, and npm gives each first version `latest` as well as `next`, as it did for `rc.1`.
5. On each new package's settings page, under Publishing access, require two-factor authentication and disallow tokens. Run `npm logout`.
6. Re-run the failed jobs ("Re-run failed jobs", never "Re-run all jobs"). The job finds all six on npm and ends green.
7. An agent runs `npm run release:verify-published -- 0.1.0-rc.3 --no-provenance`, which says for each package whether it has provenance: the four should, the two hand uploads will not. The flag applies to the whole set, so the agent reads the four lines itself rather than relying on the exit code.
8. Link the two trusted publishers when the next Release pull request (`rc.4` or `0.1.0`) is ready, not earlier, because a link expires after 2 days unused: for each of `@mapcairn/adapter-maplibre` and `@mapcairn/sdk`, organisation `MapCairn`, repository `mapcairn`, workflow `release.yml`, environment `npm`, allowed action `npm publish`. That release then publishes all six from CI.

## Tests

Each step starts with the failing tests named here.

- [unit] Step 1, `MapLibreMapAdapter.workerUrl.test.ts`: the engine's `setWorkerUrl` gets what `loadWorkerUrl` resolves to, before the first map is built; a rejected `loadWorkerUrl` rejects the mount and is called again on the next mount; the engine is loaded once for two adapters. `workerUrl.test.ts` in the host: the URL carries `WORKER_CACHE_KEY`. Fails today because the option does not exist.
- [contract suite] `runMapAdapterContract` runs against the package's adapter over the scripted engine, as `MapLibreMapAdapter.contract.test.ts` does now, and against `FakeMapAdapter` in core as before. happy-dom has no WebGL, so the real engine is covered by the host's Playwright specs.
- [property] Step 2: for the fake basemaps, `styleFor`, `composeHybrid` and `omitSaveDataLayers` give the same result when the basemap's `id` is replaced by any string (fast-check, as `packages/core` uses it), which shows that no code reads the id.
- [lint tests] Step 2: the package in `manifests.test.ts` (dependencies declared, `maplibre-gl` a peer, exports are entry points only), `packageReadmes.test.ts`, `apiReports.test.ts`, `sdkDist.test.ts` (the stylesheet is built, the declarations do not import `maplibre-gl`) and `sdkPackages.test.ts`; dependency-cruiser cases for each new rule (an import of the package from `map`, of `map` from the package, of the engine from the host outside `workerUrl.ts`).
- [browser] Step 2: the host's Playwright suites run unchanged on the host that now imports the package, the full `npm run e2e` and `npm run a11y`, because the engine moves. `workerBundle.test.ts` still finds no MapLibre file in the Worker bundle.
- [build output] Step 3: the release tests with six packages (`releaseApply`, `releaseCheck`, `releaseTarballs`), the `packCheck` ceiling, the drift tests with the fifth package, a `sdkLicences.test.ts` case in which a required peer with a licence off the list, reached through one SDK package's dependency on another, fails the check, and the measured build of `examples/embed` through the umbrella.
- [consumer check, browser] Step 4: a leg whose app names only `@mapcairn/sdk` among MapCairn packages (with the peers `react`, `react-dom` and `maplibre-gl` at the root lockfile's versions), imports everything from it and passes `loadWorkerUrl` from a Vite `?worker&url` import. The leg builds it with plain Vite, serves it on a free local port with the policy that `buildContentSecurityPolicy` in `examples/embed` builds as a header, and drives it with the repository's Playwright Chromium. Every request off the local origin is refused, except a made-up style origin answered with a minimal style (a background layer and one inline GeoJSON point, which makes the engine start its worker, as `packages/web/e2e/support/network.ts` does). It passes when the mount resolves, the worker came from the page's origin, a pixel in the map region has the style's background colour, no request was made before the page gave a basemap, and no policy violation was reported. It skips with a warning when Playwright or Chromium is missing, as the workerd leg does without Miniflare, and the CI `SDK packages` job installs Chromium for it. Unit tests in `consumerCheck.test.ts` and `consumerLegs.test.ts` cover its manifest, its skip rule and the pixel check. Rejected: a check in plain Node or jsdom, which cannot draw WebGL and would only show that the factory is exported, which the existing render leg shows once the app imports it.
- No new accessibility test: no interface changes. iOS stays a real-device check.

## Order of work

Each step is one pull request, build green, `Part of #43`.

1. **[#571](https://github.com/MapCairn/mapcairn/issues/571): the worker URL from the host.** The `loadWorkerUrl` option, `workerCacheKey` removed from the options, the host's `workerUrl.ts`, `Emitter` moved into the adapter folder, the re-exports narrowed and the test options moved to an internal argument. Files: `packages/web/src/adapters/maplibre/*`, `packages/web/src/adapters/shared/emitter*.ts`, `packages/web/src/composition/createServices*.ts`, `packages/web/src/e2eTimers.test.ts`.
2. **[#572](https://github.com/MapCairn/mapcairn/issues/572): the private package.** After step 1. `packages/adapter-maplibre` with the moved files, `styles.css.ts`, manifest (`private`, `maplibre-gl` peer, `core` and `theme` exact), `LICENSE`, `README.md` with its **Status** line, Vite config with the 95% thresholds, `UNRELEASED_SDK_PACKAGES` ahead of `sdk`, the rules above, the API report, a real `npm install` with the lockfile and `npm ci --ignore-scripts` in a disposable clone. The host imports it.
3. **[#573](https://github.com/MapCairn/mapcairn/issues/573): the release set and the umbrella.** After step 2 and #541. The package joins `SDK_PACKAGES`, loses `private`, and joins the workflow lists and `SIZE_CEILINGS`; the umbrella re-exports it with its peer and stylesheet line; the drift tests cover five packages; the licence check judges the adapter's peer through the umbrella; the tree-shaking measurement. From this step every app that imports the umbrella's root has `import("maplibre-gl")` in its module graph, so the consumer check's umbrella leg lists `maplibre-gl` in its app manifest and `maplibre-gl` joins `LOCKED_TOOLS` here, or the strict pnpm and Yarn builds fail.
4. **[#574](https://github.com/MapCairn/mapcairn/issues/574): the consumer check draws a real map.** After step 3. The browser leg and its CI job change.
5. **[#575](https://github.com/MapCairn/mapcairn/issues/575): the quickstart shows a real map.** After step 4. README and guides.
6. **`v0.1.0-rc.3`.** With #541, through the `release` skill and the checklist above.

## Documents to update

- Step 1: `ARCHITECTURE.md` ("The map adapter": the loader takes the worker URL from the host; "Adding an adapter": the shared emitter line), `docs/guides/content-security-policy.md` (worker section).
- Step 2: `ARCHITECTURE.md` (the diagram, a row for the package in "Layers and dependency rules", "The map adapter", "Adding an adapter", "Building the SDK packages"), `DESIGN.md` (the engine style file's path under "Exempt surfaces"), `AGENTS.md` ("About" and the package boundaries), `packages/adapter-maplibre/README.md` (new), `docs/guides/extending.md` (the reference adapter's path).
- Step 3: `docs/guides/releasing.md` (six packages, two first uploads in order, two links), `docs/guides/public-api.md`, `packages/sdk/README.md`, `docs/plans/0014-sdk-release.md` and plan 0015's `rc.3` checklist (pointing here), `ARCHITECTURE.md` (the umbrella row).
- Step 4: `docs/guides/public-api.md` (what the consumer check proves), `docs/guides/content-security-policy.md` (what was checked in a browser).
- Step 5: `README.md` (quickstart and Packages table), `docs/guides/extending.md`, `docs/guides/serving-from-iis.md`.
- This pull request: `docs/plans/README.md` lists this plan.
- `ROADMAP.md`, `PRIVACY.md`, `ATTRIBUTIONS.md`: no change. The work is in the "First release" milestone, adds no origin and no data, and MapLibre is already credited.

## Risks

- **Public API.** `loadWorkerUrl` decides how every host integrates the engine. It is one required function, which a later option can sit beside without a break. Exporting the factory and not the class keeps the class free to change.
- **Content Security Policy.** A host that serves the worker from another origin needs `blob:` in `worker-src`, which its policy may not allow, and gets a blank map. Contained by the guide, by `buildContentSecurityPolicy` in `examples/embed`, and by the step 4 leg, the first check of the policy contract in a browser.
- **iOS.** Unchanged for the reference host. Another host's worker set-up is not checked on a device; the guide says so.
- **Worker in other bundlers.** Only Vite is checked. A host on another bundler supplies the URL its bundler gives the worker file, or copies the file and names it. The dynamic CSS import needs a bundler that handles CSS imports. Contained by saying exactly what was checked, and by #44 (a prebuilt browser bundle) for pages without a bundler.
- **Engine styles keyed on `MapView`'s attributes.** `styles.css` selects `[data-map-host]` and `[data-projection]`, which `@mapcairn/map` sets. Whether `data-*` hooks are public is undecided (`docs/guides/public-api.md`). The two packages are released in lockstep, so they cannot drift apart in a release; a test in step 2 checks that `MapView` still sets both.
- **Install size.** Every umbrella install downloads `maplibre-gl`. Contained by the tree-shaking measurement and the four packages for hosts that want less.
- **A host that renders on a server.** A server bundle follows `import("maplibre-gl")` and may bundle the engine, as the reference host's Worker build would without its `keepBrowserEngineOutOfWorker` plugin. It runs nothing, but it adds about 1.4 MB. Contained by a note in `docs/guides/extending.md`.
- **Release.** Two new packages in one candidate, two hand uploads, two links to make late. Contained by the checklist above and by the job's per-package states; the run is red until both uploads are done.
- **Tile providers and privacy.** No change: the adapter has no provider of its own, and a host's basemaps decide every origin.
- **Licence.** `maplibre-gl` and its tree pass the allowlist today, by a walk of the lockfile. A new dependency of a later `maplibre-gl` is caught by `npm run licence:sdk` once step 3 makes it judge the adapter's peer through the umbrella.

## Decided and open

Decided on 2026-11-20, on #43: the name, the peer, `rc.3` with the umbrella, and the umbrella re-exporting the adapter.

Decided in this plan (proposed until the plan merges):

- The host supplies the worker URL through a required `loadWorkerUrl`; the package never imports the worker.
- The package depends on `core` and `theme`. It exports the factory, its options type, `TILE_LAYER_SLOW_MS` and `./styles.css`, and nothing else.
- `imageExport.ts` and the pending-load lifecycle move without a split.
- The engine's stylesheet stays a lazy import beside the engine.
- The `maplibre-gl` peer range is `^6.18.0`.

Open, for the maintainer:

1. **The umbrella carries the adapter at its root, with `maplibre-gl` as a required peer** (option 3 above). Recommendation: yes, because it is the only shape where one install and one import give a real map. The cost is the engine downloaded on every umbrella install; the alternative is a subpath with an optional peer, which costs every host that wants a map a second import and a manual install.
2. **`examples/embed` stays on the four packages and on fakes.** #43's task list says the example draws a real map; plan 0015 keeps the example on the four packages, requesting nothing. Recommendation: keep it, so the example still proves each package's own entry points with no network, and let the step 4 leg prove the real map through the umbrella. The cost of a real map there would be a tile origin in the example, network requests in its tests, and an example that no longer runs offline.
3. **Whether the name is free on npm.** Not checked while writing this plan. Recommendation: the maintainer runs `npm view @mapcairn/adapter-maplibre` before step 3; only the organisation can publish under the scope, so a 404 is enough.
4. **Whether `data-map-host` and `data-projection` become public hooks.** They join the open `data-*` decision in #423. Recommendation: keep them internal; the adapter package is the only other reader, and it ships in lockstep.
