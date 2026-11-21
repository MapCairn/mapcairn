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
  browserPolicy,
  STYLE_ORIGIN,
} from "../../../../scripts/release/browserLeg.mjs";
import { BASEMAPS, DEFAULT_BASEMAP_ID } from "../basemaps/basemaps";
import {
  fencedBlocks,
  headingAnchors,
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

/** The umbrella's subpath for the MapLibre adapter, which `examples/embed` leaves on the fakes. */
const ADAPTER_SUBPATH = "@mapcairn/sdk/adapter-maplibre";

/** The line that gives a Vite project the types of its `?worker&url` and CSS imports. */
const VITE_TYPES_LINE = '/// <reference types="vite/client" />';

/** The TypeScript compiler's entry file, from the repository's own install. */
const TSC = "node_modules/typescript/bin/tsc";

/**
 * Compiles a code block as an app outside the repository would, and returns
 * the compiler's error lines (none when it type-checks). The block sits in a
 * scratch folder whose `node_modules` is the repository's, so each `@mapcairn`
 * import resolves through the package's own `exports`, to the source behind
 * the `@mapcairn/source` condition. The scratch project declares nothing a
 * Vite app gets from `vite/client` (a `?worker&url` import, a plain CSS
 * import): the source brings it with its own `/// <reference types="vite/client" />`
 * line, as a user's file does, so a source without the line fails as it
 * would for a user.
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
    writeFileSync(path.join(scratch, "src", "snippet.tsx"), source);
    writeFileSync(
      path.join(scratch, "tsconfig.json"),
      JSON.stringify({
        extends: path.join(repo, "tsconfig.base.json"),
        compilerOptions: { noEmit: true, types: [], jsx: "react-jsx" },
        files: ["src/snippet.tsx"],
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

  it("imports only what examples/embed imports, from the same entry point, except the adapter the type-check covers", () => {
    const imports = namedImports(snippet);
    expect(imports.length).toBeGreaterThan(0);
    const missing = imports
      .filter(
        ({ specifier, imported }) =>
          specifier !== ADAPTER_SUBPATH &&
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
    expect(README.indexOf(install[0] ?? "")).toBeLessThan(
      README.indexOf(snippet),
    );
    expect(README).toContain("`maplibre-gl` is a required peer");
  });

  it("is one whole main.tsx: the Vite types line first, the umbrella only, and the real adapter with its worker URL", () => {
    expect(snippet.startsWith(`${VITE_TYPES_LINE}\n`)).toBe(true);
    expect(
      namedImports(snippet).every(
        ({ specifier }) =>
          !specifier.startsWith("@mapcairn/") ||
          specifier === "@mapcairn/sdk" ||
          specifier === ADAPTER_SUBPATH,
      ),
    ).toBe(true);
    expect(snippet).toContain("createMapLibreMapAdapter");
    expect(snippet).toContain("loadWorkerUrl");
    expect(snippet).toContain(
      "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url",
    );
    expect(snippet).toContain('document.getElementById("root")');
  });

  it("shows the page and its style sheet that main.tsx names, with a height and no margin", () => {
    const [html = ""] = fencedBlocks(README, "html");
    const [css = ""] = fencedBlocks(README, "css");
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('src="/src/main.tsx"');
    expect(html).toContain('name="viewport"');
    expect(snippet).toContain('import "./page.css";');
    expect(css).toMatch(/html,\s*body,\s*#root\s*{[^}]*height:\s*100%/);
    expect(css).toMatch(/html,\s*body,\s*#root\s*{[^}]*margin:\s*0/);
    expect(README.indexOf(html)).toBeLessThan(README.indexOf(snippet));
    expect(README.indexOf(css)).toBeLessThan(README.indexOf(snippet));
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
    "shows a main.tsx that type-checks as an outside app would write it, with its own Vite types line",
    () => {
      expect(typeCheckSnippet(REPO, snippet)).toEqual([]);
    },
    COMPILE_TIMEOUT_MS,
  );

  it(
    "fails the same main.tsx without the Vite types line, on the worker URL and the CSS import",
    () => {
      const errors = typeCheckSnippet(
        REPO,
        snippet.replace(`${VITE_TYPES_LINE}\n`, ""),
      ).join("\n");
      expect(errors).toContain("TS2307");
      expect(errors).toContain("TS2882");
    },
    COMPILE_TIMEOUT_MS,
  );

  it("says what the real map asks of a host: the other bundlers, the policy and the privacy default", () => {
    const section = README.slice(README.indexOf("## Embed a map"));
    expect(section).toContain("docs/guides/content-security-policy.md");
    expect(section).toContain("docs/guides/extending.md#show-a-real-map");
    expect(section).toMatch(/makes no request until/);
    expect(section).toContain("a similar app, not from this file");
    expect(section).not.toContain("not yet shipped");
  });

  it("leaves what is tested, and the bundlers and browsers tried, to the extending guide, which says them", () => {
    const guide = readFileSync(
      path.join(REPO, "docs/guides/extending.md"),
      "utf8",
    );
    const section = guide.slice(guide.indexOf("## Show a real map"));
    expect(section).toContain("`SDK packages` job");
    expect(section).toContain("other bundlers and browsers are not tried");
    expect(section).toContain("builds a similar app");
    expect(section).toContain("`MODULE_LEVEL_DIRECTIVE`");
    expect(section).toContain("https://tiles.openfreemap.org");
  });

  it("names the default basemap's origin, the directives it needs and the harmless build warning", () => {
    const section = README.slice(README.indexOf("## Embed a map"));
    const basemap = BASEMAPS.find(({ id }) => id === DEFAULT_BASEMAP_ID);
    expect(basemap?.source.kind).toBe("vector");
    const origin = new URL(
      basemap?.source.kind === "vector" ? basemap.source.styleUrl : "",
    ).origin;
    expect(section).toContain(`\`${origin}\``);
    expect(section).toContain("`connect-src`");
    expect(section).toContain("`img-src`");
    expect(section).toContain(`\`${VITE_TYPES_LINE}\``);
    expect(section).toContain("TS2307");
    expect(section).toContain("TS2882");
    expect(section).toContain("`MODULE_LEVEL_DIRECTIVE`");
    expect(section).toContain("search shows sample results");
    expect(section).toContain("The basemap catalogue's default");
  });

  it("gives one policy line whose directives are the ones the consumer check's browser leg runs under", () => {
    const [policy = ""] = fencedBlocks(README, "text");
    const basemap = BASEMAPS.find(({ id }) => id === DEFAULT_BASEMAP_ID);
    const origin = new URL(
      basemap?.source.kind === "vector" ? basemap.source.styleUrl : "",
    ).origin;
    const tested = browserPolicy().replaceAll(STYLE_ORIGIN, origin);
    const directives = policy.trim().split("; ");
    expect(directives).toContain(`img-src 'self' data: blob: ${origin}`);
    expect(directives).toContain(`connect-src 'self' ${origin}`);
    expect(directives).toContain("worker-src 'self' blob:");
    expect(directives.length).toBeGreaterThan(5);
    expect(
      directives.filter((directive) => !tested.split("; ").includes(directive)),
    ).toEqual([]);
  });

  it("imports the SDK's stylesheet, then the page's own, as examples/embed's main.tsx imports its two", () => {
    const stylesheets = [
      ...snippet.matchAll(/^import\s+"([^"]+\.css)";/gm),
    ].map((match) => match[1]);
    expect(stylesheets).toEqual(["@mapcairn/sdk/styles.css", "./page.css"]);
    const main = readFileSync(
      path.join(REPO, EXAMPLE_SOURCE, "main.tsx"),
      "utf8",
    );
    expect(main).toContain('import "./page.css";');
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
    expect(fits).toContain("to the people who use it");
  });

  it("names the licence AGPL-3.0-only as the manifests do, in the badge and in the other documents that state it", () => {
    expect(README).toContain("[![Licence: AGPL-3.0-only]");
    for (const doc of ["CONTRIBUTING.md", "GOVERNANCE.md"]) {
      const text = readFileSync(path.join(REPO, doc), "utf8");
      expect(
        text.replace("the AGPL-3.0 or another OSI-approved licence", ""),
        doc,
      ).not.toMatch(/AGPL-3\.0(?!-only)/);
    }
    const contributing = readFileSync(
      path.join(REPO, "CONTRIBUTING.md"),
      "utf8",
    );
    expect(contributing).toContain("(docs/guides/licence.md)");
    expect(contributing).not.toMatch(/may agree other licence terms/);
  });

  it("shows the install command under the intro, before the screenshot, with the requirements and a link to Embed a map beside it", () => {
    const intro = README.indexOf("This repository also holds the playground");
    const install = README.indexOf(
      "npm install @mapcairn/sdk@next react react-dom maplibre-gl",
    );
    const screenshot = README.indexOf("docs/images/playground-light.png");
    expect(intro).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(intro);
    expect(install).toBeLessThan(screenshot);
    const beside = README.slice(install, screenshot);
    for (const requirement of [
      "React 19",
      "`maplibre-gl` 6.18 or later",
      "Vite",
      "`bundler`, `node16` or `nodenext`",
      "(#embed-a-map)",
    ]) {
      expect(beside, requirement).toContain(requirement);
    }
  });

  it("names the requirements as the SDK's manifest and README state them", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(REPO, "packages/sdk/package.json"), "utf8"),
    ) as { readonly peerDependencies: Record<string, string> };
    expect(manifest.peerDependencies["react"]).toMatch(/^\^19\./);
    expect(manifest.peerDependencies["maplibre-gl"]).toBe("^6.18.0");
  });

  it("calls the repository checkout steps what they are, not a quick start", () => {
    expect(README).toContain("\n## Run the playground from source\n");
    expect(README).not.toMatch(/quick start/i);
  });

  it("links to headings of its own that exist", () => {
    const anchors = headingAnchors(README);
    const missing = [...README.matchAll(/\]\(#([^)\s]+)\)/g)]
      .map((match) => match[1] ?? "")
      .filter((anchor) => !anchors.includes(anchor));
    expect(missing).toEqual([]);
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
