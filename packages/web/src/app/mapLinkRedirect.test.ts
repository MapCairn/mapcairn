// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { MAP_LINK_REDIRECT_SCRIPT } from "./mapLinkRedirect";

/** Runs the script against a stand-in `location` and returns where it sent the page, if anywhere. */
function run(hash: string, search = ""): string | undefined {
  let target: string | undefined;
  const location = {
    hash,
    search,
    replace(url: string) {
      target = url;
    },
  };
  new Function("location", MAP_LINK_REDIRECT_SCRIPT)(location);
  return target;
}

describe("the old map link redirect", () => {
  it.each([
    "#map=11.00/-33.92000/18.42000",
    "#basemap=dark",
    "#layers=earthquakes&earthquakes.window=week",
    "#map=5.00/10.00000/20.00000&basemap=osm&shapes=abc",
  ])("sends %s to the map with the same hash", (hash) => {
    expect(run(hash)).toBe(`/map${hash}`);
  });

  it("keeps a query string too", () => {
    expect(run("#basemap=dark", "?from=old")).toBe(
      "/map?from=old#basemap=dark",
    );
  });

  it.each(["", "#", "#the-code", "#questions", "#=nothing"])(
    "leaves %j on the product page",
    (hash) => {
      expect(run(hash)).toBeUndefined();
    },
  );

  it("never throws, even when the location cannot be read", () => {
    const blocked = {
      get hash(): string {
        throw new Error("blocked");
      },
    };
    expect(() =>
      new Function("location", MAP_LINK_REDIRECT_SCRIPT)(blocked),
    ).not.toThrow();
  });

  it("is one line with no markup, so it can sit inline under a hash", () => {
    expect(MAP_LINK_REDIRECT_SCRIPT).not.toMatch(/[\n<>]/);
  });
});
