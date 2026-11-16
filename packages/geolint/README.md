# @mapcairn/geolint

A linter for GeoJSON. It finds the mistakes people make that schema validation does not: latitude and longitude swapped, projected coordinates left in a file that claims to be WGS 84, rings wound the wrong way, polygons that cross themselves, shapes that cross the antimeridian without being split, features in the wrong country. It works for any country, and a region hint sharpens the guesses.

It is a `geolint` command and a library. The library's lint engine is pure (no Node built-in), so it runs in a browser or a Worker as well as in Node.

This package is licensed under [Apache-2.0](LICENSE), unlike the rest of the MapCairn repository, which is AGPL-3.0. It is meant to be used freely inside other toolchains. It imports nothing from the other packages in the repository. It is not published to npm yet.

## Install and use

Until it is published, build it from the repository:

```bash
npm install
npm run build -w @mapcairn/geolint
node packages/geolint/dist/cli/bin.js data.geojson
```

Once published, `npx @mapcairn/geolint data.geojson` will do. It needs Node 24 or newer.

```bash
geolint <file|glob|-> [...]
geolint data.geojson
geolint "data/**/*.geojson" --format sarif > geolint.sarif
cat data.geojson | geolint -
geolint --region ZA --region LS districts.geojson
geolint --fix data.geojson            # writes data.fixed.geojson, never changes data.geojson
geolint --rules
```

| Option               | What it does                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `--format <f>`       | `text` (the default), `json` or `sarif`                                                   |
| `--region <code>`    | An ISO 3166-1 alpha-2 country the data should be in, such as `ZA`. Repeat it for several  |
| `--ignore <rule-id>` | Leave a rule out. Repeat it for several                                                   |
| `--fix`              | Write `<name>.fixed.geojson` with the safe repairs applied. The original is never changed |
| `--jobs <n>`         | Lint files in `n` worker threads. The output is the same for any `n`                      |
| `--rules`            | List the rules and exit                                                                   |

Exit codes: `0` clean, `1` warnings only, `2` errors, `3` an input that could not be read or is not valid JSON, or a request the command could not understand (an unknown option, rule or region), or an unexpected failure (one line on standard error: `geolint: unexpected error: ...`). Findings of `info` severity never change the code.

A finding names the file, the severity, the rule, how sure the rule is (its confidence), a JSON pointer to the place, and a sentence:

```
parcels.geojson: error self-intersection (high confidence) /features/12/geometry/coordinates/0 Ring crosses itself at 18.4, -33.9.
```

The pointer, not a line number, says where: the linter streams the file and never builds a line table. A JSON pointer works with `jq` (`jq '.features[12]' parcels.geojson`).

### Fixing

`--fix` repairs what has one right answer: it closes an open ring, removes repeated consecutive vertices, rounds coordinates to seven decimals and turns rings the right way round. It writes `<name>.fixed.geojson` beside the input and then lints that copy, so what you see is what is left to repair by hand. It applies the fixes in a fixed order until nothing changes, because one fix can create work for another. It never fixes a guess (a swap, a projection, a country mismatch). If the input is not valid JSON nothing is written.

The copy is re-serialised: members other than `features` keep their order and values, a feature that needed nothing keeps its original text, and whitespace between features is not kept.

### Output formats

`--format json` writes `{ "version": 1, "files": [...], "summary": {...} }` with every finding. `--format sarif` writes SARIF 2.1.0 for code-scanning tools: the rules are the tool's rule metadata, the JSON pointer is a logical location (findings have no line numbers, so each result's region is line 1 and the logical location is the real place), and the confidence is a property of the result. A Windows drive path becomes a `file:///C:/...` URI. Severity `info` is the SARIF level `note`.

## The library

```ts
import { lintText, loadCountries } from "@mapcairn/geolint";

const report = await lintText(geojsonString, { regions: ["ZA"], countries: loadCountries });
for (const finding of report.findings) {
  console.log(finding.ruleId, finding.path, finding.message);
}
```

`lintBytes` takes an async iterable of `Uint8Array` and streams it, so it works on a `fetch` body or a file. `formatText`, `formatJson` and `formatSarif` turn reports into output, `fixBytes` streams a fixed copy of a document, and `rules` lists the rules. The engine is also exported as `@mapcairn/geolint/engine`. The Node helpers (reading files, expanding globs, linting a file, writing a fixed copy beside a file, worker threads) are in `@mapcairn/geolint/node`; the command itself is the `geolint` bin.

