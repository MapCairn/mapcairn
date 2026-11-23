// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  areaOf,
  copyText,
  isListedInIndex,
  LLMS_FULL_CEILING,
  LLMS_INDEX_CEILING,
  llmsFullFiles,
  llmsFullIndexTxt,
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

describe("copyText decorative elements", () => {
  const page = parseDocSource(
    "swatches",
    [
      "---",
      "title: Swatches",
      "description: Swatches.",
      "---",
      "",
      '<div className="sample" aria-hidden="true">Text on surface</div>',
      "",
      "| Role | Value |",
      "| --- | --- |",
      '| <span className="chip" aria-hidden="true"></span> `text` | `oklch(0.2 0 0)` |',
      "",
      'A <b>visible</b> tag and <i aria-hidden="true">hidden</i> one stay or go.',
      "",
      "```html",
      '<div aria-hidden="true">kept in code</div>',
      "```",
      "",
    ].join("\n"),
  );

  it("leaves out an element marked aria-hidden, and a line that held only one, so the copy keeps the text the page gives", () => {
    const copy = copyText(page, [page], CONTEXT);
    expect(copy).not.toContain("Text on surface");
    expect(copy).toContain("| `text` | `oklch(0.2 0 0)` |");
    expect(copy).toContain("A <b>visible</b> tag and one stay or go.");
    expect(copy).not.toContain("<span");
  });

  it("keeps an aria-hidden element inside a code fence", () => {
    expect(copyText(page, [page], CONTEXT)).toContain(
      '<div aria-hidden="true">kept in code</div>',
    );
  });
});

describe("copyText layout tags", () => {
  it("drops lines that hold only HTML tags and the blank lines after them, and keeps tags in code", () => {
    const page = parseDocSource(
      "cards",
      [
        "---",
        "title: Cards",
        "description: Cards.",
        "---",
        "",
        "Intro.",
        "",
        '<div className="wrap">',
        "",
        "## Lane",
        "",
        '<progress value={1} max={2} aria-hidden="true"></progress>',
        "",
        "Text with <b>inline</b> tag.",
        "",
        "```html",
        "<div>kept</div>",
        "",
        "```",
        "",
        "</div>",
        "",
      ].join("\n"),
    );
    expect(copyText(page, [page], CONTEXT)).toBe(
      "Intro.\n\n## Lane\n\nText with <b>inline</b> tag.\n\n```html\n<div>kept</div>\n\n```\n",
    );
  });
});

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
  it("llms.txt lists the pages in the order given, with their descriptions, copy links and sizes", () => {
    const text = llmsTxt([GUIDE, HOME], CONTEXT);
    expect(
      text.startsWith("# Example documentation\n\n> Docs for the example"),
    ).toBe(true);
    const size = Buffer.byteLength(copyText(GUIDE, [GUIDE, HOME], CONTEXT));
    expect(text).toContain(
      `- [The guide](https://example.test/docs/guides/x.md): A guide. (${size} bytes)`,
    );
    expect(text.indexOf("- [The guide]")).toBeLessThan(
      text.indexOf("- [Get started]"),
    );
  });

  it("llms.txt lists each full-text file with its size and page count", () => {
    const pages = [HOME, GUIDE];
    const text = llmsTxt(pages, CONTEXT);
    const [file] = llmsFullFiles(pages, CONTEXT);
    expect(text).toContain(
      `- [llms-full-guides.txt](https://example.test/docs/llms-full-guides.txt): guides (Get started to The guide), 2 pages, ${file?.bytes} bytes`,
    );
  });

  it("llms-full.txt holds no page content and names each area file with its size", () => {
    const pages = [HOME, GUIDE];
    const [file] = llmsFullFiles(pages, CONTEXT);
    const text = llmsFullIndexTxt(pages, CONTEXT);
    expect(text).toContain("https://example.test/docs/llms.txt");
    expect(text).toContain(
      `- [llms-full-guides.txt](https://example.test/docs/llms-full-guides.txt): guides (Get started to The guide), 2 pages, ${file?.bytes} bytes`,
    );
    expect(text).not.toContain("npm install");
    expect(text).not.toContain("Body.");
  });

  it("robots.txt blocks nothing and names the sitemap", () => {
    const text = robotsTxt(CONTEXT);
    expect(text).toContain("User-agent: *\nAllow: /");
    expect(text).not.toMatch(/^Disallow:/m);
    expect(text).toContain("Sitemap: https://example.test/docs/sitemap.xml");
  });
});

