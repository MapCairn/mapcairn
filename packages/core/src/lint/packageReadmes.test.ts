// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fencedBlocks, namedImports, tagAttributes } from "./markdownSupport";

/**
 * Keeps the four package READMEs fit for the npm page, which shows each one
 * on its own, away from the repository. They install the package with npm,
 * pnpm and yarn side by side, hold one Status line that matches the
 * manifest (unpublished while private, a release candidate for an `-rc`
 * version), show code that only uses what `examples/embed` uses, say the package is ESM
 * only, link to the licence, the contribution guide and the changelog, and
 * link to the repository only by absolute URL, because a relative link means
 * nothing on npm.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const EXAMPLE_SOURCE = "examples/embed/src";
const SDK_PACKAGES = ["core", "map", "react", "theme"] as const;

/** Where a link to a file of the repository must start. */
const REPOSITORY_FILES = "https://github.com/MapCairn/mapcairn/blob/main/";
/** Where a link to a folder of the repository must start. */
const REPOSITORY_FOLDERS = "https://github.com/MapCairn/mapcairn/tree/main/";

/**
 * Files a README links to before they exist. Remove a name here when its file
 * lands, so the test then checks the link like any other.
 */
const NOT_YET_IN_THE_REPOSITORY: readonly string[] = [];

/** The install line each package shows, for one package manager. */
const INSTALL_VERBS = ["npm install", "pnpm add", "yarn add"] as const;

function readmeOf(name: string): string {
  return readFileSync(path.join(REPO, "packages", name, "README.md"), "utf8");
}

/** The shipped source of `examples/embed`, as one text for each file. */
function exampleSources(): string[] {
  return readdirSync(path.join(REPO, EXAMPLE_SOURCE))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => readFileSync(path.join(REPO, EXAMPLE_SOURCE, file), "utf8"));
}

/** Every link target in a Markdown text: inline links and definitions. */
function linkTargets(markdown: string): string[] {
  const prose = markdown.replace(/^```[\s\S]*?^```/gm, "");
  const inline = [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const definitions = [...prose.matchAll(/^\[[^\]]+\]:\s+(\S+)/gm)].map(
    (m) => m[1],
  );
  return [...inline, ...definitions].map((target) => target ?? "");
}

/** The code blocks of a README that hold TypeScript. */
function codeBlocks(markdown: string): string[] {
  return [...fencedBlocks(markdown, "tsx"), ...fencedBlocks(markdown, "ts")];
}

