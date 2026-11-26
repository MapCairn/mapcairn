// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { MountMapError } from "./MountMapError";
import { MAP_TOOLS, validateTools } from "./tools";

const SEARCH = { search: () => Promise.resolve([]) } as never;
const LOCATION = { locate: () => Promise.resolve({}) } as never;

function problem(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MountMapError);
    expect((error as MountMapError).kind).toBe("invalid-option");
    return (error as MountMapError).message;
  }
  throw new Error("It did not throw.");
}

describe("validateTools", () => {
  it("names the six tools", () => {
    expect(MAP_TOOLS).toEqual([
      "search",
      "basemaps",
      "layers",
      "measure",
      "settings",
      "locate",
    ]);
  });

  it("offers none when left out, and when empty", () => {
    expect(validateTools(undefined, {}, false).size).toBe(0);
    expect(validateTools([], {}, false).size).toBe(0);
  });

  it("returns the tools named, once each", () => {
    const tools = validateTools(
      ["measure", "settings", "measure", "basemaps"],
      {},
      false,
    );
    expect([...tools].sort()).toEqual(["basemaps", "measure", "settings"]);
  });

  it("refuses a list that is not a list", () => {
    expect(problem(() => validateTools("search", {}, false))).toBe(
      'tools must be a list of tool names, for example ["measure", "settings"].',
    );
  });

  it("refuses an unknown name and lists the ones there are", () => {
    expect(problem(() => validateTools(["measures"], {}, false))).toBe(
      'tools: "measures" is not a tool. Use any of: "search", "basemaps", "layers", "measure", "settings", "locate".',
    );
  });

  it("refuses search without a search provider, and accepts it with one", () => {
    expect(problem(() => validateTools(["search"], {}, false))).toBe(
      'tools: "search" needs a search provider. Pass services.search, or remove "search" from tools.',
    );
    expect(
      validateTools(["search"], { search: SEARCH }, false).has("search"),
    ).toBe(true);
  });

  it("refuses locate without a location provider, and accepts it with one", () => {
    expect(problem(() => validateTools(["locate"], {}, false))).toBe(
      'tools: "locate" needs a location provider. Pass services.location, or remove "locate" from tools.',
    );
    expect(
      validateTools(["locate"], { location: LOCATION }, false).has("locate"),
    ).toBe(true);
  });

  it("refuses the layers tool without layers", () => {
    expect(problem(() => validateTools(["layers"], {}, false))).toBe(
      'tools: "layers" needs layers. Pass layers, or remove "layers" from tools.',
    );
    expect(validateTools(["layers"], {}, true).has("layers")).toBe(true);
  });

  it("refuses layers that no tool can turn on", () => {
    expect(problem(() => validateTools(["measure"], {}, true))).toBe(
      'layers can only be turned on from the "layers" tool. Add "layers" to tools, or remove layers.',
    );
  });
});
