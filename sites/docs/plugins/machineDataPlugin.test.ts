// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  API_FILE,
  type ApiJson,
  PAGES_FILE,
  type PagesJson,
} from "../scripts/machineData";
import { parseDocSource } from "../scripts/markdownCopies";
import { readCatalogueData, writeMachineData } from "./machineDataPlugin";

const CONTEXT = {
  origin: "https://example.org",
  baseUrl: "/docs/",
  version: "0.4.0",
  title: "Docs",
  tagline: "Tagline",
};

const PAGES = [
  parseDocSource(
    "guides/embed",
    "---\ntitle: Embed\ndescription: Put a map on a page.\n---\n\n# Embed\n",
  ),
];

function catalogueFile(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "docs-catalogue-"));
  const file = join(dir, "_catalogue.json");
  writeFileSync(file, JSON.stringify(content));
  return file;
}

const CATALOGUE = {
  packages: [{ name: "@fixture/core", version: "0.4.0" }],
  entries: [
    {
      package: "@fixture/core",
      entryPoint: "@fixture/core",
      name: "go",
      kind: "function",
      group: "functions",
      signature: "function go(): void;",
      summary: "Goes.",
      since: "",
      deprecated: "",
      page: "core/go",
      sourceUrl: null,
    },
  ],
};

describe("writeMachineData", () => {
  const out = mkdtempSync(join(tmpdir(), "docs-machine-"));
  mkdirSync(join(out, "guides", "embed"), { recursive: true });
  writeFileSync(
    join(out, "guides", "embed", "index.html"),
    '<article><h1 id="e">Embed</h1><h2 id="install">Install</h2></article>',
  );
  writeMachineData(
    out,
    PAGES,
    readCatalogueData(catalogueFile(CATALOGUE)),
    CONTEXT,
  );
  const pages = JSON.parse(
    readFileSync(join(out, PAGES_FILE), "utf8"),
  ) as PagesJson;
  const api = JSON.parse(readFileSync(join(out, API_FILE), "utf8")) as ApiJson;

  it("writes the page manifest with the headings read from the built page", () => {
    expect(pages.pages).toHaveLength(1);
    expect(pages.pages[0]?.headings).toEqual([
      {
        level: 2,
        text: "Install",
        anchor: "install",
        url: "https://example.org/docs/guides/embed/#install",
      },
    ]);
    expect(pages.packages).toEqual(CATALOGUE.packages);
  });

  it("writes the API catalogue with the address of each page", () => {
    expect(api.entries.map((entry) => entry.pageUrl)).toEqual([
      "https://example.org/docs/api/core/go/",
    ]);
  });
});

describe("readCatalogueData", () => {
  it("stops, naming the command that writes the file, when it is missing", () => {
    expect(() => readCatalogueData("/nowhere/_catalogue.json")).toThrow(
      "npm run generate",
    );
  });

  it("stops on a file that is not a catalogue", () => {
    expect(() => readCatalogueData(catalogueFile({ packages: [] }))).toThrow(
      "not a catalogue",
    );
  });
});
