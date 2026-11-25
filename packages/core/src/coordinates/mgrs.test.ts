// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { formatMgrs } from "./mgrs";
import { parseCoordinates } from "./parseCoordinates";

/*
 * The references marked "published" come from the test suite of the proj4js
 * mgrs package, which derives from GEOTRANS. The rest were computed on the
 * WGS 84 ellipsoid and checked against that suite and the `utm` Python
 * package.
 */

describe("formatMgrs", () => {
  it("writes the zone, band letter, 100 km square and one-metre digits", () => {
    // published: forward of the equator crossing of zone 31
    expect(formatMgrs({ lat: 0, lng: 0 })).toBe("31N AA 66021 00000");
    // published: forward of 0.00001 degrees north of it
    expect(formatMgrs({ lat: 0.00001, lng: 0 })).toBe("31N AA 66021 00001");
    // The proj4js mgrs suite publishes forward of Las Vegas as
    // "11SPA7234911844"; PROJ puts the northing at 4 011 844.975 m, which
    // rounds to ...11845, so the suite's last digit is a metre off and the
    // string here follows the rounding the other published anchors use.
    expect(formatMgrs({ lat: 36.2361322, lng: -115.0820944 })).toBe(
      "11S PA 72349 11845",
    );
    expect(formatMgrs({ lat: 51.5074, lng: -0.1278 })).toBe(
      "30U XC 99316 10164",
    );
    expect(formatMgrs({ lat: -33.9249, lng: 18.4241 })).toBe(
      "34H BH 61882 43182",
    );
    expect(formatMgrs({ lat: -0.1807, lng: -78.4678 })).toBe(
      "17M QV 81861 80008",
    );
    expect(formatMgrs({ lat: 38.8895, lng: -77.0347 })).toBe(
      "18S UJ 23530 06482",
    );
  });

  it("writes the Norway exception zones", () => {
    expect(formatMgrs({ lat: 60.391, lng: 5.322 })).toBe("32V KN 97347 00615");
    expect(formatMgrs({ lat: 60, lng: 1.5 })).toBe("31V DG 16338 52360");
    expect(formatMgrs({ lat: 60, lng: 11.9 })).toBe("32V PM 61721 54957");
  });

  it("writes the Svalbard exception zones", () => {
    expect(formatMgrs({ lat: 78.2232, lng: 15.6267 })).toBe(
      "33X WG 14279 83355",
    );
    expect(formatMgrs({ lat: 78.2232, lng: 5 })).toBe("31X EG 45560 84058");
    expect(formatMgrs({ lat: 78.2232, lng: 25 })).toBe("35X MG 54440 84058");
    expect(formatMgrs({ lat: 78.2232, lng: 40 })).toBe("37X EG 22783 83474");
  });

  it("refuses latitudes outside the UTM grid", () => {
    expect(formatMgrs({ lat: 84.0000001, lng: 0 })).toBeNull();
    expect(formatMgrs({ lat: 85, lng: 0 })).toBeNull();
    expect(formatMgrs({ lat: -80.0000001, lng: 0 })).toBeNull();
    expect(formatMgrs({ lat: 84, lng: 0 })).not.toBeNull();
    expect(formatMgrs({ lat: -80, lng: 0 })).not.toBeNull();
  });
});

