// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const DEPCRUISE = path.join(
  REPO,
  "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs",
);
const BIOME = path.join(REPO, "node_modules/@biomejs/biome/bin/biome");

/** Writes `{ "relative/path": "source" }` under `root`. */
function writeTree(root: string, files: Record<string, string>): void {
  for (const [file, source] of Object.entries(files)) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
}

/** One violation reported as `rule: file`. */
type Finding = string;

describe("dependency-cruiser boundaries", () => {
  let root: string;
  let findings: Finding[];

  const files: Record<string, string> = {
    // Targets that other fixtures import.
    "packages/core/src/format/helper.ts":
      "export const helper = 1;\nexport type Helper = number;\n",
    "packages/map/src/ui/index.ts": "export const ui = 1;\n",
    "packages/map/src/index.ts": 'export * from "./ui/index";\n',
    "packages/map/package.json":
      '{ "name": "@mapcairn/map", "exports": { ".": "./src/index.ts" } }\n',
    "packages/web/src/adapters/clipboard/BrowserClipboard.ts":
      "export const clipboard = 1;\n",

    // core is pure.
    "packages/core/src/bad/importsReact.ts":
      'import { useState } from "react";\nexport const x = useState;\n',
    "packages/core/src/bad/importsMaplibre.ts":
      'import type { Map } from "maplibre-gl";\nexport type X = Map;\n',
    "packages/core/src/bad/importsUi.ts":
      'import { ui } from "../../../map/src/ui/index";\nexport const x = ui;\n',
    "packages/core/src/bad/importsNode.ts":
      'import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n',
    "packages/core/src/bad/importsZod.ts":
      'import { z } from "zod";\nexport const x = z;\n',
    "packages/core/src/good/importsTurf.ts":
      'import area from "@turf/area";\nexport const x = area;\n',

    // ports are types only.
    "packages/core/src/ports/badValue.ts":
      'import { helper } from "../format/helper";\nexport const v = helper;\n',
    "packages/core/src/ports/badNpm.ts":
      'import { z } from "zod";\nexport const v = z;\n',
    "packages/core/src/ports/goodType.ts":
      'import type { Helper } from "../format/helper";\nexport type V = Helper;\n',

    // adapters are reached through the composition root only.
    "packages/map/src/ui/badAdapter.ts":
      'import { clipboard } from "../../../web/src/adapters/clipboard/BrowserClipboard";\nexport const x = clipboard;\n',
    "packages/web/src/routes/badRoute.ts":
      'import { clipboard } from "../adapters/clipboard/BrowserClipboard";\nexport const x = clipboard;\n',
    "packages/web/src/composition/goodRoot.ts":
      'import { clipboard } from "../adapters/clipboard/BrowserClipboard";\nexport const x = clipboard;\n',
    "packages/web/src/adapters/clipboard/badUi.ts":
      'import { ui } from "../../../../map/src/ui/index";\nexport const x = ui;\n',
    "packages/web/src/adapters/clipboard/badRoot.ts":
      'import { x } from "../../composition/goodRoot";\nexport const y = x;\n',

    // the engine library stays in the engine adapter.
    "packages/map/src/ui/badMaplibre.ts":
      'import { Map } from "maplibre-gl";\nexport const x = Map;\n',
    "packages/map/src/ui/badMaplibreType.ts":
      'import type { Map } from "maplibre-gl";\nexport type X = Map;\n',
    "packages/map/src/ui/badDynamicMaplibre.ts":
      'export const load = () => import("maplibre-gl");\n',
    "packages/map/src/ui/badMaplibreCss.ts":
      'import "maplibre-gl/dist/maplibre-gl.css";\nexport const x = 1;\n',
    "packages/map/src/ui/badPlugin.ts":
      'import "maplibre-gl-draw";\nexport const x = 1;\n',
    "packages/map/src/ui/badMaplibrePlugin.ts":
      'import { x } from "@maplibre/maplibre-gl-geocoder";\nexport const y = x;\n',
    "packages/adapter-maplibre/src/goodMaplibre.ts":
      'import { Map } from "maplibre-gl";\nimport "maplibre-gl/dist/maplibre-gl.css";\nexport const x = Map;\nexport const load = () => import("maplibre-gl");\n',
    // In the host, only the one worker file may import the engine.
    "packages/web/src/adapters/maplibre/workerUrl.ts":
      'export const load = () => import("maplibre-gl");\n',
    "packages/web/src/adapters/maplibre/badEngine.ts":
      'import { Map } from "maplibre-gl";\nexport const x = Map;\n',

    // the MapLibre adapter package: the host imports it from the composition
    // root only, and nothing but core and theme may sit under it or over it.
    "packages/adapter-maplibre/package.json":
      '{ "name": "@mapcairn/adapter-maplibre", "exports": { ".": "./src/index.ts" } }\n',
    // The same imports by package name, as the host and the ui write them.
    "packages/web/src/routes/badAdapterPackageByName.ts":
      'import { createAdapter } from "@mapcairn/adapter-maplibre";\nexport const x = createAdapter;\n',
    "packages/web/src/composition/goodAdapterPackageByName.ts":
      'import { createAdapter } from "@mapcairn/adapter-maplibre";\nexport const x = createAdapter;\n',
    "packages/map/src/ui/badAdapterPackageByName.ts":
      'import { createAdapter } from "@mapcairn/adapter-maplibre";\nexport const x = createAdapter;\n',
    "packages/adapter-maplibre/src/index.ts":
      "export const createAdapter = () => 1;\n",
    "packages/adapter-maplibre/src/goodCore.ts":
      'import { helper } from "../../core/src/format/helper";\nexport const x = helper;\n',
    "packages/adapter-maplibre/src/badMap.ts":
      'import { ui } from "../../map/src/ui/index";\nexport const x = ui;\n',
    "packages/adapter-maplibre/src/badHost.ts":
      'import { clipboard } from "../../web/src/adapters/clipboard/BrowserClipboard";\nexport const x = clipboard;\n',
    "packages/web/src/composition/goodAdapterPackage.ts":
      'import { createAdapter } from "../../../adapter-maplibre/src/index";\nexport const x = createAdapter;\n',
    "packages/web/src/routes/badAdapterPackage.ts":
      'import { createAdapter } from "../../../adapter-maplibre/src/index";\nexport const x = createAdapter;\n',
    "packages/web/src/adapters/maplibre/badAdapterPackage.ts":
      'import { createAdapter } from "../../../../adapter-maplibre/src/index";\nexport const x = createAdapter;\n',
    "packages/core/src/bad/importsAdapterPackage.ts":
      'import { createAdapter } from "../../../adapter-maplibre/src/index";\nexport const x = createAdapter;\n',
    "packages/react/src/badAdapterPackage.ts":
      'import { createAdapter } from "../../adapter-maplibre/src/index";\nexport const x = createAdapter;\n',
    "packages/theme/src/badAdapterPackage.ts":
      'import { createAdapter } from "../../adapter-maplibre/src/index";\nexport const x = createAdapter;\n',
    "packages/map/src/ui/badAdapterPackage.ts":
      'import { createAdapter } from "../../../adapter-maplibre/src/index";\nexport const x = createAdapter;\n',

    // one icon package.
    "packages/map/src/ui/badIcons.ts":
      'import { FaBeer } from "react-icons/fa";\nexport const x = FaBeer;\n',
    "packages/map/src/ui/badLucideStatic.ts":
      'import { x } from "lucide-static";\nexport const y = x;\n',
    "packages/map/src/ui/goodPhosphor.ts":
      'import { MagnifyingGlass } from "@phosphor-icons/react";\nexport const x = MagnifyingGlass;\n',

    // Radix is wrapped in four primitives.
    "packages/map/src/ui/Button/badRadix.ts":
      'import * as Switch from "@radix-ui/react-switch";\nexport const x = Switch;\n',
    "packages/map/src/ui/Switch/goodRadix.ts":
      'import * as Switch from "@radix-ui/react-switch";\nexport const x = Switch;\n',
    "packages/map/src/ui/Tooltip/goodRadix.ts":
      'import * as T from "@radix-ui/react-tooltip";\nexport const x = T;\n',

    // an example app reaches the SDK only through its public entry points.
    "examples/demo/src/badDeep.ts":
      'import { ui } from "../../../packages/map/src/ui/index";\nexport const x = ui;\n',
    "examples/demo/src/badHost.ts":
      'import { clipboard } from "../../../packages/web/src/adapters/clipboard/BrowserClipboard";\nexport const x = clipboard;\n',
    "examples/demo/src/badRelativeEntry.ts":
      'import { ui } from "../../../packages/map/src/index";\nexport const x = ui;\n',
    "examples/demo/src/goodEntry.ts":
      'import { ServicesProvider } from "@mapcairn/map";\nexport const x = ServicesProvider;\n',

    // the umbrella package only re-exports the four packages' entry points,
    // and nothing in packages/ imports it.
    "packages/sdk/package.json":
      '{ "name": "@mapcairn/sdk", "exports": { ".": "./src/index.ts", "./adapter-maplibre": "./src/adapterMaplibre.ts" } }\n',
    "packages/sdk/src/index.ts": 'export * from "@mapcairn/map";\n',
    // Only the subpath file may reach the MapLibre adapter package.
    "packages/sdk/src/adapterMaplibre.ts":
      'export * from "@mapcairn/adapter-maplibre";\n',
    "packages/sdk/src/badRootAdapter.ts":
      'export * from "@mapcairn/adapter-maplibre";\n',
    "packages/sdk/src/badAdapterDeep.ts":
      'export * from "../../adapter-maplibre/src/goodCore";\n',
    // The browser folder: React and its own files, and the packages' entry points.
    "packages/sdk/src/browser/good.tsx":
      'import { createRoot } from "react-dom/client";\nimport { x } from "@mapcairn/map";\nimport { y } from "./goodSibling";\nexport const z = [createRoot, x, y];\n',
    "packages/sdk/src/browser/goodSibling.ts": "export const y = 1;\n",
    "packages/sdk/src/browser/good.test.ts":
      'import { it } from "vitest";\nit("x", () => {});\n',
    "packages/sdk/src/browser/testSupport.ts": "export const helper = 1;\n",
    "packages/sdk/src/browser/goodUsesSupport.test.ts":
      'import { helper } from "./testSupport";\nexport const y = helper;\n',
    "packages/sdk/src/browser/badUsesSupport.ts":
      'import { helper } from "./testSupport";\nexport const y = helper;\n',
    "packages/sdk/src/browser/badNpm.ts": 'export * from "zod";\n',
    "packages/sdk/src/browser/badDeep.ts":
      'export * from "../../../map/src/ui/index";\n',
    "packages/sdk/src/badImportsBrowser.ts":
      'export * from "./browser/goodSibling";\n',
    "packages/sdk/src/badNpm.ts": 'export * from "zod";\n',
    "packages/sdk/src/badDeep.ts": 'export * from "../../map/src/ui/index";\n',
    "packages/sdk/src/badCode.ts":
      'import { ui } from "../../map/src/ui/index";\nexport const x = ui;\n',
    "packages/web/src/routes/badUmbrella.ts":
      'import { x } from "../../../sdk/src/index";\nexport const y = x;\n',
    "packages/core/src/bad/importsUmbrella.ts":
      'import { x } from "../../../sdk/src/index";\nexport const y = x;\n',
    "packages/map/src/ui/badUmbrella.ts":
      'import { x } from "../../../sdk/src/index";\nexport const y = x;\n',
    "examples/demo/src/goodUmbrella.ts":
      'import { ServicesProvider } from "@mapcairn/sdk";\nexport const x = ServicesProvider;\n',
    "examples/demo/src/goodUmbrellaAdapter.ts":
      'import { createAdapter } from "@mapcairn/sdk/adapter-maplibre";\nexport const x = createAdapter;\n',
    // An example that uses the adapter package on its own, with no interface.
    "examples/demo/src/goodAdapterPackage.ts":
      'import { createAdapter } from "@mapcairn/adapter-maplibre";\nexport const x = createAdapter;\n',
    "examples/demo/src/badAdapterDeep.ts":
      'import { helper } from "../../../packages/adapter-maplibre/src/goodCore";\nexport const x = helper;\n',

    // the SDK never depends on an example.
    "packages/map/src/ui/badExample.ts":
      'import { ui } from "../../../../examples/demo/src/badDeep";\nexport const x = ui;\n',
  };

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "mapcairn-depcruise-"));
    writeTree(root, files);
    symlinkSync(
      path.join(REPO, "node_modules"),
      path.join(root, "node_modules"),
      "junction",
    );
    // The example finds the fixture's map package by name, through a link
    // like the one an npm workspace makes.
    mkdirSync(path.join(root, "examples/demo/node_modules/@mapcairn"), {
      recursive: true,
    });
    symlinkSync(
      path.join(root, "packages/map"),
      path.join(root, "examples/demo/node_modules/@mapcairn/map"),
      "junction",
    );
    for (const [consumer, target] of [
      ["examples/demo", "sdk"],
      ["examples/demo", "adapter-maplibre"],
      ["packages/sdk", "map"],
      ["packages/sdk", "adapter-maplibre"],
      ["packages/web", "adapter-maplibre"],
      ["packages/map", "adapter-maplibre"],
    ] as const) {
      mkdirSync(path.join(root, consumer, "node_modules/@mapcairn"), {
        recursive: true,
      });
      symlinkSync(
        path.join(root, "packages", target),
        path.join(root, consumer, "node_modules/@mapcairn", target),
        "junction",
      );
    }
    const result = spawnSync(
      process.execPath,
      [
        DEPCRUISE,
        "packages",
        "examples",
        "--config",
        path.join(REPO, ".dependency-cruiser.cjs"),
        "--output-type",
        "json",
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const report = JSON.parse(result.stdout);
    findings = report.summary.violations.map(
      (v: { rule: { name: string }; from: string }) =>
        `${v.rule.name}: ${v.from}`,
    );
  }, 60_000);

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ["core-uses-only-pure-packages", "packages/core/src/bad/importsReact.ts"],
    [
      "core-uses-only-pure-packages",
      "packages/core/src/bad/importsMaplibre.ts",
    ],
    ["core-uses-only-pure-packages", "packages/core/src/bad/importsNode.ts"],
    ["core-uses-only-pure-packages", "packages/core/src/bad/importsZod.ts"],
    ["core-is-dependency-free", "packages/core/src/bad/importsUi.ts"],
    ["ports-are-types-only", "packages/core/src/ports/badValue.ts"],
    ["ports-import-no-packages", "packages/core/src/ports/badNpm.ts"],
    ["map-has-no-web-dependency", "packages/map/src/ui/badAdapter.ts"],
    [
      "adapters-are-imported-by-composition-only",
      "packages/map/src/ui/badAdapter.ts",
    ],
    [
      "adapters-are-imported-by-composition-only",
      "packages/web/src/routes/badRoute.ts",
    ],
    [
      "adapters-do-not-reach-into-ui",
      "packages/web/src/adapters/clipboard/badUi.ts",
    ],
    [
      "composition-root-is-not-a-singleton",
      "packages/web/src/adapters/clipboard/badRoot.ts",
    ],
    [
      "map-engine-libraries-only-in-engine-adapters",
      "packages/map/src/ui/badMaplibre.ts",
    ],
    [
      "map-engine-libraries-only-in-engine-adapters",
      "packages/map/src/ui/badMaplibreType.ts",
    ],
    [
      "map-engine-libraries-only-in-engine-adapters",
      "packages/map/src/ui/badMaplibreCss.ts",
    ],
    // MapLibre plugins are not installed, so these imports cannot resolve and
    // the unresolved-specifier rule is the one that catches them. maplibre-gl
    // stays installed (the engine adapter uses it), which keeps the
    // resolved-path rule above exercised.
    [
      "map-engine-libraries-unresolved",
      "packages/map/src/ui/badMaplibrePlugin.ts",
    ],
    ["map-engine-libraries-unresolved", "packages/map/src/ui/badPlugin.ts"],
    ["icons-unresolved", "packages/map/src/ui/badIcons.ts"],
    ["radix-only-in-ui-primitives", "packages/map/src/ui/Button/badRadix.ts"],
    ["examples-use-public-entry-points", "examples/demo/src/badDeep.ts"],
    ["examples-use-public-entry-points", "examples/demo/src/badHost.ts"],
    ["examples-import-packages-by-name", "examples/demo/src/badDeep.ts"],
    ["examples-use-public-entry-points", "examples/demo/src/badAdapterDeep.ts"],
    ["examples-import-packages-by-name", "examples/demo/src/badAdapterDeep.ts"],
    [
      "examples-import-packages-by-name",
      "examples/demo/src/badRelativeEntry.ts",
    ],
    ["packages-do-not-import-examples", "packages/map/src/ui/badExample.ts"],
    ["umbrella-reexports-entry-points-only", "packages/sdk/src/badNpm.ts"],
    ["umbrella-reexports-entry-points-only", "packages/sdk/src/badDeep.ts"],
    ["umbrella-reexports-entry-points-only", "packages/sdk/src/badCode.ts"],
    ["umbrella-browser-uses-react-only", "packages/sdk/src/browser/badNpm.ts"],
    [
      "umbrella-browser-test-support-for-tests-only",
      "packages/sdk/src/browser/badUsesSupport.ts",
    ],
    [
      "umbrella-browser-uses-entry-points-only",
      "packages/sdk/src/browser/badDeep.ts",
    ],
    [
      "umbrella-browser-is-imported-by-itself-only",
      "packages/sdk/src/badImportsBrowser.ts",
    ],
    ["umbrella-root-has-no-adapter", "packages/sdk/src/badRootAdapter.ts"],
    ["umbrella-root-has-no-adapter", "packages/sdk/src/badAdapterDeep.ts"],
    [
      "umbrella-reexports-entry-points-only",
      "packages/sdk/src/badAdapterDeep.ts",
    ],
    ["nothing-imports-the-umbrella", "packages/web/src/routes/badUmbrella.ts"],
    [
      "nothing-imports-the-umbrella",
      "packages/core/src/bad/importsUmbrella.ts",
    ],
    ["nothing-imports-the-umbrella", "packages/map/src/ui/badUmbrella.ts"],
    ["core-is-dependency-free", "packages/core/src/bad/importsUmbrella.ts"],
    ["map-has-no-web-dependency", "packages/map/src/ui/badUmbrella.ts"],
    [
      "core-is-dependency-free",
      "packages/core/src/bad/importsAdapterPackage.ts",
    ],
    ["react-is-dependency-free", "packages/react/src/badAdapterPackage.ts"],
    ["theme-is-dependency-free", "packages/theme/src/badAdapterPackage.ts"],
    ["map-has-no-web-dependency", "packages/map/src/ui/badAdapterPackage.ts"],
    [
      "adapter-package-imported-by-composition-only",
      "packages/web/src/routes/badAdapterPackage.ts",
    ],
    [
      "adapter-package-imported-by-composition-only",
      "packages/web/src/adapters/maplibre/badAdapterPackage.ts",
    ],
    [
      "adapter-package-imported-by-composition-only",
      "packages/web/src/routes/badAdapterPackageByName.ts",
    ],
    [
      "map-has-no-web-dependency",
      "packages/map/src/ui/badAdapterPackageByName.ts",
    ],
    [
      "adapter-package-uses-core-and-theme-only",
      "packages/adapter-maplibre/src/badMap.ts",
    ],
    [
      "adapter-package-uses-core-and-theme-only",
      "packages/adapter-maplibre/src/badHost.ts",
    ],
    [
      "map-engine-libraries-only-in-engine-adapters",
      "packages/web/src/adapters/maplibre/badEngine.ts",
    ],
  ])("reports %s for %s", (rule, file) => {
    expect(findings).toContain(`${rule}: ${file}`);
  });

  it("catches a dynamic import of MapLibre (resolved or not)", () => {
    expect(
      findings.filter((f) =>
        f.endsWith("packages/map/src/ui/badDynamicMaplibre.ts"),
      ),
    ).not.toEqual([]);
  });

  it("catches an icon package that is not @phosphor-icons/react (resolved or not)", () => {
    expect(
      findings.filter((f) =>
        f.endsWith("packages/map/src/ui/badLucideStatic.ts"),
      ),
    ).not.toEqual([]);
  });

  it.each([
    "packages/core/src/good/importsTurf.ts",
    "packages/core/src/ports/goodType.ts",
    "packages/web/src/composition/goodRoot.ts",
    "packages/adapter-maplibre/src/goodMaplibre.ts",
    "packages/adapter-maplibre/src/goodCore.ts",
    "packages/web/src/adapters/maplibre/workerUrl.ts",
    "packages/web/src/composition/goodAdapterPackage.ts",
    "packages/web/src/composition/goodAdapterPackageByName.ts",
    "packages/map/src/ui/goodPhosphor.ts",
    "packages/map/src/ui/Switch/goodRadix.ts",
    "packages/map/src/ui/Tooltip/goodRadix.ts",
    "examples/demo/src/goodEntry.ts",
    "examples/demo/src/goodUmbrella.ts",
    "examples/demo/src/goodUmbrellaAdapter.ts",
    "examples/demo/src/goodAdapterPackage.ts",
    "packages/sdk/src/index.ts",
    "packages/sdk/src/adapterMaplibre.ts",
    "packages/sdk/src/browser/good.tsx",
    "packages/sdk/src/browser/goodSibling.ts",
    "packages/sdk/src/browser/good.test.ts",
  ])("accepts %s", (file) => {
    expect(findings.filter((f) => f.endsWith(file))).toEqual([]);
  });
});

