// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  parsePackListing,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/npm.mjs";

const listing = { filename: "mapcairn-core-1.0.0.tgz", files: [] };

describe("parsePackListing", () => {
  it("reads the array npm 11 prints", () => {
    expect(parsePackListing(JSON.stringify([listing]))).toEqual(listing);
  });

  it("reads the object keyed by package name npm 12 prints", () => {
    expect(
      parsePackListing(JSON.stringify({ "@mapcairn/core": listing })),
    ).toEqual(listing);
  });

  it("fails clearly when npm printed no package", () => {
    expect(() => parsePackListing("[]")).toThrow(/no package/);
    expect(() => parsePackListing("{}")).toThrow(/no package/);
  });
});
