// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loader as markdownLoader } from "../routes/index.md";
import { loader as llmsLoader } from "../routes/llms.txt";
import { loader as fullLoader } from "../routes/llms-full.txt";
import { meta } from "../routes/product";
import { ProductPage } from "./ProductPage";

/*
 * The rules every text the product page publishes keeps: the page itself, its
 * structured data, `/index.md`, `/llms.txt` and `/llms-full.txt`. They link to
 * no issue, pull request or milestone and cite none by number, say nothing
 * about npm, never mention commercial terms, and hold no fact that is true
 * only today (a percentage, a "coming soon"), so the page stays true as the
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
  const { container } = render(<ProductPage />);
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

describe.each(SOURCES)("%s", (_name, read) => {
  it("links to no issue, pull request or milestone, and cites none by number", async () => {
    expect(await read()).not.toMatch(TRACKER);
  });

  it("says nothing about npm and nothing about commercial terms", async () => {
    const text = await read();
    expect(text).not.toMatch(/npm/i);
    expect(text).not.toMatch(/commercial/i);
  });

  it("holds no fact that is true only for a while", async () => {
    expect(await read()).not.toMatch(VOLATILE);
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
    "https://github.com/MapCairn/mapcairn#documentation",
    "&#39;",
    "https://github.com/MapCairn/mapcairn/contribute",
  ])("leaves %s alone", (text) => {
    expect(text).not.toMatch(TRACKER);
  });
});