A rule is a pure function `(feature, context) => Finding[]`, one file in `src/engine/rules` and one line in the registry. A `Reader` turns bytes into features and the document's own members, so another format (NDJSON, TopoJSON) can be added without touching a rule; only GeoJSON is implemented.

## Rules

| Rule                    | Severity                         | Confidence                             | Fix | What it finds                                                                                                                                      |
| ----------------------- | -------------------------------- | -------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `structure`             | error                            | high                                   | no  | A feature, geometry, position or bounding box that is not shaped as RFC 7946 says                                                                  |
| `winding-order`         | warning                          | high                                   | yes | An exterior ring that is not counter-clockwise, or a hole that is not clockwise                                                                    |
| `unclosed-ring`         | error                            | high                                   | yes | A polygon ring whose first and last positions differ                                                                                               |
| `self-intersection`     | error (a touch is a warning)     | high                                   | no  | A ring that crosses itself, touches itself or overlaps itself along a segment, or two rings of one polygon that cross; the finding gives the point |
| `duplicate-vertices`    | warning                          | high                                   | yes | Consecutive identical positions                                                                                                                    |
| `coordinate-order`      | warning with a region; else info | high or medium with a region; else low | no  | Latitude and longitude swapped                                                                                                                     |
| `projected-coords`      | error                            | high                                   | no  | Numbers that cannot be longitude and latitude, with the projected systems they probably come from                                                  |
| `deprecated-crs-member` | warning (info for WGS 84)        | high                                   | no  | A `crs` member, which RFC 7946 removed                                                                                                             |
| `precision`             | info                             | high                                   | yes | More than seven decimal places (about a centimetre)                                                                                                |
| `antimeridian`          | warning                          | medium                                 | no  | A shape that crosses 180 degrees of longitude unsplit, or a longitude beyond 180                                                                   |
| `empty-geometry`        | warning (info for null)          | high (medium for null)                 | no  | A geometry with no coordinates, or a feature with a null geometry                                                                                  |
| `null-island`           | warning (info off a point)       | medium (low off a point)               | no  | A position at exactly 0, 0, often a default for a missing location                                                                                 |
| `region-mismatch`       | warning                          | medium                                 | no  | With `--region`: a feature that lies in a different country                                                                                        |

Run `geolint --rules` for the same list from the installed version. A finding's confidence says how sure the rule is that it is a mistake and not unusual valid data; the rule's severity says how serious the mistake is if it is one.

### How the guesses work

- **`coordinate-order` with `--region`** looks at up to 64 evenly spaced positions of each geometry. A position is suspect when, read as longitude and latitude, it is outside every named country and, with its two numbers swapped, it is inside one. A geometry whose sampled positions are all suspect is reported with high confidence; more than half, with medium.
- **`coordinate-order` without a region** reports only a position whose second number cannot be a latitude (above 90 in magnitude, up to 180) while the first could be one. It is info severity and low confidence. It never guesses from a position where both orders are valid.
- **`projected-coords`** tries Web Mercator, every UTM zone on WGS 84, the British National Grid, the Irish Transverse Mercator and Lambert-93 on the numbers and checks that the result lands in the system's own area of use. Without `--region` it cannot choose between systems that fit and lists them in a fixed order (it names UTM once, "zone not known"). With `--region` it ranks the systems, UTM zones included, by how many positions land inside the country, and names the best three. Adding a national grid is adding an entry to `src/engine/crs/systems.ts`.
- **`region-mismatch`** reports a feature only when at least half of its sampled positions are inside the outline of some other country. See the limitations below for why that is.

## Failure modes and limitations

Read this before you trust the heuristic rules.

