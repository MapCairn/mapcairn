// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { FakeMessageCatalogue } from "../fakes/FakeMessageCatalogue";
import {
  coordinateSearchResult,
  isCoordinateText,
} from "./coordinateSearchResult";
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

  it("answers a UTM reference", () => {
    const result = coordinateSearchResult("31N 166021 0000000", messages);
    expect(result?.centre?.lat).toBeCloseTo(0, 4);
    expect(result?.centre?.lng).toBeCloseTo(0, 4);
    expect(result?.label).toBe(
      coordinateSearchResult("0.0, 0.0", messages)?.label,
    );
  });

  it("answers an MGRS reference", () => {
    const result = coordinateSearchResult("11S PA 72349 11844", messages);
    expect(result?.centre?.lat).toBeCloseTo(36.2361322, 4);
    expect(result?.centre?.lng).toBeCloseTo(-115.0820944, 4);
  });

  it("returns null for a grid reference that names an area or is out of range", () => {
    expect(coordinateSearchResult("33U XP", messages)).toBeNull();
    expect(coordinateSearchResult("31U 500000 9500000", messages)).toBeNull();
    expect(coordinateSearchResult("33UXP", messages)).toBeNull();
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

  it("reads the words of the catalogue's language", () => {
    const afrikaans = new FakeMessageCatalogue({
      language: "af",
      overrides: {
        "format.wordSouth": "suid",
        "format.wordEast": "oos",
        "format.wordDegree": "graad grade",
      },
    });
    expect(
      coordinateSearchResult("26.2041 grade suid, 28.0473 graad oos", afrikaans)
        ?.centre,
    ).toEqual({ lat: -26.2041, lng: 28.0473 });
    expect(
      coordinateSearchResult("26.2041 suid, 28.0473 oos", messages),
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

describe("isCoordinateText", () => {
  it("is true for text that reads as a position", () => {
    for (const text of [
      "-26.2041, 28.0473",
      "26.2041 south 28.0473 east",
      "31U 500000 5500000",
      "11SPA7234911844",
      "11S PA 72349 11844",
    ]) {
      expect(isCoordinateText(text, messages), text).toBe(true);
    }
  });

  it("reads the words of the catalogue's language", () => {
    const afrikaans = new FakeMessageCatalogue({
      language: "af",
      overrides: { "format.wordSouth": "suid", "format.wordEast": "oos" },
    });
    expect(isCoordinateText("26.2041 suid, 28.0473 oos", afrikaans)).toBe(true);
  });

  it("is true for a grid reference still being typed, spaced or not", () => {
    for (const text of [
      "11SPA",
      "11SPA72",
      "11SPA7234911",
      "11S PA 723",
      "11S P",
      "31U",
      "31U 500",
      "31 N 5000",
      "34h26188",
      "٣١U 500",
      "31U CT 12345 678",
    ]) {
      expect(isCoordinateText(text, messages), text).toBe(true);
    }
  });

  it("is false for a place name", () => {
    for (const text of [
      "Cape Town",
      "Paris",
      "5 Main Street",
      "10 Downing Street",
      "12345",
      "",
    ]) {
      expect(isCoordinateText(text, messages), text).toBe(false);
    }
  });
});
