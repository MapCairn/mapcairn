// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, describe, expect, it, vi } from "vitest";
import { MountMapError } from "./MountMapError";
import { MAP_TOOLS, validateTools } from "./tools";

const SEARCH = { search: () => Promise.resolve([]) } as never;
const LOCATION = { locate: () => Promise.resolve({}) } as never;

afterEach(() => {
  vi.restoreAllMocks();
});

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
  it("names the five tools", () => {
    expect(MAP_TOOLS).toEqual([
      "search",
      "map-options",
      "measure",
      "locate",
      "settings",
    ]);
  });

  it("offers none when left out, and when empty", () => {
    expect(validateTools(undefined, {}).size).toBe(0);
    expect(validateTools([], {}).size).toBe(0);
  });

  it("returns the tools named, once each", () => {
    const tools = validateTools(
      ["measure", "settings", "measure", "map-options"],
      {},
    );
    expect([...tools].sort()).toEqual(["map-options", "measure", "settings"]);
  });

  it("refuses a list that is not a list", () => {
    expect(problem(() => validateTools("search", {}))).toBe(
      'tools must be a list of tool names, for example ["measure", "settings"].',
    );
  });

  it("refuses an unknown name and lists the ones there are", () => {
    expect(problem(() => validateTools(["measures"], {}))).toBe(
      'tools: "measures" is not a tool. Use any of: "search", "map-options", "measure", "locate", "settings".',
    );
  });

  it("refuses the names the tools had before they were merged", () => {
    expect(problem(() => validateTools(["basemaps"], {}))).toContain(
      '"basemaps" is not a tool',
    );
  });

  it("leaves out search without a provider, with one warning that names the fix", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(validateTools(["search"], {}).has("search")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'tools: "search" needs a search provider, so it is not shown. Pass services.search, or remove "search" from tools.',
    );
  });

  it("leaves out locate without a provider, with one warning that names the fix", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(validateTools(["locate"], {}).has("locate")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      'tools: "locate" needs a location provider, so it is not shown. Pass services.location, or remove "locate" from tools.',
    );
  });

  it("keeps search and locate, quietly, with their providers", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tools = validateTools(["search", "locate"], {
      search: SEARCH,
      location: LOCATION,
    });
    expect([...tools].sort()).toEqual(["locate", "search"]);
    expect(warn).not.toHaveBeenCalled();
  });
});
