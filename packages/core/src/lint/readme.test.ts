// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  fencedBlocks,
  isUsedByExample,
  namedImports,
  relativeLinks,
  tagAttributes,
} from "./markdownSupport";

/**
 * Keeps `README.md` true to the repository: its embedding example must use
 * only what `examples/embed` uses, imported from the same public entry
 * points (or from `@mapcairn/sdk`, which re-exports them), with the same
 * components and props, and every relative link must
 * name a file or directory that exists. `examples/embed` is type-checked and
 * built against the SDK's public entry points on every pull request, so an
 * import it makes is one an outside app can make. The README also names no
 * issue or pull request, so it stays true as they close.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const README = readFileSync(path.join(REPO, "README.md"), "utf8");
const EXAMPLE_SOURCE = "examples/embed/src";

/** The example's shipped source files, read as one list of texts. */
function exampleSources(): string[] {
  return readdirSync(path.join(REPO, EXAMPLE_SOURCE))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => readFileSync(path.join(REPO, EXAMPLE_SOURCE, file), "utf8"));
}

describe("README.md", () => {
  const snippets = fencedBlocks(README, "tsx");

  it("has one embedding example, in a tsx block", () => {
    expect(snippets).toHaveLength(1);
  });

  const snippet = snippets[0] ?? "";
  const examples = exampleSources();
  const exampleImports = examples.flatMap(namedImports);

  it("imports only what examples/embed imports, from the same entry point", () => {
    const imports = namedImports(snippet);
    expect(imports.length).toBeGreaterThan(0);
    const missing = imports
      .filter(
        ({ specifier, imported }) =>
          !isUsedByExample(exampleImports, specifier, imported),
      )
      .map(({ specifier, imported }) => `${imported} from ${specifier}`);
    expect(missing).toEqual([]);
  });

  it("shows the umbrella's install and import before the example, using only names the example imports", () => {
    const install = fencedBlocks(README, "bash").filter((block) =>
      block.includes("@mapcairn/sdk"),
    );
    expect(install).toEqual(["npm install @mapcairn/sdk@next\n"]);
    const [short = ""] = fencedBlocks(README, "ts");
    expect(README.indexOf(short)).toBeLessThan(README.indexOf(snippet));
    expect(
      [...short.matchAll(/^import\s+"([^"]+\.css)";/gm)].map((m) => m[1]),
    ).toEqual(["@mapcairn/sdk/styles.css"]);
    const imports = namedImports(short);
    expect(imports.length).toBeGreaterThan(0);
    expect(
      imports.filter(
        ({ specifier, imported }) =>
          specifier !== "@mapcairn/sdk" ||
          !isUsedByExample(exampleImports, specifier, imported),
      ),
    ).toEqual([]);
  });

  it("shows the real-map adapter from the umbrella's subpath after the example, as one short block", () => {
    const real = fencedBlocks(README, "ts").find((block) =>
      block.includes("@mapcairn/sdk/adapter-maplibre"),
    );
    expect(real).toBeDefined();
    expect(README.indexOf(real ?? "")).toBeGreaterThan(README.indexOf(snippet));
    expect(real).toContain("createMapLibreMapAdapter");
    expect(real).toContain("loadWorkerUrl");
    expect(
      namedImports(real ?? "").every(
        ({ specifier }) =>
          specifier === "@mapcairn/sdk" ||
          specifier === "@mapcairn/sdk/adapter-maplibre",
      ),
    ).toBe(true);
    expect(README).toContain("`maplibre-gl` is a required peer");
  });

  it("imports the stylesheets as examples/embed does, or the one that stands for both", () => {
    const stylesheets = [
      ...snippet.matchAll(/^import\s+"([^"]+\.css)";/gm),
    ].map((match) => match[1]);
    const main = readFileSync(
      path.join(REPO, EXAMPLE_SOURCE, "main.tsx"),
      "utf8",
    );
    const umbrella = ["@mapcairn/sdk/styles.css"];
    const packages = ["@mapcairn/theme/tokens.css", "@mapcairn/map/styles.css"];
    expect([umbrella, packages]).toContainEqual(stylesheets);
    if (stylesheets.join() === packages.join()) {
      for (const stylesheet of stylesheets) {
        expect(main).toContain(`import "${stylesheet}";`);
      }
    }
  });

  it("uses each SDK component with props the example also passes it", () => {
    const components = namedImports(snippet).filter(
      ({ specifier, local, typeOnly }) =>
        !typeOnly && specifier.startsWith("@mapcairn/") && /^[A-Z]/.test(local),
    );
    const unknown: string[] = [];
    for (const { local, imported } of components) {
      const known = new Set(
        examples.flatMap((source) =>
          tagAttributes(source, imported).flatMap((props) => [...props]),
        ),
      );
      const used = tagAttributes(snippet, local);
      expect(
        used.length,
        `<${local}> is imported but not used`,
      ).toBeGreaterThan(0);
      for (const prop of used.flatMap((props) => [...props])) {
        if (!known.has(prop)) {
          unknown.push(`<${local} ${prop}>`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("links only to files and directories that exist", () => {
    const links = relativeLinks(README);
    expect(links.length).toBeGreaterThan(0);
    const broken = links.filter(
      (target) => !existsSync(path.join(REPO, target)),
    );
    expect(broken).toEqual([]);
  });

  it("names no issue or pull request, so it stays true as they close", () => {
    const prose = README.replace(/^```[\s\S]*?^```/gm, "");
    const references = prose.match(
      /\/(?:issues|pull)\/\d+|(?<![\w/&])#\d+(?![\w-])/g,
    );
    expect(references).toBeNull();
  });
});
