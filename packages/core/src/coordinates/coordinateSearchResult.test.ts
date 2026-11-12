// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { coordinateSearchResult } from "./coordinateSearchResult";
import { parseCoordinates } from "./parseCoordinates";

describe("coordinateSearchResult", () => {
  it("names the place in words, with the hemisphere letters the formatters use", () => {
    expect(coordinateSearchResult("-26.2041, 28.0473")).toEqual({
      id: "coordinates:-26.20410,28.04730",
      label: "Coordinates 26.20410° S, 28.04730° E",
      centre: { lat: -26.2041, lng: 28.0473 },
    });
  });

  it("gives the same result for every way of writing the same place", () => {
    const expected = coordinateSearchResult("-26.2041 28.0473");
    expect(coordinateSearchResult(`S26.2041 E28.0473`)).toEqual(expected);
    expect(coordinateSearchResult("26.2041° S, 28.0473° E")).toEqual(expected);
  });

  it("has no bounds, so the map centres on the point", () => {
    expect(coordinateSearchResult("1.5 2.5")).not.toHaveProperty("bounds");
  });

  it("returns null for text that is not a coordinate pair", () => {
    expect(coordinateSearchResult("Cape Town")).toBeNull();
    expect(coordinateSearchResult("2196")).toBeNull();
    expect(coordinateSearchResult("")).toBeNull();
  });

  it("writes a label that reads back as the same place to about a metre", () => {
    const result = coordinateSearchResult("-26.2041234, 28.0473456");
    const readBack = parseCoordinates(result?.label ?? "");
    expect(readBack?.lat).toBeCloseTo(-26.2041234, 5);
    expect(readBack?.lng).toBeCloseTo(28.0473456, 5);
  });

  it("does not show a negative zero", () => {
    expect(coordinateSearchResult("0.0 -0.000001")?.label).toBe(
      "Coordinates 0.00000° N, 0.00000° E",
    );
  });
});
