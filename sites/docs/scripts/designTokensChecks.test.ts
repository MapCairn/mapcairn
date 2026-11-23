// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { designTokensFindings } from "./designTokensChecks";

const roots: string[] = [];

const BLOCKS = 6;
const HTML = `${'<section class="dt-theme" data-theme="light"></section>'.repeat(BLOCKS / 2)}${'<section class="dt-theme" data-theme="dark"></section>'.repeat(BLOCKS / 2)}<td>Pass</td>`;
const COPY =
  "# Design tokens, visually\n\n#### Contrast of the pairs, light theme\n\n| Pair | Used as | Ratio | 4.5:1 | 3:1 |\n";

function site(html: string | null, copy: string | null): string {
  const root = mkdtempSync(join(tmpdir(), "mapcairn-design-tokens-"));
  roots.push(root);
  if (html !== null) {
    mkdirSync(join(root, "design", "visual-tokens"), { recursive: true });
    writeFileSync(join(root, "design", "visual-tokens", "index.html"), html);
  }
  if (copy !== null) {
    mkdirSync(join(root, "design"), { recursive: true });
    writeFileSync(join(root, "design", "visual-tokens.md"), copy);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("designTokensFindings", () => {
  it("passes a build with the page, both themes in its blocks and a copy that has the tables", () => {
    expect(designTokensFindings(site(HTML, COPY))).toEqual([]);
  });

  it("reports a page that was not built", () => {
    expect(designTokensFindings(site(null, COPY)).join("\n")).toContain(
      "design tokens page was not built",
    );
  });

  it("reports a page that lacks the dark blocks or the results of the contrast pairs", () => {
    const light = HTML.replaceAll('data-theme="dark"', 'data-theme="light"');
    expect(designTokensFindings(site(light, COPY)).join("\n")).toContain(
      "dark theme",
    );
    const bare = HTML.replace("<td>Pass</td>", "");
    expect(designTokensFindings(site(bare, COPY)).join("\n")).toContain("Pass");
  });

  it("reports a Markdown copy that is missing or leaves out the tables", () => {
    expect(designTokensFindings(site(HTML, null)).join("\n")).toContain(
      "visual-tokens.md",
    );
    const thin = COPY.replace("| Pair |", "");
    expect(designTokensFindings(site(HTML, thin)).join("\n")).toContain(
      "| Pair |",
    );
  });
});
