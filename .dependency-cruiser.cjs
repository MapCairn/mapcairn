// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Enforces MapCairn's package boundaries and the layers described in
 * ARCHITECTURE.md. Run through `npm run depcruise`, part of `npm run lint`.
 */
/**
 * npm packages that render a map or ship a map engine, plugin or type
 * declarations. Only `packages/web/src/adapters/maplibre` may import them.
 * Matches the resolved path, so it also covers CSS files such as
 * `maplibre-gl/dist/maplibre-gl.css`, dynamic `import()` and `import type`.
 */
const ENGINE_PACKAGES =
  "(^|/)node_modules/(@types/)?(maplibre-gl|@maplibre|maplibre-gl-[^/]+)(/|$)";

/** The same packages as bare specifiers, for imports that do not resolve. */
const ENGINE_SPECIFIERS =
  "^(@types/)?(maplibre-gl|@maplibre|maplibre-gl-[^/]+)(/|$)";

/** Icon libraries other than `lucide-react`, as package name patterns. */
const OTHER_ICON_NAMES =
  "(react-icons|@heroicons|heroicons|@tabler|@phosphor-icons|phosphor-react|@fortawesome|@mui/icons-material|@radix-ui/react-icons|react-feather|feather-icons|@iconify|@iconify-icons|@primer/octicons[^/]*|@carbon/icons[^/]*|@ant-design/icons[^/]*|bootstrap-icons|react-bootstrap-icons|remixicon|@remixicon|ionicons|@fluentui/react-icons|material-icons|@material-design-icons|@material-symbols|boxicons|simple-icons|@iconscout|grommet-icons|lucide|lucide-static|lucide-vue[^/]*|lucide-svelte|lucide-solid|lucide-preact|lucide-angular)(/|$)";

/** The same packages by resolved path. */
const OTHER_ICON_PACKAGES = `(^|/)node_modules/${OTHER_ICON_NAMES}`;

/** The same packages as bare specifiers, for imports that do not resolve. */
const OTHER_ICON_SPECIFIERS = `^${OTHER_ICON_NAMES}`;

/** The only npm packages `packages/core` may import. */
const CORE_ALLOWED_PACKAGES = "(^|/)node_modules/(@turf|@types/geojson)(/|$)";

/** The `ui` primitives that may wrap Radix. */
const RADIX_WRAPPERS =
  "^packages/map/src/ui/(Switch|Slider|SegmentedControl|Tooltip)/";

/** The engine adapter, the only place an engine library may be imported. */
const ENGINE_ADAPTERS = "^packages/web/src/adapters/maplibre/";

/**
 * The files the SDK's `package.json` entry points resolve to. Workspace
 * imports resolve through the symlink to these real paths.
 */
const SDK_ENTRY_POINTS =
  "^packages/((core|map|react|theme)/src/index|core/src/contracts/index)\\.ts$";

