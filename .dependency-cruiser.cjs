// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Enforces MapCairn's package boundaries and the layers described in
 * ARCHITECTURE.md. Run through `npm run depcruise`, part of `npm run lint`.
 */
/**
 * npm packages that render a map or ship a map engine, plugin or type
 * declarations. Only the MapLibre adapter package, and the host's one worker
 * file, may import them.
 * Matches the resolved path, so it also covers CSS files such as
 * `maplibre-gl/dist/maplibre-gl.css`, dynamic `import()` and `import type`.
 */
const ENGINE_PACKAGES =
  "(^|/)node_modules/(@types/)?(maplibre-gl|@maplibre|maplibre-gl-[^/]+)(/|$)";

/** The same packages as bare specifiers, for imports that do not resolve. */
const ENGINE_SPECIFIERS =
  "^(@types/)?(maplibre-gl|@maplibre|maplibre-gl-[^/]+)(/|$)";

/** Icon libraries other than `@phosphor-icons/react`, as package name patterns. */
const OTHER_ICON_NAMES =
  "(react-icons|@heroicons|heroicons|@tabler|phosphor-react|@phosphor-icons/(?!react(/|$))[^/]+|@fortawesome|@mui/icons-material|@radix-ui/react-icons|react-feather|feather-icons|@iconify|@iconify-icons|@primer/octicons[^/]*|@carbon/icons[^/]*|@ant-design/icons[^/]*|bootstrap-icons|react-bootstrap-icons|remixicon|@remixicon|ionicons|@fluentui/react-icons|material-icons|@material-design-icons|@material-symbols|boxicons|simple-icons|@iconscout|grommet-icons|lucide-react|lucide|lucide-static|lucide-vue[^/]*|lucide-svelte|lucide-solid|lucide-preact|lucide-angular)(/|$)";

/** The same packages by resolved path. */
const OTHER_ICON_PACKAGES = `(^|/)node_modules/${OTHER_ICON_NAMES}`;

/** The same packages as bare specifiers, for imports that do not resolve. */
const OTHER_ICON_SPECIFIERS = `^${OTHER_ICON_NAMES}`;

/** The only npm packages `packages/core` may import. */
const CORE_ALLOWED_PACKAGES = "(^|/)node_modules/(@turf|@types/geojson)(/|$)";

/** The `ui` primitives that may wrap Radix. */
const RADIX_WRAPPERS =
  "^packages/map/src/ui/(Switch|Slider|SegmentedControl|Tooltip)/";

/**
 * The places an engine library may be imported: the MapLibre adapter package,
 * and the one host file that builds the engine's worker URL.
 */
const ENGINE_ADAPTERS =
  "^packages/(adapter-maplibre/src/|web/src/adapters/maplibre/workerUrl\\.ts$)";

/** The code entry points of the four packages: the modules their `exports` point at under the source condition. */
const FOUR_PACKAGE_MODULES =
  "(core|map|react|theme)/src/index\\.ts|core/src/contracts/index\\.ts";

/** The two stylesheets of the four packages, as compiled (`@mapcairn/theme/tokens.css`, `@mapcairn/map/styles.css`). */
const FOUR_PACKAGE_STYLESHEETS =
  "theme/dist/tokens\\.css|map/dist/styles\\.css";

/**
 * The files the four SDK packages' `package.json` entry points resolve to: the
 * modules, and the two compiled stylesheets an app imports. Workspace imports
 * resolve through the symlink to these real paths. The umbrella package may
 * import only these.
 */
const FOUR_PACKAGE_ENTRY_POINTS = `^packages/(${FOUR_PACKAGE_MODULES}|${FOUR_PACKAGE_STYLESHEETS})$`;

/** The MapLibre adapter package's entry points: its module and its compiled stylesheet (`@mapcairn/adapter-maplibre`, `@mapcairn/adapter-maplibre/styles.css`). */
const ADAPTER_ENTRY_POINTS =
  "adapter-maplibre/src/index\\.ts|adapter-maplibre/dist/styles\\.css";

/**
 * The umbrella package's own entry points (`@mapcairn/sdk`): one module for
 * the root and one for each subpath, and its compiled stylesheet.
 */
