// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { decimalsOf } from "../propertyTesting/decimalPlaces";
import {
  exportableShapes,
  SHAPES_CSV_HEADER,
  shapeGeometry,
  shapesToCsv,
  shapesToGeoJson,
  shapesToGeoJsonText,
  shapesToWkt,
} from "./export";
import { ringSignedArea } from "./geo";
import { shapeRing, validateShape } from "./shape";
import type { DrawShape } from "./types";

const p = (lng: number, lat: number) => ({ lat, lng });

const POINT: DrawShape = {
  id: "shape-1",
  kind: "point",
  label: "Point 1",
  vertices: [p(2.3522, 48.8566)],
  done: true,
};
const LINE: DrawShape = {
  id: "shape-2",
  kind: "line",
  label: "Line 1",
  vertices: [p(2.35, 48.85), p(2.36, 48.86), p(2.37, 48.85)],
  done: true,
};
const POLYGON: DrawShape = {
  id: "shape-3",
  kind: "polygon",
  label: "Polygon 1",
  // Clockwise on a map, so export has to turn it round.
  vertices: [p(0, 0), p(0, 0.01), p(0.01, 0.01), p(0.01, 0)],
  done: true,
};
const CIRCLE: DrawShape = {
  id: "shape-4",
  kind: "circle",
  label: "Circle 1",
  vertices: [p(36.8219, -1.2921)],
  radiusMetres: 500,
  done: true,
};

describe("shapeGeometry", () => {
  it("writes a point as longitude then latitude", () => {
    expect(shapeGeometry(POINT)).toEqual({
      type: "Point",
      coordinates: [2.3522, 48.8566],
    });
  });

  it("writes a line", () => {
    expect(shapeGeometry(LINE)).toEqual({
      type: "LineString",
      coordinates: [
        [2.35, 48.85],
        [2.36, 48.86],
        [2.37, 48.85],
      ],
    });
  });

  it("writes a polygon as a closed, anticlockwise ring", () => {
    const geometry = shapeGeometry(POLYGON);
    expect(geometry?.type).toBe("Polygon");
    const ring =
      (geometry as { coordinates: number[][][] }).coordinates[0] ?? [];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(
      ringSignedArea(
        ring
          .slice(0, 4)
          .map(([lng, lat]) => ({ lat: lat as number, lng: lng as number })),
      ),
    ).toBeGreaterThan(0);
  });

  it("writes a circle as a polygon ring of 72 positions, closed", () => {
    const geometry = shapeGeometry(CIRCLE);
    const ring =
      (geometry as { coordinates: number[][][] }).coordinates[0] ?? [];
    expect(geometry?.type).toBe("Polygon");
    expect(ring).toHaveLength(73);
  });

  it("rounds coordinates to six decimals", () => {
    const geometry = shapeGeometry({
      ...POINT,
      vertices: [p(2.123456789, 48.987654321)],
    });
    expect(geometry).toEqual({
      type: "Point",
      coordinates: [2.123457, 48.987654],
    });
  });

  it("writes nothing for a shape that is not valid", () => {
    expect(shapeGeometry({ ...LINE, vertices: [p(1, 1)] })).toBeNull();
    expect(shapeGeometry({ ...CIRCLE, radiusMetres: undefined })).toBeNull();
  });
});

describe("exportableShapes", () => {
  it("keeps finished, valid shapes and leaves out a draft", () => {
    const draft: DrawShape = { ...POLYGON, id: "d", done: false };
    expect(exportableShapes([POINT, draft, LINE])).toEqual([POINT, LINE]);
  });
});

describe("shapesToGeoJson", () => {
  it("is a FeatureCollection with one feature per exportable shape", () => {
    const collection = shapesToGeoJson([POINT, LINE, POLYGON, CIRCLE]);
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features.map((feature) => feature.id)).toEqual([
      "shape-1",
      "shape-2",
      "shape-3",
      "shape-4",
    ]);
  });

  it("carries the name, type and measures as properties", () => {
    const [point, line, polygon, circle] = shapesToGeoJson([
      POINT,
      LINE,
      POLYGON,
      CIRCLE,
    ]).features;
    expect(point?.properties).toEqual({ name: "Point 1", type: "point" });
    expect(line?.properties).toMatchObject({ name: "Line 1", type: "line" });
    expect(typeof line?.properties?.length_m).toBe("number");
    expect(polygon?.properties).toMatchObject({ type: "polygon" });
    expect(polygon?.properties?.area_m2).toBeGreaterThan(1_000_000);
    expect(polygon?.properties?.length_m).toBeGreaterThan(4000);
    expect(circle?.properties).toMatchObject({
      type: "circle",
      radius_m: 500,
      centre: [36.8219, -1.2921],
    });
    expect(circle?.properties?.area_m2).toBeCloseTo(Math.PI * 500 * 500, -2);
  });

  it("is an empty collection with nothing to export", () => {
    expect(shapesToGeoJson([]).features).toEqual([]);
  });
});

