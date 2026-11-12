// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { MapPlacement } from "../globe/placement";
import type { LatLng, PixelPoint } from "../ports/geometry";
import { destinationPoint } from "./geo";
import { hitTestHandle, pickShape } from "./hit";
import type { DrawShape } from "./types";

/** A flat map centred on 0, 0 that places positions with `place`. */
function flat(place: (position: LatLng) => PixelPoint): MapPlacement {
  return {
    projection: "flat",
    view: { center: { lat: 0, lng: 0 }, zoom: 0 },
    project: place,
    isVisible: () => true,
  };
}

const project = flat((position) => ({
  x: position.lng * 100,
  y: -position.lat * 100,
}));

const p = (lng: number, lat: number) => ({ lat, lng });

describe("hitTestHandle", () => {
  const handles = [
    { id: "a", point: { x: 100, y: 100 }, kind: "vertex" as const },
    { id: "b", point: { x: 110, y: 100 }, kind: "vertex" as const },
    { id: "m", point: { x: 112, y: 100 }, kind: "midpoint" as const },
  ];

  it("returns the nearest handle within the tolerance", () => {
    expect(hitTestHandle(handles, { x: 103, y: 100 }, 12)?.id).toBe("a");
    expect(hitTestHandle(handles, { x: 108, y: 101 }, 12)?.id).toBe("b");
  });

  it("returns null when every handle is out of reach", () => {
    expect(hitTestHandle(handles, { x: 300, y: 300 }, 12)).toBeNull();
    expect(hitTestHandle([], { x: 0, y: 0 }, 12)).toBeNull();
  });

  it("includes a handle exactly at the tolerance", () => {
    expect(hitTestHandle(handles, { x: 88, y: 100 }, 12)?.id).toBe("a");
  });

  it("prefers a vertex to a midpoint at the same distance", () => {
    const tied = [
      { id: "m", point: { x: 10, y: 0 }, kind: "midpoint" as const },
      { id: "v", point: { x: -10, y: 0 }, kind: "vertex" as const },
    ];
    expect(hitTestHandle(tied, { x: 0, y: 0 }, 12)?.id).toBe("v");
  });

  it("prefers the later handle when kind and distance are equal", () => {
    const tied = [
      { id: "first", point: { x: 10, y: 0 }, kind: "vertex" as const },
      { id: "last", point: { x: -10, y: 0 }, kind: "vertex" as const },
    ];
    expect(hitTestHandle(tied, { x: 0, y: 0 }, 12)?.id).toBe("last");
  });
});

function shape(
  partial: Partial<DrawShape> & Pick<DrawShape, "kind">,
): DrawShape {
  return {
    id: partial.id ?? partial.kind,
    label: "Shape",
    done: true,
    vertices: [],
    ...partial,
  };
}

