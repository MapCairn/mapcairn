// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { UrlStateValue } from "../ports/url";
import { parseUrlHash, serialiseUrlHash } from "./index";

describe("shapes in the hash", () => {
  it("reads a shapes parameter made of link-safe characters", () => {
    expect(parseUrlHash("#map=3/1/2&shapes=gAbC.p_-9").shapes).toBe(
      "gAbC.p_-9",
    );
  });

  it("ignores a shapes parameter with anything else in it, or one that is too long", () => {
    expect(parseUrlHash("#shapes=a%20b")).toEqual({});
    expect(parseUrlHash("#shapes=a<b")).toEqual({});
    expect(parseUrlHash("#shapes=")).toEqual({});
    expect(parseUrlHash(`#shapes=${"A".repeat(2001)}`)).toEqual({});
  });

  it("writes shapes last, after the view, basemap and layers", () => {
    expect(
      serialiseUrlHash({
        basemapId: "positron",
        shapes: "pAAAA",
      }),
    ).toBe("#basemap=positron&shapes=pAAAA");
  });

  it("leaves out shapes that are not link-safe", () => {
    expect(serialiseUrlHash({ shapes: "a b" })).toBe("");
    expect(serialiseUrlHash({ shapes: "" })).toBe("");
  });

  it("round-trips", () => {
    const value: UrlStateValue = { shapes: "gAbC.p_-9" };
    expect(parseUrlHash(serialiseUrlHash(value))).toEqual(value);
  });
});
