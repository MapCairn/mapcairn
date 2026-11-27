// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error The lexer is dependency-free JavaScript with JSDoc types.
import { stripComments } from "../../../../scripts/harmony/lex.mjs";
// @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
import { SDK_PACKAGES } from "../../../../scripts/sdkPackages.mjs";

/**
 * How the SDK is built is not something an adopter has to understand, so no
 * text an adopter reads names it: that the interface is not in a shadow root,
 * how announcements are shared, that React is inside the browser bundle, or
 * where the code of a route lives. A page says what a person must do (serve
 * these files, give the map a height) and not why the SDK is built that way.
 *
 * The patterns name phrases, not words: React, bundlers, the live region and
 * the package names are all things an adopter does meet.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const REACT = "React(?:\\s+DOM)?(?:\\s+and\\s+React\\s+DOM)?";

/** What an adopter-facing text must not name, and the phrases that name it. */
const INTERNALS: Readonly<Record<string, readonly RegExp[]>> = {
  "the shadow DOM": [
    /\bshadow[\s-]*(?:DOM|root|tree)s?\b/i,
    /\b(?:open|closed)\s+shadow\b/i,
    /\battachShadow\b/,
    /\blight[\s-]+DOM\b/i,
  ],
  "the announcer": [
    /\bannouncers?\b/i,
    /\beach\s+(?:mount|mounted\s+map)\b[^.]*\b(?:live|status)\s+region\b/i,
  ],
  "the bundling of React": [
    new RegExp(
      `\\bbundl(?:e|es|ed|ing)\\s+(?:its\\s+own\\s+)?(?:copy\\s+of\\s+)?${REACT}\\b`,
      "i",
    ),
    new RegExp(
      `\\b${REACT}\\s+(?:is|are|comes?|gets?)\\s+(?:already\\s+)?(?:bundled(?!\\s+with\\s+your)|inlined|built\\s+in|inside|included\\s+in)\\b`,
      "i",
    ),
    new RegExp(
      `\\b(?:bundle|module|subpath|files?|stylesheet|element)\\s+(?:carries|carry|includes?|contains?|brings?|ships?(?:\\s+with)?|has|have)\\s+(?:its\\s+own\\s+)?(?:copy\\s+of\\s+)?${REACT}\\b`,
      "i",
    ),
    new RegExp(`\\bwith\\s+${REACT}\\s+(?:inside|built\\s+in|bundled)\\b`, "i"),
    // A copy of the SDK has a React context of its own, which is not React.
    /\b(?:its|their)\s+own\s+(?:copy\s+of\s+)?React\b(?!\s+(?:context|tree|root)\b)/i,
  ],
  "the package layout": [
    /\bpackages\/sdk\/src\b/,
    /\bsrc\/browser\b/,
    /@mapcairn\/browser\b/,
    /\b(?:holds|has|carries|contains)\s+no\s+code\s+of\s+its\s+own\b/i,
    /\b(?:browser\s+(?:bundle|route|code)|bundle)\s+(?:lives|is\s+placed|is\s+kept|sits)\s+(?:in|inside)\b/i,
    /\b(?:separate|own)\s+package\s+for\s+the\s+browser\b/i,
  ],
};

/** The internals a line of text names, each once. */
function internalsNamed(text: string): string[] {
  const flat = text.replace(/\s+/g, " ");
  return Object.entries(INTERNALS)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(flat)))
    .map(([name]) => name);
}

/**
 * What was true before `@mapcairn/sdk/browser` was built and is not now: that a
 * page without React has no bundle or mount function. The patterns name those
 * claims, not the words, so "there is no worker file to serve" passes.
 */
const DENIALS_OF_THE_BROWSER_ROUTE: readonly RegExp[] = [
  /\bno\s+pre-?built\s+(?:bundle|script)\b/i,
  /\bno\s+(?:`?mountMap`?|mount)\s+function\b/i,
  /\bused\s+a\s+mount\s+function,\s+because\b/i,
  /\bneeds\s+a\s+(?:small\s+)?React\s+island\b/i,
  /\bnext\s+is\b[^.]*\bmount\s+function\b/i,
  // The item as a list of what the SDK does not fit.
  /^a\s+pre-?built\s+bundle\s+for\s+pages\s+without\s+React;$/i,
  // An entry in a list of what the SDK is not the right choice for.
  /\bto\s+mount\s+it\s+in\s+a\s+page\s+without\s+React\b/i,
  // A table row that marks it missing or not started.
  /(?:mount\s+function|pre-?built\s+bundle)[^|]*\|(?:[^|]*\|)?\s*(?:lacks|proposed)\s*\|/i,
];

