// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import config from "../docusaurus.config";
import { writeMarkdownFiles } from "../plugins/markdownCopiesPlugin";
import { BASE_URL, SITE_ORIGIN } from "../src/siteConfig";
import { inlineScriptHashes } from "./builtSite";
import { MACHINE_DATA_SCHEMA_VERSION } from "./machineData";
import { parseDocSource } from "./markdownCopies";
import { PRIORITY_NOT_SCHEDULE } from "./roadmapPage";
import { SDK_VERSION } from "./sdkVersion";
import { buildHeadersFile } from "./securityHeaders";
import { TARGETED_CLASSES } from "./targetedClasses";
import {
  API_PAGE_ALLOWANCE_BYTES,
  SCRIPT_BUDGET_BYTES,
  scriptBudgetFor,
  verifyBuild,
} from "./verifyBuild";

const roots: string[] = [];

/** Markup that carries every framework class the stylesheet targets. */
const TARGETS = `<div class="${TARGETED_CLASSES.join(" ")}"></div>`;

/** What the fixtures treat as the expected inline scripts. */
const ONE = {
  name: "one",
  hash: inlineScriptHashes("<script>one()</script>")[0] ?? "",
};

/** The context the build check reads the site's names and addresses from. */
const CONTEXT = {
  origin: SITE_ORIGIN,
  baseUrl: BASE_URL,
  version: SDK_VERSION,
  title: config.title ?? "",
  tagline: config.tagline ?? "",
};

