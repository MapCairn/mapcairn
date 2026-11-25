// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { parseCoordinates } from "./parseCoordinates";
import { formatUtm } from "./utm";

/*
 * Expected texts were computed on the WGS 84 ellipsoid and checked against
 * the reference implementations: the proj4js mgrs package's published test
 * values (which come from GEOTRANS) and the `utm` Python package.
 */

describe("formatUtm", () => {
  it("writes the zone, band letter, easting and northing", () => {
    expect(formatUtm({ lat: 0, lng: 0 })).toBe("31N 166021 0000000");
    expect(formatUtm({ lat: 51.5074, lng: -0.1278 })).toBe(
      "30U 699316 5710164",
    );
    expect(formatUtm({ lat: -33.9249, lng: 18.4241 })).toBe(
      "34H 261882 6243182",
    );
    expect(formatUtm({ lat: -33.8688, lng: 151.2093 })).toBe(
      "56H 334369 6250948",
    );
    expect(formatUtm({ lat: -0.1807, lng: -78.4678 })).toBe(
      "17M 781861 9980008",
    );
    expect(formatUtm({ lat: 64.1466, lng: -21.9426 })).toBe(
      "27W 454138 7113690",
    );
  });

  it("writes the Norway exception zones", () => {
    // Bergen: 3 to 12 degrees east in band V is zone 32.
    expect(formatUtm({ lat: 60.391, lng: 5.322 })).toBe("32V 297347 6700615");
    expect(formatUtm({ lat: 59.9139, lng: 10.7522 })).toBe(
      "32V 597980 6643119",
    );
    // West of 3 degrees east in band V stays zone 31, which is 3 degrees wide.
    expect(formatUtm({ lat: 60, lng: 1.5 })).toBe("31V 416338 6652360");
    expect(formatUtm({ lat: 60, lng: 11.9 })).toBe("32V 661721 6654957");
  });

  it("writes the Svalbard exception zones", () => {
    expect(formatUtm({ lat: 78.2232, lng: 15.6267 })).toBe(
      "33X 514279 8683355",
    );
    expect(formatUtm({ lat: 78.2232, lng: 5 })).toBe("31X 545560 8684058");
    expect(formatUtm({ lat: 78.2232, lng: 25 })).toBe("35X 454440 8684058");
    expect(formatUtm({ lat: 78.2232, lng: 40 })).toBe("37X 522783 8683474");
  });

  it("puts a boundary longitude in the zone to its east", () => {
    expect(formatUtm({ lat: 48, lng: 5.9999999 })).toBe("31U 723776 5320656");
    expect(formatUtm({ lat: 48, lng: 6 })).toBe("32U 276224 5320656");
  });

  it("writes the antimeridian in zone 60, as GEOTRANS does", () => {
    // Zone 60 runs from 174 east to 180 east, so a point on the antimeridian
    // is three degrees east of the central meridian, mirroring (0, 0) in
    // zone 31.
    expect(formatUtm({ lat: 0, lng: 180 })).toBe("60N 833979 0000000");
  });

  it("keeps the band edges in their bands", () => {
    expect(formatUtm({ lat: -79.9999, lng: 18 })).toBe("34C 441867 1116926");
    expect(formatUtm({ lat: 83.9999, lng: 18 })).toBe("33X 534995 9328994");
  });

  it("keeps the top of band X in the exception zones", () => {
    // Band X runs to 84 degrees north inclusive, so a point at exactly 84
    // is in the widened zone 31, not in zone 32, which band X does not use.
    expect(formatUtm({ lat: 84, lng: 6 })?.slice(0, 3)).toBe("31X");
    expect(formatUtm({ lat: 84, lng: 5 })?.slice(0, 3)).toBe("31X");
    expect(formatUtm({ lat: 84, lng: 25 })?.slice(0, 3)).toBe("35X");
  });

  it("starts each zone exception at its edge", () => {
    const zoneOf = (lat: number, lng: number): string | undefined =>
      formatUtm({ lat, lng })?.split(" ")[0];
    // Norway: band V runs 56 to 64 degrees north, zone 32 from 3 to 12 east.
    expect(zoneOf(56, 3)).toBe("32V");
    expect(zoneOf(56, 2.9999999)).toBe("31V");
    expect(zoneOf(60, 12)).toBe("33V");
    expect(zoneOf(60, 11.9999999)).toBe("32V");
    expect(zoneOf(55.9999999, 5)).toBe("31U");
    expect(zoneOf(64, 5)).toBe("31W");
    expect(zoneOf(63.9999999, 5)).toBe("32V");
    // Svalbard: band X from 72 north, zones 31, 33, 35 and 37.
    expect(zoneOf(72, 7)).toBe("31X");
    expect(zoneOf(72, 9)).toBe("33X");
    expect(zoneOf(78, 9.5)).toBe("33X");
    expect(zoneOf(72, 21)).toBe("35X");
    expect(zoneOf(72, 20.9999999)).toBe("33X");
    expect(zoneOf(72, 33)).toBe("37X");
    expect(zoneOf(72, 32.9999999)).toBe("35X");
    expect(zoneOf(72, 42)).toBe("38X");
    expect(zoneOf(72, 41.9999999)).toBe("37X");
    expect(zoneOf(71.9999999, 7)).toBe("32W");
  });

  it("writes a position a hair south of the equator below the false northing", () => {
    const text = formatUtm({ lat: -1e-7, lng: 0 });
    expect(text?.startsWith("31M")).toBe(true);
    expect(text).toBe("31M 166021 9999999");
  });

  it("wraps a longitude outside -180 to 180 before choosing the zone", () => {
    expect(formatUtm({ lat: 10, lng: 363 })).toBe(
      formatUtm({ lat: 10, lng: 3 }),
    );
    expect(formatUtm({ lat: 10, lng: -357 })).toBe(
      formatUtm({ lat: 10, lng: 3 }),
    );
  });

  it("refuses a position that is not a number", () => {
    expect(formatUtm({ lat: Number.NaN, lng: 0 })).toBeNull();
    expect(formatUtm({ lat: 10, lng: Number.NaN })).toBeNull();
    expect(formatUtm({ lat: 10, lng: Number.POSITIVE_INFINITY })).toBeNull();
    expect(formatUtm({ lat: Number.NEGATIVE_INFINITY, lng: 0 })).toBeNull();
  });

  it("refuses latitudes outside the UTM grid", () => {
    expect(formatUtm({ lat: 84.0000001, lng: 0 })).toBeNull();
    expect(formatUtm({ lat: 85, lng: 0 })).toBeNull();
    expect(formatUtm({ lat: -90, lng: 0 })).toBeNull();
    expect(formatUtm({ lat: -80.0000001, lng: 0 })).toBeNull();
    expect(formatUtm({ lat: 84, lng: 0 })).not.toBeNull();
    expect(formatUtm({ lat: -80, lng: 0 })).not.toBeNull();
  });
});

