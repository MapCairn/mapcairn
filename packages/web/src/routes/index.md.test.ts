// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { SITE_URL } from "../constants/siteConfig";
import {
  EMBED_EXCERPT,
  HEADLINE,
  lineToText,
  SECTIONS,
} from "../product/productContent";
import { loader } from "./index.md";

describe("/index.md, the product page as Markdown", () => {
  it("is Markdown, with the page's h1 first", async () => {
    const response = loader();
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    const text = await response.text();
    expect(text.startsWith(`# ${HEADLINE}\n`)).toBe(true);
  });

  it("has every section the page has, in the same order, with its text", async () => {
    const text = await loader().text();
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual(SECTIONS.map((section) => section.heading));
    for (const section of SECTIONS) {
      for (const block of section.blocks) {
        if (block.kind === "paragraph") {
          for (const run of block.text) {
            expect(text).toContain(lineToText([run]));
          }
        }
      }
    }
  });

  it("carries the page's excerpt of the embedding example as a code block under its name, and not the whole app", async () => {
    const text = await loader().text();
    expect(text).toContain(
      `\`src/main.tsx, an excerpt\`:\n\n\`\`\`tsx\n${EMBED_EXCERPT}\n\`\`\``,
    );
    expect(text).not.toContain("createRoot(root)");
  });

  it("makes every link on the site absolute", async () => {
    const text = await loader().text();
    expect(text).not.toMatch(/\]\(\//);
    expect(text).toContain(`](${SITE_URL}/map)`);
    expect(text).toContain(`](${SITE_URL}/privacy)`);
  });
});
