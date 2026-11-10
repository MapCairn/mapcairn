/**
 * Configuration for the harmony scanner (`npm run lint:harmony`).
 *
 * Three lists decide what the scanner skips, and each has one home:
 *
 * - `EXEMPT_SURFACES` below: files that legitimately hold raw values.
 * - `legacyPaths.json`: old code awaiting deletion in the app rebuild.
 * - `allowlist.mjs`: one-off, justified exceptions, each with a reason.
 *
 * Exempt surfaces are the ones documented in DESIGN.md: the tokens file, the
 * engine style file, committed basemap assets and map style definitions, tests
 * and fixtures, and build output. The inline script in `packages/web/src/root.tsx`
 * is a string, so it needs no exemption: no rule here reads inside a string
 * except for colour and selector patterns.
 */

/**
 * Files that hold raw values on purpose. Matched against the repository
 * relative path with forward slashes.
 * @type {ReadonlyArray<{ pattern: RegExp, reason: string }>}
 */
export const EXEMPT_SURFACES = [
  {
    pattern: /^packages\/theme\/src\/tokens\.css\.ts$/,
    reason: "The tokens file is where raw token values are declared.",
  },
  {
    pattern: /^packages\/theme\/src\/tokenValues\.ts$/,
    reason: "Token values (colours, scales, z-index numbers) live here.",
  },
  {
    pattern: /^packages\/theme\/src\/contrast(\.test)?\.ts$/,
    reason: "Contrast maths and its tests work on raw colour values.",
  },
  {
    pattern: /^packages\/web\/src\/adapters\/mapEngine\.css\.ts$/,
    reason:
      "The engine style file restyles MapLibre, which needs engine selectors and raw z-index values.",
  },
  {
    pattern: /^packages\/(core|web)\/src\/basemaps\//,
    reason:
      "Basemap definitions are data: committed basemap assets and map style definitions carry their own colours and fonts, in the SDK and in the host.",
  },
];

/**
 * Files the scanner never reads: tests, fixtures, test support and tooling.
 * @param {string} file Repository relative path with forward slashes.
 * @returns {boolean}
 */
export function isTestOrToolingFile(file) {
  const base = file.slice(file.lastIndexOf("/") + 1);
  return (
    /\.(test|spec)\.(ts|tsx)$/.test(base) ||
    /(^|\/)(e2e|lint-fixtures|__snapshots__)\//.test(file) ||
    /test(harness|host|engine|utils|fixtures|seam)/i.test(base) ||
    base === "vitest.setup.ts" ||
    base.endsWith(".d.ts")
  );
}

/**
 * Components that may use `position: absolute` or `fixed`. Everything else
 * lays out in flow, inside a `MapChrome` slot. Add a path here only for a new
 * kind of floating surface, and say which kind in the comment.
 * @type {ReadonlyArray<{ prefix: string, kind: string }>}
 */
export const POSITIONED_COMPONENTS = [
  { prefix: "packages/map/src/chrome/MapChrome/", kind: "MapChrome" },
  { prefix: "packages/map/src/chrome/EndStack/", kind: "chrome slot" },
  { prefix: "packages/map/src/chrome/Sheet/", kind: "Sheet" },
  {
    prefix: "packages/map/src/chrome/Attribution/",
    kind: "Attribution popover",
  },
  { prefix: "packages/map/src/ui/Tooltip/", kind: "tooltip wrapper" },
  { prefix: "packages/map/src/ui/VisuallyHidden/", kind: "VisuallyHidden" },
  { prefix: "packages/map/src/ui/SkipLink/", kind: "SkipLink" },
  { prefix: "packages/map/src/host/MapView", kind: "engine host (MapView)" },
  { prefix: "packages/map/src/host/overlays/", kind: "map overlay components" },
];

/** Directories that may create live regions (`aria-live`, `role="status"`, `role="alert"`). */
export const LIVE_REGION_DIRS = [
  "packages/map/src/ui/LiveRegion/",
  "packages/map/src/ui/StatusMessage/",
];

/** The one directory that may size or stroke an icon. */
export const ICON_SIZING_DIR = "packages/map/src/ui/Icon/";

/** Directories that may construct adapters and call `createServices`. */
export const ADAPTER_WIRING_DIRS = [
  "packages/web/src/adapters/",
  "packages/web/src/composition/",
];

/** Weights in the type scale. */
export const ALLOWED_FONT_WEIGHTS = new Set(["400", "600"]);

/** Smallest font size that is allowed, in CSS pixels. */
export const MIN_FONT_SIZE_PX = 13;

/** Border and outline widths that may be written as literals. */
export const ALLOWED_LINE_WIDTHS_PX = new Set([0, 1, 2]);
