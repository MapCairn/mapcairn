// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { announcement, viewFor } from "./searchState";

describe("viewFor", () => {
  it("shows the hint before anything is typed, even while loading", () => {
    expect(viewFor("loading", "", 0)).toBe("hint");
    expect(viewFor("ready", "  ", 0)).toBe("hint");
  });

  it("shows loading, then error, in preference to results", () => {
    expect(viewFor("loading", "map", 0)).toBe("loading");
    expect(viewFor("error", "map", 0)).toBe("error");
  });

  it("shows results, or the empty state when nothing matched", () => {
    expect(viewFor("ready", "map", 3)).toBe("results");
    expect(viewFor("ready", "map", 0)).toBe("empty");
  });

  it("shows the error even before anything is typed", () => {
    expect(viewFor("error", "", 0)).toBe("error");
  });
});

describe("announcement", () => {
  it("counts results, singular and plural", () => {
    expect(announcement("results", "map", 1)).toBe("1 result");
    expect(announcement("results", "map", 5)).toBe("5 results");
  });

  it("says what was not found, naming the query", () => {
    expect(announcement("empty", " zzz ", 0)).toBe("No results for “zzz”");
  });

  it("says when the index is loading or failed", () => {
    expect(announcement("loading", "map", 0)).toBe("Loading search");
    expect(announcement("error", "map", 0)).toBe("Search could not be loaded");
  });

  it("says nothing for the hint", () => {
    expect(announcement("hint", "", 0)).toBe("");
  });
});