/**
 * The limitation that stays until a release carries the browser route: merging
 * deploys the site while the latest release has no `./browser`, so these three
 * places still say so to someone who installs it. Each phrase names the
 * releases it is true of, so a denial without them still fails, and each must
 * be there, so the release that ships the route removes the text and its entry
 * here together.
 */
const UNTIL_THE_ROUTE_IS_RELEASED: Readonly<Record<string, readonly string[]>> =
  {
    "README.md": [
      "to mount it in a page without React with `0.2.0` or an earlier release",
    ],
    "DESIGN.md": [
      "no prebuilt bundle for pages without React in 0.2.0 or earlier",
    ],
    "packages/web/src/product/productContent.ts": [
      "0.2.0 and earlier have no prebuilt bundle for pages without React",
    ],
  };

/** `text` without the limitation `file` may still state. */
function withoutAllowed(file: string, text: string): string {
  return (UNTIL_THE_ROUTE_IS_RELEASED[file] ?? []).reduce(
    (rest, phrase) => rest.replaceAll(phrase, ""),
    text,
  );
}

/** `file:line: denies the browser route` for each line of `text` that does. */
function denialsIn(file: string, text: string): string[] {
  return text
    .split("\n")
    .flatMap((line, index) =>
      DENIALS_OF_THE_BROWSER_ROUTE.some((pattern) => pattern.test(line.trim()))
        ? [`${file}:${index + 1}: denies the browser route`]
        : [],
    );
}

/** `file:line: names <internal>` for each line of `text` that names one. */
function findingsIn(file: string, text: string): string[] {
  return text
    .split("\n")
    .flatMap((line, index) =>
      internalsNamed(line).map((name) => `${file}:${index + 1}: names ${name}`),
    );
}

