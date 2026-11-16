// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { loadCountries } from "../regions/index.js";
import type { RuleContext } from "../types.js";
import { projectedCoordsRule } from "./projected-coords.js";

const noRegion: RuleContext = { regions: [], countries: undefined };
const withRegion = async (...regions: string[]): Promise<RuleContext> => ({
  regions,
  countries: await loadCountries(),
});
const feature = (geometry: unknown) => ({
  type: "Feature",
  properties: {},
  geometry,
});
const point = (x: number, y: number) =>
  feature({ type: "Point", coordinates: [x, y] });

type Named = { code: string }[];
const codes = (
  findings: ReturnType<typeof projectedCoordsRule.check>,
): string[] =>
  ((findings[0]?.data?.candidates ?? []) as Named).map(
    (candidate) => candidate.code,
  );

describe("projected-coords without a region", () => {
  const check = (value: unknown) => projectedCoordsRule.check(value, noRegion);

  it("flags numbers that cannot be longitude and latitude", () => {
    const [finding] = check(point(262000, 6247000));
    expect(finding).toMatchObject({
      ruleId: "projected-coords",
      severity: "error",
      confidence: "high",
      path: "/geometry/coordinates",
      data: { count: 1 },
    });
    expect(finding?.message).toContain("probably projected");
  });

  it("lists every system that the numbers could be in, in a fixed order, since it cannot choose", () => {
    expect(codes(check(point(262000, 6247000)))).toEqual([
      "EPSG:3857",
      "EPSG:326xx or EPSG:327xx",
      "EPSG:2154",
    ]);
  });

  it("says when the numbers fit no system it knows", () => {
    const [finding] = check(point(1e9, 1e9));
    expect(finding?.message).toContain("fit none of the systems");
    expect(finding?.data?.candidates).toEqual([]);
  });

  it("offers a southern UTM northing", () => {
    expect(codes(check(point(500000, 7000000)))).toContain(
      "EPSG:326xx or EPSG:327xx",
    );
  });

  it("does not flag valid longitude and latitude, or a longitude a little past 180", () => {
    expect(check(point(18.4, -33.9))).toEqual([]);
    expect(check(point(190, 10))).toEqual([]);
    expect(check(point(-180, 90))).toEqual([]);
  });

  it("flags a latitude past 90 and a longitude past 360", () => {
    expect(check(point(190, 95))).toHaveLength(1);
    expect(check(point(200, 100))).toHaveLength(1);
    expect(check(point(400, 10))).toHaveLength(1);
  });

  it("leaves a swapped latitude and longitude to coordinate-order, which is not projected data", () => {
    expect(check(point(-31.95, 115.86))).toEqual([]);
    expect(check(point(10, 120))).toEqual([]);
    expect(check(point(90, 180))).toEqual([]);
    expect(check(point(91, 120))).toHaveLength(1);
    expect(check(point(10, 181))).toHaveLength(1);
  });

  it("makes one finding for each geometry, and counts every out-of-range position", () => {
    const geometry = {
      type: "LineString",
      coordinates: [
        [262000, 6247000],
        [263000, 6248000],
        [10, 10],
      ],
    };
    const findings = check(feature(geometry));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.data).toMatchObject({ count: 2 });
    expect(findings[0]?.message).toContain("2 positions are");
  });

  it("samples a long run, so the cost does not grow with its length", () => {
    const coordinates = Array.from({ length: 5000 }, (_, i) => [
      262000 + i,
      6247000,
    ]);
    expect(
      check(feature({ type: "LineString", coordinates }))[0]?.data,
    ).toMatchObject({ count: 5000 });
  });

  it("looks inside collections and ignores null geometry and junk", () => {
    const geometry = {
      type: "GeometryCollection",
      geometries: [{ type: "Point", coordinates: [262000, 6247000] }],
    };
    expect(check(feature(geometry))[0]?.path).toBe(
      "/geometry/geometries/0/coordinates",
    );
    expect(check(feature(null))).toEqual([]);
    expect(check("x")).toEqual([]);
  });

  it("recognises Web Mercator and the national grids by what they would be", () => {
    expect(codes(check(point(2051000, -4010000)))).toContain("EPSG:3857");
    expect(codes(check(point(538877, 177292)))).toContain("EPSG:27700");
    expect(codes(check(point(652000, 6862000)))).toContain("EPSG:2154");
  });

  it("never throws on any numbers", () => {
    void fc.assert(
      fc.property(
        fc.double({ noNaN: true }),
        fc.double({ noNaN: true }),
        (x, y) => {
          expect(() => check(point(x, y))).not.toThrow();
        },
      ),
    );
  });
});

describe("projected-coords with a region", () => {
  it("ranks the UTM zone that lands in the country first (Cape Town, 34S)", async () => {
    const found = projectedCoordsRule.check(
      point(262000, 6247000),
      await withRegion("ZA"),
    );
    expect(codes(found)[0]).toBe("EPSG:32734");
    expect(
      ((found[0]?.data?.candidates ?? []) as { reason: string }[])[0]?.reason,
    ).toContain("in ZA");
  });

  it("ranks Lambert-93 first for French coordinates", async () => {
    const found = projectedCoordsRule.check(
      point(652000, 6862000),
      await withRegion("FR"),
    );
    expect(codes(found)[0]).toBe("EPSG:2154");
  });

  it("ranks Web Mercator first for Web Mercator metres", async () => {
    const found = projectedCoordsRule.check(
      point(2051000, -4010000),
      await withRegion("ZA"),
    );
    expect(codes(found)[0]).toBe("EPSG:3857");
  });

  it("names up to three systems and says when none puts the data in the region", async () => {
    const none = projectedCoordsRule.check(
      point(538877, 177292),
      await withRegion("ZA"),
    );
    expect(none[0]?.message).toContain("put them in ZA");
    const several = projectedCoordsRule.check(
      point(500000, 3000000),
      await withRegion("EG", "SA", "LY", "SD"),
    );
    expect(codes(several).length).toBeLessThanOrEqual(3);
  });

  it("ranks the Irish grid first for Irish coordinates", async () => {
    const found = projectedCoordsRule.check(
      point(600000, 750000),
      await withRegion("IE"),
    );
    expect(codes(found)[0]).toBe("EPSG:2157");
  });

  it("does nothing special when the countries are missing", () => {
    const found = projectedCoordsRule.check(point(262000, 6247000), {
      regions: ["ZA"],
      countries: undefined,
    });
    expect(found[0]?.data?.candidates).toEqual([]);
  });
});