describe("shapesToCsv", () => {
  it("has a header and one row per shape, with CRLF line ends", () => {
    const csv = shapesToCsv([POINT, POLYGON]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "id,type,area_m2,length_m,geometry,radius_m,centre_lng,centre_lat",
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]?.startsWith("shape-1,point,,,")).toBe(true);
    expect(lines[2]?.startsWith("shape-3,polygon,")).toBe(true);
  });

  it("quotes the geometry text and doubles its quotes", () => {
    const row = shapesToCsv([POINT]).split("\r\n")[1] ?? "";
    expect(row).toBe(
      'shape-1,point,,,"{""type"":""Point"",""coordinates"":[2.3522,48.8566]}",,,',
    );
  });

  it("rounds the measures to two decimals", () => {
    const row = shapesToCsv([LINE]).split("\r\n")[1] ?? "";
    const length = row.split(",")[3] ?? "";
    expect(length).toMatch(/^\d+\.\d{1,2}$/);
  });

  it("writes a circle's radius and centre after the geometry, so it can be read back", () => {
    const row = shapesToCsv([CIRCLE]).split("\r\n")[1] ?? "";
    expect(row.startsWith("shape-4,circle,")).toBe(true);
    expect(row.endsWith('",500,36.8219,-1.2921')).toBe(true);
  });

  it("is only the header when there is nothing to export", () => {
    expect(shapesToCsv([])).toBe(
      "id,type,area_m2,length_m,geometry,radius_m,centre_lng,centre_lat",
    );
  });
});

describe("shapesToWkt", () => {
  it("writes one WKT geometry per exportable shape, one to a line, longitude first", () => {
    const draft: DrawShape = { ...POLYGON, id: "d", done: false };
    const lines = shapesToWkt([POINT, LINE, draft, POLYGON]).split("\n");
    expect(lines).toEqual([
      "POINT (2.3522 48.8566)",
      "LINESTRING (2.35 48.85, 2.36 48.86, 2.37 48.85)",
      // The ring is turned anticlockwise and closed, as in the GeoJSON.
      "POLYGON ((0.01 0, 0.01 0.01, 0 0.01, 0 0, 0.01 0))",
    ]);
  });

  it("writes a circle as the polygon of its outline", () => {
    const [line = ""] = shapesToWkt([CIRCLE]).split("\n");
    expect(line.startsWith("POLYGON ((")).toBe(true);
    expect(line.split(",")).toHaveLength(73);
  });

  it("is empty when there is nothing to export", () => {
    expect(shapesToWkt([])).toBe("");
  });
});

describe("shapes across the antimeridian", () => {
  it("exports the positions as they were drawn, without unwrapping them", () => {
    const line: DrawShape = {
      id: "a",
      kind: "line",
      label: "Line 1",
      done: true,
      vertices: [p(170, 10), p(-170, 10)],
    };
    expect(shapeGeometry(line)).toEqual({
      type: "LineString",
      coordinates: [
        [170, 10],
        [-170, 10],
      ],
    });
    expect(shapesToCsv([line])).toContain(
      '""coordinates"":[[170,10],[-170,10]]',
    );
  });
});

/** The issue the draw rules find with the ring a polygon geometry holds, or null. */
function ringIssue(geometry: unknown) {
  const ring = (geometry as { coordinates: number[][][] }).coordinates[0] ?? [];
  return validateShape({
    id: "ring",
    kind: "polygon",
    label: "Ring",
    done: true,
    vertices: ring
      .slice(0, -1)
      .map(([lng, lat]) => ({ lat: lat as number, lng: lng as number })),
  });
}

/** The issue with a shape's ring rounded to `decimals` places, or null when it is valid. */
function ringIssueAt(shape: DrawShape, decimals: number) {
  const factor = 10 ** decimals;
  const round = (value: number) => Math.round(value * factor) / factor;
  return validateShape({
    id: "ring",
    kind: "polygon",
    label: "Ring",
    done: true,
    vertices: shapeRing(shape).map(({ lat, lng }) => ({
      lat: round(lat),
      lng: round(lng),
    })),
  });
}