const UMBRELLA_ENTRY_POINTS =
  "sdk/src/(index|core|coreContracts|map|adapterMaplibre|react|theme)\\.ts|sdk/dist/styles\\.css";

/** Everything a site may import from `packages/`. */
const SDK_ENTRY_POINTS = `^packages/(${FOUR_PACKAGE_MODULES}|${FOUR_PACKAGE_STYLESHEETS}|${UMBRELLA_ENTRY_POINTS})$`;

/**
 * Everything an example app may import from `packages/`: the above and the
 * MapLibre adapter package by name, for an example that uses it with no interface.
 */
const EXAMPLE_ENTRY_POINTS = `^packages/(${FOUR_PACKAGE_MODULES}|${FOUR_PACKAGE_STYLESHEETS}|${ADAPTER_ENTRY_POINTS}|${UMBRELLA_ENTRY_POINTS})$`;

module.exports = {
  forbidden: [
    {
      name: "core-is-dependency-free",
      severity: "error",
      comment: "Core must not depend on rendering, hooks or the host.",
      from: { path: "^packages/core/src" },
      to: { path: "^packages/(map|react|theme|web|sdk|adapter-maplibre)/src" },
    },
    {
      name: "react-is-dependency-free",
      severity: "error",
      comment: "Generic React hooks must not depend on map or host concerns.",
      from: { path: "^packages/react/src" },
      to: { path: "^packages/(core|map|theme|web|sdk|adapter-maplibre)/src" },
    },
    {
      name: "theme-is-dependency-free",
      severity: "error",
      comment: "The token contract must remain independent of its consumers.",
      from: { path: "^packages/theme/src" },
      to: { path: "^packages/(core|map|react|web|sdk|adapter-maplibre)/src" },
    },
    {
      name: "map-has-no-web-dependency",
      severity: "error",
      comment:
        "Map components receive configuration rather than import the host, the umbrella package or the MapLibre adapter package.",
      from: { path: "^packages/map/src" },
      to: { path: "^packages/(web|sdk|adapter-maplibre)/src" },
    },
    {
      name: "adapter-package-imported-by-composition-only",
      severity: "error",
      comment:
        "Inside the host, only the composition root may import the MapLibre adapter package (@mapcairn/adapter-maplibre). The host's other adapter files import the engine, not the package. adapters-are-imported-by-composition-only is left as it is, because it would refuse the package's own imports between its files.",
      from: {
        path: "^packages/web/",
        pathNot: "^packages/web/src/composition/",
      },
      to: { path: "^packages/adapter-maplibre/" },
    },
    {
      name: "adapter-package-uses-core-and-theme-only",
      severity: "error",
      comment:
        "The MapLibre adapter package implements a port from core and draws with tokens from theme. It may not import the ui, the generic hooks, the umbrella or the host.",
      from: { path: "^packages/adapter-maplibre/src" },
      to: { path: "^packages/(map|react|web|sdk)/" },
    },
    {
      name: "nothing-imports-the-umbrella",
      severity: "error",
      comment:
        "The umbrella package (@mapcairn/sdk) is for apps outside the repository. No package, including the host, imports it: they use the four packages it re-exports.",
      from: { path: "^packages/", pathNot: "^packages/sdk/" },
      to: { path: "^packages/sdk/" },
    },
    {
      name: "umbrella-reexports-entry-points-only",
      severity: "error",
      comment:
        "The umbrella package holds only re-exports of the four packages' and the MapLibre adapter's entry points: no npm package, no file inside a package, no code of its own. The one exception is the browser folder, which umbrella-browser-uses-entry-points-only holds to the packages' entry points.",
      from: {
        path: "^packages/sdk/src",
        pathNot: "^packages/sdk/src/browser/",
      },
      to: {
        pathNot: [
          FOUR_PACKAGE_ENTRY_POINTS,
          `^packages/(${ADAPTER_ENTRY_POINTS})$`,
          "^packages/sdk/src/",
        ],
      },
    },
    {
      name: "umbrella-browser-uses-entry-points-only",
      severity: "error",
      comment:
        "The umbrella's browser folder is built as a self-contained bundle. It may import React and its own files, and the SDK packages only through their entry points, never a file inside one.",
      from: { path: "^packages/sdk/src/browser/" },
      to: {
        path: "^packages/",
        pathNot: [
          FOUR_PACKAGE_ENTRY_POINTS,
          `^packages/(${ADAPTER_ENTRY_POINTS})$`,
          "^packages/sdk/src/browser/",
        ],
      },
    },
    {
      name: "umbrella-browser-uses-react-only",
      severity: "error",
      comment:
        "The umbrella's browser folder is built as a self-contained bundle, so a package it imports is in every page's bundle. Beside the SDK packages it may import React and React DOM and nothing else from npm; a test file, and the one test support file, may import their test tools.",
      from: {
        path: "^packages/sdk/src/browser/",
        pathNot: "\\.test\\.tsx?$|/testSupport\\.ts$",
      },
      to: {
        path: "(^|/)node_modules/",
        pathNot: "(^|/)node_modules/(react|react-dom)/",
      },
    },
    {
      name: "umbrella-browser-is-imported-by-itself-only",
      severity: "error",
      comment:
        "The umbrella's root and its re-export files never import the browser folder, so an app that imports the root carries no bundle, no React of its own making and no engine.",
      from: {
        path: "^packages/sdk/src",
        pathNot: "^packages/sdk/src/browser/",
      },
      to: { path: "^packages/sdk/src/browser/" },
    },
    {
      name: "umbrella-root-has-no-adapter",
      severity: "error",
      comment:
        "Only the umbrella's adapter-maplibre subpath file may import the MapLibre adapter package. The root and the other subpaths stay free of the engine, so an app that does not import the subpath carries none. This rule sees direct imports of scripts only: it does not parse src/styles.css (an @import), and the drift tests in packages/core/src/lint/umbrella.test.ts catch a re-export of the adapter through another file.",
      from: {
        path: "^packages/sdk/src",
        pathNot: [
          "^packages/sdk/src/adapterMaplibre\\.ts$",
          "^packages/sdk/src/browser/",
        ],
      },
      to: { path: "^packages/adapter-maplibre/" },
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
        "MapLibre, its plugins, styles and types may be imported only from packages/adapter-maplibre and the host's workerUrl.ts. The ui and the rest of the host never see an engine.",
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
      name: "icons-only-from-phosphor-react",
      severity: "error",
      comment: "@phosphor-icons/react is the only icon package.",
      from: { path: "^packages/" },
      to: { path: OTHER_ICON_PACKAGES },
    },
    {
      name: "icons-unresolved",
      severity: "error",
      comment:
        "An icon package that cannot be resolved is still not @phosphor-icons/react.",
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
        "An example app uses the SDK as an outside app would: through the package entry points (`@mapcairn/core`, `@mapcairn/core/contracts`, `@mapcairn/map`, `@mapcairn/react`, `@mapcairn/theme`, `@mapcairn/adapter-maplibre`, `@mapcairn/sdk`), never a file inside a package or the reference host.",
      from: { path: "^examples/" },
      to: { path: "^packages/", pathNot: EXAMPLE_ENTRY_POINTS },
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
      name: "sites-use-public-entry-points",
      severity: "error",
      comment:
        "The documentation site (`sites/docs`) uses the SDK as an outside app would: through the package entry points, never a file inside a package or the reference host.",
      from: { path: "^sites/" },
      to: { path: "^packages/", pathNot: SDK_ENTRY_POINTS },
    },
    {
      name: "sites-import-packages-by-name",
      severity: "error",
      comment:
        "A site imports the SDK by package name, never by a relative path into packages/, even to an entry point.",
      from: { path: "^sites/" },
      to: { path: "^packages/", dependencyTypes: ["local"] },
    },
    {
      name: "packages-do-not-import-sites",
      severity: "error",
      comment:
        "Sites use the packages; nothing in a package or an example may depend on a site.",
      from: { path: "^(packages|examples)/" },
      to: { path: "^sites/" },
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
    // `@mapcairn/source` makes the SDK packages resolve to their source, which
    // the layer rules and `SDK_ENTRY_POINTS` name, not to the built `dist`.
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: [
        "@mapcairn/source",
        "import",
        "require",
        "node",
        "default",
      ],
    },
  },
};
