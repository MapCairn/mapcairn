// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SearchRecord } from "../scripts/searchRecords";
import { SEARCH_INDEX_FILE, writeSearchIndex } from "./searchIndexPlugin";

const page = (title: string, body: string): string =>
  `<html><body><article><header><h1>${title}</h1></header><p>${body}</p></article></body></html>`;

describe("writeSearchIndex", () => {
  const out = mkdtempSync(join(tmpdir(), "docs-search-"));
  writeFileSync(join(out, "index.html"), page("Get started", "Install it."));
  mkdirSync(join(out, "guides"));
  writeFileSync(join(out, "guides", "index.html"), page("Guides", "Many."));
  writeFileSync(join(out, "404.html"), page("Page not found", "Gone."));
  const count = writeSearchIndex(out, "/docs/");
  const records = JSON.parse(
    readFileSync(join(out, SEARCH_INDEX_FILE), "utf8"),
  ) as SearchRecord[];

  it("writes one record per section of every page and returns how many", () => {
    expect(count).toBe(2);
    expect(records.map((record) => record.url).sort()).toEqual([
      "/docs/",
      "/docs/guides/",
    ]);
  });

  it("leaves the not-found page out of the index", () => {
    expect(records.some((record) => record.page === "Page not found")).toBe(
      false,
    );
  });
});
