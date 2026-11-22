// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { groupOf, portNames } from "./classify";
import { anExport } from "./fixtures";

const NO_FILE = "";

describe("portNames", () => {
  it("finds an interface named Port and one a class implements", () => {
    const ports = portNames([
      anExport({ name: "ClipboardPort", kind: "interface" }),
      anExport({ name: "SearchProvider", kind: "interface" }),
      anExport({ name: "Unrelated", kind: "interface" }),
      anExport({
        name: "FakeSearchProvider",
        kind: "class",
        bases: [{ packageName: "@fixture/pkg", name: "SearchProvider" }],
      }),
    ]);
    expect([...ports].sort()).toEqual(["ClipboardPort", "SearchProvider"]);
  });
});

describe("groupOf", () => {
  const ports = new Set(["MapAdapter"]);
  const group = (fields: Parameters<typeof anExport>[0], file = NO_FILE) =>
    groupOf(anExport(fields), { file, ports }).id;

  it("groups a capitalised function as a component and a use function as a hook", () => {
    expect(group({ name: "Button" })).toBe("components");
    expect(group({ name: "useReadingDirection" })).toBe("hooks");
    expect(group({ name: "user" })).toBe("functions");
  });

  it("groups a port, what implements it and what returns it as adapters", () => {
    expect(group({ name: "MapAdapter", kind: "interface" })).toBe("ports");
    expect(
      group({
        name: "FakeMapAdapter",
        kind: "class",
        bases: [{ packageName: "@fixture/pkg", name: "MapAdapter" }],
      }),
    ).toBe("adapters");
    expect(group({ name: "createAdapter", returnType: "MapAdapter" })).toBe(
      "adapters",
    );
    expect(group({ name: "other", returnType: "Promise<MapAdapters>" })).toBe(
      "functions",
    );
  });

  it("groups values named or declared as tokens", () => {
    expect(group({ name: "tokens", kind: "variable" })).toBe("tokens");
    expect(group({ name: "mapOverlayTokens", kind: "variable" })).toBe(
      "tokens",
    );
    expect(
      group(
        { name: "spacing", kind: "variable" },
        "packages/theme/src/tokenValues.ts",
      ),
    ).toBe("tokens");
    expect(group({ name: "LIMIT", kind: "variable" })).toBe("constants");
  });

  it("groups the rest as classes and types", () => {
    expect(group({ name: "SearchError", kind: "class" })).toBe("classes");
    expect(group({ name: "LatLng", kind: "interface" })).toBe("types");
    expect(group({ name: "Mode", kind: "typeAlias" })).toBe("types");
    expect(group({ name: "Level", kind: "enum" })).toBe("types");
  });
});
