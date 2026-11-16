// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  type CountryArtefact,
  createCountryIndex,
  loadCountries,
} from "./index.js";

/** Delta-encodes a ring of whole-degree points with a quantum of 1. */
function ring(...points: [number, number][]): number[] {
  const flat: number[] = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of points) {
    flat.push(x - px, y - py);
    px = x;
    py = y;
  }
  return flat;
}

const square = ring([0, 0], [10, 0], [10, 10], [0, 10], [0, 0]);
const hole = ring([3, 3], [7, 3], [7, 7], [3, 7], [3, 3]);

const tiny: CountryArtefact = {
  format: 1,
  quantum: 1,
  countries: [
    {
      code: "AA",
      tolerance: 1,
      polygons: [
        [square, hole],
        [ring([20, 0], [30, 0], [30, 10], [20, 10], [20, 0])],
      ],
    },
    {
      code: "BB",
      tolerance: 0,
      polygons: [[ring([50, 50], [60, 50], [60, 60], [50, 60], [50, 50])]],
    },
    { code: "CC", tolerance: 0, polygons: [] },
  ],
};

describe("createCountryIndex", () => {
  const index = createCountryIndex(tiny);

  it("knows which codes it has", () => {
    expect(index.has("AA")).toBe(true);
    expect(index.has("CC")).toBe(true);
    expect(index.has("ZZ")).toBe(false);
  });

  it("contains a point inside a polygon, in either of a country's polygons", () => {
    expect(index.contains("AA", 2, 2)).toBe(true);
    expect(index.contains("AA", 25, 5)).toBe(true);
    expect(index.contains("BB", 55, 55)).toBe(true);
  });

  it("does not contain a point in a hole, beyond the tolerance, or in another country", () => {
    expect(index.contains("AA", 5, 5)).toBe(false);
    expect(index.contains("AA", 15, 5)).toBe(false);
    expect(index.contains("AA", 55, 55)).toBe(false);
    expect(index.contains("BB", 2, 2)).toBe(false);
    expect(index.contains("CC", 2, 2)).toBe(false);
  });

  it("counts a point within the tolerance of the outline as inside", () => {
    expect(index.contains("AA", 10.5, 5)).toBe(true);
    expect(index.contains("AA", 10.99, 5)).toBe(true);
    expect(index.contains("AA", 11.2, 5)).toBe(false);
    expect(index.contains("BB", 60.01, 55)).toBe(false);
  });

  it("is exact on a vertex and along an edge when the tolerance is zero", () => {
    expect(index.contains("BB", 60, 60)).toBe(true);
    expect(index.contains("BB", 55, 50)).toBe(true);
  });

  it("gives the bounding box of a country's polygons, without the tolerance", () => {
    expect(index.bounds("AA")).toEqual([0, 0, 30, 10]);
    expect(index.bounds("BB")).toEqual([50, 50, 60, 60]);
  });

  it("has no bounding box for an unknown country or one without a polygon", () => {
    expect(index.bounds("CC")).toBeUndefined();
    expect(index.bounds("ZZ")).toBeUndefined();
  });

  it("locates the country whose polygon strictly contains a point", () => {
    expect(index.locate(2, 2)).toBe("AA");
    expect(index.locate(25, 5)).toBe("AA");
    expect(index.locate(55, 55)).toBe("BB");
  });

  it("locates nothing for a point in a hole or in the sea", () => {
    expect(index.locate(5, 5)).toBeUndefined();
    expect(index.locate(15, 5)).toBeUndefined();
    expect(index.locate(-40, 40)).toBeUndefined();
  });

  it("does not use the tolerance to locate a point on the fringe of an outline", () => {
    expect(index.contains("AA", 10.5, 5)).toBe(true);
    expect(index.locate(10.5, 5)).toBeUndefined();
  });

  it("locates nothing at all in an empty index", () => {
    expect(
      createCountryIndex({ format: 1, quantum: 1, countries: [] }).locate(1, 1),
    ).toBeUndefined();
  });

  it("ignores a polygon that has no rings", () => {
    const hollow = createCountryIndex({
      format: 1,
      quantum: 1,
      countries: [{ code: "EE", tolerance: 0, polygons: [[]] }],
    });
    expect(hollow.has("EE")).toBe(true);
    expect(hollow.bounds("EE")).toBeUndefined();
    expect(hollow.contains("EE", 0, 0)).toBe(false);
  });

  it("copes with no polygons at all", () => {
    const empty = createCountryIndex({ format: 1, quantum: 1, countries: [] });
    expect(empty.contains("AA", 1, 1)).toBe(false);
    expect(empty.has("AA")).toBe(false);
  });

  it("copes with a degenerate edge (two equal vertices)", () => {
    const degenerate = createCountryIndex({
      format: 1,
      quantum: 1,
      countries: [
        {
          code: "DD",
          tolerance: 1,
          polygons: [[ring([0, 0], [0, 0], [4, 0], [4, 4], [0, 0])]],
        },
      ],
    });
    expect(degenerate.contains("DD", 3, 1)).toBe(true);
    expect(degenerate.contains("DD", 0.5, 0.2)).toBe(true);
  });
});