describe("Biome rules", () => {
  let root: string;
  let findings: Finding[];

  const lines = (...rows: string[]): string => `${rows.join("\n")}\n`;
  const globals = lines(
    'export const a = localStorage.getItem("a");',
    'export const b = fetch("/x");',
    'export const c = window.matchMedia("(min-width: 1px)");',
    "export const d = navigator.geolocation;",
    "export const e = navigator.clipboard;",
    'export const f = globalThis.fetch("/y");',
    "export const g = window.location.hash;",
  );

  const files: Record<string, string> = {
    "packages/map/src/ui/Example/imports.tsx": lines(
      'import * as Phosphor from "@phosphor-icons/react";',
      'import Default from "@phosphor-icons/react";',
      'import { Dyn } from "@phosphor-icons/react/dist/ssr";',
      'import { FaBeer } from "react-icons/fa";',
      "export const x = [Phosphor, Default, Dyn, FaBeer];",
    ),
    "packages/map/src/ui/Example/goodImports.tsx": lines(
      'import { MagnifyingGlass } from "@phosphor-icons/react";',
      "export const x = MagnifyingGlass;",
    ),
    "packages/map/src/ui/Example/a11y.tsx": lines(
      "export const a = <div onClick={() => 1}>x</div>;",
      'export const b = <button type="button" tabIndex={2} aria-hidden="true">y</button>;',
      "export const c = <li onClick={() => 1}>z</li>;",
      "export const s = <div style={{ top: 1 }} />;",
    ),
    "packages/map/src/ui/Example/goodA11y.tsx": lines(
      'export const a = <button type="button" onClick={() => 1}>x</button>;',
      'export const b = <button type="button" tabIndex={0}>y</button>;',
    ),
    "packages/web/src/viewport.tsx": lines(
      'export const m = <meta name="viewport" content="width=device-width, user-scalable=no" />;',
    ),
    "packages/map/src/host/globals.ts": globals,
    "packages/map/src/host/cookie.ts": 'document.cookie = "a=b";\n',
    "packages/web/src/adapters/x/globals.ts": globals,
    "packages/map/src/host/globals.test.ts": globals,
    "packages/core/src/pure/dom.ts": lines(
      "export const a = window;",
      "export const b = document.title;",
      "export const c = navigator.userAgent;",
    ),
    "packages/core/src/pure/ok.ts": lines(
      "export type Signal = AbortSignal;",
      "export function run(signal: AbortSignal): boolean {",
      "  return signal.aborted;",
      "}",
    ),
    "packages/core/src/pure/dom.test.ts": "export const a = window;\n",
    "packages/web/src/important.css": "a {\n  color: red !important;\n}\n",
    "packages/map/src/host/loud.ts": lines(
      'console.log("a");',
      'console.error("b");',
      'console.warn("c");',
    ),
    "packages/map/src/host/loud.test.ts": 'console.log("a");\n',
    "packages/web/scripts/loud.mjs": 'console.log("a");\n',
    "packages/map/src/host/quality.ts": lines(
      "export type Shape = { a: number };",
      "export class Box {",
      "  #items = new Set<number>();",
      "  add(n: number): void {",
      "    this.#items.add(n);",
      "  }",
      "}",
      "export const nested = (a: boolean, b: boolean) => (a ? 1 : b ? 2 : 3);",
      "const outer = 1;",
      "export const shadow = (outer: number) => outer;",
      "export const taken = outer;",
      "export async function load(): Promise<void> {}",
      "export function run(): void {",
      "  load();",
      "}",
      'export function kind(value: "a" | "b"): number {',
      "  switch (value) {",
      '    case "a":',
      "      return 1;",
      "  }",
      "  return 2;",
      "}",
    ),
    "packages/map/src/host/quality.tsx": lines(
      "export const leaked = (count: number) => <p>{count && <b>x</b>}</p>;",
    ),
    "packages/map/src/host/old.ts": lines(
      "/** @deprecated Use something else. */",
      "export const old = 1;",
    ),
    "packages/map/src/host/useOld.ts": lines(
      'import { old } from "./old";',
      "export const value = old;",
    ),
    "packages/map/src/host/cycleA.ts": lines(
      'import { b } from "./cycleB";',
      "export const a = () => b;",
    ),
    "packages/map/src/host/cycleB.ts": lines(
      'import { a } from "./cycleA";',
      "export const b = () => a;",
    ),
    "packages/map/src/host/Prop.tsx": lines(
      "export function Prop(props: { a: number }) {",
      "  props.a = 2;",
      "  return <p>{props.a}</p>;",
      "}",
    ),
    "packages/map/package.json": JSON.stringify({
      dependencies: { left: "1.0.0" },
      devDependencies: { left: "1.0.0" },
    }),
    "packages/web/e2e/badDescribe.spec.ts": lines(
      'import { test } from "@playwright/test";',
      'test.describe("x", 5 as never);',
    ),
    "packages/map/src/host/describeParam.ts": lines(
      "export const call = (",
      "  describe: (name: string, body: number) => void,",
      '): void => describe("x", 5);',
    ),
    "packages/map/src/host/goodQuality.ts": lines(
      "export interface Shape {",
      "  a: number;",
      "}",
      "export class Box {",
      "  readonly #items = new Set<number>();",
      "  add(n: number): void {",
      "    this.#items.add(n);",
      "  }",
      "}",
      "export const pick = (a: boolean) => (a ? 1 : 2);",
      "export async function load(): Promise<void> {}",
      "export async function run(): Promise<void> {",
      "  await load();",
      "}",
      'export function kind(value: "a" | "b"): number {',
      "  switch (value) {",
      '    case "a":',
      "      return 1;",
      '    case "b":',
      "      return 2;",
      "  }",
      "}",
    ),
  };

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "mapcairn-biome-"));
    writeTree(root, files);
    // The config keeps its reasons in whole-line `//` comments.
    const config = JSON.parse(
      readFileSync(path.join(REPO, "biome.jsonc"), "utf8")
        .split("\n")
        .filter((row) => !row.trim().startsWith("//"))
        .join("\n"),
    );
    config.vcs = { enabled: false };
    delete config.$schema;
    writeFileSync(path.join(root, "biome.jsonc"), JSON.stringify(config));
    const result = spawnSync(
      process.execPath,
      [
        BIOME,
        "lint",
        "--reporter=github",
        "--colors=off",
        "--max-diagnostics=1000",
        ".",
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    findings = [];
    for (const row of result.stdout.split("\n")) {
      const match =
        /^::error title=lint\/[^/]+\/([^,]+),file=([^,]+),line=(\d+)/.exec(row);
      if (match) {
        const file = decodeURIComponent(match[2]).replaceAll("\\", "/");
        findings.push(`${match[1]}: ${file.slice(file.indexOf("packages/"))}`);
      }
    }
  }, 60_000);

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ["noRestrictedImports", "packages/map/src/ui/Example/imports.tsx"],
    ["noInlineStyles", "packages/map/src/ui/Example/a11y.tsx"],
    ["useKeyWithClickEvents", "packages/map/src/ui/Example/a11y.tsx"],
    ["noStaticElementInteractions", "packages/map/src/ui/Example/a11y.tsx"],
    [
      "noNoninteractiveElementInteractions",
      "packages/map/src/ui/Example/a11y.tsx",
    ],
    ["noPositiveTabindex", "packages/map/src/ui/Example/a11y.tsx"],
    ["noAriaHiddenOnFocusable", "packages/map/src/ui/Example/a11y.tsx"],
    ["noNonScalableViewport", "packages/web/src/viewport.tsx"],
    ["noRestrictedGlobals", "packages/map/src/host/globals.ts"],
    ["noJsRestrictedProperties", "packages/map/src/host/globals.ts"],
    ["noDocumentCookie", "packages/map/src/host/cookie.ts"],
    ["noRestrictedGlobals", "packages/core/src/pure/dom.ts"],
    ["noJsRestrictedProperties", "packages/core/src/pure/dom.ts"],
    ["noImportantStyles", "packages/web/src/important.css"],
    ["noConsole", "packages/map/src/host/loud.ts"],
    ["useConsistentTypeDefinitions", "packages/map/src/host/quality.ts"],
    ["useReadonlyClassProperties", "packages/map/src/host/quality.ts"],
    ["noNestedTernary", "packages/map/src/host/quality.ts"],
    ["noShadow", "packages/map/src/host/quality.ts"],
    ["noFloatingPromises", "packages/map/src/host/quality.ts"],
    ["useExhaustiveSwitchCases", "packages/map/src/host/quality.ts"],
    ["noLeakedRender", "packages/map/src/host/quality.tsx"],
    ["noDeprecatedImports", "packages/map/src/host/useOld.ts"],
    ["noImportCycles", "packages/map/src/host/cycleA.ts"],
    ["noReactPropAssignments", "packages/map/src/host/Prop.tsx"],
    ["noDuplicateDependencies", "packages/map/package.json"],
    [
      "usePlaywrightValidDescribeCallback",
      "packages/web/e2e/badDescribe.spec.ts",
    ],
  ])("%s fires in %s", (rule, file) => {
    expect(findings).toContain(`${rule}: ${file}`);
  });

  it("lets application code report a failure with console.error and console.warn", () => {
    const rows = findings.filter(
      (f) => f === "noConsole: packages/map/src/host/loud.ts",
    );
    expect(rows).toHaveLength(1);
  });

  it("flags namespace, default, dynamic and other icon imports separately", () => {
    const rows = findings.filter(
      (f) =>
        f === "noRestrictedImports: packages/map/src/ui/Example/imports.tsx",
    );
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  it.each([
    "packages/map/src/ui/Example/goodImports.tsx",
    "packages/map/src/ui/Example/goodA11y.tsx",
    "packages/web/src/adapters/x/globals.ts",
    "packages/map/src/host/globals.test.ts",
    "packages/core/src/pure/ok.ts",
    "packages/core/src/pure/dom.test.ts",
    "packages/map/src/host/loud.test.ts",
    "packages/web/scripts/loud.mjs",
    "packages/map/src/host/goodQuality.ts",
    "packages/map/src/host/describeParam.ts",
  ])("accepts %s", (file) => {
    expect(findings.filter((f) => f.endsWith(file))).toEqual([]);
  });
});