module.exports = {
  forbidden: [
    {
      name: "core-is-dependency-free",
      severity: "error",
      comment: "Core must not depend on rendering, hooks or the host.",
      from: { path: "^packages/core/src" },
      to: { path: "^packages/(map|react|theme|web)/src" },
    },
    {
      name: "react-is-dependency-free",
      severity: "error",
      comment: "Generic React hooks must not depend on map or host concerns.",
      from: { path: "^packages/react/src" },
      to: { path: "^packages/(core|map|theme|web)/src" },
    },
    {
      name: "theme-is-dependency-free",
      severity: "error",
      comment: "The token contract must remain independent of its consumers.",
      from: { path: "^packages/theme/src" },
      to: { path: "^packages/(core|map|react|web)/src" },
    },
    {
      name: "map-has-no-web-dependency",
      severity: "error",
      comment:
        "Map components receive configuration rather than import the host.",
      from: { path: "^packages/map/src" },
      to: { path: "^packages/web/src" },
    },
    {
      name: "core-uses-only-pure-packages",
      severity: "error",
      comment:
        "core is pure logic. It may import only maths libraries (@turf/*, @types/geojson): no React, map engine, DOM library or Node built-in.",
      from: {
        path: "^packages/core/src",
        // Contract suites and property-test generators are test code shipped
        // as modules, and import vitest or fast-check.
        pathNot: "^packages/core/src/(contracts|propertyTesting)/",
      },
      to: {
        dependencyTypes: [
          "npm",
          "npm-dev",
          "npm-optional",
          "npm-peer",
          "npm-bundled",
          "npm-no-pkg",
          "npm-unknown",
          "core",
        ],
        pathNot: CORE_ALLOWED_PACKAGES,
      },
    },
    {
      name: "ports-are-types-only",
      severity: "error",
      comment:
        "Ports are interfaces. They may import only types (`import type`) from elsewhere in core. The typed error classes in ports/errors.ts are the one value export and stay inside ports.",
      from: { path: "^packages/core/src/ports/" },
      to: {
        path: "^packages/core/src/",
        pathNot: "^packages/core/src/ports/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "ports-import-no-packages",
      severity: "error",
      comment: "Ports may not depend on any npm package.",
      from: { path: "^packages/core/src/ports/" },
      to: {
        dependencyTypes: [
          "npm",
          "npm-dev",
          "npm-optional",
          "npm-peer",
          "npm-unknown",
          "npm-no-pkg",
        ],
      },
    },
    {
      name: "adapters-are-imported-by-composition-only",
      severity: "error",
      comment:
        "Only the composition root may import an adapter. Everything else asks for a service through a port.",
      from: {
        path: "^packages/",
        pathNot: "^packages/web/src/(adapters|composition)/",
      },
      to: { path: "^packages/web/src/adapters/" },
    },
    {
      name: "adapters-do-not-reach-into-ui",
      severity: "error",
      comment:
        "Adapters implement ports from core. They may not import the ui or the generic hooks.",
      from: { path: "^packages/web/src/adapters/" },
      to: { path: "^packages/(map|react)/src" },
    },
    {
      name: "composition-root-is-not-a-singleton",
      severity: "error",
      comment:
        "Adapters may not import the composition root. It builds them, not the other way round.",
      from: { path: "^packages/web/src/adapters/" },
      to: { path: "^packages/web/src/composition/" },
    },
    {
      name: "map-engine-libraries-only-in-engine-adapters",
      severity: "error",
      comment:
        "MapLibre, its plugins, styles and types may be imported only from packages/web/src/adapters/maplibre. The ui and the host never see an engine.",
      from: { path: "^packages/", pathNot: ENGINE_ADAPTERS },
      to: { path: ENGINE_PACKAGES },
    },
    {
      name: "map-engine-libraries-unresolved",
      severity: "error",
      comment:
        "An engine package that cannot be resolved is still an engine import. Same rule as above, for bare specifiers.",
      from: { path: "^packages/", pathNot: ENGINE_ADAPTERS },
      to: { couldNotResolve: true, path: ENGINE_SPECIFIERS },
    },
    {
      name: "icons-only-from-lucide-react",
      severity: "error",
      comment: "lucide-react is the only icon package.",
      from: { path: "^packages/" },
      to: { path: OTHER_ICON_PACKAGES },
    },
    {
      name: "icons-unresolved",
      severity: "error",
      comment:
        "An icon package that cannot be resolved is still not lucide-react.",
      from: { path: "^packages/" },
      to: { couldNotResolve: true, path: OTHER_ICON_SPECIFIERS },
    },
    {
      name: "radix-only-in-ui-primitives",
      severity: "error",
      comment:
        "Radix primitives are wrapped once, in packages/map/src/ui/{Switch,Slider,SegmentedControl,Tooltip}. Everything else uses the wrapper.",
      from: { path: "^packages/", pathNot: RADIX_WRAPPERS },
      to: { path: "(^|/)node_modules/@radix-ui/" },
    },
    {
      name: "examples-use-public-entry-points",
      severity: "error",
      comment:
        "An example app uses the SDK as an outside app would: through the package entry points (`@mapcairn/core`, `@mapcairn/core/contracts`, `@mapcairn/map`, `@mapcairn/react`, `@mapcairn/theme`), never a file inside a package or the reference host.",
      from: { path: "^examples/" },
      to: { path: "^packages/", pathNot: SDK_ENTRY_POINTS },
    },
    {
      name: "examples-import-packages-by-name",
      severity: "error",
      comment:
        "An example app imports the SDK by package name, as an outside app must, never by a relative path into packages/, even to an entry point.",
      from: { path: "^examples/" },
      to: { path: "^packages/", dependencyTypes: ["local"] },
    },
    {
      name: "packages-do-not-import-examples",
      severity: "error",
      comment:
        "Examples use the packages; nothing in a package may depend on an example.",
      from: { path: "^packages/" },
      to: { path: "^examples/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.test\\.(ts|tsx)$" },
    // The swc parser keeps `import type` edges and tags them `type-only`,
    // which the ports-are-types-only rule and engine type imports rely on.
    // The default parser transpiles first and loses them.
    parser: "swc",
    // maplibre-gl publishes only an `import` condition in its exports map,
    // so without it the bare specifier would not resolve and the
    // resolved-path rules (core purity, engine imports) could not see it.
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
