// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  composeTitle,
  englishTitle,
  type PageTitleHandle,
  pageTitleHandle,
} from "./pageTitle";

const MAP: PageTitleHandle = { titleKey: "host.title.map", brand: "first" };
const PRIVACY: PageTitleHandle = { titleKey: "privacy.title", brand: "last" };

describe("composeTitle", () => {
  it("puts the product name where the route says", () => {
    expect(composeTitle("Interactive map", "first")).toBe(
      "MapCairn | Interactive map",
    );
    expect(composeTitle("Privacy policy", "last")).toBe(
      "Privacy policy | MapCairn",
    );
  });
});

describe("englishTitle", () => {
  it("gives the titles the site has always had", () => {
    expect(englishTitle(MAP)).toBe("MapCairn | Interactive map");
    expect(englishTitle(PRIVACY)).toBe("Privacy policy | MapCairn");
  });
});

describe("pageTitleHandle", () => {
  it("returns undefined when no route has a title handle", () => {
    expect(pageTitleHandle([])).toBeUndefined();
    expect(
      pageTitleHandle([{ handle: undefined }, { handle: {} }]),
    ).toBeUndefined();
  });

  it("returns the handle of the deepest route that has one", () => {
    expect(
      pageTitleHandle([{ handle: MAP }, { handle: PRIVACY }, { handle: 1 }]),
    ).toBe(PRIVACY);
  });

  it("ignores a handle that is not a title handle", () => {
    for (const handle of [
      { titleKey: "no.such.key", brand: "first" },
      { titleKey: 7, brand: "first" },
      { titleKey: "host.title.map", brand: "middle" },
      { titleKey: "host.title.map" },
      "host.title.map",
      null,
    ]) {
      expect(pageTitleHandle([{ handle }]), JSON.stringify(handle)).toBe(
        undefined,
      );
    }
  });
});
