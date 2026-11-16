# 0010: geolint, a GeoJSON linter in its own Apache-2.0 package

Status: in progress. Tracking issue: #259.

## Goal

`@mapcairn/geolint` finds the mistakes people make in GeoJSON that schema validation does not: swapped latitude and longitude, projected coordinates, wrong winding, self-crossing rings, unsplit antimeridian crossings, features in the wrong country. It is a `geolint` command and a pure library (the lint engine) that also runs in a browser or Worker. It works for any country, and a region hint sharpens the heuristics. GeoJSON is the only format now. A `Reader` interface keeps the rules independent of it, so NDJSON or TopoJSON can be added later without touching a rule.

## Ground rules

- The package is Apache-2.0 and the rest of the repository stays AGPL-3.0 (`AGENTS.md`, "About"). It imports nothing from any other package here, enforced by a dependency-cruiser rule that has a fixture proving it fails. Other packages may depend on it in future (Apache-2.0 into AGPL is compatible); none does now.
- Dependencies are few, permissive only (MIT, BSD, ISC, Apache-2.0, Unlicense, CC0, 0BSD) and at least seven days old (`AGENTS.md`, "Dependencies and lockfiles"). A test checks the installed production tree. Each one is justified in the package README.
- The engine has no Node built-in (a second dependency-cruiser rule). Only `src/node` (files, glob, workers) and `src/cli` use Node.
- Tests first, with the same coverage floor as the SDK packages (95 on every measure), and no exclusions. The command's logic is a `main(argv, io)` function the tests call, so spawned processes and worker threads need no coverage.
- It does not publish to npm. The manifest stays `private` until the maintainer releases it (issue #1 covers releases for the SDK packages).
- Adding a dataset needs the maintainer's decision (`AGENTS.md`, "Boundaries"). The country outlines are a build artefact of public-domain Natural Earth data, bundled only in this package, and the maintainer asked for them in the issue.
- The permissive-licence check overlaps #198, which asks for the same for the SDK packages. This plan covers geolint only and leaves #198 open.

## Design

### Layout

```
packages/geolint/
  src/engine/        pure: types, rules, geometry, reader, fixes, sarif, regions
  src/node/          Node only: files, glob, stdin, worker threads
  src/cli/           the command: main(argv, io), a bin shim, a worker
  fixtures/<rule>/   pass.geojson, fail.geojson, fail.expected.json
  data/              the country outline artefact and how it was built
```

The package exports `.` and `./engine` (the pure engine) and `./node` (the Node helpers). `bin` is `geolint`.

### Rules

A rule is a pure function `(feature, context) => Finding[]`, one file in `src/engine/rules`, registered in an index. A finding has a stable rule id, a severity (`error`, `warning`, `info`), a confidence (`high`, `medium`, `low`), a JSON pointer into the document and a message. A rule may also check the document root (for `crs`) and repair a feature (`fix`). Findings are sorted by document position, then rule id, then message, so output does not change between runs or with `--jobs`.

| Id                      | Severity | Confidence                   | Fixable | Needs `--region`  |
| ----------------------- | -------- | ---------------------------- | ------- | ----------------- |
| `structure`             | error    | high                         | no      | no                |
| `winding-order`         | warning  | high                         | yes     | no                |
| `unclosed-ring`         | error    | high                         | yes     | no                |
| `self-intersection`     | error    | high (touching: warning)     | no      | no                |
| `duplicate-vertices`    | warning  | high                         | yes     | no                |
| `coordinate-order`      | warning  | high with a region, else low | no      | no (sharper with) |
| `projected-coords`      | error    | high                         | no      | no (ranks with)   |
| `deprecated-crs-member` | warning  | high                         | no      | no                |
| `precision`             | info     | high                         | yes     | no                |
| `antimeridian`          | warning  | medium                       | no      | no                |
| `empty-geometry`        | warning  | high                         | no      | no                |
| `null-island`           | warning  | medium                       | no      | no                |
| `region-mismatch`       | warning  | medium                       | no      | yes               |

`self-intersection` uses a sweep-line algorithm (no pairwise check) over the edges of each ring, with the orientation predicate from `robust-predicates`, so the answer is exact. `coordinate-order` never guesses from a single point without a region: with `--region` it flags a position that is outside the named country in the order given and inside it swapped; without one it flags only a latitude that is impossible (above 90 in magnitude) or a file whose positions are all consistent with a swap, at low confidence and `info` severity. `projected-coords` suggests candidate systems (UTM zones, Web Mercator, national grids) with its reasoning, and with `--region` ranks them by whether the reprojected result lands in the country.

### Reading and fixing

`Reader.read(chunks)` turns bytes into an async sequence of features and the document facts (root type, members such as `crs`). The GeoJSON reader scans bytes for element boundaries and calls `JSON.parse` on one feature at a time, so a 500 MB FeatureCollection costs memory in proportion to its largest feature. Invalid or truncated input ends the sequence with an error (exit code 3) after the valid features have been checked.

`--fix` streams the input to `<name>.fixed.geojson` and never changes the original. It applies the fixes of the fixable rules in a fixed order (unclosed-ring, duplicate-vertices, precision, winding-order) until nothing changes, because one fix can create work for another (rounding can make two vertices equal). Findings that cannot be fixed are still reported.

### Output and the command

`--format text|json|sarif`. SARIF 2.1.0 carries rule metadata, JSON-pointer logical locations and the confidence as a property. `--rules` lists the rules. `--ignore <id>` is repeatable. `--jobs <n>` lints files in worker threads; results are collected in argument order. Exit codes: 0 clean, 1 warnings only, 2 errors, 3 unreadable or invalid JSON.

### Region data

Natural Earth 1:110m admin-0 country polygons are converted by a script into one compact JSON file of quantised rings, keyed by ISO 3166-1 alpha-2 code, with a bounding-box index (`flatbush`). It is loaded with a dynamic import only when a region rule needs it. The 1:110m set leaves out some very small countries (such as Monaco and the Vatican), so the 1:50m outlines of only the countries missing from it are added. The coastline is coarse at 1:110m, so a position within a stated tolerance of a country counts as inside it. The tolerance, and what it costs in missed detections, is in the README's "Failure modes and limitations". The outlines also lack many small islands, so `region-mismatch` reports a feature only when at least half of its positions are inside another country's outline (`CountryIndex.locate`); open sea and unmapped islands stay quiet, which trades missed detections for fewer false alarms.

### Options rejected

- A streaming JSON dependency: a small scanner over bytes is faster, has no dependency to audit, and lets the same code preserve the non-feature members when writing fixed output.
- `commander` or another argument parser: `node:util` `parseArgs` is enough.
- Depending on `@turf/*` or any MapCairn package: they are AGPL or heavier than needed, and independence is the point.

## Tests

- Each rule has a passing and a failing fixture, run by one fixture harness through the whole engine (`fixtures/<rule>/`), plus unit tests for edge cases: nested `GeometryCollection`s, MultiPolygons with holes, 3D coordinates, null geometry, a point exactly on a ring vertex, polygons touching at one point, Fiji and Russia across the antimeridian, France with its overseas territories, and Vatican and Monaco.
- Property tests (`fast-check`): the linter never throws on arbitrary JSON; fixing then linting again gives no finding for the fixable rules; the sweep agrees with a brute-force oracle on small inputs; output is identical for any chunking of the input.
- The parser is fuzzed with truncated and malformed input.
- For the heuristic rules, a reviewer tries to produce false positives and false negatives with realistic data, and the cases are kept as tests.
- A pack-and-install check: `npm pack`, install the tarball in a temporary directory outside the repository, and run the command there. CI runs it as its own job.

## Order of work

One pull request, with one commit for each step.

1. Licence work, the package skeleton, `LICENSE` and `NOTICE`, the header check, the independence rules and the dependency-licence check.
2. This plan, the types, the reader, and rules 1 to 5.
3. Fix mode and SARIF output.
4. Region data and rules 6, 7 and 12, with the remaining rules (8 to 11).
5. Benchmarks, performance work, the README and the roadmap entry.

## Documents to update

`README.md` (licence section in step 1, package table in step 2), `CONTRIBUTING.md`, `GOVERNANCE.md`, `AGENTS.md`, `CLA.md` and `ATTRIBUTIONS.md` (step 1; Natural Earth and each dependency as it arrives), `ARCHITECTURE.md` (the package list, step 2), `ROADMAP.md` (step 5), the package `README.md` (step 5).

## Risks

- Heuristic rules produce false positives. Mitigation: confidence levels, a region hint, `info` severity for guesses, and an honest limitations section.
- 1:110m outlines are coarse near coasts and miss small countries. Mitigation: the tolerance, the 1:50m supplement, and tests with tiny and island countries.
- Memory on very large inputs. Mitigation: streaming by feature; a single huge geometry still has to fit in memory, which the README says.
- Licence mix inside one repository. Mitigation: the header check, the dependency-licence test, a scoped `CLA.md` section, and a human look before any release.

## Decided and open

Decided on 2026-11-16: one pull request for the whole package; no npm release in this work; the package is labelled `enhancement` and `plan`, because the repository has no licence label; the first release is an MVP for speed, with the sweep-line speed-up and the shared ring view left to [#261](https://github.com/MapCairn/mapcairn/issues/261); the pull request waits for a benchmark taken on a quiet machine before it merges; `--fix` with standard input is refused, `-` is not a file to write beside; findings of `info` severity do not change the exit code; a request the command cannot understand exits 3.

Open: whether a later release should make `@mapcairn/geolint` public before the SDK packages (a release decision for the maintainer, with the licence check by a person first).