describe("shapes too small for six decimals", () => {
  const small = (radiusMetres: number): DrawShape => ({
    ...CIRCLE,
    radiusMetres,
  });

  it("writes a circle of one metre as a ring that does not fold in on itself", () => {
    expect(ringIssue(shapeGeometry(small(1)))).toBeNull();
  });

  it("writes circles from a centimetre up as valid rings", () => {
    for (const radius of [0.01, 0.05, 0.1, 0.5, 1, 1.5, 2, 3]) {
      const geometry = shapeGeometry(small(radius));
      expect(geometry?.type, `radius ${radius}`).toBe("Polygon");
      expect(ringIssue(geometry), `radius ${radius}`).toBeNull();
    }
  });

  it("keeps six decimals where they are enough", () => {
    expect(decimalsOf(shapeGeometry(CIRCLE))).toBeLessThanOrEqual(6);
    expect(decimalsOf(shapeGeometry(small(5)))).toBeLessThanOrEqual(6);
  });

  it("writes a line of a few centimetres with two different positions", () => {
    const line: DrawShape = {
      ...LINE,
      vertices: [p(2.35, 48.85), p(2.3500002, 48.85)],
    };
    const geometry = shapeGeometry(line) as { coordinates: number[][] } | null;
    expect(geometry?.coordinates[0]).not.toEqual(geometry?.coordinates[1]);
  });

  it("writes a polygon of a few decimetres as a ring that does not fold in on itself", () => {
    const polygon: DrawShape = {
      ...POLYGON,
      vertices: [
        p(10, 10),
        p(10.0000004, 10),
        p(10.0000004, 10.0000003),
        p(10, 10.0000003),
      ],
    };
    expect(ringIssue(shapeGeometry(polygon))).toBeNull();
  });

  it("writes a small circle that reaches over the antimeridian or a pole at six decimals, as it was drawn", () => {
    for (const centre of [
      p(179.99999, 0),
      p(-179.99999, 10),
      p(0, 90),
      p(0, -90),
    ]) {
      const geometry = shapeGeometry({
        ...CIRCLE,
        vertices: [centre],
        radiusMetres: 2,
      });
      expect(geometry?.type, JSON.stringify(centre)).toBe("Polygon");
      expect(decimalsOf(geometry), JSON.stringify(centre)).toBeLessThanOrEqual(
        6,
      );
    }
  });

  it("uses the fewest decimals that keep the ring valid", () => {
    for (const radius of [0.01, 0.05, 0.1, 0.5, 1]) {
      const shape = small(radius);
      const decimals = decimalsOf(shapeGeometry(shape));
      expect(decimals, `radius ${radius}`).toBeGreaterThan(6);
      expect(
        ringIssueAt(shape, decimals),
        `radius ${radius} at ${decimals}`,
      ).toBeNull();
      expect(
        ringIssueAt(shape, decimals - 1),
        `radius ${radius} at ${decimals - 1}`,
      ).not.toBeNull();
    }
  });

  it("writes a circle no number of decimals keeps valid as it is, unrounded, and exports it", () => {
    const speck = small(0.00001);
    const geometry = shapeGeometry(speck);
    expect(geometry?.type).toBe("Polygon");
    expect(decimalsOf(geometry)).toBeGreaterThan(10);
    expect(exportableShapes([POINT, speck])).toEqual([POINT, speck]);
    expect(shapesToWkt([speck])).toContain("POLYGON ((");
    expect(shapesToGeoJson([speck]).features).toHaveLength(1);
    expect(shapesToCsv([speck])).not.toBe(SHAPES_CSV_HEADER);
  });
});

describe("numbers are written without an exponent", () => {
  // A circle of a metre on the equator and the prime meridian has coordinates
  // under 1e-6, which String and JSON.stringify write as `7.8e-7`.
  const ON_THE_EQUATOR: DrawShape = {
    ...CIRCLE,
    vertices: [p(0, 0)],
    radiusMetres: 1,
  };
  const SPECK: DrawShape = { ...ON_THE_EQUATOR, radiusMetres: 0.00001 };

  it("writes a 1 m circle on the equator and the prime meridian as plain decimals in WKT", () => {
    expect(shapesToWkt([ON_THE_EQUATOR])).not.toMatch(/e/i);
  });

  it("writes plain decimals in the CSV, in its geometry and in its circle cells", () => {
    for (const shape of [ON_THE_EQUATOR, SPECK]) {
      expect(shapesToCsv([shape])).not.toMatch(/\de[+-]?\d/);
    }
  });

  it("writes plain decimals in the GeoJSON text, which reads back as the same collection", () => {
    for (const shape of [ON_THE_EQUATOR, SPECK]) {
      const text = shapesToGeoJsonText([shape]);
      expect(text).not.toMatch(/\de[+-]?\d/);
      expect(JSON.parse(text)).toEqual(
        JSON.parse(JSON.stringify(shapesToGeoJson([shape]))),
      );
    }
  });

  it("writes the same GeoJSON text as JSON.stringify where no number has an exponent", () => {
    const shapes = [POINT, LINE, POLYGON, CIRCLE];
    expect(shapesToGeoJsonText(shapes)).toBe(
      JSON.stringify(shapesToGeoJson(shapes), null, 2),
    );
  });
});
