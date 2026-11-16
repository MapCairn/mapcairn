// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { FakeMessageCatalogue } from "../fakes/FakeMessageCatalogue";
import { coordinateSearchResult } from "./coordinateSearchResult";
import { parseCoordinates } from "./parseCoordinates";

const messages = new FakeMessageCatalogue();

describe("coordinateSearchResult", () => {
  it("names the place in words, with the hemisphere letters the formatters use", () => {
    expect(coordinateSearchResult("-26.2041, 28.0473", messages)).toEqual({
      id: "coordinates:-26.20410,28.04730",
      label: "Coordinates 26.20410° S, 28.04730° E",
      centre: { lat: -26.2041, lng: 28.0473 },
    });
  });

  it("gives the same result for every way of writing the same place", () => {
    const expected = coordinateSearchResult("-26.2041 28.0473", messages);
    expect(coordinateSearchResult(`S26.2041 E28.0473`, messages)).toEqual(
      expected,
    );
    expect(coordinateSearchResult("26.2041° S, 28.0473° E", messages)).toEqual(
      expected,
    );
  });

  it("reads the hemisphere letters of the catalogue's language", () => {
    const afrikaans = new FakeMessageCatalogue({
      language: "af",
      overrides: { "format.hemisphereEast": "O" },
    });
    expect(
      coordinateSearchResult("26.2041° S, 28.0473° O", afrikaans)?.centre,
    ).toEqual({ lat: -26.2041, lng: 28.0473 });
    expect(
      coordinateSearchResult("26.2041° S, 28.0473° O", messages),
    ).toBeNull();
  });

  it("has no bounds, so the map centres on the point", () => {
    expect(coordinateSearchResult("1.5 2.5", messages)).not.toHaveProperty(
      "bounds",
    );
  });

  it("returns null for text that is not a coordinate pair", () => {
    expect(coordinateSearchResult("Cape Town", messages)).toBeNull();
    expect(coordinateSearchResult("2196", messages)).toBeNull();
    expect(coordinateSearchResult("", messages)).toBeNull();
  });

  it("writes a label that reads back as the same place to about a metre", () => {
    const result = coordinateSearchResult("-26.2041234, 28.0473456", messages);
    const readBack = parseCoordinates(result?.label ?? "");
    expect(readBack?.lat).toBeCloseTo(-26.2041234, 5);
    expect(readBack?.lng).toBeCloseTo(28.0473456, 5);
  });

  it("does not show a negative zero", () => {
    expect(coordinateSearchResult("0.0 -0.000001", messages)?.label).toBe(
      "Coordinates 0.00000° N, 0.00000° E",
    );
  });

  it("takes the hemisphere letters and the wording from the catalogue", () => {
    const afrikaans = new FakeMessageCatalogue({
      language: "af",
      overrides: {
        "format.hemisphereEast": "O",
        "search.coordinatesLabel": "Koördinate {latitude}, {longitude}",
      },
    });
    expect(coordinateSearchResult("-26.2041, 28.0473", afrikaans)?.label).toBe(
      "Koördinate 26.20410° S, 28.04730° O",
    );
  });
});