describe("pickShape", () => {
  const polygon = shape({
    kind: "polygon",
    id: "poly",
    vertices: [p(0, 0), p(1, 0), p(1, 1), p(0, 1)],
  });
  const line = shape({
    kind: "line",
    id: "line",
    vertices: [p(2, 0), p(3, 0)],
  });
  const point = shape({ kind: "point", id: "point", vertices: [p(4, 0)] });

  it("picks a polygon by its inside", () => {
    expect(pickShape([polygon], { x: 50, y: -50 }, project, 10)).toBe("poly");
  });

  it("picks a polygon by its edge, just outside", () => {
    expect(pickShape([polygon], { x: 105, y: -50 }, project, 10)).toBe("poly");
    expect(pickShape([polygon], { x: 130, y: -50 }, project, 10)).toBeNull();
  });

  it("lets a tap inside an area pass through when the interior is off, but still picks its edge", () => {
    expect(
      pickShape([polygon], { x: 50, y: -50 }, project, 10, false),
    ).toBeNull();
    expect(pickShape([polygon], { x: 105, y: -50 }, project, 10, false)).toBe(
      "poly",
    );
    const circle = shape({
      kind: "circle",
      id: "circle",
      vertices: [p(0, 0)],
      radiusMetres: 5_000_000,
    });
    const wide = flat((position) => ({
      x: position.lng * 10,
      y: -position.lat * 10,
    }));
    expect(pickShape([circle], { x: 5, y: 5 }, wide, 4, false)).toBeNull();
    const edge = wide.project(destinationPoint(p(0, 0), 90, 5_000_000));
    expect(pickShape([circle], { x: edge.x + 2, y: 0 }, wide, 4, false)).toBe(
      "circle",
    );
  });

  it("picks a line only near it", () => {
    expect(pickShape([line], { x: 250, y: 4 }, project, 10)).toBe("line");
    expect(pickShape([line], { x: 250, y: 30 }, project, 10)).toBeNull();
    expect(pickShape([line], { x: 390, y: 0 }, project, 10)).toBeNull();
  });

  it("picks a point near it", () => {
    expect(pickShape([point], { x: 405, y: 5 }, project, 10)).toBe("point");
    expect(pickShape([point], { x: 430, y: 5 }, project, 10)).toBeNull();
  });

  it("picks the topmost of overlapping shapes, which is the last drawn", () => {
    const over = shape({
      kind: "polygon",
      id: "over",
      vertices: [p(0.2, -0.2), p(0.8, -0.2), p(0.5, 0.8)],
    });
    expect(pickShape([polygon, over], { x: 50, y: -30 }, project, 10)).toBe(
      "over",
    );
  });

  it("picks a circle by its inside, using its radius on screen", () => {
    const circle = shape({
      kind: "circle",
      id: "circle",
      vertices: [p(0, 0)],
      radiusMetres: 5_000_000,
    });
    // The outline is the circle's ring, placed on the screen.
    const wide = flat((position) => ({
      x: position.lng * 10,
      y: -position.lat * 10,
    }));
    expect(pickShape([circle], { x: 5, y: 5 }, wide, 4)).toBe("circle");
    expect(pickShape([circle], { x: 900, y: 900 }, wide, 4)).toBeNull();
  });

  it("treats a circle with no radius yet as a point at its centre", () => {
    const circle = shape({
      kind: "circle",
      id: "c",
      vertices: [p(0, 0)],
      done: false,
    });
    expect(pickShape([circle], { x: 3, y: 3 }, project, 10)).toBe("c");
    expect(pickShape([circle], { x: 100, y: 100 }, project, 10)).toBeNull();
  });

  it("treats a polygon draft of two vertices as a line", () => {
    const draft = shape({
      kind: "polygon",
      id: "draft",
      done: false,
      vertices: [p(0, 0), p(1, 0)],
    });
    expect(pickShape([draft], { x: 50, y: 3 }, project, 10)).toBe("draft");
  });

  it("returns null for nothing", () => {
    expect(pickShape([], { x: 0, y: 0 }, project, 10)).toBeNull();
    expect(
      pickShape(
        [shape({ kind: "line", vertices: [] })],
        { x: 0, y: 0 },
        project,
        10,
      ),
    ).toBeNull();
  });
});

describe("pickShape across the antimeridian and on a globe", () => {
  /** One degree to ten pixels, with no wrapping, as the engine projects. */
  const place = (position: LatLng): PixelPoint => ({
    x: position.lng * 10,
    y: -position.lat * 10,
  });

  it("finds a line where it is drawn, the short way across the antimeridian", () => {
    const line = shape({
      kind: "line",
      vertices: [p(170, 10), p(-170, 10)],
    });
    const placement: MapPlacement = {
      projection: "flat",
      view: { center: p(178, 10), zoom: 2 },
      project: place,
      isVisible: () => true,
    };
    // Drawn from x 1700 to 1900, through the antimeridian at 1800.
    expect(pickShape([line], { x: 1800, y: -100 }, placement, 4)).toBe("line");
    expect(pickShape([line], { x: 0, y: -100 }, placement, 4)).toBeNull();
  });

  it("finds a long line on a globe where its great circle bends, not on the chord", () => {
    const line = shape({
      kind: "line",
      vertices: [p(-0.1, 51.5), p(-74, 40.7)],
    });
    const placement: MapPlacement = {
      projection: "globe",
      view: { center: p(-40, 45), zoom: 2 },
      project: place,
      isVisible: () => true,
    };
    // The great circle passes 52.36 N at 41.28 W; the chord passes near 46 N.
    expect(pickShape([line], place(p(-41.28, 52.36)), placement, 4)).toBe(
      "line",
    );
    expect(pickShape([line], place(p(-37.05, 46.1)), placement, 4)).toBeNull();
  });

  it("finds nothing beyond the horizon, and no inside for an area partly hidden", () => {
    const polygon = shape({
      kind: "polygon",
      vertices: [p(0, 0), p(40, 0), p(40, 30)],
    });
    const hideWest: MapPlacement = {
      projection: "globe",
      view: { center: p(60, 0), zoom: 2 },
      project: place,
      isVisible: (position) => position.lng >= 20,
    };
    // Inside the triangle, but its outline is cut by the horizon.
    expect(pickShape([polygon], place(p(30, 5)), hideWest, 4)).toBeNull();
    // On its eastern edge, which is in sight.
    expect(pickShape([polygon], place(p(40, 15)), hideWest, 4)).toBe("polygon");
    const point = shape({ kind: "point", vertices: [p(10, 10)] });
    expect(pickShape([point], place(p(10, 10)), hideWest, 4)).toBeNull();
  });
});
