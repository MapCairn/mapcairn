// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  copyText,
  llmsFullTxt,
  llmsTxt,
  parseDocSource,
  robotsTxt,
} from "./markdownCopies";

const CONTEXT = {
  origin: "https://example.test",
  baseUrl: "/docs/",
  version: "9.9.9",
  title: "Example documentation",
  tagline: "Docs for the example",
};

const HOME = parseDocSource(
  "get-started",
  `---

title: Get started
description: Install it.
slug: /
---

# Get started

Version %sdkVersion%. See [the guide](./guides/x.md#part), [home](#top), [map](/map), [npm](https://npmjs.com/x) and [other](guides/y).

\`\`\`bash
npm install %sdkVersion%
\`\`\`

\`\`\`text
[not a link](./kept.md)
\`\`\`
`,
);
const GUIDE = parseDocSource(
  "guides/x",
  "---\ntitle: The guide\ndescription: A guide.\n---\n\n# The guide\n\nBody.\n",
);

describe("parseDocSource", () => {
  it("reads the title, description and permalink, and the body without front matter", () => {
    expect(HOME).toMatchObject({
      id: "get-started",
      title: "Get started",
      description: "Install it.",
      permalink: "/",
      copyPath: "index.md",
    });
    expect(HOME.body.startsWith("# Get started")).toBe(true);
    expect(GUIDE).toMatchObject({
      permalink: "/guides/x/",
      copyPath: "guides/x.md",
    });
  });

  it("resolves a relative slug against the page's folder and an absolute one from the root", () => {
    const relative = parseDocSource(
      "guides/a",
      "---\ntitle: A\ndescription: d\nslug: other\n---\n# A\n",
    );
    expect(relative.permalink).toBe("/guides/other/");
    const absolute = parseDocSource(
      "guides/a",
      "---\ntitle: A\ndescription: d\nslug: /top\n---\n# A\n",
    );
    expect(absolute.permalink).toBe("/top/");
  });

  it("gives a folder's index page the folder's address, as the framework serves it", () => {
    const source = "---\ntitle: T\ndescription: d\n---\n# T\n";
    expect(parseDocSource("api/core/index", source)).toMatchObject({
      permalink: "/api/core/",
      copyPath: "api/core.md",
    });
    expect(parseDocSource("api/index", source).permalink).toBe("/api/");
    expect(parseDocSource("api/core/reindex", source).permalink).toBe(
      "/api/core/reindex/",
    );
  });

  it("refuses a page with no title or description, which the llms.txt files need", () => {
    expect(() => parseDocSource("x", "# X\n")).toThrow(/title/);
    expect(() => parseDocSource("x", "---\ntitle: X\n---\n# X\n")).toThrow(
      /description/,
    );
  });
});

describe("copyText", () => {
  const text = copyText(HOME, [HOME, GUIDE], CONTEXT);

  it("resolves the version token and keeps the fenced code with its language", () => {
    expect(text).toContain("Version 9.9.9.");
    expect(text).toContain("```bash\nnpm install 9.9.9\n```");
    expect(text).not.toContain("%sdkVersion%");
  });

  it("turns every link into an absolute URL, pointing a page link at its Markdown copy", () => {
    expect(text).toContain("(https://example.test/docs/guides/x.md#part)");
    expect(text).toContain("(https://example.test/docs/index.md#top)");
    expect(text).toContain("(https://example.test/map)");
    expect(text).toContain("(https://npmjs.com/x)");
    expect(text).toContain("(https://example.test/docs/guides/y)");
  });

  it("leaves what is inside a fenced block as written", () => {
    expect(text).toContain("[not a link](./kept.md)");
  });

  it("fails on a link to a page that is not in the set", () => {
    expect(() => copyText(HOME, [HOME], CONTEXT)).toThrow(/guides\/x/);
  });
});

describe("the llms files and robots.txt", () => {
  it("llms.txt lists the pages in the order given, with their descriptions and copy links", () => {
    const text = llmsTxt([GUIDE, HOME], CONTEXT);
    expect(
      text.startsWith("# Example documentation\n\n> Docs for the example"),
    ).toBe(true);
    expect(text).toContain(
      "- [The guide](https://example.test/docs/guides/x.md): A guide.",
    );
    expect(text.indexOf("The guide")).toBeLessThan(text.indexOf("Get started"));
  });

  it("llms-full.txt holds the whole copy of every page in order", () => {
    const pages = [HOME, GUIDE];
    const full = llmsFullTxt(pages, CONTEXT);
    for (const page of pages) {
      expect(full).toContain(copyText(page, pages, CONTEXT).trim());
    }
    expect(full.indexOf("# Get started")).toBeLessThan(
      full.indexOf("# The guide"),
    );
  });

  it("robots.txt blocks nothing and names the sitemap", () => {
    const text = robotsTxt(CONTEXT);
    expect(text).toContain("User-agent: *\nAllow: /");
    expect(text).not.toMatch(/^Disallow:/m);
    expect(text).toContain("Sitemap: https://example.test/docs/sitemap.xml");
  });
});
