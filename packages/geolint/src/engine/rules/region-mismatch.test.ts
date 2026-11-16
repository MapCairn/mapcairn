// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import * as fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { loadCountries } from "../regions/index.js";
import type { CountryIndex, Finding, RuleContext } from "../types.js";
import { regionMismatchRule } from "./region-mismatch.js";

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

function check(item: unknown, context: RuleContext): Finding[] {
  return [...regionMismatchRule.check(item, context)];
}

function box(
  west: number,
  south: number,
  east: number,
  north: number,
): number[][] {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
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
    `../../../fixtures/region-mismatch/${name}`,
    import.meta.url,
  );
  const parsed = JSON.parse(readFileSync(url, "utf8")) as unknown;
  return Array.isArray(parsed)
    ? parsed
    : (parsed as { features: unknown[] }).features;
}

const WINDHOEK = [17.08, -22.56];
const FRANCISTOWN = [27.51, -21.17];
const MAPUTO = [32.57, -25.97];
const HARARE = [31.05, -17.83];

/**
 * A ring through Luanda, Nairobi, Mozambique, Maputo and Windhoek with two sea
 * corners at the given latitude: most vertices are in countries other than South
 * Africa, none is in it, and the bounding box covers it only when `south` is
 * below its southern tip.
 */
function surrounding(south: number): number[][] {
  return [
    [13.23, -8.84],
    [36.82, -1.29],
    [35, -18],
    MAPUTO,
    [40, south],
    [10, south],
    WINDHOEK,
    [13.23, -8.84],
  ];
}

/** A place as longitude, latitude, with the region it must be checked against. */
type Place = readonly [name: string, region: string, number, number];

