// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inlineScriptHashes } from "./builtSite";
import { buildHeadersFile } from "./securityHeaders";
import { SCRIPT_BUDGET_BYTES, verifyBuild } from "./verifyBuild";

const roots: string[] = [];

/** Writes a small built site: the pages, any files, and the `_headers` its inline scripts need. */
function builtSite(
  pages: string,
  files: Record<string, string | Buffer> = {},
): string {
  const root = mkdtempSync(join(tmpdir(), "mapcairn-verify-"));
  roots.push(root);
  writeFileSync(join(root, "index.html"), pages);
  writeFileSync(
    join(root, "_headers"),
    buildHeadersFile(inlineScriptHashes(pages)),
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
    expect(verifyBuild(root)).toEqual([]);
  });

  it("reports a broken link, a style attribute, a resource from another origin and an inline script that _headers does not allow", () => {
    const root = builtSite(
      '<a href="/docs/missing/">x</a><p style="color:red">y</p><script src="https://cdn.example/a.js"></script><script>one()</script>',
    );
    writeFileSync(join(root, "_headers"), buildHeadersFile([]));
    const findings = verifyBuild(root).join("\n");
    expect(findings).toContain("/docs/missing/");
    expect(findings).toContain("style attribute");
    expect(findings).toContain("https://cdn.example/a.js");
    expect(findings).toContain("inline script");
  });

  it("reports a front page that loads more script than the budget", () => {
    const heavy = randomBytes(SCRIPT_BUDGET_BYTES + 20_000).toString("latin1");
    const root = builtSite(
      '<script src="/docs/assets/js/main.js" defer></script>',
      {
        "assets/js/main.js": heavy,
      },
    );
    expect(verifyBuild(root).join("\n")).toContain("over the budget");
  });
});