/** Writes a small built site: the pages, any files, and the `_headers` its inline scripts need. */
function builtSite(
  pages: string,
  files: Record<string, string | Buffer> = {},
): string {
  const root = mkdtempSync(join(tmpdir(), "mapcairn-verify-"));
  roots.push(root);
  writeFileSync(join(root, "index.html"), `${TARGETS}${pages}`);
  writeFileSync(join(root, "_headers"), buildHeadersFile([ONE.hash]));
  writeFileSync(
    join(root, "search-index.json"),
    JSON.stringify([{ id: "/docs/" }]),
  );
  writeFileSync(join(root, "sitemap.xml"), "<urlset></urlset>");
  writeMarkdownFiles(root, [], CONTEXT);
  writeFileSync(
    join(root, "pages.json"),
    JSON.stringify({
      schemaVersion: MACHINE_DATA_SCHEMA_VERSION,
      pages: [{ url: `${SITE_ORIGIN}${BASE_URL}` }],
    }),
  );
  writeFileSync(
    join(root, "api.json"),
    JSON.stringify({
      schemaVersion: MACHINE_DATA_SCHEMA_VERSION,
      entries: [{ name: "go" }],
    }),
  );
  mkdirSync(join(root, "roadmap"));
  writeFileSync(
    join(root, "roadmap", "index.html"),
    `${PRIORITY_NOT_SCHEDULE}${'<section class="roadmap__lane"></section>'.repeat(3)}`,
  );
  writeFileSync(
    join(root, "roadmap.md"),
    `${PRIORITY_NOT_SCHEDULE}\n## Now\n## Next\n## Later\n`,
  );
  mkdirSync(join(root, "design", "visual-tokens"), { recursive: true });
  writeFileSync(
    join(root, "design", "visual-tokens", "index.html"),
    `<section class="dt-theme" data-theme="light"></section><section class="dt-theme" data-theme="dark"></section>Pass`,
  );
  writeFileSync(
    join(root, "design", "visual-tokens.md"),
    "#### Contrast of the pairs, light theme\n\n| Pair | Used as | Ratio | 4.5:1 | 3:1 |\n",
  );
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("verifyBuild", () => {
  it("passes a site whose links, scripts and styles the policy allows", () => {
    const root = builtSite(
      '<a href="/map">m</a><a href="/docs/">home</a><script>one()</script>',
    );
    expect(verifyBuild(root, [ONE], [])).toEqual([]);
  });

  it("reports a broken link, a style attribute and a resource from another origin", () => {
    const root = builtSite(
      '<a href="/docs/missing/">x</a><p style="color:red">y</p><script src="https://cdn.example/a.js"></script><script>one()</script>',
    );
    const findings = verifyBuild(root, [ONE], []).join("\n");
    expect(findings).toContain("/docs/missing/");
    expect(findings).toContain("style attribute");
    expect(findings).toContain("https://cdn.example/a.js");
  });

  it("fails on an inline script that is not on the committed list, even though the page carries it", () => {
    const root = builtSite("<script>one()</script><script>two()</script>");
    const findings = verifyBuild(root, [ONE], []).join("\n");
    expect(findings).toContain("not in expectedInlineScripts.ts");
  });

  it("fails when an expected inline script is no longer in any page", () => {
    const root = builtSite("<p>none</p>");
    expect(verifyBuild(root, [ONE], []).join("\n")).toContain(
      'expected inline script "one"',
    );
  });

  it("fails when a framework class the stylesheet targets is gone", () => {
    const root = builtSite("<script>one()</script>");
    writeFileSync(join(root, "index.html"), "<script>one()</script>");
    expect(verifyBuild(root, [ONE], []).join("\n")).toContain(
      `framework class "${TARGETED_CLASSES[0]}"`,
    );
  });

  it("fails when the search index is missing or holds nothing", () => {
    const missing = builtSite("<script>one()</script>");
    rmSync(join(missing, "search-index.json"));
    expect(verifyBuild(missing, [ONE], []).join("\n")).toContain(
      "search-index.json",
    );
    const empty = builtSite("<script>one()</script>", {
      "search-index.json": "[]",
    });
    expect(verifyBuild(empty, [ONE], []).join("\n")).toContain(
      "search-index.json",
    );
  });

  it("reports a roadmap page that was not built", () => {
    const root = builtSite("<script>one()</script>");
    rmSync(join(root, "roadmap"), { recursive: true });
    expect(verifyBuild(root, [ONE], []).join("\n")).toContain(
      "roadmap page was not built",
    );
  });

  it("reports a visual design page that was not built", () => {
    const root = builtSite("<script>one()</script>");
    rmSync(join(root, "design"), { recursive: true });
    expect(verifyBuild(root, [ONE], []).join("\n")).toContain(
      "design tokens page was not built",
    );
  });

  it("reports a page that has no Markdown copy", () => {
    const root = builtSite("<script>one()</script>");
    const page = parseDocSource(
      "extra",
      "---\ntitle: Extra\ndescription: More.\n---\n# Extra\n",
    );
    expect(verifyBuild(root, [ONE], [page]).join("\n")).toContain(
      'The page "extra" has no Markdown copy',
    );
  });

  it("reports a missing api.json and a sidebar page that pages.json does not list", () => {
    const root = builtSite("<script>one()</script>");
    rmSync(join(root, "api.json"));
    const page = parseDocSource(
      "extra",
      "---\ntitle: Extra\ndescription: More.\n---\n# Extra\n",
    );
    const findings = verifyBuild(root, [ONE], [page]).join("\n");
    expect(findings).toContain("api.json is missing");
    expect(findings).toContain(
      '"extra" is in the sidebar but not in pages.json',
    );
  });

  it("reports a bundler that writes licence notice files", () => {
    const root = builtSite("<script>one()</script>", {
      "assets/js/main.js.LICENSE.txt": "notice",
    });
    expect(verifyBuild(root, [ONE], []).join("\n")).toContain(
      "assets/js/main.js.LICENSE.txt is a licence notice file",
    );
  });

  it("reports a repository ATTRIBUTIONS.md that lacks a bundled notice", () => {
    const root = builtSite("<script>one()</script>");
    expect(
      verifyBuild(root, [ONE], [], [], "no notices here").join("\n"),
    ).toContain("ATTRIBUTIONS.md does not carry the notice");
  });

  it("reports a package whose API reference section was not built", () => {
    const root = builtSite("<script>one()</script>", {
      "api/core/index.html": "<p>core</p>",
    });
    const findings = verifyBuild(root, [ONE], [], ["core", "react"]).join("\n");
    expect(findings).toContain(
      "The API reference has no section for packages/react",
    );
    expect(findings).not.toContain("packages/core");
  });

  it("allows each generated API page a little more script than the base budget", () => {
    const script = randomBytes(SCRIPT_BUDGET_BYTES + 5_000);
    const pages = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [
        `api/core/page${index}/index.html`,
        "<p>page</p>",
      ]),
    );
    const tag =
      '<script src="/docs/assets/js/main.js" defer></script><script>one()</script>';
    expect(scriptBudgetFor(100)).toBe(
      SCRIPT_BUDGET_BYTES + 100 * API_PAGE_ALLOWANCE_BYTES,
    );
    const without = builtSite(tag, { "assets/js/main.js": script });
    expect(verifyBuild(without, [ONE], []).join("\n")).toContain(
      "over the budget",
    );
    const withPages = builtSite(tag, {
      "assets/js/main.js": script,
      ...pages,
    });
    expect(verifyBuild(withPages, [ONE], [])).toEqual([]);
  });

  it("reports a front page that loads more script than the budget", () => {
    const heavy = randomBytes(SCRIPT_BUDGET_BYTES + 20_000).toString("latin1");
    const root = builtSite(
      '<script src="/docs/assets/js/main.js" defer></script>',
      {
        "assets/js/main.js": heavy,
      },
    );
    expect(verifyBuild(root, [ONE], []).join("\n")).toContain(
      "over the budget",
    );
  });
});
