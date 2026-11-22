// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  docIdsOnDisk,
  docsMissingFromSidebar,
  sidebarDocIds,
} from "./docChecks";

const roots: string[] = [];

function docsFolder(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "mapcairn-docs-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("docIdsOnDisk", () => {
  it("lists Markdown pages by path without the extension, and skips partials", () => {
    const root = docsFolder({
      "get-started.md": "# Get started",
      "guides/embed.mdx": "# Embed",
      "guides/_shared.md": "partial",
      "notes.txt": "not a page",
    });
    expect(docIdsOnDisk(root).sort()).toEqual(["get-started", "guides/embed"]);
  });
});

describe("sidebarDocIds", () => {
  it("collects ids from strings, doc items and nested categories", () => {
    expect(
      sidebarDocIds([
        "get-started",
        { type: "doc", id: "guides/embed" },
        {
          type: "category",
          label: "Concepts",
          link: { type: "doc", id: "concepts/index" },
          items: ["concepts/layers", { type: "link", label: "x", href: "/" }],
        },
      ]).sort(),
    ).toEqual([
      "concepts/index",
      "concepts/layers",
      "get-started",
      "guides/embed",
    ]);
  });
});

describe("docsMissingFromSidebar", () => {
  it("names a page that no sidebar lists, so the build can refuse it", () => {
    const root = docsFolder({ "a.md": "", "b.md": "", "c/d.md": "" });
    expect(docsMissingFromSidebar(root, ["a", "c/d"])).toEqual(["b"]);
  });

  it("names nothing when every page is listed", () => {
    const root = docsFolder({ "a.md": "" });
    expect(docsMissingFromSidebar(root, ["a"])).toEqual([]);
  });
});
