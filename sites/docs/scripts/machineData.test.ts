// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ApiEntry } from "./api/catalogue";
import {
  apiJson,
  headingsOf,
  MACHINE_DATA_SCHEMA_VERSION,
  pagesJson,
} from "./machineData";
import { type CopyContext, parseDocSource } from "./markdownCopies";

const CONTEXT: CopyContext = {
  origin: "https://example.org",
  baseUrl: "/docs/",
  version: "0.4.0",
  title: "Docs",
  tagline: "Tagline",
};

const PACKAGES = [
  { name: "@fixture/core", version: "0.4.0" },
  { name: "@fixture/map", version: "0.4.1" },
];

const PAGES = [
  parseDocSource(
    "get-started",
    "---\ntitle: Get started\nslug: /\ndescription: Start here.\n---\n\n# Get started\n",
  ),
  parseDocSource(
    "guides/embed",
    "---\ntitle: Embed a map\ndescription: Put a map on a page.\n---\n\n# Embed a map\n",
  ),
];

describe("headingsOf", () => {
  it("lists the h2 and h3 headings of a page with their anchors and levels, as plain text", () => {
    const html =
      '<article><h1 id="t">Title</h1><h2 class="a" id="install">Install<a class="hash-link" href="#install">​</a></h2><h3 id="with-npm"><code>npm</code> &amp; more</h3><h4 id="deep">Deep</h4><h2>No id</h2></article>';
    expect(headingsOf(html)).toEqual([
      { level: 2, text: "Install", anchor: "install" },
      { level: 3, text: "npm & more", anchor: "with-npm" },
    ]);
  });

  it("returns nothing for a page with no article", () => {
    expect(headingsOf('<h2 id="x">Outside</h2>')).toEqual([]);
  });
});

describe("pagesJson", () => {
  const data = pagesJson(
    PAGES,
    new Map([["/guides/embed/", [{ level: 2, text: "Install", anchor: "i" }]]]),
    PACKAGES,
    CONTEXT,
  );

  it("carries the schema version and the versions the pages were checked against", () => {
    expect(data.schemaVersion).toBe(MACHINE_DATA_SCHEMA_VERSION);
    expect(data.packages).toEqual(PACKAGES);
  });

  it("lists every page in the order given, with its address and Markdown copy", () => {
    expect(data.pages.map((page) => page.title)).toEqual([
      "Get started",
      "Embed a map",
    ]);
    expect(data.pages[1]).toEqual({
      title: "Embed a map",
      description: "Put a map on a page.",
      path: "/docs/guides/embed/",
      url: "https://example.org/docs/guides/embed/",
      markdownUrl: "https://example.org/docs/guides/embed.md",
      checkedAgainst: "0.4.0",
      headings: [
        {
          level: 2,
          text: "Install",
          anchor: "i",
          url: "https://example.org/docs/guides/embed/#i",
        },
      ],
    });
  });

  it("gives the front page the base path and an empty heading list when none was found", () => {
    expect(data.pages[0]).toMatchObject({
      path: "/docs/",
      url: "https://example.org/docs/",
      markdownUrl: "https://example.org/docs/index.md",
      headings: [],
    });
  });
});

describe("the Machine-readable data page", () => {
  const page = readFileSync(
    new URL("../docs/guides/machine-readable-data.md", import.meta.url),
    "utf8",
  );
  const api = apiJson(
    [
      {
        package: "p",
        entryPoint: "p",
        name: "n",
        kind: "function",
        group: "functions",
        signature: "",
        summary: "",
        since: "",
        deprecated: "",
        page: "p/n",
        sourceUrl: null,
      },
    ],
    PACKAGES,
    CONTEXT,
  );
  const manifest = pagesJson(
    PAGES,
    new Map([["/", [{ level: 2, text: "t", anchor: "a" }]]]),
    PACKAGES,
    CONTEXT,
  );

  it.each([
    ...Object.keys(api),
    ...Object.keys(api.entries[0] ?? {}),
    ...Object.keys(manifest),
    ...Object.keys(manifest.pages[0] ?? {}),
    ...Object.keys(manifest.pages[0]?.headings[0] ?? {}),
  ])("documents the field %s", (field) => {
    expect(page).toContain(`\`${field}\``);
  });
});

describe("apiJson", () => {
  const entry: ApiEntry = {
    package: "@fixture/core",
    entryPoint: "@fixture/core",
    name: "useThing",
    kind: "function",
    group: "hooks",
    signature: "function useThing(): void;",
    summary: "Uses a thing.",
    since: "",
    deprecated: "",
    page: "core/useThing",
    sourceUrl: null,
  };
  const data = apiJson([entry], PACKAGES, CONTEXT);

  it("carries the schema version and the packages", () => {
    expect(data.schemaVersion).toBe(MACHINE_DATA_SCHEMA_VERSION);
    expect(data.packages).toEqual(PACKAGES);
  });

  it("keeps an entry's fields and gives its page as an absolute address", () => {
    const { page, ...rest } = entry;
    expect(page).toBe("core/useThing");
    expect(data.entries).toEqual([
      { ...rest, pageUrl: "https://example.org/docs/api/core/useThing/" },
    ]);
  });
});