- **Without `--region`, `coordinate-order` can see a swap only where one order is impossible.** Data written as latitude, longitude in the Asia-Pacific and the Americas (Perth, Sydney, Auckland, Tokyo, Anchorage, Honolulu) has a second number above 90, and is caught. A swap in Europe or Africa (Cape Town, Johannesburg, Nairobi, London, Paris) leaves two valid positions, and the rule is silent. It will not guess from one position, and it decides for a geometry only when every sampled position fits. It is info severity and low confidence for that reason.
- **Without `--region`, `projected-coords` cannot say which projected system the data uses.** Many sets of numbers fit several systems. It lists the ones that fit in a fixed order and says it cannot choose; it never states a zone. A system it does not know (state plane, a South African Lo grid, most national grids) is not offered, and the message says so when nothing fits.
- **A swap is recognised with a region only when the swapped position is inside that region.** A swapped Marion Island is not recognised because the outlines lack the island. A swapped Nairobi checked against Tanzania is not recognised, because the swap lands in Kenya. A position in the open sea, or in a different country, whose swap happens to land inside the region is reported as swapped. A position that is inside the region in both orders (60 N, 60 E in Russia) is never reported.
- **The country outlines are coarse.** They are Natural Earth 1:110m (public domain), with 1:50m outlines added only for countries the 1:110m set leaves out (Monaco, the Vatican, San Marino, Liechtenstein, Singapore and about sixty more). At 1:110m a real coastline can be tens of kilometres from the drawn one, so a position within 0.25 degrees (about 28 km) of an outline counts as inside it (0.05 degrees for the 1:50m countries). The same allowance means a position within about 25 km of a land border counts as inside the neighbour too: San Diego for Mexico, Monaco for France or Italy. The allowance is in plain degrees and is not scaled for latitude.
- **Islands and overseas territories that the outlines leave out look like open sea.** The Canaries, the Balearics, Réunion, Martinique, Mayotte, Marion Island, the Chatham Islands, Stewart Island, Key West, Attu, the Azores and others are missing. `region-mismatch` stays quiet for them, because it reports a feature only when it can place the positions in another country; the cost is that it also stays quiet for a feature that really is in the open sea, and for an island the outlines lack, whichever country it belongs to.
- **`region-mismatch` tests at most 1,000 evenly spaced positions of a geometry.** A line or polygon that crosses a country without a vertex inside it can be reported (a two-point line from Windhoek to Maputo checked against South Africa). A polygon whose bounding box covers the whole country is exempt, except for a country that crosses the antimeridian (Fiji, Russia, the United States), whose bounding box spans every longitude.
- **A feature that is only partly swapped is reported only if more than half the sampled positions are swapped.**
- **`antimeridian` can be wrong near the poles and for shapes that really span more than 180 degrees of longitude.** It ignores a step along a pole and a step of exactly 360 degrees at one latitude. A polygon that really encloses a pole by running across all longitudes in one ring is treated as a polygon crossing the antimeridian only if its vertices jump by more than 180 degrees between neighbours at lower latitudes.
- **`self-intersection` is exact for any longitude and latitude, not for any finite number.** The exact arithmetic it relies on assumes values between about 1e-150 and 1e150. It reports a ring touching itself as a warning, and does not report a hole that touches the exterior at a point (that is valid), or two polygons of a MultiPolygon that touch.
- **Some invalid geometry is not reported.** A hole that lies wholly outside its exterior is not reported. Neither are overlapping members of a MultiPolygon, or members that share a whole segment.
- **An open ring reports fewer crossings than its closed form,** because the closing edge is not part of it. `--fix` closes the ring, so it can reveal more crossings.
- **A region names one country, and the outlines give some territories a code of their own.** With `--region FR`, Papeete and the other French territories that have their own country code in the outlines (French Polynesia, Guadeloupe) are reported as a region mismatch, and so are Puerto Rico's positions with `--region US`. Istanbul falls in a gap in Turkey's 1:110m outline, so `region-mismatch` misses it.
- **With a region, `projected-coords` ranks UTM zones by how many positions land in the country,** and for a large country several zones tie. The right zone is among the top three only most of the time: in a test of 44 places it was first for 30 and in the top three for 41.
- **`antimeridian` does not flag a step of exactly 180 degrees in longitude,** and flags one of 180.0000001.
- **A fourth number in a position is a `structure` warning,** and `--fix` leaves it unrounded.
- **A repeated `features` member is a `structure` error, and only the first array is checked.** `--fix` fixes the first and copies a later one through unchanged.
- **A syntax error reports the input error alone.** The checks on the document as a whole are not run when the input could not be read to its end; the features read before the error are still checked.
- **`self-intersection` slows down when very many edges meet at one vertex.** A ring that returns to the same hub vertex again and again (a thousand spokes) takes seconds, and tens of thousands of spokes take minutes, because the exact handling of many contacts at one point is not linear. Ordinary data is not affected. The sweep's speed is tracked in [#261](https://github.com/MapCairn/mapcairn/issues/261).
- **Some invalid polygons are not reported:** a hole identical to its exterior, a hole that encloses its exterior, one hole inside another, a hole that shares a segment with the exterior, and (as above) a hole wholly outside it.
- **`--fix` does not round a feature that rounding would damage.** Rounding to seven decimals can make a feature smaller than a metre cross itself or collapse onto repeated vertices. When that leaves more problems than the other fixes do alone, the feature is repaired without rounding, and its `precision` finding stays. `winding-order` is not judged, and not fixed, for a ring with a step of more than 180 degrees of longitude (`antimeridian` reports it), because the planar test cannot tell which way such a ring goes round the globe.
- **`--fix` re-serialises a feature that it changes through `JSON.parse` and `JSON.stringify`.** An integer larger than 2^53 (a 64-bit identifier written as a number) loses precision, a number too large for a double becomes `null`, and a repeated key keeps only its last value, but only in a feature that needed a repair. Identifiers written as strings are safe. A feature that needed nothing keeps its original text.
- **The Natural Earth Sudan outline crosses itself.** It is a known flaw in the source data. It does not harm the lookups (they use an even-odd rule), but linting that outline as a feature reports it.
- **No line numbers.** Findings carry JSON pointers. A malformed file reports a byte offset.
- **Memory follows the largest single feature and the findings,** not the file: features are read one at a time, but findings are kept until the end so that they can be sorted. A single polygon of a million vertices has to be parsed whole. A file with millions of findings holds them all.
- **`--fix` writes a re-serialised copy** (see above), and fixes only the rules marked fixable.
- **One format only.** GeoJSON is the only reader. A feature collection must be in one file; there is no NDJSON reader yet.

