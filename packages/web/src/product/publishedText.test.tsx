// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { FakeClipboard } from "@mapcairn/core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loader as markdownLoader } from "../routes/index.md";
import { loader as llmsLoader } from "../routes/llms.txt";
import { loader as fullLoader } from "../routes/llms-full.txt";
import { meta } from "../routes/product";
import { EMBED_EXAMPLE_FILES } from "./embedExampleFiles";
import { ProductPage } from "./ProductPage";
import {
  CAPABILITY_MATRIX_LINK,
  EXAMPLE_APP_LINK,
  INSTALL_OPTIONS,
  NPM_ACTION,
  REPOSITORY_PAGES,
} from "./productContent";

/*
 * The rules every text the product page publishes keeps: the page itself, its
 * structured data, `/index.md`, `/llms.txt` and `/llms-full.txt`. They link to
 * no issue, pull request or milestone and cite none by number, say nothing
 * about npm beyond the install commands (and the package managers' names that choose them) and the link to the package (`NPM_ACTION`),
 * say nothing about commercial terms beyond the phrase "allows commercial use" (what the licence allows, in the READMEs' own words),
 * link into the repository no further than its front page and the named set below, and hold no fact that is true only today (a
 * percentage, a "coming soon"), so the page stays true as the SDK changes.
 */

/** An issue, pull request or milestone on GitHub, or a `#123` reference. */
const TRACKER =
  /github\.com\/[\w.-]+\/[\w.-]+\/(issues|pull|pulls|milestones?)\b|(^|[^\w&/=.])#\d+\b/i;

/** Wording that is true only for a while. */
const VOLATILE =
  /\b(coming soon|in progress|not yet|soon|planned|currently)\b|\d+\s*(percent|%)/i;

/** Everything the rendered page says and links to, as one text. */
function pageText(): string {
  const { container } = render(<ProductPage clipboard={new FakeClipboard()} />);
  // The install block's choices are the package managers' names, npm among them.
  const managers = INSTALL_OPTIONS.map(({ manager }) => manager);
  for (const choice of container.querySelectorAll("fieldset label")) {
    if (managers.includes(choice.textContent ?? "")) {
      choice.remove();
    }
  }
  const hrefs = [...container.querySelectorAll("a")].map(
    (link) => link.getAttribute("href") ?? "",
  );
  return [container.textContent ?? "", ...hrefs].join("\n");
}

/** The product page's structured data, as text. */
function structuredData(): string {
  return JSON.stringify(
    (meta({} as never) ?? []).filter((tag) => "script:ld+json" in tag),
  );
}

const SOURCES: ReadonlyArray<readonly [string, () => Promise<string>]> = [
  ["the page", async () => pageText()],
  ["its structured data", async () => structuredData()],
  ["/index.md", () => markdownLoader().text()],
  ["/llms.txt", () => llmsLoader().text()],
  ["/llms-full.txt", () => fullLoader().text()],
];

/** The one phrase about commercial terms the page may use: what the licence allows. */
const COMMERCIAL_PHRASE = "allows commercial use";

/** Every link into the repository, front page or deeper, as written in a text. */
const REPOSITORY_LINK =
  /(?:https?:\/\/)?(?:www\.)?github\.com\/MapCairn\/mapcairn[^\s)"'\]\\<>]*/gi;

/** The repository's front page. */
const FRONT_PAGE = "https://github.com/MapCairn/mapcairn";

/** A link as compared: with its scheme, no `www.`, no trailing punctuation and in lower case. */
function normalised(link: string): string {
  const bare = link.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "");
  return `https://${bare.replace(/[.,;:]+$/, "")}`.toLowerCase();
}

/**
 * The pages of the repository the page may link, each for the reason an adopter
 * needs it next. The footer lists the first five; the example app is named in
 * the answer on how to use the SDK. Nothing else past the front page: no issue,
 * pull request, milestone, README section or contributing page.
 */
const ALLOWED_PAGES: ReadonlyArray<readonly [string, string]> = [
  [
    "https://github.com/MapCairn/mapcairn#documentation",
    "the documentation: the README's index of the guides",
  ],
  [
    "https://github.com/MapCairn/mapcairn/blob/main/docs/guides/capability-matrix.md",
    "the capability matrix: what the SDK has and lacks, which the production answer links",
  ],
  [
    "https://github.com/MapCairn/mapcairn/releases",
    "the release notes: what changed and what to change on upgrade",
  ],
  [
    "https://github.com/MapCairn/mapcairn/blob/main/docs/guides/licence.md",
    "the licence guide: what the AGPL-3.0 means for an adopter's project",
  ],
  [
    "https://github.com/MapCairn/mapcairn/blob/main/SECURITY.md",
    "the security policy: how to report a vulnerability",
  ],
  [
    "https://github.com/MapCairn/mapcairn/discussions",
    "Discussions: where questions are asked in public",
  ],
  [
    "https://github.com/MapCairn/mapcairn/tree/main/examples/embed",
    "the example app the answer on how to use the SDK names",
  ],
];

