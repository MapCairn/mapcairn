// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { FakeClipboard } from "@mapcairn/core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loader as markdownLoader } from "../routes/index.md";
import { loader as llmsLoader } from "../routes/llms.txt";
import { loader as fullLoader } from "../routes/llms-full.txt";
import { meta } from "../routes/product";
import { ProductPage } from "./ProductPage";
import { INSTALL_COMMAND, NPM_ACTION } from "./productContent";

/*
 * The rules every text the product page publishes keeps: the page itself, its
 * structured data, `/index.md`, `/llms.txt` and `/llms-full.txt`. They link to
 * no issue, pull request or milestone and cite none by number, say nothing
 * about npm beyond `INSTALL_COMMAND` and the link to the package (`NPM_ACTION`),
 * never mention commercial terms, and hold no fact that is true only today (a percentage, a "coming soon"), so the page stays true as the
 * SDK changes.
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

/** A link into the repository past its front page: a README section, a folder or the contributing page. */
const REPOSITORY_DEEP_LINK =
  /github\.com\/MapCairn\/mapcairn(#(documentation|licence)\b|\/tree\/|\/contribute\b)/i;

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

  it("links into the repository no further than its front page", async () => {
    expect(await read()).not.toMatch(REPOSITORY_DEEP_LINK);
  });

  it("says nothing about npm beyond the install command and the link to the package, and nothing about commercial terms", async () => {
    const text = await read();
    expect(
      text
        .replaceAll(INSTALL_COMMAND, "")
        .replaceAll(NPM_ACTION.href, "")
        .replaceAll(NPM_ACTION.text, ""),
    ).not.toMatch(/npm/i);
    expect(text).not.toMatch(/commercial/i);
  });

  it("holds no fact that is true only for a while", async () => {
    expect(await read()).not.toMatch(VOLATILE);
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
    "https://github.com/MapCairn/mapcairn#documentation",
    "https://github.com/MapCairn/mapcairn#licence",
    "https://github.com/MapCairn/mapcairn/tree/main/examples/embed",
    "https://github.com/MapCairn/mapcairn/contribute",
  ])("refuses the deep link %s", (text) => {
    expect(text).toMatch(REPOSITORY_DEEP_LINK);
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
