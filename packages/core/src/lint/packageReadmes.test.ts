// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BUILT_SDK_PACKAGES,
  SDK_PACKAGES,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/sdkPackages.mjs";
import {
  fencedBlocks,
  headingAnchors,
  isUsedByExample,
  LICENCE_DUTY,
  namedImports,
  tagAttributes,
} from "./markdownSupport";

/**
 * Keeps the SDK package READMEs fit for the npm page, which shows each one
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

/** Where a link to a file of the repository must start. */
const REPOSITORY_FILES = "https://github.com/MapCairn/mapcairn/blob/main/";
/** The documentation site's guides, which the READMEs link by address. */
const DOCUMENTATION_GUIDES = "https://docs.mapcairn.com/guides/";
/** Where a link to a folder of the repository must start. */
const REPOSITORY_FOLDERS = "https://github.com/MapCairn/mapcairn/tree/main/";

/**
 * Files a README links to before they exist. Remove a name here when its file
 * lands, so the test then checks the link like any other.
 */
const NOT_YET_IN_THE_REPOSITORY: readonly string[] = [];

/** Where a person asks a question about the SDK. */
const DISCUSSIONS = "https://github.com/MapCairn/mapcairn/discussions";

/**
 * The links in a README that carry an anchor to a repository file or folder
 * whose target has no such heading. A folder stands for its README.
 */
function brokenAnchors(markdown: string): string[] {
  const broken: string[] = [];
  for (const target of linkTargets(markdown)) {
    const [url = "", anchor] = target.split("#");
    const prefix = [REPOSITORY_FILES, REPOSITORY_FOLDERS].find((start) =>
      url.startsWith(start),
    );
    if (anchor === undefined || prefix === undefined) {
      continue;
    }
    const found = path.join(REPO, url.slice(prefix.length));
    const file = statSync(found).isDirectory()
      ? path.join(found, "README.md")
      : found;
    if (!headingAnchors(readFileSync(file, "utf8")).includes(anchor)) {
      broken.push(target);
    }
  }
  return broken;
}

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

/**
 * Packages the example app does not use. It runs on the SDK's fakes with no
 * map engine, so a README that shows one of these cannot be held to what the
 * example imports.
 */
const NOT_USED_BY_THE_EXAMPLE = [
  "@mapcairn/adapter-maplibre",
  "@mapcairn/sdk/adapter-maplibre",
];