describe("parseCoordinates of UTM references", () => {
  it("reads a zone with a band letter", () => {
    const position = parseCoordinates("31N 166021 0000000");
    expect(position?.lat).toBeCloseTo(0, 4);
    expect(position?.lng).toBeCloseTo(0, 4);
    expect(parseCoordinates("34H 261882 6243182")?.lat).toBeCloseTo(
      -33.9249,
      4,
    );
    expect(parseCoordinates("34H 261882 6243182")?.lng).toBeCloseTo(18.4241, 4);
  });

  it("reads a zone with a hemisphere letter", () => {
    // The hemisphere letter names the hemisphere; the northing is the
    // projected distance from the equator, with the 10 000 000 m offset
    // south of it.
    const south = parseCoordinates("31 S 500000 4200000");
    expect(south?.lat).toBeCloseTo(-52.3503, 4);
    expect(south?.lng).toBeCloseTo(3, 4);
    const north = parseCoordinates("31 N 500000 4200000");
    expect(north?.lat).toBeCloseTo(37.9476, 4);
    expect(north?.lng).toBeCloseTo(3, 4);
  });

  it("reads the same position with the band letter and the hemisphere letter", () => {
    // Band U is in the northern hemisphere, so both letters name the same
    // hemisphere for a northing inside the band.
    expect(parseCoordinates("33U 500000 5500000")).toEqual(
      parseCoordinates("33 N 500000 5500000"),
    );
  });

  it("reads lowercase letters and extra white space", () => {
    expect(parseCoordinates("  31n 166021 0000000 ")).toEqual(
      parseCoordinates("31N 166021 0000000"),
    );
    expect(parseCoordinates("34h 261882 6243182")).toEqual(
      parseCoordinates("34H 261882 6243182"),
    );
    expect(parseCoordinates("  34H   261882   6243182  ")).toEqual(
      parseCoordinates("34H 261882 6243182"),
    );
  });

  it("refuses a reference without a letter, which is ambiguous", () => {
    expect(parseCoordinates("31 500000 5500000")).toBeNull();
  });

  it("refuses a zone outside 1 to 60", () => {
    expect(parseCoordinates("0U 500000 5500000")).toBeNull();
    expect(parseCoordinates("61U 500000 5500000")).toBeNull();
  });

  it("refuses a letter outside the bands", () => {
    expect(parseCoordinates("31Z 500000 5500000")).toBeNull();
    expect(parseCoordinates("31I 500000 5500000")).toBeNull();
    expect(parseCoordinates("31O 500000 5500000")).toBeNull();
    expect(parseCoordinates("31A 500000 5500000")).toBeNull();
  });

  it("refuses a northing that lands outside the UTM grid", () => {
    // Band U is 48 to 56 degrees north; 9 500 000 m is about 86 degrees north.
    expect(parseCoordinates("31U 500000 9500000")).toBeNull();
    // Band U with a northing of 1 100 000 m is about 10 degrees north.
    expect(parseCoordinates("31U 500000 1100000")).toBeNull();
    // Hemisphere S with a northing of 0 is the south pole.
    expect(parseCoordinates("31S 166021 0000000")).toBeNull();
    // A hemisphere N northing at the top of the grid runs out of degrees:
    // 9 999 966 m is the pole, where the longitude breaks down.
    expect(parseCoordinates("31N 500000 9999966")).toBeNull();
    expect(parseCoordinates("31N 500000 9999999")).toBeNull();
  });

  it("refuses an easting or northing of the wrong shape", () => {
    expect(parseCoordinates("31U 50000 5500000")).toBeNull();
    expect(parseCoordinates("31U 0500000 5500000")).toBeNull();
    expect(parseCoordinates("31U 500000 550000")).toBeNull();
    expect(parseCoordinates("31U 500000 55000000")).toBeNull();
    expect(parseCoordinates("31N 500000 55000")).toBeNull();
    expect(parseCoordinates("31U 500000 12345678")).toBeNull();
    expect(parseCoordinates("31U 999999999999 999999999999")).toBeNull();
  });

  it("refuses an easting outside 100 000 to 900 000 metres", () => {
    expect(parseCoordinates("31U 099999 5500000")).toBeNull();
    expect(parseCoordinates("31U 900001 5500000")).toBeNull();
    expect(parseCoordinates("31U 100000 5500000")).not.toBeNull();
    expect(parseCoordinates("31U 900000 5500000")).not.toBeNull();
  });

  it("reads the headline example", () => {
    const position = parseCoordinates("31U 500000 5500000");
    expect(position?.lat).toBeCloseTo(49.6525, 3);
    expect(position?.lng).toBeCloseTo(3, 4);
  });

  it("reads a band M reference in the southern hemisphere", () => {
    const position = parseCoordinates("17M 781861 9980008");
    expect(position?.lat).toBeCloseTo(-0.1807, 4);
    expect(position?.lng).toBeCloseTo(-78.4678, 4);
  });

  it("reads a trailing S as the southern hemisphere, never band S", () => {
    // Band S is 32 to 40 degrees north, but the letter S after the zone is
    // the hemisphere letter: "31S 500000 4200000" is 52 degrees south.
    expect(parseCoordinates("31S 500000 4200000")?.lat).toBeCloseTo(-52.35, 2);
    // formatUtm writes band S with N, which reads back as the same place.
    const text = formatUtm({ lat: 38, lng: 3 });
    expect(text?.startsWith("31N")).toBe(true);
    expect(parseCoordinates(text ?? "")?.lat).toBeCloseTo(38, 4);
  });

  it("refuses text with anything left over", () => {
    expect(parseCoordinates("31U 500000 5500000 extra")).toBeNull();
    expect(parseCoordinates("UTM 31U 500000 5500000")).toBeNull();
  });
});
