---

title: The public API
sidebar_label: Public API
description: What counts as public in the SDK packages, how it is reported and what is a breaking change.
---

# The public API

What counts as public across the six packages (`@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react`, `@mapcairn/theme`, the MapLibre adapter `@mapcairn/adapter-maplibre` and the umbrella `@mapcairn/sdk` that re-exports them), so you know what you can rely on and how a change is classed for a release. The release scripts and reviewers use this guide as their rule.

## What counts as public

The public API is more than the TypeScript exports. A change that makes any item below stop accepting or producing something it did before is a breaking change.

| Surface                                           | What it covers                                                                                                                                                                                                                                                                                                                       | Breaking when                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exports of each entry point                       | `core` (`.` and `./contracts`), `map`, `react`, `theme`, `adapter-maplibre`, the umbrella `sdk` (`.` and its subpaths), and the stylesheets `theme/tokens.css`, `map/styles.css` and `adapter-maplibre/styles.css`                                                                                                                   | An export, a member or a signature is removed or narrowed, or a parameter becomes required                                                                               |
| New member of an exported union or enum-like type | for example a new `kind` of layer definition or a new error code                                                                                                                                                                                                                                                                     | Likely breaking, except for message keys: a host's exhaustive `switch` stops compiling                                                                                   |
| The shared-link format                            | `parseUrlHash` and `serialiseUrlHash` in `packages/core/src/urlHash/urlHash.ts`, and the `shapes` encoding (`encodeShapes`, `decodeShapes` in `packages/core/src/draw/share.ts`)                                                                                                                                                     | A link a person already shared reads differently or stops opening, even when no type changes                                                                             |
| The layer-definition validator                    | `validateLayerDefinition` in `packages/core/src/layers/validate.ts`                                                                                                                                                                                                                                                                  | It accepts less than before, so a definition a host wrote is now rejected                                                                                                |
| Formats a host writes or keeps                    | the JSON of a layer definition, the keys and values the SDK stores through `SettingsStore` (for example `mapcairn:theme`), and the shared-shapes text                                                                                                                                                                                | A value a host or a person already stored is no longer read, or reads as something else                                                                                  |
| Message keys                                      | the catalogue keys the SDK looks up, and their English source text                                                                                                                                                                                                                                                                   | Removing or renaming a key. Adding one is not breaking: a catalogue without it falls back to English. A host's `npm run catalogue:check` shows which keys it lacks       |
| Stored settings                                   | the `Settings` type of the `SettingsStore` port in `packages/core/src/ports/settings.ts` (`theme`, `units`, `zoomButtons`, `projection`, `basemapId`, `lastView`, `tourSeen`, `language`) and its values. A host with its own store owns its own keys; the reference host stores them under `mapcairn:`-prefixed `localStorage` keys | Undecided whether a stored value's format is public. Meanwhile, narrowing a `Settings` type or changing what a value means would lose or misread a person's saved choice |
| Only the `exports` entry points                   | `package.json` `exports` of each package; a deep path into `dist` or `src` is not public                                                                                                                                                                                                                                             | An entry point is removed or renamed. Reaching a file by a deep path was never supported                                                                                 |
| Behaviour a Content Security Policy depends on    | the SDK renders no inline style attributes and no inline script ([Content Security Policy](content-security-policy.md))                                                                                                                                                                                                              | Undecided: an inline style or script would force a host to loosen its policy                                                                                             |
| `peerDependencies` ranges                         | `react` and `react-dom` (`^19.0.0`), `maplibre-gl` (`^6.18.0`, required by `adapter-maplibre` and so by the umbrella), and the optional peers of `core`                                                                                                                                                                              | Not public: a range may change in a minor release while the version is `0.x`                                                                                             |
| `data-testid` attributes                          | set throughout `packages/map`                                                                                                                                                                                                                                                                                                        | Not public: they are for the project's own tests and may change                                                                                                          |
| The `@mapcairn/source` export condition           | the custom condition in each `exports` map                                                                                                                                                                                                                                                                                           | Internal: it points a build at source for this repository. A host must not set it                                                                                        |
| CSS custom property names and `data-*` attributes | generated token names in `packages/theme/src/tokens.css.ts`; `data-part`, `data-state` and similar hooks in `packages/map`                                                                                                                                                                                                           | Custom property names are not public and never breaking. The `data-*` hooks are undecided: treat them as not public                                                      |

The custom property names in `tokens.css` (such as `--rogqo0r`) are hashed at build time and may change in any release, so do not write a stylesheet against them. Theming goes through a generated stylesheet instead. For the same reason, do not write a stylesheet or a test against the `data-*` attributes until they are decided.

## The umbrella package

`@mapcairn/sdk` re-exports the other five packages, so an app installs one name and imports from one place. Its entry points are:

- `.`: every export of `core`, `map`, `react` and `theme` in one flat list.
- `./core`, `./core/contracts`, `./map`, `./react`, `./theme` and `./adapter-maplibre`: each the same as the package of that name.
- `./styles.css`: the three stylesheets, tokens, then the map's, then the engine's.

The adapter is at its subpath only. The root never imports it or `maplibre-gl`, so an app that does not import the subpath has no map engine in its page or its server bundle. `maplibre-gl` (`^6.18.0`) is a required peer of the umbrella, because the subpath needs it. The rules that hold it to the packages:

- Same types, same values: every entry is `export * from` the package and nothing is copied, so a type from the umbrella is the package's own. A new export of a package reaches the umbrella with no edit.
- Tie-breaks: two names are declared by more than one package: `ScaleBar` (the component from `map`; `core`'s measurement type stays at `@mapcairn/sdk/core`) and `ReadingDirection` (from `core`; `react` declares the same type again). The package the root already exports keeps its binding, so changing which package wins is a breaking change for the umbrella.
- No test code at the root: the contract suites are reachable only at `@mapcairn/sdk/core/contracts`, which carries `core`'s optional `vitest` peer.
- One version: the six packages share one version, and the umbrella depends on the other five at that exact version. An app that also lists one of them itself must keep it at the umbrella's version, or it gets two copies and two React contexts, and a provider from one copy is invisible to a component from the other.
- Declaration merging: a host that adds a service of its own augments `@mapcairn/core` (`declare module "@mapcairn/core"`) and lists `@mapcairn/core` as a dependency at the umbrella's version; `Services` read through the umbrella then holds the new service. Augmenting `@mapcairn/sdk` also merges today, but the supported form is to augment `core`.

## What is checked before a release

The tarballs hold only built files (no source, tests or data), every file an `exports` or `types` entry names is there, and each package stays under a size ceiling. The packages publish ES modules only (`"type": "module"`, no CommonJS build), so TypeScript resolves them with `node16`, `nodenext` or `bundler` resolution, not `node10`. The checks run `publint` and `@arethetypeswrong/cli` (`attw`) over the tarballs. `attw` runs with `--profile esm-only`, the one deliberate exception: it leaves out `node10` (which does not read `exports`) and `node16-cjs` (`node16` from a CommonJS file, which cannot `require` an ES module), and no other rule is ignored.

A consumer check then installs the packed packages into fresh apps outside the repository. It renders them in plain Node and on workerd (the Workers runtime), type-checks under the three resolutions above, builds with plain Vite with no plugins, and checks that the umbrella's root reaches no map engine. The steps, the ceilings and the legs that skip are in the [release guide](https://github.com/MapCairn/mapcairn/blob/main/docs/guides/releasing.md) ("What the pack and consumer checks verify").

## The report of the exports

Each entry point has a report generated by API Extractor from its built declarations, at `packages/<name>/api/<entry>.api.md` (the umbrella has one for each of its entry points: `index`, `core`, `coreContracts`, `map`, `adapterMaplibre`, `react`, `theme`). A report lists every exported name with its signature, so a change to the public API shows as a diff in the pull request. The reports are generated, never written by hand.

- `npm run api:check` regenerates the reports and fails when one differs from the committed file, is missing, or has no entry point. The CI step that runs it after the build is the gate, and `packages/core/src/lint/apiReports.test.ts` finds the same failure during `npm test`.
- `npm run api:update` regenerates and writes them. Run it after a change to an exported name, read the diff, and commit it with the change.
- A new line in a diff is a new export: check it was meant to be public. A removed or changed line is a breaking change, unless the member was never part of what a host used.
- A `// Warning: (ae-forgotten-export)` line means an exported declaration names a type the entry point does not export, so a host can use the type but cannot import it by name. Export the type, or stop exposing it. One remains, in `core`: `MessageParams` names the unexported `MessageParamOverrides`.

The `contracts` entry point shares its types with the main entry, so a host that names a type from both gets one declaration. `scripts/shareDeclarations.mjs` does this while the package builds (`ARCHITECTURE.md`, "Building the SDK packages"), and a test in `packages/core/src/lint/sdkDist.test.ts` fails if `contracts.d.ts` declares a name that `index.d.ts` declares.

API Extractor reads the declarations with its own bundled TypeScript, while the build emits them with the repository's TypeScript 7, so a new version of either can change every report. On the dependency pull request that bumps them, run `npm run api:update`, read the diff to see whether the change is real, and commit it. TypeDoc is not used.

### Release tags

Without a tag, every export in a report is public. The tags mean:

- `@public` (the default, so it is not written): covered by the rules on this page.
- `@beta`: exported so a host can try it; named in the release notes. Under `0.x` a minor release may break anything, so `@beta` is advisory until `1.0.0`. A host should not depend on a `@beta` export in a library of its own.
- `@internal`: in the entry point only because a barrel (`export *`) or another SDK package reaches it, and not supported, such as a tuning constant, an engine layer id or a helper that turns the SDK's data into engine input. An export that gains `@internal` is a likely breaking change (a host may use it today); one that is `@internal` from the start never breaks anyone.

Before `0.1.0` a light sweep hid the names that nothing outside their own file used and tagged the clearly internal ones. It was not an export-by-export audit: anything plausibly part of the supported surface stays public and untagged, and the rest of the review happens as the API evolves under the report check. A name that a guide or a host's tests use stays public even when a sibling is tagged `@internal` (`MIN_SUGGEST_LENGTH` is public while `MIN_SEARCH_LENGTH` is `@internal`).

### TSDoc warnings

The report run also prints warnings and never fails on them: `ae-undocumented` (an export with no TSDoc comment), `ae-unresolved-link` (a `{@link}` to something not exported) and `tsdoc-*` (syntax API Extractor cannot read). CI prints a count for each package, and nothing compares the counts with a limit. `npm run api:check -- --verbose` lists every warning.

## Deprecating and removing an export

Decided on 2026-11-24. An export that is going away is deprecated first, so a host sees the notice before it breaks. The rules cover every export that is public under "Release tags": an export tagged `@internal` is outside them.

1. **Tag it.** Add a `@deprecated` TSDoc tag that names the replacement, or says there is none. API Extractor writes the tag into the report (`// @public @deprecated`), so the deprecation shows in the pull request diff. Adding the tag is not a breaking change and `npm run release:plan` does not flag it, so the pull request is not marked with a `!`.
2. **Keep it working.** The export keeps its behaviour until it is removed.
3. **Wait one minor release.** Remove it no sooner than the first minor release after the release that carries the tag: an export tagged in `0.4.0` is removed in `0.5.0` at the earliest.
4. **Mark the removal.** The pull request that removes it has a `!` after the type in its title and ends its description with a `BREAKING CHANGE:` footer that names the export and its replacement.
5. **Put both in the release notes.** The notes of the release that carries the tag list the deprecation, and the notes of the release that removes the export list the removal, under "What to change when you upgrade", with Before and After blocks (`docs/guides/releasing.md`, "Release notes style guide").

Before `1.0.0`, a removal may skip the notice period when the export is documented as experimental or tagged `@beta`, or when keeping it would be unsafe, such as a privacy or security fault. The pull request that removes it says which exception applies and why.

Only the marker on the removal is enforced. The step "Check that a breaking API change is marked in the pull request title", in the `build` job of `.github/workflows/ci.yml` (`scripts/apiBreakingCheck.mjs`), fails when the reports show a likely breaking change and neither the `!` nor the footer is there. No check requires a `@deprecated` tag before a removal or counts the minor releases between them; the reviewer does. The maintainer decided on 2026-11-24 that no such check is added.

## How a change is classed for a release

`npm run release:plan` (`scripts/release/plan.mjs`, described in the [release guide](https://github.com/MapCairn/mapcairn/blob/main/docs/guides/releasing.md)) reads the reports' change since the last tag and the commits' types, and flags each change below as a likely breaking change. It cannot see everything above, so a person reads the go/no-go list in the Release pull request.

- A removed or changed line in a report, and a line that gained an `@internal` tag.
- A required member added to an exported interface or abstract class a host implements (an optional member, or a member of an ordinary class, does not count; for an abstract class only a new abstract member does). Hosts implement the ports, so adding a required member to one breaks them.
- An added or removed member of an exported union, or an added member of an enum. The script reads union members from the report text, names what a union lost, and compares a changed declaration without its layout, so re-wrapping one is not a change. An added member of `MessageKey` is reported but not counted, because adding a message key is not breaking.
- A removed or edited entry in `packages/core/src/urlHash/sharedLinks.test.ts` (links that must keep reading) or `packages/core/src/layers/legacyDefinitions/` (definitions that must keep validating). Adding an entry is not breaking.

The plan names removed and renamed message keys, but a person still writes them into the release notes and lists the new keys so a host can translate them. One kind of change no check sees needs a person: a stored format changed. While the version is `0.x`, a likely breaking change gives a minor bump; from `1.0.0` it gives a major one (the rules are in plan 0014).

## Who decides

The maintainer decides what is public: a new entry point, a change to the tag policy, a custom property or `data-*` name becoming public, and any breaking change. A contributor proposes it in the issue and the pull request, and the pull request description names every breaking change and why. A breaking pull request is marked with a `!` after the type in its title (`refactor!: ...`) or a `BREAKING CHANGE:` footer, because the squash commit drives the version.
