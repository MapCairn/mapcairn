// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOCS_PATH, SITE_URL } from "../constants/siteConfig";
import {
  DISCUSSIONS_LINK,
  EXAMPLE_APP_LINK,
  INSTALL_OPTIONS,
  NPM_ACTION,
  RELEASE_NOTES_LINK,
  STATUS_LINE,
} from "../product/productContent";
import { productMarkdown } from "../product/productMarkdown";
import { routePaths } from "../routePaths";
import routes from "../routes";
import { loader } from "./llms.txt";
import { loader as fullLoader } from "./llms-full.txt";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const RAW_PREFIX = "https://raw.githubusercontent.com/MapCairn/mapcairn/main/";
const BLOB_PREFIX = "https://github.com/MapCairn/mapcairn/blob/main/";

/** Every Markdown link target in a text. */
function linkTargets(text: string): string[] {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1] ?? "");
}

/** The route paths the site serves, `""` for the index. */
const ROUTE_PATHS = new Set(routePaths(routes));

/** Checks a link points at a page the site serves or a file the repository has. */
function expectResolves(target: string): void {
  if (target.startsWith(`${SITE_URL}${DOCS_PATH}`)) {
    // The documentation site is a second Worker, built by `sites/docs`.
    const guide = target.match(/\/docs\/guides\/([\w-]+)(?:\.md|\/)$/)?.[1];
    if (guide !== undefined) {
      expect(
        existsSync(path.join(REPO_ROOT, `sites/docs/docs/guides/${guide}.md`)),
        target,
      ).toBe(true);
      return;
    }
    expect([
      `${SITE_URL}${DOCS_PATH}llms.txt`,
      `${SITE_URL}${DOCS_PATH}llms-full.txt`,
      `${SITE_URL}${DOCS_PATH}`,
    ]).toContain(target);
    return;
  }
  if (target.startsWith(`${SITE_URL}/`)) {
    const page = target.slice(SITE_URL.length + 1).split("#")[0] ?? "";
    expect(ROUTE_PATHS.has(page), target).toBe(true);
    return;
  }
  for (const prefix of [RAW_PREFIX, BLOB_PREFIX]) {
    if (target.startsWith(prefix)) {
      const file = target.slice(prefix.length).split("#")[0] ?? "";
      expect(existsSync(path.join(REPO_ROOT, file)), target).toBe(true);
      return;
    }
  }
  if (target === EXAMPLE_APP_LINK.href) {
    expect(existsSync(path.join(REPO_ROOT, "examples/embed")), target).toBe(
      true,
    );
    return;
  }
  // Pages on GitHub that are not files: the repository's own release and discussion pages.
  if (
    [NPM_ACTION.href, RELEASE_NOTES_LINK.href, DISCUSSIONS_LINK.href].includes(
      target,
    )
  ) {
    return;
  }
  expect(target, "a link outside the site and the repository").toMatch(
    /^https:\/\/github\.com\/MapCairn\/mapcairn$/,
  );
}

/** A text with the install commands and the link to the npm package taken out. */
function withoutNpmLink(text: string): string {
  return INSTALL_OPTIONS.reduce(
    (rest, { command }) => rest.replaceAll(command, ""),
    text,
  )
    .replaceAll(NPM_ACTION.href, "")
    .replaceAll(NPM_ACTION.text, "");
}

describe("/llms.txt", () => {
  it("is plain text in the llmstxt.org layout: an h1, a one-sentence summary, then sections of links", async () => {
    const response = loader();
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    const lines = text.split("\n");
    expect(lines[0]).toBe("# MapCairn");
    expect(lines[2]).toMatch(/^> MapCairn is an open-source SDK.*\.$/);
    // One sentence: no full stop inside it is followed by a space.
    expect(lines[2]).not.toMatch(/\. /);
    expect([...text.matchAll(/^## (.+)$/gm)].map((match) => match[1])).toEqual([
      "Product",
      "Playground",
      "Docs",
      "Policies and source",
      "Optional",
    ]);
  });

  it("puts the product first and the playground second", async () => {
    const text = await loader().text();
    expect(text.indexOf(`(${SITE_URL}/)`)).toBeLessThan(
      text.indexOf(`(${SITE_URL}/map)`),
    );
  });

  it("says what MapCairn is not and how to use it today, and leads with the install commands and says nothing else about npm but the link to the package", async () => {
    const text = await loader().text();
    expect(text).toContain(
      "It is not a hosted service, a dataset or a GIS analysis engine",
    );
    for (const { command } of INSTALL_OPTIONS) {
      expect(text).toContain(command);
    }
    expect(text).toContain("advanced option");
    expect(text).toContain(`[${NPM_ACTION.text}](${NPM_ACTION.href})`);
    expect(withoutNpmLink(text)).not.toMatch(/npm/i);
    expect(withoutNpmLink(await fullLoader().text())).not.toMatch(/npm/i);
  });

  it("links only to pages the site serves and files the repository has", async () => {
    const text = await loader().text();
    const targets = linkTargets(text);
    expect(targets.length).toBeGreaterThan(10);
    for (const target of targets) {
      expectResolves(target);
    }
  });

  it("links the documentation site, its llms.txt and its full text", async () => {
    const targets = linkTargets(await loader().text());
    expect(targets).toEqual(
      expect.arrayContaining([
        `${SITE_URL}${DOCS_PATH}`,
        `${SITE_URL}${DOCS_PATH}llms.txt`,
        `${SITE_URL}${DOCS_PATH}llms-full.txt`,
      ]),
    );
  });

  it("lists the licence guide, the public API guide and the changelog among the documents", async () => {
    const text = await loader().text();
    for (const guide of ["licence", "public-api"]) {
      expect(text).toContain(`(${SITE_URL}${DOCS_PATH}guides/${guide}.md)`);
    }
    expect(text).toContain(`(${RAW_PREFIX}CHANGELOG.md)`);
  });

  it("links the release notes, the security policy and Discussions, and says the licence allows commercial use and the SDK is before 1.0", async () => {
    const text = await loader().text();
    expect(linkTargets(text)).toEqual(
      expect.arrayContaining([
        RELEASE_NOTES_LINK.href,
        DISCUSSIONS_LINK.href,
        `${BLOB_PREFIX}SECURITY.md`,
      ]),
    );
    expect(text).toContain("The licence allows commercial use");
    expect(text).toContain(STATUS_LINE);
    expect(text).toContain(EXAMPLE_APP_LINK.href);
  });

  it("links to each target once", async () => {
    const targets = linkTargets(await loader().text());
    expect(new Set(targets).size).toBe(targets.length);
  });
});

describe("/llms-full.txt", () => {
  it("is /llms.txt followed by the product page's whole text", async () => {
    const response = fullLoader();
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    const summary = await loader().text();
    expect(text.startsWith(summary)).toBe(true);
    expect(text.endsWith(productMarkdown())).toBe(true);
  });

  it("links only to pages the site serves and files the repository has", async () => {
    for (const target of linkTargets(await fullLoader().text())) {
      expectResolves(target);
    }
  });
});