## Performance

The benchmark (`npm run bench`, after `npm run build`) generates a 1 MB, a 50 MB and a 500 MB FeatureCollection of small polygons (24 vertices each, six decimal places) and one polygon of 1,000,000 vertices, lints each in a fresh process with every rule on, and prints the time, the speed and the peak resident memory. `npm run bench:rules` times each rule on its own on a 1 MB input, so a slow rule shows up by name.

Targets, set before any profiling: a FeatureCollection lints at 15 MB/s or better on one thread with peak memory under 400 MB whatever its size, and a polygon of 1,000,000 vertices lints in under 10 seconds with under 1 GB.

Results, with every rule on, one thread, on a developer laptop that was in normal use (other programs running), so treat the times as a floor and the memory figures as the steadier ones:

Machine: Intel Core i7-10850H, 12 logical processors, 32 GB memory, Windows 11, Node 24.22.

| Input                           | Size    | Time    | Speed    | Peak memory | Features |
| ------------------------------- | ------- | ------- | -------- | ----------- | -------- |
| FeatureCollection, 1 MB         | 1.0 MB  | 0.47 s  | 2.1 MB/s | 94 MB       | 1,456    |
| FeatureCollection, 50 MB        | 50.0 MB | 12.69 s | 3.9 MB/s | 246 MB      | 72,403   |
| One polygon, 1,000,000 vertices | 23.5 MB | 5.25 s  | 4.5 MB/s | 731 MB      | 1        |

The 500 MB FeatureCollection has not been run yet. Memory grew from 94 MB at 1 MB to 246 MB at 50 MB, which is mostly the runtime and the loaded rules rather than the input (the reader holds one feature at a time), so a 500 MB file is expected to stay in the same range; that is an expectation, not a measurement.

