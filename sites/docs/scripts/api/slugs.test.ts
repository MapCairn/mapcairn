// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { allocateSlugs, slugOf } from "./slugs";

describe("slugOf", () => {
  it("keeps the name's own case and replaces what an address cannot hold", () => {
    expect(slugOf("parseCoordinates")).toBe("parseCoordinates");
    expect(slugOf("a.b c")).toBe("a-b-c");
  });

  it("does not start with an underscore, which the framework would ignore", () => {
    expect(slugOf("_hidden")).toBe("x_hidden");
  });
});

describe("allocateSlugs", () => {
  it("gives each export its own name", () => {
    expect(
      allocateSlugs(
        [
          { name: "Alpha", kind: "interface" },
          { name: "beta", kind: "function" },
        ],
        new Set(),
      ),
    ).toEqual(["Alpha", "beta"]);
  });

  it("adds the kind to names that differ only by case, which a case-insensitive disk would merge", () => {
    expect(
      allocateSlugs(
        [
          { name: "Tokens", kind: "interface" },
          { name: "tokens", kind: "variable" },
          { name: "other", kind: "function" },
        ],
        new Set(),
      ),
    ).toEqual(["Tokens-interface", "tokens-variable", "other"]);
  });

  it("adds the kind to a name that is a page or folder of the module already", () => {
    expect(
      allocateSlugs(
        [
          { name: "index", kind: "function" },
          { name: "Contracts", kind: "variable" },
        ],
        new Set(["index", "contracts"]),
      ),
    ).toEqual(["index-function", "Contracts-variable"]);
  });
});
