// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { announceIdentified } from "./index";

describe("announceIdentified", () => {
  const settled = {
    found: 0,
    asked: 1,
    available: 1,
    failed: [] as readonly string[],
  };

  it("says nothing when one feature was found and nothing went wrong", () => {
    expect(announceIdentified({ ...settled, found: 1 })).toBeNull();
  });

  it("says nothing when no layer was asked", () => {
    expect(
      announceIdentified({ ...settled, asked: 0, available: 0 }),
    ).toBeNull();
  });

  it("says several features opened a list", () => {
    expect(announceIdentified({ ...settled, found: 3 })).toEqual({
      message: "3 features here. Choose one from the list.",
      priority: "polite",
    });
  });

  it("says when nothing was found", () => {
    expect(announceIdentified(settled)).toEqual({
      message: "Nothing found here.",
      priority: "polite",
    });
  });

  it("names a layer that did not answer, beside what the others found", () => {
    expect(
      announceIdentified({
        found: 2,
        asked: 2,
        available: 2,
        failed: ["Rainfall"],
      }),
    ).toEqual({
      message:
        "2 features here. Choose one from the list. Rainfall did not answer.",
      priority: "polite",
    });
  });

  it("still names a layer that did not answer when one feature was found", () => {
    expect(
      announceIdentified({
        found: 1,
        asked: 2,
        available: 2,
        failed: ["Rainfall"],
      }),
    ).toEqual({ message: "Rainfall did not answer.", priority: "polite" });
  });

  it("says nothing was found as well as who did not answer when some layers answered", () => {
    expect(
      announceIdentified({
        found: 0,
        asked: 2,
        available: 2,
        failed: ["Rainfall"],
      }),
    ).toEqual({
      message: "Nothing found here. Rainfall did not answer.",
      priority: "polite",
    });
  });

  it("is assertive, and does not say nothing was found, when every layer failed", () => {
    expect(
      announceIdentified({
        found: 0,
        asked: 2,
        available: 2,
        failed: ["Rainfall", "Flood depth"],
      }),
    ).toEqual({
      message: "Rainfall and Flood depth did not answer.",
      priority: "assertive",
    });
  });

  it("joins three names with commas and an and", () => {
    expect(
      announceIdentified({
        found: 0,
        asked: 4,
        available: 4,
        failed: ["Rain", "Flood", "Wind"],
      })?.message,
    ).toBe("Nothing found here. Rain, Flood and Wind did not answer.");
  });

  it("says how many layers were asked when more could have been", () => {
    expect(
      announceIdentified({ found: 3, asked: 4, available: 6, failed: [] }),
    ).toEqual({
      message:
        "3 features here. Choose one from the list. Asked 4 of 6 layers.",
      priority: "polite",
    });
  });

  it("says the cap even when one feature was found", () => {
    expect(
      announceIdentified({ found: 1, asked: 4, available: 6, failed: [] })
        ?.message,
    ).toBe("Asked 4 of 6 layers.");
  });

  it("puts the failures before the cap", () => {
    expect(
      announceIdentified({
        found: 0,
        asked: 4,
        available: 5,
        failed: ["Rain"],
      })?.message,
    ).toBe("Nothing found here. Rain did not answer. Asked 4 of 5 layers.");
  });
});
