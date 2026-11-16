// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import * as fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { loadCountries } from "../regions/index.js";
import type { CountryIndex, Finding, RuleContext } from "../types.js";
import { coordinateOrderRule, listRegions } from "./coordinate-order.js";

const NO_REGION: RuleContext = { regions: [], countries: undefined };

let countries: CountryIndex;
beforeAll(async () => {
  countries = await loadCountries();
});

function inRegions(...regions: string[]): RuleContext {
  return { regions, countries };
}

function feature(geometry: unknown): unknown {
  return { type: "Feature", properties: {}, geometry };
}

function point(...coordinates: number[]): unknown {
  return feature({ type: "Point", coordinates });
}

/** A place as longitude, latitude and the same place written as latitude, longitude. */
type Place = readonly [name: string, region: string, number, number];

function swap(place: Place): number[] {
  return [place[3], place[2]];
}

function check(item: unknown, context: RuleContext): Finding[] {
  return [...coordinateOrderRule.check(item, context)];
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function readFixture(name: string): unknown[] {
  const url = new URL(
    `../../../fixtures/coordinate-order/${name}`,
    import.meta.url,
  );
  const parsed = JSON.parse(readFileSync(url, "utf8")) as unknown;
  return Array.isArray(parsed)
    ? parsed
    : (parsed as { features: unknown[] }).features;
}

/** Places that really are where they say, as longitude, latitude. */
const PLACES: readonly Place[] = [
  ["Cape Town", "ZA", 18.42, -33.92],
  ["Durban", "ZA", 31.02, -29.86],
  ["Johannesburg", "ZA", 28.05, -26.2],
  ["Hammerfest, Norway", "NO", 23.68, 70.66],
  ["Kirkenes, Norway", "NO", 30.05, 69.73],
  ["Dover", "GB", 1.31, 51.13],
  ["Calais", "FR", 1.86, 50.95],
  ["San Diego", "US", -117.16, 32.72],
  ["Honolulu", "US", -157.86, 21.31],
  ["Anchorage", "US", -149.9, 61.22],
  ["Cayenne, French Guiana", "FR", -52.33, 4.93],
  ["Suva, Fiji", "FJ", 178.44, -18.14],
  ["Anadyr, Chukotka", "RU", 177.5, 64.73],
  ["Auckland", "NZ", 174.76, -36.85],
  ["Nairobi", "KE", 36.82, -1.29],
  ["Monaco", "MC", 7.4246, 43.7384],
  ["Vatican City", "VA", 12.4534, 41.9029],
  ["San Marino", "SM", 12.4578, 43.9424],
  ["Vaduz, Liechtenstein", "LI", 9.5209, 47.141],
];

describe("coordinateOrderRule", () => {
  it("describes itself", () => {
    expect(coordinateOrderRule).toMatchObject({
      id: "coordinate-order",
      severity: "warning",
      confidence: "medium",
      fixable: false,
      needsRegion: false,
    });
    expect(coordinateOrderRule.summary).toMatch(/region sharpens/);
    expect(coordinateOrderRule.summary).toMatch(/.$/);
  });

  describe("fixtures", () => {
    it("reports nothing on the pass fixture", () => {
      for (const item of readFixture("pass.geojson")) {
        expect(check(item, inRegions("ZA"))).toEqual([]);
      }
    });

    it("reports the expected findings on the fail fixture, in order", () => {
      const reported = readFixture("fail.geojson").flatMap((item, index) =>
        check(item, inRegions("ZA")).map((finding) => ({
          path: `/features/${index}${finding.path}`,
          severity: finding.severity,
        })),
      );
      expect(reported).toEqual(readFixture("fail.expected.json"));
    });
  });

  describe("with a region", () => {
    it.each(PLACES)(
      "must flag %s written as latitude, longitude (region %s)",
      (_name, region, longitude, latitude) => {
        const [finding, ...others] = check(
          point(latitude, longitude),
          inRegions(region),
        );
        expect(others).toEqual([]);
        expect(finding).toMatchObject({
          ruleId: "coordinate-order",
          severity: "warning",
          confidence: "high",
          path: "/geometry/coordinates",
          fixable: false,
          data: { suspect: 1, sampled: 1, regions: [region] },
        });
      },
    );

    it.each(PLACES)(
      "must not flag %s written as longitude, latitude (region %s)",
      (_name, region, longitude, latitude) => {
        expect(check(point(longitude, latitude), inRegions(region))).toEqual(
          [],
        );
      },
    );

    it("says in one plain sentence what it saw", () => {
      const [finding] = check(point(-33.92, 18.42), inRegions("ZA"));
      expect(finding?.message).toBe(
        "The position is outside ZA but inside it when the two numbers are swapped, so the coordinates may be written as latitude, longitude.",
      );
    });

    it("names every region when there are several", () => {
      const [finding] = check(
        point(-33.92, 18.42),
        inRegions("FR", "NA", "ZA"),
      );
      expect(finding?.message).toContain(
        "outside FR, NA or ZA but inside one of them",
      );
      expect(finding?.data).toMatchObject({ regions: ["FR", "NA", "ZA"] });
    });

    it("flags a swap that lands in any one of several regions", () => {
      expect(check(point(-33.92, 18.42), inRegions("NO", "ZA"))).toHaveLength(
        1,
      );
    });

    it("flags Johannesburg and Nairobi written swapped even though both orders are valid coordinates", () => {
      expect(check(point(-26.2, 28.05), inRegions("ZA"))).toHaveLength(1);
      expect(check(point(-1.29, 36.82), inRegions("KE"))).toHaveLength(1);
    });

    it("flags a swapped Monaco, the tiniest of targets", () => {
      expect(check(point(43.7384, 7.4246), inRegions("MC"))).toHaveLength(1);
    });

    it("flags a swapped Fiji position that is east of the antimeridian", () => {
      expect(check(point(-16.3, -179.9), inRegions("FJ"))).toHaveLength(1);
    });

    it("must flag a swapped line, polygon, multipolygon and multilinestring, at the first suspect position", () => {
      const ring = [
        [-26, 27.9],
        [-26, 28.2],
        [-26.4, 28.2],
        [-26.4, 27.9],
        [-26, 27.9],
      ];
      const geometries: [unknown, string][] = [
        [{ type: "LineString", coordinates: ring }, "/geometry/coordinates/0"],
        [
          { type: "MultiLineString", coordinates: [ring, ring] },
          "/geometry/coordinates/0/0",
        ],
        [{ type: "Polygon", coordinates: [ring] }, "/geometry/coordinates/0/0"],
        [
          { type: "MultiPolygon", coordinates: [[ring], [ring]] },
          "/geometry/coordinates/0/0/0",
        ],
      ];
      for (const [geometry, path] of geometries) {
        const findings = check(feature(geometry), inRegions("ZA"));
        expect(findings.map((finding) => finding.path)).toEqual([path]);
        expect(findings[0]?.confidence).toBe("high");
      }
    });

    it("must not flag a polygon, line or multipolygon that is written correctly", () => {
      const ring = [
        [27.9, -26],
        [28.2, -26],
        [28.2, -26.4],
        [27.9, -26.4],
        [27.9, -26],
      ];
      for (const geometry of [
        { type: "LineString", coordinates: ring },
        { type: "Polygon", coordinates: [ring] },
        { type: "MultiPolygon", coordinates: [[ring]] },
      ]) {
        expect(check(feature(geometry), inRegions("ZA"))).toEqual([]);
      }
    });

    it("reads 3D coordinates, in either order", () => {
      expect(check(point(-33.92, 18.42, 12), inRegions("ZA"))).toHaveLength(1);
      expect(check(point(18.42, -33.92, 12), inRegions("ZA"))).toEqual([]);
    });

    it("gives medium confidence when most but not all of a MultiPoint is swapped", () => {
      const item = feature({
        type: "MultiPoint",
        coordinates: [
          [-29.86, 31.02],
          [18.42, -33.92],
          [-26.2, 28.05],
        ],
      });
      const [finding] = check(item, inRegions("ZA"));
      expect(finding).toMatchObject({
        confidence: "medium",
        path: "/geometry/coordinates/0",
        data: { suspect: 2, sampled: 3 },
      });
      expect(finding?.message).toContain("2 of 3 sampled positions");
    });

    it("says all of a swapped geometry's positions when there are several", () => {
      const item = feature({
        type: "LineString",
        coordinates: [
          [-29.86, 31.02],
          [-26.2, 28.05],
        ],
      });
      expect(check(item, inRegions("ZA"))[0]?.message).toContain(
        "All 2 sampled positions",
      );
    });

    it("must not flag a MultiPoint with one swapped point among good ones, or with exactly half swapped", () => {
      const good = [
        [18.42, -33.92],
        [31.02, -29.86],
        [28.05, -26.2],
      ];
      const oneSwapped = feature({
        type: "MultiPoint",
        coordinates: [...good, [-29.86, 31.02]],
      });
      const half = feature({
        type: "MultiPoint",
        coordinates: [good[0], good[1], [-29.86, 31.02], [-26.2, 28.05]],
      });
      expect(check(oneSwapped, inRegions("ZA"))).toEqual([]);
      expect(check(half, inRegions("ZA"))).toEqual([]);
    });

    it("flags a MultiPoint with mostly swapped points at the first of them, not at a good one", () => {
      const item = feature({
        type: "MultiPoint",
        coordinates: [
          [18.42, -33.92],
          [-29.86, 31.02],
          [-26.2, 28.05],
          [-25.75, 28.19],
        ],
      });
      const [finding] = check(item, inRegions("ZA"));
      expect(finding?.path).toBe("/geometry/coordinates/1");
      expect(finding?.confidence).toBe("medium");
    });

    it("checks each geometry of a nested GeometryCollection on its own", () => {
      const item = feature({
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [-33.92, 18.42] },
          {
            type: "GeometryCollection",
            geometries: [
              { type: "Point", coordinates: [18.42, -33.92] },
              { type: "LineString", coordinates: [[-29.86, 31.02]] },
            ],
          },
        ],
      });
      expect(
        check(item, inRegions("ZA")).map((finding) => finding.path),
      ).toEqual([
        "/geometry/geometries/0/coordinates",
        "/geometry/geometries/1/geometries/1/coordinates/0",
      ]);
    });

    it("reads a bare geometry as well as a feature", () => {
      const findings = check(
        { type: "Point", coordinates: [-33.92, 18.42] },
        inRegions("ZA"),
      );
      expect(findings.map((finding) => finding.path)).toEqual(["/coordinates"]);
    });

    it("must not flag a position that is on a far island the 1:110m outline lacks, such as Marion Island (swapped too, it is no clearer)", () => {
      expect(check(point(37.75, -46.9), inRegions("ZA"))).toEqual([]);
      expect(check(point(-46.9, 37.75), inRegions("ZA"))).toEqual([]);
    });

    it("must not flag the Canary Islands, Reunion, the Chatham Islands or Key West written correctly, though the outlines lack them", () => {
      expect(check(point(-15.41, 28.12), inRegions("ES"))).toEqual([]);
      expect(check(point(55.45, -20.88), inRegions("FR"))).toEqual([]);
      expect(check(point(-176.56, -43.95), inRegions("NZ"))).toEqual([]);
      expect(check(point(-81.78, 24.55), inRegions("US"))).toEqual([]);
    });

    it("must not flag Svalbard, Alaska, Hawaii, French Guiana or Chukotka written correctly, which the outlines do hold", () => {
      const places: [number, number, string][] = [
        [15.63, 78.22, "NO"],
        [11.93, 78.92, "NO"],
        [-156.79, 71.29, "US"],
        [-52.33, 4.93, "FR"],
        [170.3, 69.7, "RU"],
        [-179.9, -16.3, "FJ"],
      ];
      for (const [longitude, latitude, region] of places) {
        expect(check(point(longitude, latitude), inRegions(region))).toEqual(
          [],
        );
      }
    });

    it("must not flag a good point just across a border or coast from the region (Calais for Great Britain, Dover for France, Dublin for Great Britain)", () => {
      expect(check(point(1.86, 50.95), inRegions("GB"))).toEqual([]);
      expect(check(point(1.31, 51.13), inRegions("FR"))).toEqual([]);
      expect(check(point(-6.26, 53.35), inRegions("GB"))).toEqual([]);
    });

    it("must not flag a feature that is entirely in the sea", () => {
      expect(check(point(0, 0), inRegions("ZA"))).toEqual([]);
      expect(check(point(-5, -40), inRegions("ZA"))).toEqual([]);
    });

    it("must not flag a continent-sized polygon around the region", () => {
      const africa = [
        [-18, -35],
        [52, -35],
        [52, 38],
        [-18, 38],
        [-18, -35],
      ];
      const item = feature({ type: "Polygon", coordinates: [africa] });
      expect(check(item, inRegions("ZA"))).toEqual([]);
    });

    it("cannot tell a point that is inside the region in both orders (60 N 60 E is in Russia either way)", () => {
      expect(check(point(60, 60), inRegions("RU"))).toEqual([]);
    });

    it("cannot tell a swapped position that the outline lacks, such as Marion Island in South Africa", () => {
      expect(check(point(-46.9, 37.75), inRegions("ZA"))).toEqual([]);
    });

    it("cannot tell a swapped position whose swap is also outside the region (a swapped Nairobi against Tanzania)", () => {
      expect(check(point(-1.29, 36.82), inRegions("TZ"))).toEqual([]);
    });

    it("wrongly reports open-sea data in the North Atlantic as swapped when its swap lands in the region (a known false positive for South Africa)", () => {
      expect(check(point(-25, 28), inRegions("ZA"))).toHaveLength(1);
    });

    it("wrongly reports a Mogadishu position as swapped against France, because its swap lands in France (a known false positive)", () => {
      expect(check(point(45.3, 2.05), inRegions("FR"))).toHaveLength(1);
    });

    it("treats regions without outlines as no region at all", () => {
      const item = point(-33.92, 115.86);
      expect(
        check(item, { regions: ["ZA"], countries: undefined }).map(
          (finding) => finding.severity,
        ),
      ).toEqual(["info"]);
    });

    it("tests at most 64 positions of a huge geometry, and still finds what is swapped in it", {
      timeout: 30_000,
    }, () => {
      let calls = 0;
      const counting: CountryIndex = {
        has: (code) => countries.has(code),
        bounds: (code) => countries.bounds(code),
        locate: (longitude, latitude) => countries.locate(longitude, latitude),
        contains: (code, longitude, latitude) => {
          calls += 1;
          return countries.contains(code, longitude, latitude);
        },
      };
      const swapped = Array.from({ length: 1_000_000 }, (_, index) => [
        -30 + (index % 100) / 100,
        20 + (index % 50) / 100,
      ]);
      const item = feature({ type: "LineString", coordinates: swapped });
      const findings = check(item, { regions: ["ZA"], countries: counting });
      expect(findings).toHaveLength(1);
      expect(findings[0]?.data).toMatchObject({ sampled: 64 });
      expect(calls).toBeLessThanOrEqual(128);
    });
  });

  describe("without a region", () => {
    const perth: Place = ["Perth", "AU", 115.86, -31.95];

    it.each([
      perth,
      ["Sydney", "AU", 151.21, -33.87],
      ["Auckland", "NZ", 174.76, -36.85],
      ["Suva, Fiji", "FJ", 178.44, -18.14],
      ["Tokyo", "JP", 139.69, 35.68],
      ["Beijing", "CN", 116.4, 39.9],
      ["Hong Kong", "HK", 114.17, 22.3],
      ["Honolulu", "US", -157.86, 21.31],
      ["Anchorage", "US", -149.9, 61.22],
    ] as readonly Place[])(
      "must flag %s written as latitude, longitude, as information of low confidence",
      (...place) => {
        const [finding, ...others] = check(point(...swap(place)), NO_REGION);
        expect(others).toEqual([]);
        expect(finding).toMatchObject({
          ruleId: "coordinate-order",
          severity: "info",
          confidence: "low",
          path: "/geometry/coordinates",
          fixable: false,
          data: { suspect: 1, sampled: 1, regions: [] },
        });
      },
    );

    it.each([
      perth,
      ["Cape Town", "ZA", 18.42, -33.92],
      ["Paris", "FR", 2.35, 48.85],
      ["New York", "US", -74, 40.71],
      ["London", "GB", -0.12, 51.5],
    ] as readonly Place[])(
      "must not flag %s written as longitude, latitude",
      (_name, _region, longitude, latitude) => {
        expect(check(point(longitude, latitude), NO_REGION)).toEqual([]);
      },
    );

    it.each([
      ["Cape Town", "ZA", 18.42, -33.92],
      ["Johannesburg", "ZA", 28.05, -26.2],
      ["New York", "US", -74, 40.71],
      ["London", "GB", -0.12, 51.5],
      ["Paris", "FR", 2.35, 48.85],
      ["Nairobi", "KE", 36.82, -1.29],
    ] as readonly Place[])(
      "cannot tell %s written as latitude, longitude, because both orders are valid coordinates",
      (...place) => {
        expect(check(point(...swap(place)), NO_REGION)).toEqual([]);
      },
    );

    it("never flags a position where both orders are valid", () => {
      void fc.assert(
        fc.property(
          fc.double({ min: -90, max: 90, noNaN: true }),
          fc.double({ min: -90, max: 90, noNaN: true }),
          (first, second) => {
            expect(check(point(first, second), NO_REGION)).toEqual([]);
          },
        ),
      );
    });

    it("never flags projected coordinates, which projected-coords reports", () => {
      for (const coordinates of [
        [500000, 4000000],
        [500000, 100],
        [91, 120],
        [333000, 6000000, 12],
      ]) {
        expect(check(point(...coordinates), NO_REGION)).toEqual([]);
      }
    });

    it("never flags a second number that is out of range as a longitude too", () => {
      expect(check(point(10, 180.1), NO_REGION)).toEqual([]);
      expect(check(point(190, 10), NO_REGION)).toEqual([]);
    });

    it("draws the line at 90 for both numbers and at 180 for the second", () => {
      expect(check(point(90, 180), NO_REGION)).toHaveLength(1);
      expect(check(point(90, 90), NO_REGION)).toEqual([]);
      expect(check(point(90.1, 120), NO_REGION)).toEqual([]);
      expect(check(point(-90, -90.1), NO_REGION)).toHaveLength(1);
    });

    it("flags a swapped line or polygon only when every position fits", () => {
      const swappedLine = feature({
        type: "LineString",
        coordinates: [
          [-31.95, 115.86],
          [-33.87, 151.21],
        ],
      });
      const mixedLine = feature({
        type: "LineString",
        coordinates: [
          [-31.95, 115.86],
          [-33.87, 151.21],
          [115.86, -31.95],
        ],
      });
      const swappedPolygon = feature({
        type: "Polygon",
        coordinates: [
          [
            [-31.9, 115.8],
            [-31.9, 115.9],
            [-32, 115.9],
            [-31.9, 115.8],
          ],
        ],
      });
      const [line] = check(swappedLine, NO_REGION);
      expect(line?.message).toBe(
        "All 2 sampled positions have a second number above 90, which cannot be a latitude, and a first number that fits as one, so the coordinates may be written as latitude, longitude.",
      );
      expect(line?.path).toBe("/geometry/coordinates/0");
      expect(check(mixedLine, NO_REGION)).toEqual([]);
      expect(check(swappedPolygon, NO_REGION)[0]?.path).toBe(
        "/geometry/coordinates/0/0",
      );
    });

    it("says the position, not all positions, for one position", () => {
      expect(check(point(-31.95, 115.86), NO_REGION)[0]?.message).toMatch(
        /^The position has a second number/,
      );
    });

    it("reports each geometry of a collection on its own", () => {
      const item = feature({
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [-31.95, 115.86] },
          { type: "Point", coordinates: [115.86, -31.95] },
          { type: "Point", coordinates: [-33.87, 151.21] },
        ],
      });
      expect(check(item, NO_REGION).map((finding) => finding.path)).toEqual([
        "/geometry/geometries/0/coordinates",
        "/geometry/geometries/2/coordinates",
      ]);
    });
  });

  describe("on any input", () => {
    it("reports nothing for a null geometry, an empty one, a missing one or no geometry at all", () => {
      const context = inRegions("ZA");
      for (const item of [
        feature(null),
        { type: "Feature", properties: {} },
        feature({ type: "Point", coordinates: [] }),
        feature({ type: "LineString", coordinates: [] }),
        feature({ type: "MultiPolygon", coordinates: [] }),
        feature({ type: "GeometryCollection", geometries: [] }),
        feature({ type: "Circle", coordinates: [1, 2] }),
        null,
        "text",
        7,
        [],
      ]) {
        expect(check(item, context)).toEqual([]);
        expect(check(item, NO_REGION)).toEqual([]);
      }
    });

    it("never throws and never changes its input, whatever JSON it is given", () => {
      void fc.assert(
        fc.property(fc.jsonValue(), (value) => {
          const frozen = deepFreeze(structuredClone(value));
          expect(() => check(frozen, inRegions("ZA", "FR"))).not.toThrow();
          expect(() => check(frozen, NO_REGION)).not.toThrow();
        }),
      );
    });

    it("never throws for geometries of the right shape with any numbers", () => {
      void fc.assert(
        fc.property(
          fc.array(fc.tuple(fc.double(), fc.double()), { maxLength: 6 }),
          (positions) => {
            const item = feature({
              type: "LineString",
              coordinates: positions,
            });
            expect(() => check(item, inRegions("ZA"))).not.toThrow();
            expect(() => check(item, NO_REGION)).not.toThrow();
          },
        ),
      );
    });
  });
});

describe("listRegions", () => {
  it("joins one, two and three codes the way a sentence does", () => {
    expect(listRegions(["ZA"])).toBe("ZA");
    expect(listRegions(["ZA", "NA"])).toBe("ZA or NA");
    expect(listRegions(["ZA", "NA", "FR"])).toBe("ZA, NA or FR");
  });
});
