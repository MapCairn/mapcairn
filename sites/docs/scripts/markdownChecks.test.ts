// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeMarkdownFiles } from "../plugins/markdownCopiesPlugin";
import { markdownFindings, PART_COPY_ALLOWANCE } from "./markdownChecks";
import {
  type CopyContext,
  copyUrl,
  LLMS_INDEX_CEILING,
  parseDocSource,
} from "./markdownCopies";
import { PART_CEILING } from "./repositoryDocParts";

const CONTEXT: CopyContext = {
  origin: "https://example.test",
  baseUrl: "/docs/",
  version: "1.2.3",
  title: "Example",
  tagline: "Tagline",
};

const PAGES = [
  parseDocSource(
    "guides/af",
    "---\ntitle: Afrikaans\ndescription: Dit werk — ê en ë.\n---\n# Môre — ê ë\n",
  ),
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
  it("passes a build whose pages each have a copy, a head link and a place in an llms-full file", () => {
    expect(markdownFindings(built(), PAGES, CONTEXT)).toEqual([]);
  });

  it("lists the size of each copy as the written file has it, multibyte text included", () => {
    const root = built();
    const index = readFileSync(join(root, "llms.txt"), "utf8");
    for (const page of PAGES) {
      const { size } = statSync(join(root, page.copyPath));
      expect(index).toContain(
        `(${copyUrl(page, CONTEXT)}): ${page.description} (${size} bytes)`,
      );
    }
  });

  it("names a page with no Markdown copy, no head link and no place in the llms files", () => {
    const findings = markdownFindings(built(false), PAGES, CONTEXT).join("\n");
    expect(findings).toContain('"guides/two" has no Markdown copy');
    expect(findings).toContain("llms-full-guides.txt was not built");
    expect(findings).toContain("llms.txt was not built");
    expect(findings).toContain("llms-full.txt was not built");
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

  it("names an llms file that is not what the pages give", () => {
    const root = built();
    writeFileSync(join(root, "llms-full-guides.txt"), "stale");
    expect(markdownFindings(root, PAGES, CONTEXT)).toEqual([
      "llms-full-guides.txt is not what the pages give, in sidebar order.",
    ]);
  });

  it("names an llms.txt over the size ceiling", () => {
    const root = mkdtempSync(join(tmpdir(), "mapcairn-md-"));
    roots.push(root);
    const pages = Array.from({ length: 800 }, (_, index) =>
      parseDocSource(
        `guides/p${index}`,
        `---\ntitle: P${index}\ndescription: ${"d".repeat(200)}\n---\n# P\n`,
      ),
    );
    expect(markdownFindings(root, pages, CONTEXT)).toContain(
      `llms.txt is over ${LLMS_INDEX_CEILING} bytes.`,
    );
  });

  it("names the copy of a part of a repository document over the part ceiling, and no other page", () => {
    const root = mkdtempSync(join(tmpdir(), "mapcairn-md-"));
    roots.push(root);
    const text = (title: string): string =>
      `---\ntitle: ${title}\ndescription: Long.\n---\n\n${"a".repeat(PART_CEILING + PART_COPY_ALLOWANCE)}\n`;
    const pages = [
      parseDocSource("generated/design", text("Overview")),
      parseDocSource("generated/design/big", text("Big")),
      parseDocSource("guides/long", text("Long")),
    ];
    for (const page of pages) {
      mkdirSync(join(root, page.permalink), { recursive: true });
      writeFileSync(
        join(root, page.permalink, "index.html"),
        "<html><head></head><body></body></html>",
      );
    }
    writeMarkdownFiles(root, pages, CONTEXT);
    const findings = markdownFindings(root, pages, CONTEXT).filter((finding) =>
      finding.includes("most a part"),
    );
    expect(findings).toEqual([
      `generated/design/big.md is over ${PART_CEILING + PART_COPY_ALLOWANCE} bytes, the most a part of a repository document holds.`,
    ]);
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