/** The links a text makes into the repository that are neither its front page nor in the named set. */
function unlistedRepositoryLinks(text: string): string[] {
  const allowed = new Set(
    [FRONT_PAGE, ...ALLOWED_PAGES.map(([url]) => url)].map(normalised),
  );
  return (text.match(REPOSITORY_LINK) ?? []).filter(
    (url) => !allowed.has(normalised(url)),
  );
}

/** How many times a text links the repository's front page. */
function frontPageLinks(text: string): number {
  return (
    text.match(/https:\/\/github\.com\/MapCairn\/mapcairn(?![\w/#.-])/g)
      ?.length ?? 0
  );
}

describe.each(SOURCES)("%s", (_name, read) => {
  it("links to no issue, pull request or milestone, and cites none by number", async () => {
    expect(await read()).not.toMatch(TRACKER);
  });

  it("links into the repository no further than its front page and the named set of pages", async () => {
    expect(unlistedRepositoryLinks(await read())).toEqual([]);
  });

  it("says nothing about npm beyond the install command and the link to the package, and nothing about commercial terms beyond what the licence allows", async () => {
    const text = await read();
    expect(
      INSTALL_OPTIONS.reduce(
        (rest, { command }) => rest.replaceAll(command, ""),
        text,
      )
        .replaceAll(NPM_ACTION.href, "")
        .replaceAll(NPM_ACTION.text, ""),
    ).not.toMatch(/npm/i);
    expect(text.replaceAll(COMMERCIAL_PHRASE, "")).not.toMatch(/commercial/i);
  });

  it("holds no fact that is true only for a while", async () => {
    // The example's code is not a statement about today: `height: 100%` is CSS.
    const prose = EMBED_EXAMPLE_FILES.reduce(
      (text, { code }) => text.replaceAll(code, ""),
      await read(),
    );
    expect(prose).not.toMatch(VOLATILE);
  });
});

describe("links to the repository's front page", () => {
  it.each([
    ["the page: the hero's button and the footer's Source code", pageText, 2],
    ["/index.md: the hero's button", () => markdownLoader().text(), 1],
    ["/llms.txt: Source code", () => llmsLoader().text(), 1],
    [
      "/llms-full.txt: its own Source code and the page's button",
      () => fullLoader().text(),
      2,
    ],
  ] as const)("%s", async (_name, read, count) => {
    expect(frontPageLinks(await read())).toBe(count);
  });

  it("counts a front-page link but not a raw file or a deeper page", () => {
    expect(
      frontPageLinks(
        "[a](https://github.com/MapCairn/mapcairn) https://github.com/MapCairn/mapcairn/tree/main https://raw.githubusercontent.com/MapCairn/mapcairn/main/README.md",
      ),
    ).toBe(1);
  });

  it.each([
    "https://github.com/MapCairn/mapcairn#licence",
    "github.com/MapCairn/mapcairn/issues/1",
    "http://www.github.com/MapCairn/mapcairn/pull/2",
    "HTTPS://GITHUB.COM/MAPCAIRN/MAPCAIRN/Blob/main/README.md",
    "https://github.com/MapCairn/mapcairn/tree/main/src",
    "https://github.com/MapCairn/mapcairn/contribute",
    "https://github.com/MapCairn/mapcairn/blob/main/README.md",
  ])("refuses the deep link %s", (text) => {
    expect(unlistedRepositoryLinks(`[a](${text})`)).toEqual([text]);
  });

  it("reads an allowed link with its trailing punctuation, in any case or scheme, as the allowed link", () => {
    expect(
      unlistedRepositoryLinks(
        "See HTTP://www.GitHub.com/mapcairn/mapcairn/discussions. And github.com/MapCairn/mapcairn,",
      ),
    ).toEqual([]);
  });

  it.each(ALLOWED_PAGES)("allows %s, for a reason: %s", (url) => {
    expect(unlistedRepositoryLinks(`[a](${url}) ${url}`)).toEqual([]);
  });

  it("keeps the allowed set equal to the pages the content links", () => {
    expect(
      [...REPOSITORY_PAGES, CAPABILITY_MATRIX_LINK, EXAMPLE_APP_LINK]
        .map((link) => link.href)
        .sort(),
    ).toEqual(ALLOWED_PAGES.map(([url]) => url).sort());
  });
});

describe("the tracker pattern", () => {
  it.each([
    "https://github.com/MapCairn/mapcairn/issues/1",
    "https://github.com/MapCairn/mapcairn/issues",
    "https://github.com/MapCairn/mapcairn/pull/314",
    "https://github.com/MapCairn/mapcairn/milestones",
    "see #44 for that",
    "(#231)",
  ])("catches %s", (text) => {
    expect(text).toMatch(TRACKER);
  });

  it.each([
    "/map#map=11.00/-33.92000/18.42000",
    "https://github.com/MapCairn/mapcairn",
    "&#39;",
  ])("leaves %s alone", (text) => {
    expect(text).not.toMatch(TRACKER);
  });
});
