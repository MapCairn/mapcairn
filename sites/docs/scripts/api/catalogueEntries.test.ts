// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { buildCatalogue, type PackageInput } from "./catalogue";
import { anExport } from "./fixtures";

const REPOSITORY = "https://example.com/repo";

const PACKAGES: PackageInput[] = [
  {
    dirName: "core",
    name: "@fixture/core",
    version: "1.2.3",
    description: "The core package",
    modules: [
      {
        specifier: "@fixture/core",
        reExports: [],
        sources: new Map([
          [
            "useThing",
            { file: "packages/core/src/useThing.ts", line: 7, comment: "" },
          ],
        ]),
        exports: [
          anExport({
            name: "useThing",
            packageName: "@fixture/core",
            signature: "function useThing(): void;",
            summary: "Uses a thing. It has a second sentence.",
            since: "0.1.0",
            deprecated: "Use useOther.",
          }),
          anExport({
            name: "ThingPort",
            kind: "interface",
            packageName: "@fixture/core",
            summary: "",
          }),
        ],
      },
      {
        specifier: "@fixture/core/extra",
        reExports: [],
        sources: new Map(),
        exports: [anExport({ name: "more", packageName: "@fixture/core" })],
      },
    ],
  },
];

describe("buildCatalogue entries", () => {
  const { entries } = buildCatalogue(PACKAGES, REPOSITORY);

  it("lists every export once, in the order of the packages", () => {
    expect(entries.map((entry) => entry.name)).toEqual([
      "useThing",
      "ThingPort",
      "more",
    ]);
  });

  it("describes an export from the same data its page uses", () => {
    expect(entries[0]).toEqual({
      package: "@fixture/core",
      entryPoint: "@fixture/core",
      name: "useThing",
      kind: "function",
      group: "hooks",
      signature: "function useThing(): void;",
      summary: "Uses a thing.",
      since: "0.1.0",
      deprecated: "Use useOther.",
      page: "core/useThing",
      sourceUrl: `${REPOSITORY}/blob/main/packages/core/src/useThing.ts#L7`,
    });
  });

  it("gives an empty string for what a comment does not say and no source URL when the source is unknown", () => {
    expect(entries[1]).toMatchObject({
      group: "ports",
      since: "",
      deprecated: "",
      sourceUrl: null,
    });
  });

  it("names the entry point of an export that is in a subpath", () => {
    expect(entries[2]).toMatchObject({
      entryPoint: "@fixture/core/extra",
      page: "core/extra/more",
    });
  });
});
