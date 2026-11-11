import { describe, expect, it } from "vitest";
import {
  exportableShapes,
  shapeGeometry,
  shapesToCsv,
  shapesToGeoJson,
} from "./export";
import { ringSignedArea } from "./geo";
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
    expect(lines[0]).toBe("id,type,area_m2,length_m,geometry");
    expect(lines).toHaveLength(3);
    expect(lines[1]?.startsWith("shape-1,point,,,")).toBe(true);
    expect(lines[2]?.startsWith("shape-3,polygon,")).toBe(true);
  });

  it("quotes the geometry text and doubles its quotes", () => {
    const row = shapesToCsv([POINT]).split("\r\n")[1] ?? "";
    expect(row).toBe(
      'shape-1,point,,,"{""type"":""Point"",""coordinates"":[2.3522,48.8566]}"',
    );
  });

  it("rounds the measures to two decimals", () => {
    const row = shapesToCsv([LINE]).split("\r\n")[1] ?? "";
    const length = row.split(",")[3] ?? "";
    expect(length).toMatch(/^\d+\.\d{1,2}$/);
  });

  it("is only the header when there is nothing to export", () => {
    expect(shapesToCsv([])).toBe("id,type,area_m2,length_m,geometry");
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