The speed target is not met, and the first release is an MVP for speed. The polygon target is met. Profiling showed that `self-intersection` (the exact sweep line) is about 80 percent of the CPU time on a collection of small polygons, and the rest is reading each feature and the rules that walk every position. Two cheap fixes were made (JSON pointers are built only for a position that produces a finding, and a cheap exact test decides whether a number has more than seven decimals), which roughly halved the time. The sweep and the shared ring reading are tracked in [#261](https://github.com/MapCairn/mapcairn/issues/261). To measure again, run `npm run build -w @mapcairn/geolint` and then `npm run bench -w @mapcairn/geolint`, on a quiet machine, with `-- --skip-large` to leave out the 500 MB file.

## What it adds

These are the tools people reach for first. The comparison is from their own documentation, checked on 2026-11-16.

| Tool                                                                                            | What it does                                                                                                                                                                         | What geolint adds                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [geojsonhint](https://github.com/mapbox/geojsonhint) (`@mapbox/geojsonhint`, ISC, archived)     | Checks a document against RFC 7946, with line numbers for each problem, and options to warn about precision and the right-hand rule                                                  | Checks for mistakes that are valid GeoJSON but wrong data (swapped order, projected numbers, crossing rings, the antimeridian, the wrong country), repairs some, streams large files |
| [check-geojson](https://github.com/placemark/check-geojson) (`@placemarkio/check-geojson`, MIT) | A parser and validator that reports errors with character-level positions. It only reports errors: no warnings for precision or the right-hand rule, and it ignores the `crs` member | The same kind of structure check, plus warnings and information, the heuristic rules, SARIF, `--fix`, a command with exit codes and a library that runs in a Worker                  |
| `ogrinfo` (GDAL)                                                                                | A general tool that prints a vector file's layers, schema, extent and features, and can run SQL on them. It is not a GeoJSON linter and has no rule set for GeoJSON mistakes         | A rule set for GeoJSON mistakes with stable ids and severities, with no GDAL install                                                                                                 |

What geolint gives up: line numbers (it reports JSON pointers), the character-level parse errors check-geojson gives for invalid JSON (it reports a byte offset), and GDAL's reach across formats.

## Dependencies

There are two direct runtime dependencies (three packages with `flatqueue`, which `flatbush` brings), all permissive, and all installed from the registry rather than copied in.

| Package                                                             | Licence   | Why                                                                                                                                                                             |
| ------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`robust-predicates`](https://github.com/mourner/robust-predicates) | Unlicense | Exact orientation tests (Shewchuk's adaptive arithmetic), so winding and intersection decisions never depend on a rounding error. Hand-written float comparisons were ruled out |
| [`flatbush`](https://github.com/mourner/flatbush)                   | ISC       | A static R-tree over the country polygons' bounding boxes, so a lookup touches only the polygons near a position (it brings `flatqueue`, also ISC)                              |

A test fails if a production dependency of this package has a licence outside MIT, BSD, ISC, Apache-2.0, Unlicense, CC0 and 0BSD, or is AGPL, GPL or LGPL. There is no JSON parsing library (a small scanner finds the feature boundaries and `JSON.parse` reads one feature at a time) and no argument parser (`node:util` is enough). The country outlines are Natural Earth admin-0 country polygons (public domain, no credit required), taken from the [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) repository at commit `ca96624a56bd078437bca8184e78163e5039ad19`: the 1:110m file (SHA-256 `6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f`) and, for the countries it leaves out, the 1:50m file (`3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb`). `scripts/build-countries.mjs` checks both checksums, quantises the rings to 1e-4 degrees and writes `src/engine/regions/countries.json` (the output is then formatted with Biome, so the committed file is larger than the script's raw output); it is loaded only when a region is given.

## Developing

```bash
npm run build -w @mapcairn/geolint      # tsc, to dist/
npm test -w @mapcairn/geolint
npm run smoke -w @mapcairn/geolint      # build, npm pack, install the tarball outside the repo, run it
npm run bench -w @mapcairn/geolint      # the benchmark; run the build first
npm run bench:rules -w @mapcairn/geolint
```

Each rule has a passing and a failing fixture in `fixtures/<rule-id>/`, which one test runs through the whole engine. See [`ATTRIBUTIONS.md`](../../ATTRIBUTIONS.md) for the data and software credits and [`docs/plans/0010-geolint.md`](../../docs/plans/0010-geolint.md) for the design.

## Licence

Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). Contributions to this package are licensed under Apache-2.0; the rest of the repository is AGPL-3.0 (see the root `README.md`, `CONTRIBUTING.md` and section 7 of `CLA.md`).