describe("regionMismatchRule", () => {
  it("describes itself", () => {
    expect(regionMismatchRule).toMatchObject({
      id: "region-mismatch",
      severity: "warning",
      confidence: "medium",
      fixable: false,
      needsRegion: true,
    });
    expect(regionMismatchRule.summary).toMatch(/.$/);
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

  describe("without a region", () => {
    it("does nothing, whatever the feature", () => {
      expect(check(point(0, 0), NO_REGION)).toEqual([]);
      expect(check(point(0, 0), { regions: [], countries })).toEqual([]);
    });

    it("does nothing when regions were named but no outlines were supplied", () => {
      expect(
        check(point(0, 0), { regions: ["ZA"], countries: undefined }),
      ).toEqual([]);
    });
  });

  describe("a feature that must be flagged", () => {
    it.each([
      ["Paris", "ZA", 2.35, 48.85],
      ["Windhoek, Namibia", "ZA", 17.08, -22.56],
      ["Harare, Zimbabwe", "ZA", 31.05, -17.83],
      [
        "Maputo, Mozambique, 0.6 degrees beyond the border",
        "ZA",
        32.57,
        -25.97,
      ],
      ["Calais, across the Channel", "GB", 1.86, 50.95],
      ["Dublin, across the Irish Sea", "GB", -6.26, 53.35],
      ["Rome, outside the Vatican", "VA", 12.4964, 41.9028],
      ["Oslo, outside Sweden", "SE", 10.75, 59.91],
      ["Wellington", "AU", 174.78, -41.29],
      ["Nairobi, Kenya", "ZA", 36.82, -1.29],
      ["Lagos, Nigeria", "ZA", 3.38, 6.52],
      ["Sydney, Australia", "ZA", 151.21, -33.87],
      ["Cairo, Egypt", "ZA", 31.24, 30.04],
      ["Johannesburg, South Africa", "FR", 28.05, -26.2],
      ["Buenos Aires, Argentina", "CL", -58.4, -34.6],
    ] as readonly Place[])(
      "must flag a point at %s (region %s)",
      (_name, region, longitude, latitude) => {
        const [finding, ...others] = check(
          point(longitude, latitude),
          inRegions(region),
        );
        expect(others).toEqual([]);
        expect(finding).toMatchObject({
          ruleId: "region-mismatch",
          severity: "warning",
          confidence: "medium",
          path: "/geometry",
          fixable: false,
          data: { regions: [region], positions: 1 },
        });
      },
    );

    it("describes a single position and several in one plain sentence", () => {
      const [one] = check(point(2.35, 48.85), inRegions("ZA"));
      expect(one?.message).toBe(
        "The only position in this feature is outside ZA, even allowing for a coarse coastline, so the feature may belong to another place.",
      );
      const [many] = check(
        feature({
          type: "LineString",
          coordinates: [
            [2.35, 48.85],
            [2.4, 48.9],
            [2.5, 48.95],
          ],
        }),
        inRegions("ZA", "NA"),
      );
      expect(many?.message).toBe(
        "All 3 positions in this feature are outside ZA or NA, even allowing for a coarse coastline, so the feature may belong to another place.",
      );
      expect(many?.data).toEqual({
        regions: ["ZA", "NA"],
        positions: 3,
        checked: 3,
      });
    });

    it("flags a line, polygon, multipoint and multipolygon that lie wholly elsewhere, at the geometry", () => {
      const paris = box(2, 48, 3, 49);
      const geometries = [
        { type: "LineString", coordinates: paris },
        { type: "MultiLineString", coordinates: [paris, paris] },
        { type: "Polygon", coordinates: [paris] },
        { type: "MultiPolygon", coordinates: [[paris], [paris]] },
        { type: "MultiPoint", coordinates: paris },
      ];
      for (const geometry of geometries) {
        const findings = check(feature(geometry), inRegions("ZA"));
        expect(findings.map((finding) => finding.path)).toEqual(["/geometry"]);
        expect(findings[0]?.data).toMatchObject({
          positions:
            geometry.type === "MultiLineString" ||
            geometry.type === "MultiPolygon"
              ? 10
              : 5,
        });
      }
    });

    it("flags a feature with 3D coordinates", () => {
      expect(check(point(2.35, 48.85, 35), inRegions("ZA"))).toHaveLength(1);
    });

    it("flags a collection of which every geometry lies elsewhere, at the first geometry that has a position", () => {
      const item = feature({
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [] },
          {
            type: "GeometryCollection",
            geometries: [
              { type: "Point", coordinates: [2.35, 48.85] },
              { type: "Point", coordinates: [-0.13, 51.51] },
            ],
          },
        ],
      });
      const [finding] = check(item, inRegions("ZA"));
      expect(finding?.path).toBe("/geometry/geometries/1/geometries/0");
      expect(finding?.data).toMatchObject({ positions: 2 });
    });

    it("flags a feature when only some of its positions are swapped and the swap explains too few of them", () => {
      const item = feature({
        type: "MultiPoint",
        coordinates: [
          [-33.92, 18.42],
          [-29.86, 31.02],
          [2.35, 48.85],
          [-0.13, 51.51],
        ],
      });
      expect(check(item, inRegions("ZA"))).toHaveLength(1);
    });

    it("flags a thin polygon north of the region, none of whose vertices is inside it", () => {
      const sliver = feature({
        type: "Polygon",
        coordinates: [box(15, -20, 35, -19.5)],
      });
      expect(check(sliver, inRegions("ZA"))).toHaveLength(1);
    });

    it("flags a polygon whose vertices lie in the countries round the region but none in it", () => {
      const ring = [WINDHOEK, FRANCISTOWN, MAPUTO, HARARE, WINDHOEK];
      expect(
        check(
          feature({ type: "Polygon", coordinates: [ring] }),
          inRegions("ZA"),
        ),
      ).toHaveLength(1);
    });

    it("flags a polygon of land vertices and sea corners that stops short of the region's bounding box", () => {
      const ring = surrounding(-30);
      expect(
        check(
          feature({ type: "Polygon", coordinates: [ring] }),
          inRegions("ZA"),
        ),
      ).toHaveLength(1);
    });

    it("cannot use the bounding box guard for a region that crosses the antimeridian (Fiji, Russia), so a world-sized polygon is still reported", () => {
      const ring = [
        [2.35, 48.85],
        [151.21, -33.87],
        [-70.65, -33.45],
        [28.05, -26.2],
        [-179, 0],
        [179, 0],
        [2.35, 48.85],
      ];
      expect(
        check(
          feature({ type: "Polygon", coordinates: [ring] }),
          inRegions("FJ"),
        ),
      ).toHaveLength(1);
    });

    it("flags a feature whose positions are exactly half in other countries and half in the sea", () => {
      const item = feature({
        type: "MultiPoint",
        coordinates: [
          [2.35, 48.85],
          [0, 0],
        ],
      });
      expect(check(item, inRegions("ZA"))).toHaveLength(1);
    });

    it("flags a feature when the index has no bounding box for the region", () => {
      const sparse: CountryIndex = {
        has: () => true,
        bounds: () => undefined,
        contains: () => false,
        locate: () => "FR",
      };
      expect(
        check(point(2.35, 48.85), { regions: ["ZZ"], countries: sparse }),
      ).toHaveLength(1);
    });

    it("flags a bare geometry at its own pointer", () => {
      const [finding] = check(
        { type: "Point", coordinates: [2.35, 48.85] },
        inRegions("ZA"),
      );
      expect(finding?.path).toBe("");
    });

    it("tests a huge geometry with a bounded number of lookups and still flags it", {
      timeout: 30_000,
    }, () => {
      let calls = 0;
      const counting: CountryIndex = {
        has: (code) => countries.has(code),
        bounds: (code) => countries.bounds(code),
        contains: (code, longitude, latitude) => {
          calls += 1;
          return countries.contains(code, longitude, latitude);
        },
        locate: (longitude, latitude) => {
          calls += 1;
          return countries.locate(longitude, latitude);
        },
      };
      const ring = Array.from({ length: 1_000_000 }, (_, index) => {
        const angle = (index / 1_000_000) * 2 * Math.PI;
        return [2.35 + Math.cos(angle), 48.85 + Math.sin(angle)];
      });
      ring.push(ring[0] as number[]);
      const item = feature({ type: "Polygon", coordinates: [ring] });
      const findings = check(item, { regions: ["ZA"], countries: counting });
      expect(findings).toHaveLength(1);
      expect(findings[0]?.data).toMatchObject({
        positions: 1_000_001,
        checked: 1000,
      });
      expect(findings[0]?.message).toBe(
        "All 1,000 positions checked in this feature (of 1,000,001) are outside ZA, even allowing for a coarse coastline, so the feature may belong to another place.",
      );
      expect(calls).toBeLessThanOrEqual(2 * 1000 + 2 * 64);
    });
  });

  describe("a feature that must not be flagged", () => {
    it.each([
      ["Cape Town", "ZA", 18.42, -33.92],
      ["Cape Agulhas, the southern tip", "ZA", 20.0, -34.83],
      ["Port Nolloth, on the cold coast", "ZA", 16.85, -29.25],
      ["Durban", "ZA", 31.02, -29.86],
      ["Musina, on the northern border", "ZA", 30.0, -22.35],
      ["Hammerfest, the northern coast of Norway", "NO", 23.68, 70.66],
      ["Longyearbyen, Svalbard", "NO", 15.63, 78.22],
      ["Ny-Alesund, Svalbard", "NO", 11.93, 78.92],
      ["Bergen, on a fjord coast", "NO", 5.32, 60.39],
      ["Dover", "GB", 1.31, 51.13],
      ["Calais", "FR", 1.86, 50.95],
      ["Belfast", "GB", -5.93, 54.6],
      ["Honolulu, Hawaii", "US", -157.86, 21.31],
      ["Anchorage, Alaska", "US", -149.9, 61.22],
      ["Utqiagvik, Alaska", "US", -156.79, 71.29],
      ["Cayenne, French Guiana", "FR", -52.33, 4.93],
      ["Ajaccio, Corsica", "FR", 8.74, 41.92],
      ["Ceuta, a Spanish city in Africa", "ES", -5.31, 35.89],
      ["Suva, Fiji", "FJ", 178.44, -18.14],
      ["Labasa, Fiji", "FJ", 179.38, -16.43],
      ["Taveuni, Fiji, east of 180 degrees", "FJ", -179.9, -16.3],
      ["Anadyr, Chukotka", "RU", 177.5, 64.73],
      ["Pevek, Chukotka", "RU", 170.3, 69.7],
      ["Wrangel Island, east of 180 degrees", "RU", -178.5, 71.2],
      ["Kaliningrad, apart from the rest of Russia", "RU", 20.5, 54.7],
      ["Wellington", "NZ", 174.78, -41.29],
      ["Auckland", "NZ", 174.76, -36.85],
      ["Monaco", "MC", 7.4246, 43.7384],
      ["Vatican City", "VA", 12.4534, 41.9029],
      ["San Marino", "SM", 12.4578, 43.9424],
      ["Vaduz, Liechtenstein", "LI", 9.5209, 47.141],
      ["Faroe Islands", "FO", -6.77, 62.0],
      ["Greenland", "GL", -51.7, 64.18],
      ["Singapore", "SG", 103.82, 1.35],
    ] as readonly Place[])(
      "must not flag a point at %s (region %s)",
      (_name, region, longitude, latitude) => {
        expect(check(point(longitude, latitude), inRegions(region))).toEqual(
          [],
        );
      },
    );

    it("lets one position inside the region save a whole line, polygon or collection", () => {
      const capeTown = [18.42, -33.92];
      const items = [
        feature({
          type: "LineString",
          coordinates: [[17.08, -22.56], capeTown, [13.23, -8.84]],
        }),
        feature({
          type: "MultiPoint",
          coordinates: [
            [2.35, 48.85],
            [-0.13, 51.51],
            [28.05, -26.2],
          ],
        }),
        feature({
          type: "Polygon",
          coordinates: [
            [
              [10, -20],
              [40, -20],
              [18.42, -33.92],
              [10, -20],
            ],
          ],
        }),
        feature({
          type: "GeometryCollection",
          geometries: [
            { type: "Point", coordinates: [2.35, 48.85] },
            {
              type: "GeometryCollection",
              geometries: [{ type: "Point", coordinates: capeTown }],
            },
          ],
        }),
      ];
      for (const item of items) {
        expect(check(item, inRegions("ZA"))).toEqual([]);
      }
    });

    it("lets a position in any one of several regions save the feature", () => {
      expect(check(point(18.42, -33.92), inRegions("NO", "ZA"))).toEqual([]);
      expect(check(point(17.08, -22.56), inRegions("NA", "ZA"))).toEqual([]);
    });

    it("leaves a swapped position to coordinate-order, whatever the geometry", () => {
      const cases = [
        point(-33.92, 18.42),
        point(-26.2, 28.05),
        feature({
          type: "LineString",
          coordinates: [
            [-33.92, 18.42],
            [-29.86, 31.02],
          ],
        }),
        feature({
          type: "Polygon",
          coordinates: [box(-26.4, 27.9, -26, 28.2)],
        }),
      ];
      for (const item of cases) {
        expect(check(item, inRegions("ZA"))).toEqual([]);
      }
      expect(check(point(43.7384, 7.4246), inRegions("MC"))).toEqual([]);
      expect(check(point(-1.29, 36.82), inRegions("KE"))).toEqual([]);
    });

    it("skips a feature with no geometry, a null geometry or no readable position", () => {
      for (const item of [
        feature(null),
        { type: "Feature", properties: {} },
        feature({ type: "Point", coordinates: [] }),
        feature({ type: "Point", coordinates: ["x", "y"] }),
        feature({ type: "LineString", coordinates: [] }),
        feature({ type: "Polygon", coordinates: [[]] }),
        feature({ type: "MultiPoint", coordinates: [[1], [null, 2]] }),
        feature({ type: "GeometryCollection", geometries: [] }),
        feature({ type: "GeometryCollection", geometries: [null, 4] }),
        feature({ type: "Hexagon", coordinates: [2.35, 48.85] }),
        null,
        "text",
        7,
        [],
      ]) {
        expect(check(item, inRegions("ZA"))).toEqual([]);
      }
    });

    it("must not flag a continent-sized polygon that holds the region but has no vertex in it", () => {
      const ring = surrounding(-36);
      expect(
        check(
          feature({ type: "Polygon", coordinates: [ring] }),
          inRegions("ZA"),
        ),
      ).toEqual([]);
    });

    it("lets a polygon around one of several regions save the feature", () => {
      const norway = feature({
        type: "Polygon",
        coordinates: [
          [
            [-3.2, 55.95],
            [37.62, 55.75],
            [40, 85],
            [0, 85],
            [18.07, 59.33],
            [24.9, 60.17],
            [-3.2, 55.95],
          ],
        ],
      });
      expect(check(norway, inRegions("ZA"))).toHaveLength(1);
      expect(check(norway, inRegions("ZA", "NO"))).toEqual([]);
    });

    it.each([
      ["Null Island, in the Gulf of Guinea", "ZA", 0, 0],
      ["the open South Atlantic", "ZA", -5, -40],
      ["open water in the Bay of Biscay", "FR", -8, 45],
    ] as readonly Place[])(
      "must not flag a point at %s (region %s): open sea is not known to be another country",
      (_name, region, longitude, latitude) => {
        expect(check(point(longitude, latitude), inRegions(region))).toEqual(
          [],
        );
      },
    );

    it("must not flag a polygon or line wholly in the sea", () => {
      const gulf = box(0, 0, 2, 2);
      expect(
        check(
          feature({ type: "Polygon", coordinates: [gulf] }),
          inRegions("ZA"),
        ),
      ).toEqual([]);
      expect(
        check(
          feature({ type: "LineString", coordinates: gulf }),
          inRegions("ZA"),
        ),
      ).toEqual([]);
    });

    it("must not flag a feature with fewer than half of its positions in other countries", () => {
      const item = feature({
        type: "MultiPoint",
        coordinates: [
          [2.35, 48.85],
          [0, 0],
          [-5, -40],
        ],
      });
      expect(check(item, inRegions("ZA"))).toEqual([]);
    });

    it("must not flag Dover for France, because the outlines place it in neither country", () => {
      expect(check(point(1.31, 51.13), inRegions("FR"))).toEqual([]);
    });

    it("sees a position inside the region when it is the first of a huge geometry", () => {
      const ring = Array.from({ length: 100_000 }, (_, index) => [
        index === 0 ? 18.42 : 2.35,
        index === 0 ? -33.92 : 48.85,
      ]);
      const item = feature({ type: "LineString", coordinates: ring });
      expect(check(item, inRegions("ZA"))).toEqual([]);
    });
  });

  describe("what the rule cannot tell", () => {
    it.each([
      ["San Diego", "MX", -117.16, 32.72],
      ["Tijuana", "US", -117.03, 32.53],
      ["Monaco", "FR", 7.4246, 43.7384],
      ["Monaco", "IT", 7.4246, 43.7384],
      ["Hong Kong", "CN", 114.17, 22.3],
    ] as readonly Place[])(
      "cannot tell that %s is not in %s: it is within the coastline allowance of that country's border",
      (_name, region, longitude, latitude) => {
        expect(check(point(longitude, latitude), inRegions(region))).toEqual(
          [],
        );
      },
    );

    it.each([
      ["Marion Island, Prince Edward Islands", "ZA", 37.75, -46.9],
      ["Las Palmas, Canary Islands", "ES", -15.41, 28.12],
      ["Palma, Balearic Islands", "ES", 2.65, 39.57],
      ["Saint-Denis, Reunion", "FR", 55.45, -20.88],
      ["Fort-de-France, Martinique", "FR", -61.07, 14.6],
      ["Chatham Islands", "NZ", -176.56, -43.95],
      ["Stewart Island", "NZ", 167.85, -46.9],
      ["Key West, Florida", "US", -81.78, 24.55],
      ["Attu, the western Aleutians", "US", 172.9, 52.9],
      ["the Azores", "PT", -25.67, 37.74],
      ["Trindade, Brazil", "BR", -29.3, -20.5],
      ["Rotuma, Fiji", "FJ", 177.05, -12.5],
    ] as readonly Place[])(
      "is no longer reported for %s in %s, because the outline lacks the island and the rule only reports a position it can place in another country",
      (_name, region, longitude, latitude) => {
        expect(check(point(longitude, latitude), inRegions(region))).toEqual(
          [],
        );
      },
    );

    it("reports a two-point line that crosses the region without a vertex in it, wrongly (a known false positive)", () => {
      const crossing = feature({
        type: "LineString",
        coordinates: [
          [17.08, -22.56],
          [32.57, -25.97],
        ],
      });
      expect(check(crossing, inRegions("ZA"))).toHaveLength(1);
    });

    it("reports Cape Town against Namibia, because only the named regions count", () => {
      expect(check(point(18.42, -33.92), inRegions("NA"))).toHaveLength(1);
    });
  });

  describe("on any input", () => {
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
              type: "MultiPoint",
              coordinates: positions,
            });
            expect(() => check(item, inRegions("ZA"))).not.toThrow();
          },
        ),
      );
    });

    it("never reports a feature that has a position at the middle of its own region", () => {
      void fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              fc.double({ min: -180, max: 180, noNaN: true }),
              fc.double({ min: -90, max: 90, noNaN: true }),
            ),
            { maxLength: 8 },
          ),
          (positions) => {
            const item = feature({
              type: "MultiPoint",
              coordinates: [...positions, [24, -29]],
            });
            expect(check(item, inRegions("ZA"))).toEqual([]);
          },
        ),
      );
    });
  });
});
