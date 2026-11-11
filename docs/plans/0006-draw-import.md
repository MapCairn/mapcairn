# Plan 0006: import GeoJSON and CSV into the draw tool

Status: in progress. Written 2026-11-11.

Tracking issue: [#10](https://github.com/MapCairn/mapcairn/issues/10).

## Goal

Drawing can export GeoJSON and CSV but cannot read them back. Add an import: choose a file, see in words what it held, and add its points, lines, polygons and circles to the drawn shapes. A file exported by the draw tool comes back as the same shapes. Nothing is uploaded: the file is read in the browser and goes nowhere else.

## Ground rules

- Parsing is pure, in `packages/core/src/draw`, with no DOM and no browser global. It never throws, whatever the text.
- Every input is bounded before it is walked: size, depth, shapes, points per shape and points in all. Work is linear in the file, except the existing polygon edge check, which is quadratic in a polygon's points and is held small by the per-shape cap.
- A shape is valid by the same rules the draw reducer uses (`validateShape`), plus positions inside the world.
- Refusals and skips are said in words, and say what to do next where there is something to do.
- The file picker is a port with a real adapter, a fake and one contract suite, as `FileSaver` and `ClipboardPort` are.
- No new dependency. The CSV reader is a few lines of RFC 4180.

## Design

### Formats (`packages/core/src/draw/import.ts`)

The format is read from the content, not the file name: text that starts with `{` (after white space and a byte order mark) is GeoJSON, and text that starts with the draw tool's CSV header is CSV.

- **GeoJSON.** A `FeatureCollection`, a single `Feature` or a bare geometry. `Point`, `LineString` and `Polygon` become one shape each; `MultiPoint`, `MultiLineString` and `MultiPolygon` become one shape per part; a `GeometryCollection` is flattened one level, and a collection inside a collection is skipped. A polygon keeps its outer ring; holes are left out and the result says so. A ring's closing position is dropped. A position is `[longitude, latitude]` with an optional altitude, which is ignored. A feature whose properties carry `type: "circle"`, a `radius_m` and a `centre`, as the exporter writes, becomes a circle; otherwise its polygon is imported as a polygon.
- **CSV.** Exactly what `shapesToCsv` writes. The exporter gains three columns after `geometry`: `radius_m`, `centre_lng` and `centre_lat`, filled for a circle and empty otherwise, so a circle round-trips through CSV as it does through GeoJSON. The reader accepts the new eight-column header and the old five-column one (where a circle comes back as its polygon). Rows end with CRLF or LF, and quoted fields may hold commas, quotes and new lines.
- **Caps.** A file of at most 1 MB (`MAX_IMPORT_BYTES`, also checked on the text); JSON nesting at most 16 deep, measured by a linear scan before `JSON.parse`; at most 500 shapes (`MAX_IMPORT_SHAPES`); at most 1,000 points in a shape (`MAX_IMPORT_SHAPE_POINTS`) and 10,000 in the file (`MAX_IMPORT_POINTS`). A file over the size, depth, shape or total point cap is refused whole, as a link over its limits is refused rather than cut short. A shape over the per-shape cap is skipped. Walking stops as soon as a cap is passed.
- **Safety.** Keys are read with `Object.hasOwn` and checked with `typeof`; parsed objects are never spread or assigned, so a `__proto__` key is just a key. `1e999` parses to `Infinity` and is refused as not a number, and so are strings, `null` and missing positions.
- **Result.** `parseShapeFile(text)` returns either a refusal (`empty`, `too-large`, `too-deep`, `not-recognised`, `too-many-shapes`, `too-many-points`) or the shapes with counts of what was skipped and why (`self-intersecting`, `degenerate`, `too-few-vertices`, `radius-too-large`, `out-of-range`, `too-many-points`, `not-a-number`, `unsupported`) and how many polygons lost holes. `describeShapeImport` turns either into a sentence, such as "3 shapes imported. 2 skipped: 1 with edges that cross, 1 with a position outside the world."

### Reducer

A new `import` action appends the shapes through `commit`, so the whole import is one undo step. Ids continue from `nextId` and labels from the serials ("Polygon 3"), never from the file. Imported shapes go before a shape still being drawn, so the draft stays last. Without a draft the first imported shape is selected. The `imported` event carries the count; it is announced through the import result, not twice.

### Port (`FileOpener`)

`open({ accept, maxBytes, signal })` resolves with `{ name, text }` and rejects only with a `FileOpenError` whose kind is `cancelled`, `too-large`, `unreadable` or `unsupported`. The fake is scripted per call. The contract suite runs against the fake and `BrowserFileOpener`, which appends a hidden `<input type="file">` with `accept` set to `.geojson,.json,.csv` and their media types, clicks it, listens for `change` and `cancel`, checks `file.size` before reading with `File.text()`, and removes the input afterwards. A second `open` cancels one still pending. The ui calls `open` straight from the click handler, so the browser keeps the user activation.

### Interface

- `useDraw` gains `importFile()`, `importFeedback` and `importRequest` (a counter with the bounds of what was imported). Import feedback survives the change of shapes the import itself makes; any later change clears it, as export feedback is cleared.
- `ShapesSection` gains an "Import" subheading with an "Import GeoJSON or CSV" button and the result beside it in words with an icon, announced politely for success and assertively for a refusal. The note adds that imported files are read on this device and not sent anywhere. The draw toolbar's Shapes and export entry opens this section, so both routes reach it.
- `ShapesSection` fits the map to the imported shapes clear of the sheet or side panel (`coveredPadding`, as Show on map does), with a zoom cap for a single point.
- Above 50 shapes the result adds that a link carries at most 50, so a file is the way to share them.

### Documents

`ARCHITECTURE.md` (Drawing and the ports table), `DESIGN.md` (`ShapesSection` and the gesture equivalents), the extending guide (the port list) and the reference-site guide (import and the CSV columns). The privacy position does not change: the file is read in the browser and no request is made.

## Tests

- Core: unit tests for each format, each refusal and skip and the wording; property tests that export then import then export again gives the same text for generated shapes; hostile input (random text, fragments of GeoJSON and CSV, deep nesting, a huge file, `NaN`, `Infinity`, strings for numbers, `__proto__` keys, thousands of tiny shapes, mixed valid and invalid) never throws and stays within the caps.
- Reducer: import appends, keeps the draft last, continues labels, is one undo step.
- Port: the contract suite against the fake and the browser adapter.
- Map: `useDraw` and `ShapesSection` with the fake opener, including focus, announcements and the fit.
- E2E: import a fixture through the real adapter with Playwright's file chooser, check the list, the message and the map, and an accessibility scan of the section with a result.

## Order of work

1. This plan.
2. Parser, caps, wording and the CSV columns in core, test first.
3. The reducer action.
4. The port, fake, contract, adapter and registration.
5. `useDraw` and `ShapesSection`.
6. E2E and accessibility specs, screenshots, documents.
