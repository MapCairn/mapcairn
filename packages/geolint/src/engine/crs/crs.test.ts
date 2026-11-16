// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  AIRY_1830,
  GRS80,
  inverseLambertConformalConic,
  inverseTransverseMercator,
  inverseWebMercator,
  WEB_MERCATOR_RADIUS,
  WGS84,
} from "./projections.js";
import { allUtmZones, fitsArea, OTHER_SYSTEMS, utmSystem } from "./systems.js";

const close = (
  actual: readonly number[],
  expected: readonly number[],
  places = 6,
) => {
  expect(actual[0]).toBeCloseTo(expected[0] as number, places);
  expect(actual[1]).toBeCloseTo(expected[1] as number, places);
};

const utm31 = {
  ellipsoid: WGS84,
  centralMeridian: 3,
  latitudeOfOrigin: 0,
  scale: 0.9996,
  falseEasting: 500000,
  falseNorthing: 0,
};

describe("inverseTransverseMercator", () => {
  it("puts the false origin on the central meridian at the equator", () => {
    close(inverseTransverseMercator(utm31, 500000, 0), [3, 0], 9);
  });

  it("gives the published northing for 45 degrees on the central meridian", () => {
    close(inverseTransverseMercator(utm31, 500000, 4982950.4), [3, 45], 6);
  });

  it("finds the Eiffel Tower from its UTM 31N coordinates", () => {
    close(
      inverseTransverseMercator(utm31, 448251.9, 5411932.7),
      [2.2945, 48.8584],
      3,
    );
  });

  it("honours a latitude of origin, a false northing and another ellipsoid", () => {
    const bng = OTHER_SYSTEMS.find((system) => system.code === "EPSG:27700");
    close(bng?.inverse(400000, -100000) ?? [], [-2, 49], 9);
    const itm = OTHER_SYSTEMS.find((system) => system.code === "EPSG:2157");
    close(itm?.inverse(600000, 750000) ?? [], [-8, 53.5], 9);
    expect(AIRY_1830.a).toBeLessThan(WGS84.a);
    expect(GRS80.a).toBe(WGS84.a);
  });

  it("finds Greenwich on the British National Grid, within the datum shift", () => {
    const bng = OTHER_SYSTEMS.find((system) => system.code === "EPSG:27700");
    close(bng?.inverse(538877, 177292) ?? [], [0, 51.4772], 2);
  });
});

describe("inverseLambertConformalConic", () => {
  const lambert = {
    ellipsoid: GRS80,
    firstParallel: 49,
    secondParallel: 44,
    latitudeOfOrigin: 46.5,
    centralMeridian: 3,
    falseEasting: 700000,
    falseNorthing: 6600000,
  };

  it("puts the false origin at its latitude and central meridian", () => {
    close(inverseLambertConformalConic(lambert, 700000, 6600000), [3, 46.5], 9);
  });

  it("finds Paris from Lambert-93 coordinates", () => {
    close(
      inverseLambertConformalConic(lambert, 652000, 6862000),
      [2.35, 48.85],
      1,
    );
  });
});

describe("inverseWebMercator", () => {
  it("is the origin at the origin and 180 degrees at the edge", () => {
    close(inverseWebMercator(0, 0), [0, 0], 12);
    expect(inverseWebMercator(Math.PI * WEB_MERCATOR_RADIUS, 0)[0]).toBeCloseTo(
      180,
      9,
    );
  });

  it("inverts the forward formula", () => {
    const longitude = 18.4241;
    const x = (longitude * Math.PI * WEB_MERCATOR_RADIUS) / 180;
    const latitude = -33.9249;
    const y =
      WEB_MERCATOR_RADIUS *
      Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
    close(inverseWebMercator(x, y), [longitude, latitude], 9);
  });
});

describe("the candidate systems", () => {
  it("lists a UTM zone with its EPSG code and name, north and south", () => {
    expect(utmSystem(34, false)).toMatchObject({
      code: "EPSG:32734",
      name: "WGS 84 / UTM zone 34S",
    });
    expect(utmSystem(31, true)).toMatchObject({
      code: "EPSG:32631",
      name: "WGS 84 / UTM zone 31N",
    });
  });

  it("has sixty zones in each hemisphere", () => {
    const zones = allUtmZones();
    expect(zones).toHaveLength(120);
    expect(new Set(zones.map((zone) => zone.code)).size).toBe(120);
  });

  it("puts a southern northing south of the equator", () => {
    const zone = utmSystem(34, false);
    const [longitude, latitude] = zone.inverse(262000, 6247000);
    expect(longitude).toBeCloseTo(18.4, 0);
    expect(latitude).toBeCloseTo(-33.9, 0);
  });

  it("decides whether a result is in the area of use, with a margin", () => {
    const zone = utmSystem(34, false);
    expect(fitsArea(zone, [18.4, -33.9])).toBe(true);
    expect(fitsArea(zone, [10, -33.9])).toBe(false);
    expect(fitsArea(zone, [18.4, 10])).toBe(false);
    expect(fitsArea(zone, [Number.NaN, -33.9])).toBe(false);
  });

  it("describes each other system's range", () => {
    for (const system of OTHER_SYSTEMS) {
      expect(system.describeRange.length).toBeGreaterThan(10);
    }
  });
});
