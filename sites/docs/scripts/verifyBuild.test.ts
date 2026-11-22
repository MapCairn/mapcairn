// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inlineScriptHashes } from "./builtSite";
import { buildHeadersFile } from "./securityHeaders";
import { TARGETED_CLASSES } from "./targetedClasses";
import { SCRIPT_BUDGET_BYTES, verifyBuild } from "./verifyBuild";

const roots: string[] = [];

/** Markup that carries every framework class the stylesheet targets. */
const TARGETS = `<div class="${TARGETED_CLASSES.join(" ")}"></div>`;

/** What the fixtures treat as the expected inline scripts. */
const ONE = {
  name: "one",
  hash: inlineScriptHashes("<script>one()</script>")[0] ?? "",
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
    expect(verifyBuild(root, [ONE])).toEqual([]);
  });

  it("reports a broken link, a style attribute and a resource from another origin", () => {
    const root = builtSite(
      '<a href="/docs/missing/">x</a><p style="color:red">y</p><script src="https://cdn.example/a.js"></script><script>one()</script>',
    );
    const findings = verifyBuild(root, [ONE]).join("\n");
    expect(findings).toContain("/docs/missing/");
    expect(findings).toContain("style attribute");
    expect(findings).toContain("https://cdn.example/a.js");
  });

  it("fails on an inline script that is not on the committed list, even though the page carries it", () => {
    const root = builtSite("<script>one()</script><script>two()</script>");
    const findings = verifyBuild(root, [ONE]).join("\n");
    expect(findings).toContain("not in expectedInlineScripts.ts");
  });

  it("fails when an expected inline script is no longer in any page", () => {
    const root = builtSite("<p>none</p>");
    expect(verifyBuild(root, [ONE]).join("\n")).toContain(
      'expected inline script "one"',
    );
  });

  it("fails when a framework class the stylesheet targets is gone", () => {
    const root = builtSite("<script>one()</script>");
    writeFileSync(join(root, "index.html"), "<script>one()</script>");
    expect(verifyBuild(root, [ONE]).join("\n")).toContain(
      `framework class "${TARGETED_CLASSES[0]}"`,
    );
  });

  it("reports a front page that loads more script than the budget", () => {
    const heavy = randomBytes(SCRIPT_BUDGET_BYTES + 20_000).toString("latin1");
    const root = builtSite(
      '<script src="/docs/assets/js/main.js" defer></script>',
      {
        "assets/js/main.js": heavy,
      },
    );
    expect(verifyBuild(root, [ONE]).join("\n")).toContain("over the budget");
  });
});