/** The text of every string and template literal of a source file, comments left out. */
function literalsOf(source: string): string {
  const code = (stripComments as (text: string) => string)(source);
  // Strings joined with `+` are one message, so they are read as one.
  const joined = code.replace(/(["'`])\s*\+\s*\1/g, "");
  return [...joined.matchAll(/(["'`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g)]
    .map((match) => match[2] ?? "")
    .join("\n");
}

/**
 * The files Git tracks or would track under the given paths. A new page is
 * read before it is committed, and generated, ignored pages never are (the
 * site builds some from `ARCHITECTURE.md` and `DESIGN.md`).
 */
function repositoryFiles(...paths: string[]): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...paths],
    { cwd: REPO, encoding: "utf8" },
  )
    .split("\n")
    .filter((file) => file !== "");
}

/**
 * Every page and README an adopter reads. Every page of the documentation site
 * is checked, with no exclusion, so a new page is covered without a change to
 * this test.
 */
function adopterPages(): string[] {
  const site = repositoryFiles("sites/docs/docs").filter((file) =>
    /\.mdx?$/.test(file),
  );
  const readmes = [
    "README.md",
    "examples/browser/README.md",
    ...(SDK_PACKAGES as readonly string[]).map(
      (name) => `packages/${name}/README.md`,
    ),
  ];
  return [...readmes, ...site];
}

/** The browser route's source, whose strings include its errors and warnings. */
function browserSources(): string[] {
  return repositoryFiles("packages/sdk/src/browser").filter(
    (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$|testSupport/.test(file),
  );
}

function read(file: string): string {
  return readFileSync(path.join(REPO, file), "utf8");
}

describe("the check for internals in adopter-facing text", () => {
  it.each([
    ["The interface is not in a shadow root.", "the shadow DOM"],
    ["The map uses no Shadow DOM.", "the shadow DOM"],
    ["It does not call `attachShadow`.", "the shadow DOM"],
    ["The interface sits in the light DOM.", "the shadow DOM"],
    ["Each map has its own announcer.", "the announcer"],
    ["Maps on one page share one announcer.", "the announcer"],
    ["Each mounted map has a live region of its own.", "the announcer"],
    ["React is bundled, so the page writes none.", "the bundling of React"],
    ["React and React DOM are inlined.", "the bundling of React"],
    ["The module bundles React.", "the bundling of React"],
    ["The bundle carries its own copy of React.", "the bundling of React"],
    ["One script with React inside.", "the bundling of React"],
    ["The map runs on its own React.", "the bundling of React"],
    ["See `packages/sdk/src/browser`.", "the package layout"],
    ["Install `@mapcairn/browser`.", "the package layout"],
    ["The umbrella holds no code of its own.", "the package layout"],
    ["The browser bundle lives inside the umbrella.", "the package layout"],
  ])("fails on %j", (text, internal) => {
    expect(internalsNamed(text)).toContain(internal);
  });

  it.each([
    "An app written in React.",
    "React and React DOM 19 are peer dependencies, and your app already has them.",
    "React is bundled with your app by your own bundler.",
    "The peers install but are never loaded.",
    "npm reports ERESOLVE against the React 19 peer.",
    "The maps share the page's one live region.",
    "`LiveRegionProvider` adds the live region, which `createAnnouncer` writes to.",
    "A page with no React and no build step draws a map.",
    "A bundler that handles CSS imports is needed.",
    "`@mapcairn/sdk/browser` draws a map; serve its files from your own site.",
    "The control casts a shadow on the map.",
    "Two copies each have their own React context.",
  ])("passes %j", (text) => {
    expect(internalsNamed(text)).toEqual([]);
  });

  it("names the file and the line", () => {
    expect(findingsIn("page.md", "Fine.\nNo shadow root.")).toEqual([
      "page.md:2: names the shadow DOM",
    ]);
  });

  it("reads the strings of a source file, joined ones as one, and not its comments or names", () => {
    const source = [
      "// There is no shadow root.",
      "/** One announcer for each mount. */",
      "const announcer = createAnnouncer();",
      'throw new MountMapError("a", "React is " + "bundled.");',
      "console.warn(`The ${name} has no shadow root.`);",
    ].join("\n");
    expect(findingsIn("a.ts", literalsOf(source))).toEqual([
      expect.stringContaining("the bundling of React"),
      expect.stringContaining("the shadow DOM"),
    ]);
  });
});

describe("the check for text that denies the browser route", () => {
  it.each([
    "There is no prebuilt bundle for pages without React yet.",
    "There is no prebuilt script with a mount function for pages without React either.",
    "There is no prebuilt bundle and no `mountMap` function for a page without React.",
    "No page used a mount function, because the issue is open.",
    "A host that does not use React needs a small React island of its own.",
    "Next is the other route, a framework-neutral mount function and a custom element.",
    "a prebuilt bundle for pages without React;",
    "- to mount it in a page without React, or to reach layers behind a login;",
    "| A script and stylesheet with a mount function for pages without React | lacks | none |",
    "| Embedding | A prebuilt bundle and custom element | proposed | none |",
  ])("fails on %j", (text) => {
    expect(denialsIn("page.md", text)).toEqual([
      "page.md:1: denies the browser route",
    ]);
  });

  it.each([
    "There is no worker file to serve.",
    "There is no directions tool.",
    "There is no classic script, only a module.",
    "`@mapcairn/sdk/browser` is a prebuilt bundle for pages without React.",
    "| A script and stylesheet with a mount function | has | `examples/browser` | none |",
    "The bundle has no mount point of its own.",
  ])("passes %j", (text) => {
    expect(denialsIn("page.md", text)).toEqual([]);
  });
});

describe("what an adopter reads", () => {
  it("includes the READMEs, every page of the documentation site and the browser route's source", () => {
    const pages = adopterPages();
    expect(pages).toContain("README.md");
    expect(pages).toContain("packages/sdk/README.md");
    expect(pages).toContain("sites/docs/docs/get-started.md");
    expect(pages).toContain("sites/docs/docs/guides/extending.md");
    expect(pages.some((page) => page.includes("/generated/"))).toBe(false);
    expect(browserSources()).toContain("packages/sdk/src/browser/mount.tsx");
  });

  it("names no internal of the SDK in a page or a README", () => {
    expect(
      adopterPages().flatMap((file) => findingsIn(file, read(file))),
    ).toEqual([]);
  });

  it("does not say the browser route is missing, in a page, the product page's copy, the design system or the roadmap", () => {
    const product = "packages/web/src/product/productContent.ts";
    expect(
      [...adopterPages(), "DESIGN.md", "ROADMAP.md"]
        .flatMap((file) => denialsIn(file, withoutAllowed(file, read(file))))
        .concat(
          denialsIn(
            product,
            withoutAllowed(product, literalsOf(read(product))),
          ),
        ),
    ).toEqual([]);
  });

  it("still states the limitation of the latest release where it is allowed to", () => {
    for (const [file, phrases] of Object.entries(UNTIL_THE_ROUTE_IS_RELEASED)) {
      const text = file.endsWith(".ts") ? literalsOf(read(file)) : read(file);
      for (const phrase of phrases) {
        expect(text, file).toContain(phrase);
      }
    }
  });

  it("names no internal of the SDK in an error or a warning of the browser route", () => {
    expect(
      browserSources().flatMap((file) =>
        findingsIn(file, literalsOf(read(file))),
      ),
    ).toEqual([]);
  });
});
