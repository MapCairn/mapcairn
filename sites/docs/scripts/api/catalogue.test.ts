// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { SidebarEntry } from "../docChecks";
import {
  buildCatalogue,
  LINK_MARKER,
  type ModuleInput,
  type PackageInput,
  requireDescriptions,
  requireMemberDescriptions,
} from "./catalogue";
import { anExport } from "./fixtures";

const REPOSITORY = "https://example.com/repo";

function aModule(
  specifier: string,
  exports: ModuleInput["exports"],
  rest: Partial<ModuleInput> = {},
): ModuleInput {
  return { specifier, exports, reExports: [], sources: new Map(), ...rest };
}

function aPackage(
  dirName: string,
  modules: PackageInput["modules"],
): PackageInput {
  return {
    dirName,
    name: `@fixture/${dirName}`,
    version: "1.2.3",
    description: `The ${dirName} package`,
    modules,
  };
}

/** The ids of every category and doc in a sidebar entry, by label path. */
function labels(entry: SidebarEntry): string[] {
  if (typeof entry === "string" || entry.type !== "category") {
    return [];
  }
  return [entry.label, ...entry.items.flatMap(labels)];
}

/** The entries inside a sidebar category; none for anything else. */
function itemsOf(entry: SidebarEntry): readonly SidebarEntry[] {
  return typeof entry !== "string" && entry.type === "category"
    ? entry.items
    : [];
}

const CORE = aPackage("core", [
  aModule(
    "@fixture/core",
    [
      anExport({
        name: "ThingPort",
        kind: "interface",
        packageName: "@fixture/core",
      }),
      anExport({
        name: "FakeThing",
        kind: "class",
        packageName: "@fixture/core",
        bases: [{ packageName: "@fixture/core", name: "ThingPort" }],
      }),
      anExport({
        name: "go",
        packageName: "@fixture/core",
        summary: `Goes like [\`ThingPort\`](${LINK_MARKER}ThingPort) and [\`Missing\`](${LINK_MARKER}Missing).`,
        references: [{ packageName: "@fixture/core", name: "ThingPort" }],
      }),
    ],
    {
      sources: new Map([
        ["go", { file: "packages/core/src/go.ts", line: 7, comment: "" }],
      ]),
    },
  ),
  aModule("@fixture/core/contracts", [
    anExport({ name: "runContract", packageName: "@fixture/core" }),
  ]),
]);

const UI = aPackage("ui", [
  aModule("@fixture/ui", [
    anExport({
      name: "Button",
      packageName: "@fixture/ui",
      references: [{ packageName: "@fixture/core", name: "ThingPort" }],
    }),
    anExport({ name: "useThing", packageName: "@fixture/ui" }),
  ]),
]);

const UMBRELLA = aPackage("umbrella", [
  aModule("@fixture/umbrella", [], {
    reExports: ["@fixture/core", "@fixture/ui"],
  }),
  aModule("@fixture/umbrella/contracts", [], {
    reExports: ["@fixture/core/contracts"],
  }),
]);