describe("parseCoordinates of MGRS references", () => {
  it("reads a published reference", () => {
    const position = parseCoordinates("11 SPA 72349 11844");
    expect(position?.lat).toBeCloseTo(36.2361322, 4);
    expect(position?.lng).toBeCloseTo(-115.0820944, 4);
  });

  it("reads the square and digits with or without spaces", () => {
    // published: the two forms name the same point
    expect(parseCoordinates("4QFJ 12345 67890")).toEqual(
      parseCoordinates("4QFJ1234567890"),
    );
    expect(parseCoordinates("11SPA7234911844")).toEqual(
      parseCoordinates("11 SPA 72349 11844"),
    );
  });

  it("reads lowercase letters", () => {
    expect(parseCoordinates("11spa7234911844")).toEqual(
      parseCoordinates("11 SPA 72349 11844"),
    );
  });

  it("reads coarser precisions", () => {
    // published: the centre of the 10 km square 33UXP04
    const square = parseCoordinates("33U XP 05004 44997");
    expect(square?.lat).toBeCloseTo(48.24949, 4);
    expect(square?.lng).toBeCloseTo(16.4145, 4);
  });

  it("reads a reference written on a neighbouring zone's grid", () => {
    // published: 24XWT783908 names this point, written on zone 24's grid
    // though the point lies in zone 25; the suite also publishes forward
    // of it as 25XEN041865. Each reference is a 100 m square, so the two
    // decodes land within a square's width of the point and of each other.
    const onZone24 = parseCoordinates("24X WT 783 908");
    expect(onZone24?.lat).toBeCloseTo(83.62778, 4);
    expect(onZone24?.lng).toBeCloseTo(-32.66433, 4);
    const onZone25 = parseCoordinates("25XEN041865");
    expect(Math.abs((onZone25?.lat ?? 0) - 83.62778)).toBeLessThan(0.001);
    expect(Math.abs((onZone25?.lng ?? 0) + 32.66433)).toBeLessThan(0.01);
  });

  it("refuses a bare 100 km square, which names an area not a point", () => {
    expect(parseCoordinates("33UXP")).toBeNull();
    expect(parseCoordinates("33U XP")).toBeNull();
  });

  it("refuses an odd number of digits", () => {
    expect(parseCoordinates("33UXP041")).toBeNull();
    expect(parseCoordinates("33U XP 05004 4499")).toBeNull();
    expect(parseCoordinates("33U XP 0500 44997")).toBeNull();
  });

  it("refuses a zone or band outside the grid", () => {
    expect(parseCoordinates("0AAA6602100000")).toBeNull();
    expect(parseCoordinates("61AAA6602100000")).toBeNull();
    expect(parseCoordinates("31ZAA6602100000")).toBeNull();
    expect(parseCoordinates("31IAA6602100000")).toBeNull();
    expect(parseCoordinates("31OAA6602100000")).toBeNull();
  });

  it("refuses a 100 km square that does not belong to the zone", () => {
    // Zone 31 takes its columns from ABCDEFGH, so UJ names no square in it.
    expect(parseCoordinates("31XUJ 12345 67890")).toBeNull();
    // Zone 25 takes its columns from ABCDEFGH too, and J is in JKLMNPQR.
    expect(parseCoordinates("25XJJ1234567890")).toBeNull();
  });

  it("refuses a northing that lands outside the band", () => {
    // Band U is 48 to 56 degrees north. Square AD with northing digits
    // 00000 puts the 100 km row near 5 300 000 m or 6 300 000 m, and no
    // multiple of 2 000 000 m in between lands in the band.
    expect(parseCoordinates("31U AD 66021 00000")).toBeNull();
    // Band N is 0 to 8 degrees north, and square AJ (the row starting at
    // 800 000 m) with northing digits 89000 is about 8.003 degrees north,
    // in band P.
    expect(parseCoordinates("31N AJ 66021 89000")).toBeNull();
  });

  it("refuses text with anything left over", () => {
    expect(parseCoordinates("11SPA72349118445")).toBeNull();
    expect(parseCoordinates("MGRS 11SPA7234911844")).toBeNull();
    expect(parseCoordinates("11 SPA 72349 11844 extra")).toBeNull();
  });

  it("reads a reference in zone 1 against the antimeridian", () => {
    const position = parseCoordinates("1NAA6602100000");
    expect(position?.lat).toBeCloseTo(0, 4);
    // The point sits a hair west of the antimeridian, so its longitude
    // wraps to just under 180 east rather than past −180 west.
    expect(Math.abs(position?.lng ?? 0)).toBeCloseTo(180, 4);
  });

  it("reads white space around the reference", () => {
    expect(parseCoordinates("  11SPA7234911844  ")).toEqual(
      parseCoordinates("11SPA7234911844"),
    );
  });
});
