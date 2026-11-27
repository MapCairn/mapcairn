// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/**
 * How a project resolves the package: through `exports` with a bundler's
 * rules, or with Node's own (`node16`). The checked file is inside the
 * package, which names itself, so `exports` decides what it imports.
 */
type Resolution = "bundler" | "node16";

/** The errors `tsc` reports for a file that imports the built entries as a project would. */
function diagnosticsOf(
  source: string,
  resolution: Resolution = "bundler",
): string[] {
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
          module: resolution === "bundler" ? "ESNext" : "Node16",
          moduleResolution: resolution === "bundler" ? "Bundler" : "Node16",
          jsx: "react-jsx",
          lib: ["ES2022", "DOM"],
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          types: ["react"],
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

describe("the element entry on its own", () => {
  const usage = `import "@mapcairn/sdk/browser/element";
const found = document.querySelector("mapcairn-map");
found?.addEventListener("mapcairn-click", (event) => event.detail.lat.toFixed());
export const zoom = found?.view?.zoom;
`;

  it.each(["bundler", "node16"] as const)(
    "types the tag through exports, resolved the %s way, with no other import",
    (resolution) => {
      expect(diagnosticsOf(usage, resolution)).toEqual([]);
    },
  );

  it.each(["bundler", "node16"] as const)(
    "gives the main entry the same types, resolved the %s way",
    (resolution) => {
      expect(diagnosticsOf(usage.replace("/element", ""), resolution)).toEqual(
        [],
      );
    },
  );
});

describe("what the build appends to the declarations", () => {
  const read = (file: string) => readFileSync(path.join(DIST, file), "utf8");
  const fromBlock = (text: string) =>
    text.slice(text.lastIndexOf("export { }"));

  it("is the tag name map, in the main entry and in the element's", () => {
    expect(fromBlock(read("browser.d.ts"))).toMatchInlineSnapshot(`
      "export { }

      declare global {
          interface HTMLElementTagNameMap {
              /** The map element: see {@link MapCairnMapElement}. */
              "mapcairn-map": MapCairnMapElement;
          }
      }
      "
    `);
    expect(read("browser-element.d.ts")).toMatchInlineSnapshot(`
      "export { }

      import type { MapCairnMapElement } from "./browser.js";
      declare global {
          interface HTMLElementTagNameMap {
              /** The map element: see {@link MapCairnMapElement}. */
              "mapcairn-map": MapCairnMapElement;
          }
      }
      "
    `);
  });

  it("is the JSX entry's augmentation of react, which names the element's types from the main entry", () => {
    expect(read("browserReactJsx.d.ts")).toMatchInlineSnapshot(`
      "/**
       * Lets TypeScript accept the \`mapcairn-map\` tag in JSX. A React project that
       * wants it adds one line in any file the project compiles:
       * \`import "@mapcairn/sdk/browser/react-jsx";\`. Load the element with
       * \`import "@mapcairn/sdk/browser/element";\` before the app renders, because
       * React sets an object as an attribute, which reads as text, on an element that
       * is not defined yet. Keep the objects you pass as \`services\`, \`layers\`,
       * \`basemaps\` and \`languages\` the same from one render to the next, because a
       * new one with other data draws the map again.
       * @packageDocumentation
       */

      export { }

      import type { MapCairnMapElement, MapCairnMapEventMap, MountMapOptions } from "./browser.js";
      declare module "react" {
          namespace JSX {
              interface IntrinsicElements {
                  "mapcairn-map": import("react").DetailedHTMLProps<import("react").HTMLAttributes<MapCairnMapElement>, MapCairnMapElement> & {
                      /** The attributes of the element, as JSX takes them: a number may be written as text. */
                      latitude?: number | string;
                      longitude?: number | string;
                      zoom?: number | string;
                      bearing?: number | string;
                      basemap?: string;
                      /** A theme choice: \`"light"\`, \`"dark"\` or \`"system"\`. */
                      theme?: MountMapOptions["theme"];
                      label?: string;
                      language?: string;
                      /** The tool names, separated by spaces. */
                      tools?: string;
                      /** The properties of the element, which React sets on it once it is defined. */
                      services?: MapCairnMapElement["services"];
                      basemaps?: MapCairnMapElement["basemaps"];
                      layers?: MapCairnMapElement["layers"];
                      languages?: MapCairnMapElement["languages"];
                      view?: MapCairnMapElement["view"];
                      /** The element's events: React listens for the event named after \`on\`. */
                      "onmapcairn-view-change"?: (event: MapCairnMapEventMap["mapcairn-view-change"]) => void;
                      "onmapcairn-click"?: (event: MapCairnMapEventMap["mapcairn-click"]) => void;
                      "onmapcairn-feature-tap"?: (event: MapCairnMapEventMap["mapcairn-feature-tap"]) => void;
                      "onmapcairn-error"?: (event: MapCairnMapEventMap["mapcairn-error"]) => void;
                  };
              }
          }
      }
      "
    `);
  });
});