describe.each(SDK_PACKAGES)("the README of @mapcairn/%s", (name) => {
  const readme = readmeOf(name);
  const packageName = `@mapcairn/${name}`;
  const exampleImports = exampleSources().flatMap(namedImports);

  it("is titled with the package name", () => {
    expect(readme.split("\n")[0]).toBe(`# \`${packageName}\``);
  });

  it("installs the package with npm, pnpm and yarn, side by side", () => {
    const installs = fencedBlocks(readme, "bash").filter((block) =>
      block.includes(packageName),
    );
    expect(installs).toHaveLength(1);
    const lines = (installs[0] ?? "").trim().split("\n");
    expect(lines).toHaveLength(INSTALL_VERBS.length);
    INSTALL_VERBS.forEach((verb, index) => {
      expect(lines[index]).toMatch(
        new RegExp(
          `^${verb} ${packageName}(@next)?( @mapcairn/[a-z]+(@next)?)*$`,
        ),
      );
    });
  });

  it("has one Status line", () => {
    const lines = readme
      .split("\n")
      .filter((line) => line.startsWith("**Status:**"));
    expect(lines).toHaveLength(1);
  });

  it("calls the release a candidate in the Status line while the version is a release candidate", () => {
    const status = readme
      .split("\n")
      .find((line) => line.startsWith("**Status:**"));
    const manifest = JSON.parse(
      readFileSync(path.join(REPO, "packages", name, "package.json"), "utf8"),
    ) as { readonly version: string };
    expect(/release candidate/i.test(status ?? "")).toBe(
      /-rc\.\d+$/.test(manifest.version),
    );
  });

  it("says in the Status line that it is unpublished only while the manifest is private", () => {
    const status = readme
      .split("\n")
      .find((line) => line.startsWith("**Status:**"));
    const manifest = JSON.parse(
      readFileSync(path.join(REPO, "packages", name, "package.json"), "utf8"),
    ) as { readonly private?: boolean };
    expect(
      /not published to npm/i.test(status ?? ""),
      'change the Status line and "private" together',
    ).toBe(manifest.private === true);
  });

  it("says it is ESM only and which TypeScript resolution it needs", () => {
    expect(readme).toContain("The package is ESM only: it has no `main` field");
    expect(readme).toContain("node16");
    expect(readme).toContain("nodenext");
    expect(readme).toContain("bundler");
  });

  it("shows code that only imports what examples/embed imports", () => {
    const blocks = codeBlocks(readme);
    expect(blocks.length).toBeGreaterThan(0);
    const unknown = blocks
      .flatMap(namedImports)
      .filter(({ specifier }) => specifier.startsWith("@mapcairn/"))
      .filter(
        ({ specifier, imported }) =>
          !exampleImports.some(
            (known) =>
              known.specifier === specifier && known.imported === imported,
          ),
      )
      .map(({ specifier, imported }) => `${imported} from ${specifier}`);
    expect(unknown).toEqual([]);
  });

  it("passes only props that examples/embed also passes", () => {
    const examples = exampleSources();
    const unknown: string[] = [];
    for (const block of codeBlocks(readme)) {
      for (const { imported, local, specifier, typeOnly } of namedImports(
        block,
      )) {
        if (
          typeOnly ||
          !specifier.startsWith("@mapcairn/") ||
          !/^[A-Z]/.test(local)
        ) {
          continue;
        }
        const known = new Set(
          examples.flatMap((source) =>
            tagAttributes(source, imported).flatMap((props) => [...props]),
          ),
        );
        for (const props of tagAttributes(block, local)) {
          for (const prop of props) {
            if (!known.has(prop)) {
              unknown.push(`<${local} ${prop}>`);
            }
          }
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("links to the licence text, the contribution guide and the changelog", () => {
    const targets = linkTargets(readme);
    expect(readme).toContain("AGPL-3.0-only");
    expect(targets).toContain(`${REPOSITORY_FILES}packages/${name}/LICENSE`);
    expect(targets).toContain(`${REPOSITORY_FILES}CONTRIBUTING.md`);
    expect(targets).toContain(`${REPOSITORY_FILES}CHANGELOG.md`);
  });

  it("links by absolute URL, to files and folders that exist", () => {
    const broken: string[] = [];
    for (const target of linkTargets(readme)) {
      if (!/^(https:\/\/|mailto:)/.test(target)) {
        broken.push(`${target}: not an absolute link`);
        continue;
      }
      const prefix = [REPOSITORY_FILES, REPOSITORY_FOLDERS].find((start) =>
        target.startsWith(start),
      );
      if (prefix === undefined) {
        continue;
      }
      const file = target.slice(prefix.length).split("#")[0] ?? "";
      if (
        !NOT_YET_IN_THE_REPOSITORY.includes(file) &&
        !existsSync(path.join(REPO, file))
      ) {
        broken.push(`${target}: no such path in the repository`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("names no issue or pull request, so it stays true as they close", () => {
    const prose = readme.replace(/^```[\s\S]*?^```/gm, "");
    expect(
      prose.match(/\/(?:issues|pull)\/\d+|(?<![\w/&])#\d+(?![\w-])/g),
    ).toBeNull();
  });
});

describe("the files a README may link to before they exist", () => {
  it("lists only files that are still missing", () => {
    expect(
      NOT_YET_IN_THE_REPOSITORY.filter((file) =>
        existsSync(path.join(REPO, file)),
      ),
    ).toEqual([]);
  });
});

describe("the stylesheet imports in the README of @mapcairn/map and @mapcairn/theme", () => {
  /** The stylesheets a README's code imports, in order. */
  function stylesheetsOf(name: string): (string | undefined)[] {
    return codeBlocks(readmeOf(name)).flatMap((block) =>
      [...block.matchAll(/^import\s+"([^"]+\.css)";/gm)].map(
        (match) => match[1],
      ),
    );
  }

  it("map shows both, tokens first", () => {
    expect(stylesheetsOf("map").slice(0, 2)).toEqual([
      "@mapcairn/theme/tokens.css",
      "@mapcairn/map/styles.css",
    ]);
  });

  it("theme shows its own, and no stylesheet of a package it does not install", () => {
    expect(new Set(stylesheetsOf("theme"))).toEqual(
      new Set(["@mapcairn/theme/tokens.css"]),
    );
  });
});

describe("the README of @mapcairn/map", () => {
  const readme = readmeOf("map");

  it("installs core and theme beside it, because the examples import them", () => {
    expect(readme).toContain(
      "npm install @mapcairn/map @mapcairn/core @mapcairn/theme",
    );
  });

  it("shows how to load the map in a chunk of its own", () => {
    const heading = readme
      .split("\n")
      .find((line) => /^## .*chunk/i.test(line));
    expect(heading).toBeDefined();
    const code = codeBlocks(readme).join("\n");
    expect(code).toMatch(/\blazy\(\s*\(\)\s*=>\s*import\(/);
    expect(code).toContain("<Suspense");
  });
});
