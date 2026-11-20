// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { isUsedByExample, type NamedImport } from "./markdownSupport";

function known(specifier: string, imported: string): NamedImport {
  return { specifier, imported, local: imported, typeOnly: false };
}

const EXAMPLE = [
  known("@mapcairn/core", "createFakeServices"),
  known("@mapcairn/map", "MapChrome"),
  known("@mapcairn/theme", "tokens"),
];

describe("isUsedByExample", () => {
  it("accepts a name from the package the example imports it from", () => {
    expect(isUsedByExample(EXAMPLE, "@mapcairn/map", "MapChrome")).toBe(true);
  });

  it("rejects a name the example does not import, and one from the wrong package", () => {
    expect(isUsedByExample(EXAMPLE, "@mapcairn/map", "Nope")).toBe(false);
    expect(isUsedByExample(EXAMPLE, "@mapcairn/core", "MapChrome")).toBe(false);
  });

  it("accepts the umbrella root for a name the example imports from any of the four packages", () => {
    expect(isUsedByExample(EXAMPLE, "@mapcairn/sdk", "MapChrome")).toBe(true);
    expect(
      isUsedByExample(EXAMPLE, "@mapcairn/sdk", "createFakeServices"),
    ).toBe(true);
    expect(isUsedByExample(EXAMPLE, "@mapcairn/sdk", "Nope")).toBe(false);
  });

  it("accepts an umbrella subpath only for the package it mirrors", () => {
    expect(isUsedByExample(EXAMPLE, "@mapcairn/sdk/map", "MapChrome")).toBe(
      true,
    );
    expect(isUsedByExample(EXAMPLE, "@mapcairn/sdk/core", "MapChrome")).toBe(
      false,
    );
  });

  it("does not count the umbrella as one of the four", () => {
    expect(
      isUsedByExample(
        [known("@mapcairn/sdk", "MapChrome")],
        "@mapcairn/sdk",
        "MapChrome",
      ),
    ).toBe(false);
  });
});
