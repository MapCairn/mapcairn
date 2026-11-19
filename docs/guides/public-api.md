# The public API

What a host can rely on from the four SDK packages (`@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme`), how a change to it is found in review, and how a change is classed for a release. The packages are private at version `0.0.0` until the first release (`docs/plans/0014-sdk-release.md`); this guide is the rule the release scripts and reviewers use from then on.

## What counts as public

The public API is more than the TypeScript exports. A change to any item below is a change to the public API, and a change that makes it stop accepting or producing something it did before is a breaking change.

| Surface                                                      | Where it lives                                                                                                                                                                   | How a change is found                                                                     | Breaking when                                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Exports of each entry point                                  | `core` (`.` and `./contracts`), `map`, `react`, `theme`, and the two stylesheets `theme/tokens.css` and `map/styles.css` by name                                                 | The API report diff (below)                                                               | An export, a member or a signature is removed or narrowed, or a parameter becomes required           |
| New member of an exported union or enum-like type            | for example a new `kind` of layer definition, a new error code                                                                                                                   | The API report diff                                                                       | Always likely breaking: a host's exhaustive `switch` stops compiling                                 |
| The shared-link format                                       | `parseUrlHash` and `serialiseUrlHash` in `packages/core/src/urlHash/urlHash.ts`, and the `shapes` encoding (`encodeShapes`, `decodeShapes` in `packages/core/src/draw/share.ts`) | `packages/core/src/urlHash/sharedLinks.test.ts`, a list of links that must keep reading   | A link a person already shared reads differently or stops opening, even when no type changes         |
| The layer-definition validator                               | `validateLayerDefinition` in `packages/core/src/layers/validate.ts`                                                                                                              | `packages/core/src/layers/legacyDefinitions/`, definitions that must keep validating      | It accepts less than before, so a definition a host wrote is now rejected                            |
| Formats a host writes or keeps                               | the JSON of a layer definition, the keys and values the SDK stores through `SettingsStore` (for example `mapcairn:theme`), and the shared-shapes text                            | The tests above for definitions and links; review for the rest                            | A value a host or a person already stored is no longer read, or reads as something else              |
| Message keys                                                 | the catalogue keys the SDK looks up, and their English source text                                                                                                               | the release notes (the host's `npm run catalogue:check` shows a host which keys it lacks) | Removing or renaming a key. Adding one is not breaking: a catalogue without it falls back to English |
| CSS custom property names and `data-*` attributes (see next) | generated token names in `packages/theme/src/tokens.css.ts`; `data-part`, `data-state` and similar hooks in `packages/map`                                                       | Not checked                                                                               | Not public until the maintainer decides                                                              |

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

- `npm run api:check` builds the SDK if it is stale, regenerates the reports and fails when one differs from the committed file, is missing, or has no entry point. CI runs it after the build.
- `npm run api:update` regenerates and writes them. Run it after a change to an exported name, read the diff, and commit it with the change.
- Read the diff of a report as a reviewer would. A new line is a new export; check it was meant to be public. A removed or changed line is a breaking change, unless the member was never part of what a host used.
- A `// Warning: (ae-forgotten-export)` line means an exported declaration names a type the entry point does not export. A host can use the type but cannot import it by name. Export the type, or stop exposing it.

### Release tags

Every export in a report is public unless its TSDoc says otherwise. Use at most these tags:

- `@public` (the default, so it is not written): covered by the rules on this page.
- `@beta`: exported so a host can try it. It may change in a minor release and is named in the release notes. Do not depend on a `@beta` export in a library of your own.
- `@internal`: exported only because another SDK package or the reference host needs it. It is not supported, and a change to it is never breaking. A name that is only used inside one package is not exported at all.

Nothing in the packages carries a tag today, so every export in the first reports is public by default. A new tag appears in the report diff, which is how a reviewer sees that an export was narrowed.

### TSDoc warnings

The same run prints warnings, and never fails on them:

- `ae-undocumented`: an export, or a member of an exported type, with no TSDoc comment.
- `ae-unresolved-link`: a `{@link}` that names something that is not exported.
- `tsdoc-*`: TSDoc syntax that API Extractor cannot read, such as an unescaped `}` or a `@param` with no hyphen.

CI prints each warning in a group and a count for each package as one annotation. The counts are not a baseline and nothing compares them with a limit; the rule in `AGENTS.md` is that every export is documented, and a pull request should not add a warning. `npm run api:check -- --verbose` lists every warning.

## How a change is classed for a release

The release script (plan 0014, step 8, not built yet) is to read the reports' change since the last tag and the commits' types, and to flag each change below as a likely breaking change. It cannot see everything above, so a person reads the go/no-go list in the Release pull request.

- a removed or changed line in a report, other than a line that only gained a `@beta` or `@internal` tag;
- an added member of an exported union (a line added inside a union type in a report; step 8 decides how it reads that);
- a change under `packages/core/src/urlHash/sharedLinks.test.ts` or `packages/core/src/layers/legacyDefinitions/` that removes or edits an entry. Adding an entry is not breaking.

Two kinds of change need a person, because no check sees them: a message key removed or renamed (the release notes list new keys so a host can translate them), and a stored format changed. While the version is `0.x`, a likely breaking change gives a minor bump; from `1.0.0` it gives a major one (the rules are in plan 0014).

## Who decides

The maintainer decides what is public: a new entry point, a change to the tag policy, a custom property or `data-*` name becoming public, and any breaking change. A contributor proposes it in the issue and the pull request; the pull request description names every breaking change and why. A reviewer who sees a change on this page without that note asks for it.
