// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUNDLED_NOTICE_HOLDERS,
  noticeFiles,
  noticeFindings,
} from "./noticeChecks";

const roots: string[] = [];

function site(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "mapcairn-notices-"));
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

const published = `${BUNDLED_NOTICE_HOLDERS.join("\n")}\nPermission is hereby granted, free of charge`;

describe("noticeFiles", () => {
  it("lists the licence notice files a bundler wrote, relative to the build", () => {
    const root = site({
      "assets/js/main.abc.js": "x",
      "assets/js/main.abc.js.LICENSE.txt": "notice",
      "index.html": "",
    });
    expect(noticeFiles(root)).toEqual(["assets/js/main.abc.js.LICENSE.txt"]);
  });

  it("returns nothing for a build without them", () => {
    expect(noticeFiles(site({ "index.html": "" }))).toEqual([]);
  });
});

describe("noticeFindings", () => {
  it("passes when no notice files are written and ATTRIBUTIONS.md carries every holder", () => {
    expect(noticeFindings(site({ "index.html": "" }), published)).toEqual([]);
  });

  it("flags a bundler that writes notice files again", () => {
    const root = site({ "assets/js/a.js.LICENSE.txt": "notice" });
    expect(noticeFindings(root, published)).toEqual([
      expect.stringContaining("assets/js/a.js.LICENSE.txt"),
    ]);
  });

  it("flags a holder ATTRIBUTIONS.md does not name", () => {
    const first = BUNDLED_NOTICE_HOLDERS[0] ?? "";
    const without = published.replace(first, "");
    expect(noticeFindings(site({ "index.html": "" }), without)).toEqual([
      expect.stringContaining(first),
    ]);
  });

  it("flags attributions with no licence text", () => {
    const names = BUNDLED_NOTICE_HOLDERS.join("\n");
    expect(noticeFindings(site({ "index.html": "" }), names)).toEqual([
      expect.stringContaining("licence text"),
    ]);
  });
});