describe.each(BUILT_SDK_PACKAGES)("the README of @mapcairn/%s", (name) => {
  const readme = readmeOf(name);
  const packageName = `@mapcairn/${name}`;
  const exampleImports = exampleSources().flatMap(namedImports);

  it("is titled with the package name", () => {
    expect(readme.split("\n")[0]).toBe(`# \`${packageName}\``);
  });

  it("shows the npm version badge of this package and the GitHub Release badge under the title, each linking to its page", () => {
    const [, blank, npmBadge, releaseBadge, afterBadges] = readme.split("\n");
    expect(blank).toBe("");
    expect(npmBadge).toBe(
      `[![npm version](https://img.shields.io/npm/v/${packageName})](https://www.npmjs.com/package/${packageName})`,
    );
    expect(releaseBadge).toBe(
      "[![GitHub Release](https://img.shields.io/github/v/release/MapCairn/mapcairn)](https://github.com/MapCairn/mapcairn/releases)",
    );
    expect(afterBadges).toBe("");
  });

  it.skipIf(!SDK_PACKAGES.includes(name))(
    "installs the package with npm, pnpm and yarn, side by side",
    () => {
      const installs = fencedBlocks(readme, "bash").filter((block) =>
        block.includes(packageName),
      );
      expect(installs).toHaveLength(1);
      const lines = (installs[0] ?? "").trim().split("\n");
      expect(lines).toHaveLength(INSTALL_VERBS.length);
      INSTALL_VERBS.forEach((verb, index) => {
        expect(lines[index]).toMatch(
          new RegExp(
            `^${verb} ${packageName}(@next)?( (@mapcairn/[a-z-]+(@next)?|maplibre-gl|react|react-dom))*$`,
          ),
        );
      });
    },
  );

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
        ({ specifier }) =>
          !NOT_USED_BY_THE_EXAMPLE.some((unused) =>
            specifier.startsWith(unused),
          ),
      )
      .filter(
        ({ specifier, imported }) =>
          !isUsedByExample(exampleImports, specifier, imported),
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
          NOT_USED_BY_THE_EXAMPLE.some((unused) =>
            specifier.startsWith(unused),
          ) ||
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
    expect(targets).toContain(`${REPOSITORY_FILES}.github/CONTRIBUTING.md`);
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

  it("says where to ask a question and to report a security problem privately", () => {
    const section = readme.slice(readme.indexOf("## Contributing and changes"));
    const targets = linkTargets(section);
    expect(targets).toContain(DISCUSSIONS);
    expect(targets).toContain(`${REPOSITORY_FILES}.github/SECURITY.md`);
    expect(section).toMatch(/privately/);
    expect(section).toMatch(/not in an issue/);
  });

  it("says the licence allows commercial use, in the words every README shares, and links the plain guide", () => {
    const section = readme.slice(readme.indexOf("## Licence"));
    expect(section).toContain(
      "an open-source licence that allows commercial use",
    );
    expect(section).toContain(LICENCE_DUTY);
    expect(section).not.toMatch(/publish the corresponding source/);
    expect(linkTargets(section)).toContain(`${DOCUMENTATION_GUIDES}licence/`);
  });

  it("points every link with an anchor at a heading that exists, in a file or in a folder's README", () => {
    expect(brokenAnchors(readme)).toEqual([]);
  });

  it("keeps the history of how the package joined the release out of the Status line", () => {
    const status = readme
      .split("\n")
      .find((line) => line.startsWith("**Status:**"));
    expect(status).not.toMatch(/\bPlan \d{4}\b|from `?\d+\.\d+\.\d+-rc/);
  });
});

describe("the package.json descriptions npm search shows", () => {
  function descriptionOf(name: string): string {
    return (
      JSON.parse(
        readFileSync(path.join(REPO, "packages", name, "package.json"), "utf8"),
      ) as { readonly description: string }
    ).description;
  }

  it("name what each package is now, not what it was", () => {
    expect(descriptionOf("map")).toContain("accessible React map interface");
    expect(descriptionOf("theme")).toContain("no plugin needed");
    expect(descriptionOf("core")).toContain("no React, no browser globals");
  });

  it("leave out the stale wording", () => {
    for (const name of BUILT_SDK_PACKAGES as string[]) {
      expect(descriptionOf(name), name).not.toMatch(
        /Domain-agnostic|Generic map rendering|vanilla-extract/,
      );
    }
  });
});

describe("the Next steps list in the README of @mapcairn/sdk", () => {
  const readme = readmeOf("sdk");
  const section = readme.slice(readme.indexOf("## Next steps"));
  const targets = linkTargets(section.slice(0, section.indexOf("\n## ", 5)));

  it("links the guides, the playground and the whole-app example", () => {
    expect(readme).toContain("## Next steps");
    for (const wanted of [
      "docs.mapcairn.com/guides/extending/#show-a-real-map",
      "docs.mapcairn.com/guides/extending/#theme-the-sdk-with-your-own-colours",
      "docs.mapcairn.com/guides/translate-the-sdk/",
      "docs.mapcairn.com/guides/extending/#write-a-search-provider",
      "docs.mapcairn.com/guides/extending/#add-a-routing-provider",
      "docs.mapcairn.com/guides/extending/#add-a-data-layer",
      "docs.mapcairn.com/guides/content-security-policy/",
      "examples/embed",
    ]) {
      expect(
        targets.some((target) => target.endsWith(wanted)),
        wanted,
      ).toBe(true);
    }
    expect(targets).toContain("https://mapcairn.com/map");
  });
});

/** The stable Status text the release guide gives every README. */
function stableStatus(guide: string): string[] {
  return guide
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("**Status:** pre-1.0"));
}

/** The root README's form of the stable Status text: its links are relative. */
function rootStatus(status: string): string {
  return status.replaceAll(
    "https://github.com/MapCairn/mapcairn/blob/main/",
    "",
  );
}

describe("the release guide's steps for the stable version", () => {
  const guide = readFileSync(
    path.join(REPO, "docs/guides/releasing.md"),
    "utf8",
  );

  it("names the two test files whose install literals the Release pull request updated, and each holds its literal without `@next`", () => {
    for (const [file, literal] of [
      [
        "packages/core/src/lint/readme.test.ts",
        "npm install @mapcairn/sdk react react-dom maplibre-gl",
      ],
      [
        "packages/core/src/lint/packageReadmes.test.ts",
        "npm install @mapcairn/map @mapcairn/core @mapcairn/theme",
      ],
    ] as const) {
      expect(guide, file).toContain(file);
      expect(readFileSync(path.join(REPO, file), "utf8"), file).toContain(
        literal,
      );
    }
  });

  it.each([
    "README.md",
    ...(BUILT_SDK_PACKAGES as string[]).map(
      (name) => `packages/${name}/README.md`,
    ),
  ])(
    "gives %s the stable Status line while no version is a prerelease",
    (file) => {
      const versions = (BUILT_SDK_PACKAGES as string[]).map(
        (name) =>
          (
            JSON.parse(
              readFileSync(
                path.join(REPO, "packages", name, "package.json"),
                "utf8",
              ),
            ) as { readonly version: string }
          ).version,
      );
      const [status = ""] = stableStatus(guide);
      const expected = file === "README.md" ? rootStatus(status) : status;
      const actual = readFileSync(path.join(REPO, file), "utf8")
        .split("\n")
        .find((line) => line.startsWith("**Status:**"));
      if (versions.some(isPrerelease)) {
        expect(actual).not.toBe(expected);
      } else {
        expect(actual).toBe(expected);
      }
    },
  );

  it("holds one stable Status line that the Status rules accept once no version is a release candidate", () => {
    const [status = "", ...others] = stableStatus(guide);
    expect(others).toEqual([]);
    expect(status).toMatch(/^\*\*Status:\*\* /);
    expect(/release candidate/i.test(status)).toBe(false);
    expect(/not published to npm/i.test(status)).toBe(false);
    expect(status).toContain(`${DOCUMENTATION_GUIDES}public-api/`);
    expect(status).toContain(
      "https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md",
    );
  });

  it("leaves no release-candidate wording in the public API guide's sentence on the Status line", () => {
    const publicApi = readFileSync(
      path.join(REPO, "sites/docs/docs/guides/public-api.md"),
      "utf8",
    );
    expect(publicApi).not.toContain("the `0.1.0` release changes it");
    expect(publicApi).toContain("docs/guides/releasing.md");
  });

  it("leaves INSTALL_COMMAND to the follow-up", () => {
    expect(guide).toContain("INSTALL_COMMAND");
  });

  it("gives no example version in the Status text, and says a patch release is not meant to break", () => {
    const [status = ""] = stableStatus(guide);
    expect(status).not.toMatch(/0\.2\.0|0\.1\.1/);
    expect(status).toContain(
      "so a caret range takes patch releases but not the next minor release.",
    );
  });
});

describe("the licence guide", () => {
  const guide = readFileSync(
    path.join(REPO, "sites/docs/docs/guides/licence.md"),
    "utf8",
  );

  it("stays short and says what the duty reaches in the same words as the READMEs", () => {
    expect(guide.split("\n").length).toBeLessThan(90);
    expect(guide).toContain(
      "the corresponding source of the code you combine with the SDK and serve with it, under the same licence",
    );
    expect(LICENCE_DUTY).toContain(
      "the corresponding source of the code you combine with the SDK and serve with it, under the same licence",
    );
    expect(guide).not.toMatch(/whole (combined )?app/);
  });

  it("links only to files and headings that exist", () => {
    const targets = [...guide.matchAll(/\]\(([^)\s]+)\)/g)].map(
      (match) => match[1] ?? "",
    );
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      const [file = "", anchor] = target.split("#");
      const found = file.startsWith(REPOSITORY_FILES)
        ? path.join(REPO, file.slice(REPOSITORY_FILES.length))
        : path.join(REPO, "sites/docs/docs/guides", file);
      expect(existsSync(found), target).toBe(true);
      if (anchor !== undefined) {
        expect(headingAnchors(readFileSync(found, "utf8")), target).toContain(
          anchor,
        );
      }
    }
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

describe("the README of @mapcairn/sdk", () => {
  const readme = readmeOf("sdk");

  it("shows the one stylesheet import, ahead of the one import from the package", () => {
    const [block = ""] = codeBlocks(readme);
    expect(block.split("\n").slice(0, 2)).toEqual([
      'import "@mapcairn/sdk/styles.css";',
      expect.stringMatching(/^import \{ .* \} from "@mapcairn\/sdk";$/),
    ]);
  });

  it("shows the adapter's import from its subpath, and names the engine as a required peer", () => {
    expect(codeBlocks(readme).join("\n")).toContain(
      'import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";',
    );
    expect(readme).toContain("`maplibre-gl` (`^6.18.0`) is a required peer");
  });

  it("keeps Usage to one code block and a link to the whole app in Get started", () => {
    const usage = readme.slice(readme.indexOf("## Usage"));
    const section = usage.slice(0, usage.indexOf("\n## ", 5));
    expect(codeBlocks(section)).toHaveLength(1);
    expect(linkTargets(section)).toContain(
      "https://docs.mapcairn.com/get-started/",
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

describe("the README of @mapcairn/adapter-maplibre", () => {
  const readme = readmeOf("adapter-maplibre");

  it("shows the factory with its one required option, and the engine's worker as the host's to supply", () => {
    const code = codeBlocks(readme).join("\n");
    expect(code).toContain("createMapLibreMapAdapter");
    expect(code).toContain("loadWorkerUrl");
    expect(readme).toContain("maplibre-gl");
    expect(readme).toContain("peer dependency");
  });

  it("names the stylesheet an outside host imports once", () => {
    expect(readme).toContain("@mapcairn/adapter-maplibre/styles.css");
  });
});

/** The install lines in a Markdown text that still name the `next` tag. */
function installLinesWithNext(markdown: string): string[] {
  return markdown
    .split("\n")
    .filter((line) => /^(npm install|pnpm add|yarn add) .*@next\b/.test(line));
}

/** True when a version has a prerelease part, such as `0.1.0-rc.3`. */
function isPrerelease(version: string): boolean {
  return version.includes("-");
}

/**
 * The README files whose install lines still say `@next`, when any of the
 * versions has no prerelease part. Empty while every version is a prerelease.
 */
function readmesNeedingNextRemoved(
  versions: readonly string[],
  readmes: Readonly<Record<string, string>>,
): string[] {
  if (versions.every(isPrerelease)) {
    return [];
  }
  return Object.entries(readmes)
    .filter(([, text]) => installLinesWithNext(text).length > 0)
    .map(([file]) => file);
}

describe("the `@next` tag in install lines", () => {
  it("is found in a line that carries it, and not in one that does not", () => {
    expect(
      installLinesWithNext("npm install @mapcairn/sdk@next react\nnpm i x"),
    ).toEqual(["npm install @mapcairn/sdk@next react"]);
    expect(installLinesWithNext("npm install @mapcairn/sdk react")).toEqual([]);
  });

  it("is refused once a version has no prerelease part, and allowed before", () => {
    const readmes = { "README.md": "npm install @mapcairn/sdk@next\n" };
    expect(readmesNeedingNextRemoved(["0.1.0"], readmes)).toEqual([
      "README.md",
    ]);
    expect(readmesNeedingNextRemoved(["0.1.0-rc.3", "0.1.0"], readmes)).toEqual(
      ["README.md"],
    );
    expect(readmesNeedingNextRemoved(["0.1.0-rc.3"], readmes)).toEqual([]);
    expect(
      readmesNeedingNextRemoved(["0.1.0"], { "README.md": "npm install x\n" }),
    ).toEqual([]);
  });

  it("holds for the root README and every SDK package README at the current versions", () => {
    const versions = BUILT_SDK_PACKAGES.map(
      (name: string) =>
        (
          JSON.parse(
            readFileSync(
              path.join(REPO, "packages", name, "package.json"),
              "utf8",
            ),
          ) as { readonly version: string }
        ).version,
    );
    const readmes: Record<string, string> = {
      "README.md": readFileSync(path.join(REPO, "README.md"), "utf8"),
    };
    for (const name of BUILT_SDK_PACKAGES as string[]) {
      readmes[`packages/${name}/README.md`] = readmeOf(name);
    }
    expect(
      readmesNeedingNextRemoved(versions, readmes),
      "a package is released without a prerelease part: remove @next from these install lines",
    ).toEqual([]);
  });
});
