// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { writeRepositoryDocs } from "./generateRepositoryDocs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

describe("writeRepositoryDocs", () => {
  it("writes a page for the architecture and the design document from the files themselves", () => {
    const out = join(mkdtempSync(join(tmpdir(), "docs-")), "generated");
    const written = writeRepositoryDocs(REPOSITORY_ROOT, out);
    expect(written.map((path) => path.slice(out.length + 1))).toEqual([
      "architecture.md",
      "design.md",
    ]);
    const architecture = readFileSync(join(out, "architecture.md"), "utf8");
    expect(architecture).toContain("# Architecture");
    expect(architecture).toContain("slug: /architecture");
    expect(architecture).not.toMatch(/\]\((?:packages|docs|scripts)\//);
    expect(architecture).not.toMatch(/\]\(\.\.\/(?!guides\/)|\]\(\.\//);
  });

  it("replaces what the folder held", () => {
    const root = mkdtempSync(join(tmpdir(), "docs-"));
    const out = join(root, "generated");
    mkdirSync(out);
    writeFileSync(join(out, "stale.md"), "old");
    writeRepositoryDocs(REPOSITORY_ROOT, out);
    expect(() => readFileSync(join(out, "stale.md"))).toThrow();
  });
});
