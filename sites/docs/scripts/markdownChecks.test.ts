// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeMarkdownFiles } from "../plugins/markdownCopiesPlugin";
import { markdownFindings } from "./markdownChecks";
import { type CopyContext, parseDocSource } from "./markdownCopies";

const CONTEXT: CopyContext = {
  origin: "https://example.test",
  baseUrl: "/docs/",
  version: "1.2.3",
  title: "Example",
  tagline: "Tagline",
};

const PAGES = [
  parseDocSource(
    "one",
    "---\ntitle: One\ndescription: First.\nslug: /\n---\n# One\n\n```bash\nls\n```\n",
  ),
  parseDocSource(
    "guides/two",
    "---\ntitle: Two\ndescription: Second.\n---\n# Two\n\nSee [one](../one.md).\n",
  ),
];

const roots: string[] = [];

/** A built folder with a page for each document, then the files the plugin writes. */
function built(write = true): string {
  const root = mkdtempSync(join(tmpdir(), "mapcairn-md-"));
  roots.push(root);
  writeFileSync(join(root, "sitemap.xml"), "<urlset></urlset>");
  for (const page of PAGES) {
    const dir = join(root, page.permalink);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "index.html"),
      "<html><head></head><body></body></html>",
    );
  }
  if (write) {
    writeMarkdownFiles(root, PAGES, CONTEXT);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("markdownFindings", () => {
  it("passes a build whose pages each have a copy, a head link and a place in llms-full.txt", () => {
    expect(markdownFindings(built(), PAGES, CONTEXT)).toEqual([]);
  });

  it("names a page with no Markdown copy, no head link and no place in the llms files", () => {
    const findings = markdownFindings(built(false), PAGES, CONTEXT).join("\n");
    expect(findings).toContain('"guides/two" has no Markdown copy');
    expect(findings).toContain("llms-full.txt");
    expect(findings).toContain("llms.txt");
    expect(findings).toContain("alternate");
    expect(findings).toContain("robots.txt");
  });

  it("names a copy with a code fence that has no language, a relative link or hidden tabs", () => {
    const root = built();
    writeFileSync(
      join(root, "guides", "two.md"),
      "# Two\n\n```\nx\n```\n\n[a](./b.md)\n\n<Tabs>\n",
    );
    const findings = markdownFindings(root, PAGES, CONTEXT).join("\n");
    expect(findings).toContain("code fence with no language");
    expect(findings).toContain("relative link");
    expect(findings).toContain("tabs");
  });

  it("names a robots.txt that blocks a crawler", () => {
    const root = built();
    writeFileSync(
      join(root, "robots.txt"),
      "User-agent: GPTBot\nDisallow: /\n",
    );
    expect(markdownFindings(root, PAGES, CONTEXT).join("\n")).toContain(
      "robots.txt",
    );
  });
});
