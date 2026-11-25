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

const GRID_SLACK = 1.02;

describe("formatMgrs", () => {
  it("writes the zone, band letter, 100 km square and one-metre digits", () => {
    // published: forward of the equator crossing of zone 31
    expect(formatMgrs({ lat: 0, lng: 0 })).toBe("31N AA 66021 00000");
    // published: forward of 0.00001 degrees north of it
    expect(formatMgrs({ lat: 0.00001, lng: 0 })).toBe("31N AA 66021 00001");
    // published: forward of Las Vegas. PROJ puts the northing at
    // 4 011 844.975 m, and the digits are truncated, not rounded.
    expect(formatMgrs({ lat: 36.2361322, lng: -115.0820944 })).toBe(
      "11S PA 72349 11844",
    );
    expect(formatMgrs({ lat: 51.5074, lng: -0.1278 })).toBe(
      "30U XC 99316 10163",
    );
    expect(formatMgrs({ lat: -33.9249, lng: 18.4241 })).toBe(
      "34H BH 61881 43182",
    );
    expect(formatMgrs({ lat: -0.1807, lng: -78.4678 })).toBe(
      "17M QV 81861 80007",
    );
    expect(formatMgrs({ lat: 38.8895, lng: -77.0347 })).toBe(
      "18S UJ 23530 06482",
    );
  });

  it("writes the Norway exception zones", () => {
    expect(formatMgrs({ lat: 60.391, lng: 5.322 })).toBe("32V KN 97346 00615");
    expect(formatMgrs({ lat: 60, lng: 1.5 })).toBe("31V DG 16338 52359");
    expect(formatMgrs({ lat: 60, lng: 11.9 })).toBe("32V PM 61720 54956");
  });

  it("writes the Svalbard exception zones", () => {
    expect(formatMgrs({ lat: 78.2232, lng: 15.6267 })).toBe(
      "33X WG 14278 83355",
    );
    expect(formatMgrs({ lat: 78.2232, lng: 5 })).toBe("31X EG 45560 84057");
    expect(formatMgrs({ lat: 78.2232, lng: 25 })).toBe("35X MG 54439 84057");
    expect(formatMgrs({ lat: 78.2232, lng: 40 })).toBe("37X EG 22783 83473");
  });

  it("truncates to the metre, as the convention has it", () => {
    // The centre of a one-metre square sits 0.5 m short of its far edges.
    // Rounding would name the next square along; truncation names this one.
    const centre = parseCoordinates("31U CT 12345 67890");
    expect(formatMgrs(centre as { lat: number; lng: number })).toBe(
      "31U CT 12345 67890",
    );
  });

  it("wraps a longitude outside -180 to 180 before choosing the zone", () => {
    expect(formatMgrs({ lat: 10, lng: 363 })).toBe(
      formatMgrs({ lat: 10, lng: 3 }),
    );
  });

  it("refuses a position that is not a number", () => {
    expect(formatMgrs({ lat: Number.NaN, lng: 0 })).toBeNull();
    expect(formatMgrs({ lat: 10, lng: Number.NaN })).toBeNull();
    expect(formatMgrs({ lat: 10, lng: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it("keeps the antimeridian in range when it reads back", () => {
    const text = formatMgrs({ lat: 0, lng: 180 });
    expect(
      Math.abs(parseCoordinates(text ?? "")?.lng ?? 999),
    ).toBeLessThanOrEqual(180);
  });

  it("writes a position a hair south of the equator below the false northing", () => {
    expect(formatMgrs({ lat: -1e-7, lng: 0 })).toBe("31M AV 66021 99999");
  });

  it("round-trips a point whose 100 km row starts above its band's central-meridian top", () => {
    // Band V stops at 7 097 014 m on the central meridian, but at 63.9999
    // degrees north, 3 degrees east of zone 32's meridian, the northing is
    // about 7 100 460 m, in the row that starts at 7 100 000 m, above that
    // top. Reading the row back needs the allowance for the grid's growth.
    const position = { lat: 63.9999, lng: 11.99 };
    const text = formatMgrs(position);
    expect(text?.startsWith("32V")).toBe(true);
    const back = parseCoordinates(text ?? "");
    expect(back?.lat).toBeCloseTo(position.lat, 4);
    expect(back?.lng).toBeCloseTo(position.lng, 4);
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
    const position = parseCoordinates("11S PA 72349 11844");
    expect(position?.lat).toBeCloseTo(36.2361322, 4);
    expect(position?.lng).toBeCloseTo(-115.0820944, 4);
  });

  it("reads the square and digits with or without spaces", () => {
    // published: the two forms name the same point
    expect(parseCoordinates("4QFJ 12345 67890")).toEqual(
      parseCoordinates("4QFJ1234567890"),
    );
    expect(parseCoordinates("11SPA7234911844")).toEqual(
      parseCoordinates("11S PA 72349 11844"),
    );
  });

  it("reads lowercase letters", () => {
    expect(parseCoordinates("11spa7234911844")).toEqual(
      parseCoordinates("11S PA 72349 11844"),
    );
  });

  it("reads coarser precisions as the centre of the square", () => {
    // The 1 km, 100 m and 10 m squares that hold the published point
    // 33U XP 05004 44997. The point is somewhere in each square, so it is
    // within half the square's width of the centre, with a little room for
    // the grid scale.
    const point = parseCoordinates("33U XP 05004 44997");
    expect(point?.lat).toBeCloseTo(48.24949, 4);
    expect(point?.lng).toBeCloseTo(16.4145, 4);
    const withinSquare = (text: string, halfWidthMetres: number): void => {
      const square = parseCoordinates(text);
      const metresPerDegree = 111_320;
      expect(
        Math.abs((square?.lat ?? 0) - (point?.lat ?? 0)) * metresPerDegree,
      ).toBeLessThanOrEqual(halfWidthMetres * GRID_SLACK);
      expect(
        Math.abs((square?.lng ?? 0) - (point?.lng ?? 0)) *
          metresPerDegree *
          Math.cos(((point?.lat ?? 0) * Math.PI) / 180),
      ).toBeLessThanOrEqual(halfWidthMetres * GRID_SLACK);
    };
    withinSquare("33UXP0544", 500);
    withinSquare("33UXP050449", 50);
    withinSquare("33UXP05004499", 5);
  });

  it("names a coarser reference by its square's centre, not its corner", () => {
    // 33UXP0444 is the 1 km square from 4 000 m, 4 000 m to 5 000 m, 5 000 m
    // of the 100 km square; the corner reads one-metre digits 04000 44000.
    const centre = parseCoordinates("33UXP0444");
    const corner = parseCoordinates("33UXP 04000 44000");
    expect(centre?.lat).toBeGreaterThan(corner?.lat ?? 0);
    expect(centre?.lng).toBeGreaterThan(corner?.lng ?? 0);
  });

  it("refuses fewer than four digits", () => {
    expect(parseCoordinates("33UXP04")).toBeNull();
    expect(parseCoordinates("33U XP 04")).toBeNull();
  });

  it("reads references of 4, 6, 8 and 10 digits", () => {
    for (const text of [
      "33UXP0444",
      "33UXP050449",
      "33UXP05004499",
      "33UXP0500444997",
    ]) {
      expect(parseCoordinates(text)).not.toBeNull();
    }
  });

  it("never reads a date or an address as a reference", () => {
    for (const text of [
      "1 Dec 15",
      "7 Jan 12",
      "1 Feb 10",
      "1 Dec 2015",
      "7 Jan 2012",
      "1 Feb 2010",
      "3 Jun 1999",
      "31 Dec 1999",
      "12 Rue 10",
      "5 Pub 12",
      "12 Rue 1012",
      "5 Pub 1234",
      "12 Pub 5678",
      "1Dec 2015",
      "3Mar 2015",
      "1Feb2010",
      "1Dec2015",
      "7Jan 2012",
      "3Jun1999",
    ]) {
      expect(parseCoordinates(text), text).toBeNull();
    }
  });

  it("refuses letters of mixed case, which a month name is", () => {
    expect(parseCoordinates("33UxP0544")).toBeNull();
    expect(parseCoordinates("33Uxp0544")).toBeNull();
    expect(parseCoordinates("33uXP0544")).toBeNull();
    expect(parseCoordinates("33uxp0544")).not.toBeNull();
    expect(parseCoordinates("33UXP0544")).not.toBeNull();
  });

  it("refuses a space between the zone and the band letter", () => {
    expect(parseCoordinates("11 SPA 72349 11844")).toBeNull();
  });

  it("reads runs of white space as one space", () => {
    expect(parseCoordinates("31U CT 12345  67890")).toEqual(
      parseCoordinates("31U CT 12345 67890"),
    );
    expect(parseCoordinates("31U  CT   12345 \t 67890")).toEqual(
      parseCoordinates("31U CT 12345 67890"),
    );
    expect(parseCoordinates("34H   261882  6243182")).toEqual(
      parseCoordinates("34H 261882 6243182"),
    );
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