describe("the bundled country outlines", () => {
  const places: readonly [string, string, number, number][] = [
    ["Cape Town", "ZA", 18.42, -33.92],
    ["Paris", "FR", 2.35, 48.85],
    ["Cayenne, French Guiana", "FR", -52.33, 4.93],
    ["Monaco", "MC", 7.42, 43.74],
    ["Vatican City", "VA", 12.454, 41.903],
    ["Suva, Fiji", "FJ", 178.44, -18.14],
    ["Taveuni, Fiji, east of 180 degrees", "FJ", -179.9, -16.3],
    ["Moscow", "RU", 37.62, 55.75],
    ["Chukotka, Russia, east of 180 degrees", "RU", -175, 66.5],
    ["Nairobi", "KE", 36.82, -1.29],
    ["Tromsø, Norway", "NO", 18.96, 69.65],
    ["Reykjavík", "IS", -21.9, 64.15],
  ];

  it.each(places)("puts %s in %s", async (_name, code, longitude, latitude) => {
    expect((await loadCountries()).contains(code, longitude, latitude)).toBe(
      true,
    );
  });

  it("does not put Cape Town in South Africa when latitude and longitude are swapped", async () => {
    expect((await loadCountries()).contains("ZA", -33.92, 18.42)).toBe(false);
  });

  it("does not put the middle of the Atlantic in France, or Paris in Germany", async () => {
    const countries = await loadCountries();
    expect(countries.contains("FR", -30, 30)).toBe(false);
    expect(countries.contains("DE", 2.35, 48.85)).toBe(false);
  });

  it("has the countries that Natural Earth's 1:110m set lacks", async () => {
    const countries = await loadCountries();
    for (const code of ["MC", "VA", "SM", "LI", "SG", "MT", "AD"]) {
      expect(countries.has(code)).toBe(true);
    }
    expect(countries.has("XX")).toBe(false);
  });

  it("bounds South Africa by its outline, and Fiji and Russia across the antimeridian", async () => {
    const countries = await loadCountries();
    const [west, south, east, north] = countries.bounds("ZA") ?? [];
    expect(west).toBeGreaterThan(16);
    expect(east).toBeLessThan(33);
    expect(south).toBeGreaterThan(-35.5);
    expect(north).toBeLessThan(-22);
    expect(countries.bounds("FJ")?.[0]).toBeLessThan(-179);
    expect(countries.bounds("FJ")?.[2]).toBeGreaterThan(179);
    expect(countries.bounds("RU")?.[0]).toBeLessThan(-179);
    expect(countries.bounds("RU")?.[2]).toBeGreaterThan(179);
  });

  it("locates Cape Town in South Africa and Paris in France, and the open sea nowhere", async () => {
    const countries = await loadCountries();
    expect(countries.locate(18.42, -33.92)).toBe("ZA");
    expect(countries.locate(2.35, 48.85)).toBe("FR");
    expect(countries.locate(0, 0)).toBeUndefined();
    expect(countries.locate(37.75, -46.9)).toBeUndefined();
  });

  it("loads once and gives the same index", async () => {
    expect(await loadCountries()).toBe(await loadCountries());
  });
});
