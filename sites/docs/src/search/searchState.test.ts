// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  announcement,
  capMessage,
  EMPTY_ADVICE,
  ERROR_MESSAGE,
  emptyMessage,
  HINT_LINE,
  PARTIAL_MESSAGE,
  viewFor,
} from "./searchState";

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

  it("shows loading on a retry even with an empty box, so the retry is announced", () => {
    expect(viewFor("retrying", "", 0)).toBe("loading");
    expect(viewFor("retrying", "map", 0)).toBe("loading");
  });
});

describe("announcement", () => {
  const some = { shown: 5, total: 5, partial: false };

  it("counts results, singular and plural", () => {
    expect(
      announcement("results", "map", { ...some, shown: 1, total: 1 }),
    ).toBe("1 result");
    expect(announcement("results", "map", some)).toBe("5 results");
  });

  it("never says 8 results when more matched: it says the results were cut", () => {
    expect(
      announcement("results", "map", { shown: 8, total: 20, partial: false }),
    ).toBe("Showing the first 8 results. Add a word to narrow them.");
  });

  it("says 8 results when exactly 8 matched", () => {
    expect(
      announcement("results", "map", { shown: 8, total: 8, partial: false }),
    ).toBe("8 results");
  });

  it("adds that no section has every word when the results are partial", () => {
    expect(
      announcement("results", "map", { shown: 3, total: 3, partial: true }),
    ).toBe(
      "3 results. No section has all of those words. Showing sections with some of them.",
    );
  });

  it("says what was not found with the same words the page shows", () => {
    const none = { shown: 0, total: 0, partial: false };
    expect(announcement("empty", " zzz ", none)).toBe(
      "No results for “zzz”. Try a shorter word, or the name of an export.",
    );
    expect(emptyMessage(" zzz ")).toBe(
      "No results for “zzz”. Try a shorter word, or the name of an export.",
    );
  });

  it("says when the index is loading or failed, with what to do", () => {
    expect(announcement("loading", "map", some)).toBe("Loading search");
    expect(announcement("error", "map", some)).toBe(
      "Search could not be loaded. Check your connection, then try again.",
    );
    expect(ERROR_MESSAGE).toBe(
      "Search could not be loaded. Check your connection, then try again.",
    );
  });

  it("says nothing for the hint", () => {
    expect(announcement("hint", "", some)).toBe("");
  });
});

describe("the visible phrases", () => {
  it("are the ones the dialog shows", () => {
    expect(PARTIAL_MESSAGE).toBe(
      "No section has all of those words. Showing sections with some of them.",
    );
    expect(capMessage(8)).toBe(
      "Showing the first 8 results. Add a word to narrow them.",
    );
    expect(EMPTY_ADVICE).toBe("Try a shorter word, or the name of an export.");
    expect(HINT_LINE).toBe(
      "Enter opens the first result when there is one. Down arrow moves through the results. Escape closes. Ctrl or Cmd and K also open search.",
    );
  });
});