describe("buildCatalogue", () => {
  const catalogue = buildCatalogue([CORE, UI, UMBRELLA], REPOSITORY);

  it("writes a page for every export, an overview for each package and entry point, and one for the reference", () => {
    expect([...catalogue.files.keys()].sort()).toEqual([
      "core/FakeThing.md",
      "core/ThingPort.md",
      "core/contracts/index.md",
      "core/contracts/runContract.md",
      "core/go.md",
      "core/index.md",
      "index.md",
      "ui/Button.md",
      "ui/index.md",
      "ui/useThing.md",
      "umbrella/index.md",
    ]);
  });

  it("builds the sidebar from the data, grouped by what each export is", () => {
    expect(labels(catalogue.sidebar)).toEqual([
      "API reference",
      "@fixture/core",
      "Ports",
      "Adapters",
      "Functions",
      "@fixture/core/contracts",
      "Functions",
      "@fixture/ui",
      "Components",
      "Hooks",
    ]);
    const core = itemsOf(catalogue.sidebar)[0];
    expect(core).toMatchObject({
      link: { type: "doc", id: "api/core/index" },
      items: [
        { label: "Ports", items: ["api/core/ThingPort"] },
        { label: "Adapters", items: ["api/core/FakeThing"] },
        { label: "Functions", items: ["api/core/go"] },
        { label: "@fixture/core/contracts" },
      ],
    });
  });

  it("lists a package that holds no code of its own as a plain page", () => {
    expect(itemsOf(catalogue.sidebar).at(-1)).toEqual({
      type: "doc",
      id: "api/umbrella/index",
    });
  });

  it("links an export to the page it names, and writes plain code when no page has the name", () => {
    const page = catalogue.files.get("core/go.md") ?? "";
    expect(page).toContain("[`ThingPort`](./ThingPort.md)");
    expect(page).toContain("`Missing`");
    expect(page).not.toContain(LINK_MARKER);
  });

  it("links across packages, with a path relative to the page", () => {
    expect(catalogue.files.get("ui/Button.md")).toContain(
      "[`ThingPort`](../core/ThingPort.md)",
    );
  });

  it("links the source, and names the package version on every page", () => {
    const page = catalogue.files.get("core/go.md") ?? "";
    expect(page).toContain(
      "Source: [packages/core/src/go.ts:7](https://example.com/repo/blob/main/packages/core/src/go.ts#L7)",
    );
    for (const [path, text] of catalogue.files) {
      if (path !== "index.md") {
        expect(text, path).toContain("1.2.3");
      }
    }
  });

  it("lists the entry points of a package, and what an umbrella re-exports", () => {
    expect(catalogue.files.get("core/index.md")).toContain(
      "[`@fixture/core/contracts`](./contracts/index.md)",
    );
    const umbrella = catalogue.files.get("umbrella/index.md") ?? "";
    expect(umbrella).toContain(
      "`@fixture/umbrella` re-exports [`@fixture/core`](../core/index.md), [`@fixture/ui`](../ui/index.md)",
    );
    expect(umbrella).toContain(
      "`@fixture/umbrella/contracts` re-exports [`@fixture/core/contracts`](../core/contracts/index.md)",
    );
  });

  it("reports an export with no description, and takes one from the source comment when the model has none", () => {
    const bare = aPackage("bare", [
      aModule(
        "@fixture/bare",
        [
          anExport({ name: "nothing", summary: "" }),
          anExport({ name: "values", kind: "namespace", summary: "" }),
        ],
        {
          sources: new Map([
            ["values", { file: "a.ts", line: 1, comment: "Every value." }],
          ]),
        },
      ),
    ]);
    const result = buildCatalogue([bare], REPOSITORY);
    expect(result.undocumented).toEqual(["nothing (@fixture/bare)"]);
    expect(result.files.get("bare/values.md")).toContain("Every value.");
  });

  it("stops the build, naming the exports, when any has no description", () => {
    const bare = buildCatalogue(
      [
        aPackage("bare", [
          aModule("@fixture/bare", [
            anExport({ name: "nothing", summary: "" }),
            anExport({ name: "also", summary: "" }),
          ]),
        ]),
      ],
      REPOSITORY,
    );
    expect(() => requireDescriptions(bare)).toThrow(
      /no description[\s\S]*nothing \(@fixture\/bare\)[\s\S]*also \(@fixture\/bare\)/,
    );
    expect(() => requireDescriptions(catalogue)).not.toThrow();
  });

  it("stops the build for a member with no description, only in the packages it is switched on for", () => {
    const member = (name: string, summary: string) => ({
      name,
      kind: "property" as const,
      signature: `${name}: string;`,
      summary,
      parameters: [],
      returns: "",
      deprecated: "",
    });
    const result = buildCatalogue(
      [
        aPackage("bare", [
          aModule("@fixture/bare", [
            anExport({
              name: "Shape",
              kind: "interface",
              packageName: "@fixture/bare",
              members: [member("width", ""), member("height", "How tall.")],
            }),
          ]),
        ]),
      ],
      REPOSITORY,
    );
    expect(result.undocumentedMembers).toEqual([
      { package: "@fixture/bare", label: "Shape.width (@fixture/bare)" },
    ]);
    expect(() => requireMemberDescriptions(result, ["@fixture/bare"])).toThrow(
      /These members have no description[\s\S]*Shape\.width \(@fixture\/bare\)/,
    );
    expect(() =>
      requireMemberDescriptions(result, ["@fixture/other"]),
    ).not.toThrow();
  });

  it("gives names that differ only by case their own files", () => {
    const result = buildCatalogue(
      [
        aPackage("case", [
          aModule("@fixture/case", [
            anExport({ name: "Tokens", kind: "interface" }),
            anExport({ name: "tokens", kind: "variable" }),
          ]),
        ]),
      ],
      REPOSITORY,
    );
    expect([...result.files.keys()]).toEqual(
      expect.arrayContaining([
        "case/Tokens-interface.md",
        "case/tokens-variable.md",
      ]),
    );
  });
});
