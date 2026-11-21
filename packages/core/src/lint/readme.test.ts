// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  fencedBlocks,
  isUsedByExample,
  LICENCE_DUTY,
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

/** The TypeScript compiler's entry file, from the repository's own install. */
const TSC = "node_modules/typescript/bin/tsc";

/**
 * Compiles a code block as an app outside the repository would, and returns
 * the compiler's error lines (none when it type-checks). The block sits in a
 * scratch folder whose `node_modules` is the repository's, so each `@mapcairn`
 * import resolves through the package's own `exports`, to the source behind
 * the `@mapcairn/source` condition. The scratch folder declares what a Vite
 * app gets from `vite/client`: a `?worker&url` import and a plain CSS import.
 *
 * @param repo Absolute path of the repository root.
 * @param source The TypeScript to compile, as one module.
 */
function typeCheckSnippet(repo: string, source: string): string[] {
  const scratch = mkdtempSync(path.join(tmpdir(), "mapcairn-snippet-"));
  try {
    symlinkSync(
      path.join(repo, "node_modules"),
      path.join(scratch, "node_modules"),
      "junction",
    );
    mkdirSync(path.join(scratch, "src"));
    writeFileSync(path.join(scratch, "src", "snippet.ts"), source);
    writeFileSync(
      path.join(scratch, "src", "env.d.ts"),
      'declare module "*?worker&url" {\n  const url: string;\n  export default url;\n}\ndeclare module "*.css";\n',
    );
    writeFileSync(
      path.join(scratch, "tsconfig.json"),
      JSON.stringify({
        extends: path.join(repo, "tsconfig.base.json"),
        compilerOptions: { noEmit: true, types: [], jsx: "react-jsx" },
        files: ["src/snippet.ts", "src/env.d.ts"],
      }),
    );
    try {
      execFileSync(process.execPath, [path.join(repo, TSC), "-p", scratch], {
        encoding: "utf8",
        stdio: "pipe",
      });
      return [];
    } catch (error) {
      const { stdout } = error as { readonly stdout: string };
      return stdout.split("\n").filter((line) => line.trim() !== "");
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Each compile reads the whole SDK source and the engine's types, which can pass vitest's 5 s default on a loaded machine. */
const COMPILE_TIMEOUT_MS = 60_000;

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
    expect(install).toEqual([
      "npm install @mapcairn/sdk@next react react-dom maplibre-gl\n",
    ]);
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

  it("shows the real-map adapter from the umbrella's subpath before the whole-app example, as one short block", () => {
    const real = fencedBlocks(README, "ts").find((block) =>
      block.includes("@mapcairn/sdk/adapter-maplibre"),
    );
    expect(real).toBeDefined();
    expect(README.indexOf(real ?? "")).toBeLessThan(README.indexOf(snippet));
    expect(real).toContain("createMapLibreMapAdapter");
    expect(real).toContain("loadWorkerUrl");
    expect(
      namedImports(real ?? "").every(
        ({ specifier }) =>
          specifier === "@mapcairn/sdk" ||
          specifier === "@mapcairn/sdk/adapter-maplibre",
      ),
    ).toBe(true);
    expect(real).toContain(
      "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url",
    );
    expect(README).toContain("`maplibre-gl` is a required peer");
  });

  it(
    "type-checks a snippet the way an outside app would, and reports a wrong option",
    () => {
      expect(
        typeCheckSnippet(
          REPO,
          'import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";\nexport const adapter = createMapLibreMapAdapter({ workerUrl: "/w.mjs" });\n',
        ).join("\n"),
      ).toContain("workerUrl");
    },
    COMPILE_TIMEOUT_MS,
  );

  it(
    "shows a real-map block that type-checks as an outside app would write it",
    () => {
      const real = fencedBlocks(README, "ts").find((block) =>
        block.includes("@mapcairn/sdk/adapter-maplibre"),
      );
      expect(typeCheckSnippet(REPO, real ?? "")).toEqual([]);
    },
    COMPILE_TIMEOUT_MS,
  );

  it("says what the real map asks of a host: the other bundlers, the policy and the privacy default", () => {
    const section = README.slice(README.indexOf("## Embed a map"));
    expect(section).toContain("docs/guides/content-security-policy.md");
    expect(section).toContain("docs/guides/extending.md#show-a-real-map");
    expect(section).toMatch(/makes no request until/);
    expect(section).toContain("`SDK packages` job");
    expect(section).toContain(
      "other bundlers and browsers have not been tried",
    );
    expect(section).not.toContain("not yet shipped");
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

  it("does not list a host's own colours as missing, and says what is still missing", () => {
    expect(README).not.toContain("your own colours and font with contrast");
    expect(README).toContain(
      "your own font, or colours beyond the 14 interface roles",
    );
  });

  it("describes the licence as allowing commercial use and offering the source, not publishing it", () => {
    const section = README.slice(README.indexOf("\n## Licence"));
    expect(section).toContain("AGPL-3.0-only");
    expect(section).toContain(
      "an open-source licence that allows commercial use",
    );
    expect(section).toContain(LICENCE_DUTY);
    expect(section).not.toMatch(/publish the corresponding source/);
    expect(section).toContain("(docs/guides/licence.md)");
    const start = README.indexOf("## When MapCairn fits");
    const fits = README.slice(start, README.indexOf("\n## ", start + 1));
    expect(fits).not.toMatch(/can publish its source/);
  });

  it("names the licence AGPL-3.0-only as the manifests do, in the badge and in the other documents that state it", () => {
    expect(README).toContain("[![Licence: AGPL-3.0-only]");
    for (const doc of ["CONTRIBUTING.md", "GOVERNANCE.md"]) {
      const text = readFileSync(path.join(REPO, doc), "utf8");
      expect(text, doc).not.toMatch(/AGPL-3\.0(?!-only)/);
    }
    const contributing = readFileSync(
      path.join(REPO, "CONTRIBUTING.md"),
      "utf8",
    );
    expect(contributing).toContain("(docs/guides/licence.md)");
    expect(contributing).not.toMatch(/may agree other licence terms/);
  });

  it("says where to ask a question and where to report a problem", () => {
    const section = README.slice(
      README.indexOf("## Contributing, security and conduct"),
    );
    expect(section).toContain(
      "https://github.com/MapCairn/mapcairn/discussions",
    );
    expect(section).toContain("https://github.com/MapCairn/mapcairn/issues");
    expect(section).toContain("SECURITY.md");
  });

  it("names no issue or pull request, so it stays true as they close", () => {
    const prose = README.replace(/^```[\s\S]*?^```/gm, "");
    const references = prose.match(
      /\/(?:issues|pull)\/\d+|(?<![\w/&])#\d+(?![\w-])/g,
    );
    expect(references).toBeNull();
  });
});
