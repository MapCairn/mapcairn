import { spawnSync } from "node:child_process";
import {
  existsSync,
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

const legacyPaths: Array<{ path: string; reason: string }> = JSON.parse(
  readFileSync(path.join(REPO, "scripts/harmony/legacyPaths.json"), "utf8"),
);

describe("dependency-cruiser boundaries", () => {
  let root: string;
  let findings: Finding[];

  const files: Record<string, string> = {
    // Targets that other fixtures import.
    "packages/core/src/format/helper.ts":
      "export const helper = 1;\nexport type Helper = number;\n",
    "packages/map/src/ui/index.ts": "export const ui = 1;\n",
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
    "packages/web/src/adapters/maplibre/goodMaplibre.ts":
      'import { Map } from "maplibre-gl";\nimport "maplibre-gl/dist/maplibre-gl.css";\nexport const x = Map;\nexport const load = () => import("maplibre-gl");\n',

    // one icon package.
    "packages/map/src/ui/badIcons.ts":
      'import { FaBeer } from "react-icons/fa";\nexport const x = FaBeer;\n',
    "packages/map/src/ui/badLucideStatic.ts":
      'import { x } from "lucide-static";\nexport const y = x;\n',
    "packages/map/src/ui/goodLucide.ts":
      'import { Search } from "lucide-react";\nexport const x = Search;\n',

    // Radix is wrapped in four primitives.
    "packages/map/src/ui/Button/badRadix.ts":
      'import * as Switch from "@radix-ui/react-switch";\nexport const x = Switch;\n',
    "packages/map/src/ui/Switch/goodRadix.ts":
      'import * as Switch from "@radix-ui/react-switch";\nexport const x = Switch;\n',
    "packages/map/src/ui/Tooltip/goodRadix.ts":
      'import * as T from "@radix-ui/react-tooltip";\nexport const x = T;\n',
  };

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "karta-depcruise-"));
    writeTree(root, files);
    symlinkSync(
      path.join(REPO, "node_modules"),
      path.join(root, "node_modules"),
      "junction",
    );
    const result = spawnSync(
      process.execPath,
      [
        DEPCRUISE,
        "packages",
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

  it("catches an icon package that is not lucide-react (resolved or not)", () => {
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
    "packages/web/src/adapters/maplibre/goodMaplibre.ts",
    "packages/map/src/ui/goodLucide.ts",
    "packages/map/src/ui/Switch/goodRadix.ts",
    "packages/map/src/ui/Tooltip/goodRadix.ts",
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
      'import * as Lucide from "lucide-react";',
      'import Default from "lucide-react";',
      'import { Dyn } from "lucide-react/dynamic";',
      'import { FaBeer } from "react-icons/fa";',
      "export const x = [Lucide, Default, Dyn, FaBeer];",
    ),
    "packages/map/src/ui/Example/goodImports.tsx": lines(
      'import { Search } from "lucide-react";',
      "export const x = Search;",
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
  };

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "karta-biome-"));
    writeTree(root, files);
    const config = JSON.parse(
      readFileSync(path.join(REPO, "biome.jsonc"), "utf8"),
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
  ])("%s fires in %s", (rule, file) => {
    expect(findings).toContain(`${rule}: ${file}`);
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
  ])("accepts %s", (file) => {
    expect(findings.filter((f) => f.endsWith(file))).toEqual([]);
  });
});

describe("legacy path list", () => {
  it("names only paths that still exist, so deleting code empties the list", () => {
    for (const entry of legacyPaths) {
      expect(existsSync(path.join(REPO, entry.path)), entry.path).toBe(true);
    }
  });

  it("gives every entry a reason", () => {
    for (const entry of legacyPaths) {
      expect(entry.reason.length, entry.path).toBeGreaterThan(10);
    }
  });

  it("is mirrored exactly by the Biome legacy override", () => {
    const config = JSON.parse(
      readFileSync(path.join(REPO, "biome.jsonc"), "utf8"),
    );
    const override = (
      config.overrides as Array<{
        includes: string[];
        linter?: { rules?: { a11y?: Record<string, string> } };
      }>
    ).find(
      (o) =>
        o.linter?.rules?.a11y?.noNoninteractiveElementInteractions === "off",
    );
    const expected = legacyPaths.map((e) =>
      e.path.endsWith("/") ? `${e.path}**` : e.path,
    );
    if (expected.length === 0) {
      expect(override).toBeUndefined();
    } else {
      expect(override?.includes).toEqual(expected);
    }
  });
});