/** A page of the given id whose body is `size` characters of one letter. */
function pageOf(id: string, size = 10): ReturnType<typeof parseDocSource> {
  return parseDocSource(
    id,
    `---\ntitle: ${id}\ndescription: About ${id}.\n---\n\n${"a".repeat(size)}\n`,
  );
}

describe("areaOf and isListedInIndex", () => {
  it("names the package, the generated document, the changelog or the guides", () => {
    expect(areaOf("api/core/ClipboardPort")).toBe("core");
    expect(areaOf("api/adapter-maplibre/index")).toBe("adapter-maplibre");
    expect(areaOf("api/index")).toBe("guides");
    expect(areaOf("generated/architecture")).toBe("architecture");
    expect(areaOf("generated/design")).toBe("design");
    expect(areaOf("generated/design/tokens")).toBe("design");
    expect(areaOf("generated/architecture/ports-part-2")).toBe("architecture");
    expect(areaOf("changelog/0.2.0")).toBe("changelog");
    expect(areaOf("tasks/add-a-layer")).toBe("guides");
    expect(areaOf("get-started")).toBe("guides");
  });

  it("lists every page but the members of the API reference", () => {
    expect(isListedInIndex("guides/embed-a-map")).toBe(true);
    expect(isListedInIndex("api/index")).toBe(true);
    expect(isListedInIndex("api/core/index")).toBe(true);
    expect(isListedInIndex("api/core/ClipboardPort")).toBe(false);
    expect(isListedInIndex("api/core/contracts/index")).toBe(false);
  });
});

