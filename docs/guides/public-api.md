# The public API

What a host can rely on from the four SDK packages (`@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme`), how a change to it is found in review, and how a change is classed for a release. The packages are private at version `0.0.0` until the first release (`docs/plans/0014-sdk-release.md`); this guide is the rule the release scripts and reviewers use from then on.

## What counts as public

The public API is more than the TypeScript exports. A change to any item below is a change to the public API, and a change that makes it stop accepting or producing something it did before is a breaking change.

| Surface                                                       | Where it lives                                                                                                                                                                                                                                               | How a change is found                                                                     | Breaking when                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Exports of each entry point                                   | `core` (`.` and `./contracts`), `map`, `react`, `theme`, and the two stylesheets `theme/tokens.css` and `map/styles.css` by name                                                                                                                             | The API report diff (below)                                                               | An export, a member or a signature is removed or narrowed, or a parameter becomes required           |
| New member of an exported union or enum-like type             | for example a new `kind` of layer definition, a new error code                                                                                                                                                                                               | The API report diff                                                                       | Always likely breaking: a host's exhaustive `switch` stops compiling                                 |
| The shared-link format                                        | `parseUrlHash` and `serialiseUrlHash` in `packages/core/src/urlHash/urlHash.ts`, and the `shapes` encoding (`encodeShapes`, `decodeShapes` in `packages/core/src/draw/share.ts`)                                                                             | `packages/core/src/urlHash/sharedLinks.test.ts`, a list of links that must keep reading   | A link a person already shared reads differently or stops opening, even when no type changes         |
| The layer-definition validator                                | `validateLayerDefinition` in `packages/core/src/layers/validate.ts`                                                                                                                                                                                          | `packages/core/src/layers/legacyDefinitions/`, definitions that must keep validating      | It accepts less than before, so a definition a host wrote is now rejected                            |
| Formats a host writes or keeps                                | the JSON of a layer definition, the keys and values the SDK stores through `SettingsStore` (for example `mapcairn:theme`), and the shared-shapes text                                                                                                        | The tests above for definitions and links; review for the rest                            | A value a host or a person already stored is no longer read, or reads as something else              |
| Message keys                                                  | the catalogue keys the SDK looks up, and their English source text                                                                                                                                                                                           | the release notes (the host's `npm run catalogue:check` shows a host which keys it lacks) | Removing or renaming a key. Adding one is not breaking: a catalogue without it falls back to English |
| Persisted settings keys                                       | the keys the SDK writes through `SettingsStore` and `localStorage` (`mapcairn:theme`, `mapcairn:projection`, `mapcairn:language`, and the unit settings the `AREA_UNIT_KEY` and `DISTANCE_UNIT_KEY` tables in `packages/core/src/units/measurement.ts` name) | Review                                                                                    | A key is renamed or its stored value is read differently, so a person's saved choice is lost         |
| Only the `exports` entry points                               | `package.json` `exports` of each package; a deep path into `dist` or `src` is not public                                                                                                                                                                     | `packages/core/src/lint/sdkDist.test.ts` checks every export target exists                | An entry point is removed or renamed. Reaching a file by a deep path was never supported             |
| `peerDependencies` ranges                                     | `react` and `react-dom` (`^19.0.0`), and the optional peers of `core`                                                                                                                                                                                        | Review                                                                                    | Undecided: whether widening or narrowing a range is breaking is the maintainer's call                |
| `data-testid` attributes                                      | 279 uses in `packages/map`; a host's browser tests can target them                                                                                                                                                                                           | Not checked                                                                               | Undecided, with the `data-*` hooks below                                                             |
| The `@mapcairn/source` export condition                       | the custom condition in each `exports` map                                                                                                                                                                                                                   | Not checked                                                                               | Internal: it points a build at source for this repository. A host must not set it                    |
| Behaviour a Content Security Policy depends on                | the SDK renders no inline style attributes and no inline script (`docs/guides/content-security-policy.md`)                                                                                                                                                   | The render tests described in the README                                                  | Undecided: an inline style or script would force a host to loosen its policy                         |
| CSS custom property names and `data-*` attributes (see below) | generated token names in `packages/theme/src/tokens.css.ts`; `data-part`, `data-state` and similar hooks in `packages/map`                                                                                                                                   | Not checked                                                                               | Not public until the maintainer decides                                                              |

### Not decided: custom properties and `data-*` hooks

Whether the generated custom property names (the token names in `tokens.css`, such as `--rogqo0r`) and the `data-*` attributes the components set are public API is open. It is the maintainer's decision, listed among the open release decisions in #423; plan 0014 and `DESIGN.md` say the same.

Until it is made, treat both as **not public**: a host should not write a stylesheet or a test against them, and a change to them is not a breaking change. If the custom property names become public they need stable names (not build hashes) and a check that they do not change between builds; that check does not exist yet.

## The report of the exports

Each entry point has a report, generated by API Extractor from its built declarations, at `packages/<name>/api/<entry>.api.md`:

- `packages/core/api/index.api.md` and `packages/core/api/contracts.api.md`
- `packages/map/api/index.api.md`
- `packages/react/api/index.api.md`
- `packages/theme/api/index.api.md`

The report lists every exported name with its signature, so a change to the public API shows as a diff in the pull request. The reports are generated, never written by hand.

- `npm run api:check` builds the SDK if it is stale, regenerates the reports and fails when one differs from the committed file, is missing, or has no entry point, printing the changed lines (at most 40). The CI step that runs it after the build is the gate. `packages/core/src/lint/apiReports.test.ts` also compares the reports during `npm test`, so a local test run finds the same failure, but it is not the gate and a skipped test run does not skip the check.
- `npm run api:update` regenerates and writes them. Run it after a change to an exported name, read the diff, and commit it with the change.
- Read the diff of a report as a reviewer would. A new line is a new export; check it was meant to be public. A removed or changed line is a breaking change, unless the member was never part of what a host used.
- A `// Warning: (ae-forgotten-export)` line means an exported declaration names a type the entry point does not export. A host can use the type but cannot import it by name. Export the type, or stop exposing it.

### Release tags

The plan sets no tag policy, so this is a recommendation for the maintainer to adopt or change, not a decision. Without a tag, every export in a report is public. The tags would mean:

- `@public` (the default, so it is not written): covered by the rules on this page.
- `@beta`: exported so a host can try it; named in the release notes. Under `0.x` a minor release may break anything, so `@beta` is advisory until `1.0.0`. A host should not depend on a `@beta` export in a library of its own.
- `@internal`: exported only because another SDK package or the reference host needs it, and not supported. An export that gains `@internal` is a likely breaking change (a host may use it today); one that is `@internal` from the start never breaks anyone. A name used only inside one package is not exported at all.

Nothing in the packages carries a tag today, so every export in the first reports is public by default. Whether to sweep the existing exports for `@internal` before `0.1.0` is the maintainer's call. A new tag appears in the report diff, which is how a reviewer sees that an export was narrowed.

### What produces the reports

The reports come from API Extractor, which reads the declarations with its own bundled TypeScript, while the build emits them with the repository's TypeScript 7. A new version of either can change every report, and the weekly dependency pull request that bumps them fails `api:check`. On that branch run `npm run api:update`, read the diff to see whether the change is real, and commit it. `.github/dependabot.yml` groups the two apart from the other npm updates, so this happens in one small pull request.

### TSDoc warnings

The same run prints warnings, and never fails on them:

- `ae-undocumented`: an export, or a member of an exported type, with no TSDoc comment.
- `ae-unresolved-link`: a `{@link}` that names something that is not exported.
- `tsdoc-*`: TSDoc syntax that API Extractor cannot read, such as an unescaped `}` or a `@param` with no hyphen.

CI prints each warning in a group and a count for each package as one annotation. The counts are not a baseline and nothing compares them with a limit. Whether to ratchet them is the maintainer's decision. `npm run api:check -- --verbose` lists every warning.

## How a change is classed for a release

The release script (plan 0014, step 8, not built yet) is to read the reports' change since the last tag and the commits' types, and to flag each change below as a likely breaking change. It cannot see everything above, so a person reads the go/no-go list in the Release pull request.

- a removed or changed line in a report, and a line that gained an `@internal` tag;
- an added member of an exported union. API Extractor prints a short union on one line, so a new member shows as a changed line, and a long one on several lines. For step 8, `docModel` (the `.api.json` output, not enabled now) is the machine-readable form to read members from;
- a change under `packages/core/src/urlHash/sharedLinks.test.ts` or `packages/core/src/layers/legacyDefinitions/` that removes or edits an entry. Adding an entry is not breaking.

Two kinds of change need a person, because no check sees them: a message key removed or renamed (the release notes list new keys so a host can translate them), and a stored format changed. While the version is `0.x`, a likely breaking change gives a minor bump; from `1.0.0` it gives a major one (the rules are in plan 0014).

## Who decides

The maintainer decides what is public: a new entry point, a change to the tag policy, a custom property or `data-*` name becoming public, and any breaking change. A contributor proposes it in the issue and the pull request; the pull request description names every breaking change and why. A reviewer who sees a change on this page without that note asks for it.
