// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertBuilt,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/buildSdk.mjs";

/**
 * What a TypeScript project sees of `<mapcairn-map>`, from the built
 * declarations: the tag name map is in the main declarations, and the JSX
 * entry is opt-in. API Extractor drops a `declare global` and a `declare
 * module` block, so `scripts/declarationBlocks.mjs` adds them back; these
 * tests are what says it worked. Each case is compiled by `tsc` in a folder
 * under the package, so `react` and its types resolve as they do for a project.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const SDK = path.join(REPO, "packages", "sdk");
const DIST = path.join(SDK, "dist");
const TSC = path.join(REPO, "node_modules", "typescript", "lib", "tsc.js");
const WORK = path.join(SDK, ".typings-check");
let cases = 0;

beforeAll(() => {
  assertBuilt("sdk");
});

afterAll(() => {
  rmSync(WORK, { recursive: true, force: true });
});

/** The errors `tsc` reports for a file that imports the built entries as a project would. */
function diagnosticsOf(source: string): string[] {
  cases += 1;
  const folder = mkdtempSync(
    path.join(path.dirname(WORK), `.typings-${cases}-`),
  );
  try {
    writeFileSync(path.join(folder, "checked.tsx"), source);
    writeFileSync(
      path.join(folder, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react-jsx",
          lib: ["ES2022", "DOM"],
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          types: ["react"],
          paths: {
            "@mapcairn/sdk/browser": [path.join(DIST, "browser.d.ts")],
            "@mapcairn/sdk/browser/react-jsx": [
              path.join(DIST, "browserReactJsx.d.ts"),
            ],
          },
        },
        files: ["checked.tsx"],
      }),
    );
    const result = spawnSync(
      process.execPath,
      [TSC, "-p", path.join(folder, "tsconfig.json"), "--pretty", "false"],
      { encoding: "utf8", cwd: folder },
    );
    return `${result.stdout}${result.stderr}`
      .split("\n")
      .filter((line) => line.includes("error TS"));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

describe("the main declarations", () => {
  it("know the tag, its properties and its events", () => {
    expect(
      diagnosticsOf(`import "@mapcairn/sdk/browser";
const element = document.createElement("mapcairn-map");
element.services = {};
element.view = { center: { lat: 1, lng: 2 }, zoom: 3, bearing: 0 };
const handle = element.map;
element.addEventListener("mapcairn-click", (event) => event.detail.lat.toFixed());
element.addEventListener("mapcairn-view-change", (event) => event.detail.zoom.toFixed());
element.addEventListener("mapcairn-error", (event) => event.detail.message);
const found = document.querySelector("mapcairn-map");
void handle; void found;
`),
    ).toEqual([]);
  });

  it("refuse what the element does not have", () => {
    const problems = diagnosticsOf(`import "@mapcairn/sdk/browser";
const element = document.createElement("mapcairn-map");
element.zoom = 3;
element.addEventListener("mapcairn-click", (event) => event.detail.nope);
`);
    expect(problems).toHaveLength(2);
  });
});

describe("the JSX entry", () => {
  const usage = `import "@mapcairn/sdk/browser";
export const page = <mapcairn-map zoom={5} theme="dark" tools="measure settings" className="map" />;
`;

  it("is needed before JSX accepts the tag", () => {
    expect(diagnosticsOf(usage).join("\n")).toContain("mapcairn-map");
  });

  it("makes JSX accept the tag with its attributes", () => {
    expect(
      diagnosticsOf(`import "@mapcairn/sdk/browser/react-jsx";\n${usage}`),
    ).toEqual([]);
  });

  it("still refuses a theme that is not one", () => {
    expect(
      diagnosticsOf(`import "@mapcairn/sdk/browser/react-jsx";
export const page = <mapcairn-map theme="blue" />;
`),
    ).toHaveLength(1);
  });
});
