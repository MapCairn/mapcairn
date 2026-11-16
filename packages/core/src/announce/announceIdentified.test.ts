// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { FakeMessageCatalogue } from "../fakes/FakeMessageCatalogue";
import { formatMessage } from "../messages/formatMessage";
import { announceIdentified, type IdentifyReport } from "./index";

/** What the live region would say, in English, and how urgently. */
function said(report: IdentifyReport) {
  const result = announceIdentified(report);
  return result === null
    ? null
    : {
        message: formatMessage(new FakeMessageCatalogue(), result.message),
        priority: result.priority,
      };
}

describe("announceIdentified", () => {
  const settled = {
    found: 0,
    asked: 1,
    available: 1,
    failed: [] as readonly string[],
  };

  it("says nothing when one feature was found and nothing went wrong", () => {
    expect(said({ ...settled, found: 1 })).toBeNull();
  });

  it("says nothing when no layer was asked", () => {
    expect(said({ ...settled, asked: 0, available: 0 })).toBeNull();
  });

  it("says several features opened a list", () => {
    expect(said({ ...settled, found: 3 })).toEqual({
      message: "3 features here. Choose one from the list.",
      priority: "polite",
    });
  });

  it("says when nothing was found", () => {
    expect(said(settled)).toEqual({
      message: "Nothing found here.",
      priority: "polite",
    });
  });

  it("names a layer that did not answer, beside what the others found", () => {
    expect(
      said({
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
      said({
        found: 1,
        asked: 2,
        available: 2,
        failed: ["Rainfall"],
      }),
    ).toEqual({ message: "Rainfall did not answer.", priority: "polite" });
  });

  it("says nothing was found as well as who did not answer when some layers answered", () => {
    expect(
      said({
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
      said({
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
      said({
        found: 0,
        asked: 4,
        available: 4,
        failed: ["Rain", "Flood", "Wind"],
      })?.message,
    ).toBe("Nothing found here. Rain, Flood and Wind did not answer.");
  });

  it("says how many layers were asked when more could have been", () => {
    expect(said({ found: 3, asked: 4, available: 6, failed: [] })).toEqual({
      message:
        "3 features here. Choose one from the list. Asked 4 of 6 layers.",
      priority: "polite",
    });
  });

  it("says the cap even when one feature was found", () => {
    expect(
      said({ found: 1, asked: 4, available: 6, failed: [] })?.message,
    ).toBe("Asked 4 of 6 layers.");
  });

  it("puts the failures before the cap", () => {
    expect(
      said({
        found: 0,
        asked: 4,
        available: 5,
        failed: ["Rain"],
      })?.message,
    ).toBe("Nothing found here. Rain did not answer. Asked 4 of 5 layers.");
  });
});

describe("announceIdentified as keys", () => {
  it("names the layers that failed as a list, for the catalogue to join", () => {
    expect(
      announceIdentified({
        found: 3,
        asked: 4,
        available: 6,
        failed: ["Rain", "Flood"],
      })?.message,
    ).toEqual({
      key: "common.followedBy",
      params: {
        first: {
          key: "common.followedBy",
          params: {
            first: { key: "announce.featuresFound", params: { count: 3 } },
            second: {
              key: "announce.layersDidNotAnswer",
              params: { names: ["Rain", "Flood"] },
            },
          },
        },
        second: {
          key: "announce.askedOfAvailable",
          params: { asked: 4, available: 6 },
        },
      },
    });
  });
});