describe("llmsFullFiles", () => {
  it("holds every page once, in order, in a file for its area", () => {
    const pages = [
      pageOf("get-started"),
      pageOf("api/core/index"),
      pageOf("api/map/index"),
      pageOf("api/core/A"),
      pageOf("generated/design"),
    ];
    const files = llmsFullFiles(pages, CONTEXT);
    expect(files.map((file) => file.name)).toEqual([
      "llms-full-guides.txt",
      "llms-full-core.txt",
      "llms-full-map.txt",
      "llms-full-design.txt",
    ]);
    expect(files.flatMap((file) => file.pages.map((page) => page.id))).toEqual([
      "get-started",
      "api/core/index",
      "api/core/A",
      "api/map/index",
      "generated/design",
    ]);
    const core = files[1];
    expect(core?.text).toContain("# Example documentation");
    expect(core?.text).toContain("The core pages of the documentation.");
    expect(core?.bytes).toBe(Buffer.byteLength(core?.text ?? ""));
  });

  it("splits an area that is over the ceiling into numbered files, none over it", () => {
    const pages = Array.from({ length: 12 }, (_, index) =>
      pageOf(`api/core/P${index}`, 400),
    );
    const files = llmsFullFiles(pages, CONTEXT, 2_000);
    expect(files.length).toBeGreaterThan(1);
    expect(files.map((file) => file.name)).toEqual(
      files.map((_, index) => `llms-full-core-${index + 1}.txt`),
    );
    for (const file of files) {
      expect(file.parts).toBe(files.length);
      expect(file.bytes).toBeLessThanOrEqual(2_000);
    }
    expect(files.flatMap((file) => file.pages)).toHaveLength(12);
  });

  it("gives a page larger than the ceiling a file of its own", () => {
    const pages = [pageOf("a", 10), pageOf("b", 5_000), pageOf("c", 10)];
    const files = llmsFullFiles(pages, CONTEXT, 2_000);
    expect(files.map((file) => file.pages.map((page) => page.id))).toEqual([
      ["a"],
      ["b"],
      ["c"],
    ]);
  });

  it("writes exactly the head, the copies joined by a rule, and one closing newline", () => {
    const pages = [GUIDE, HOME];
    const [file] = llmsFullFiles(pages, CONTEXT);
    const copies = pages.map((page) =>
      copyText(page, pages, CONTEXT).trimEnd(),
    );
    expect(file?.text).toBe(
      `# Example documentation\n\n> Docs for the example\n\nThe guides pages of the documentation. Every file and the size of each is listed in https://example.test/docs/llms.txt.\n\n${copies[0]}\n\n---\n\n${copies[1]}\n`,
    );
    expect(file?.pages.map((page) => page.id)).toEqual([
      "guides/x",
      "get-started",
    ]);
  });

  it("counts bytes, not characters, for a page with an em dash and Afrikaans letters", () => {
    const page = parseDocSource(
      "guides/af",
      "---\ntitle: Afrikaans\ndescription: Dit werk — ê en ë.\n---\n\nDie môre — ê ë ï.\n",
    );
    const [file] = llmsFullFiles([page], CONTEXT);
    expect(file?.text.length).toBeLessThan(Buffer.byteLength(file?.text ?? ""));
    expect(file?.bytes).toBe(Buffer.byteLength(file?.text ?? ""));
    const listed = Buffer.byteLength(copyText(page, [page], CONTEXT));
    expect(llmsTxt([page], CONTEXT)).toContain(`(${listed} bytes)`);
  });

  it("keeps a file whose size is exactly the ceiling whole and splits one byte over", () => {
    const pages = [pageOf("api/core/A", 300), pageOf("api/core/B", 300)];
    const [whole] = llmsFullFiles(pages, CONTEXT, Number.MAX_SAFE_INTEGER);
    const size = whole?.bytes ?? 0;
    expect(llmsFullFiles(pages, CONTEXT, size)).toHaveLength(1);
    expect(llmsFullFiles(pages, CONTEXT, size - 1)).toHaveLength(2);
  });

  it("puts every page in exactly one file and no file but a single page over the ceiling", () => {
    const pages = [
      ...Array.from({ length: 9 }, (_, index) =>
        pageOf(`api/core/P${index}`, 250 + index * 40),
      ),
      pageOf("api/core/Huge", 4_000),
      pageOf("get-started", 100),
    ];
    const files = llmsFullFiles(pages, CONTEXT, 1_500);
    const ids = files.flatMap((file) => file.pages.map((page) => page.id));
    expect([...ids].sort()).toEqual(pages.map((page) => page.id).sort());
    for (const file of files) {
      if (file.pages.length > 1) {
        expect(Buffer.byteLength(file.text)).toBeLessThanOrEqual(1_500);
      }
    }
    expect(files.some((file) => file.pages.length > 1)).toBe(true);
  });

  it("keeps the ceiling at a size a small context can read", () => {
    expect(LLMS_FULL_CEILING).toBe(150_000);
  });
});

describe("llms.txt size", () => {
  it("stays small however many API pages there are, and under the ceiling", () => {
    const pages = [
      pageOf("get-started"),
      pageOf("api/core/index"),
      ...Array.from({ length: 2_000 }, (_, index) =>
        pageOf(`api/core/E${index}`, 300),
      ),
    ];
    const text = llmsTxt(pages, CONTEXT);
    expect(text).not.toContain("api/core/E0.md");
    expect(text).toContain("api/core.md");
    expect(Buffer.byteLength(text)).toBeLessThan(LLMS_INDEX_CEILING);
  });
});
