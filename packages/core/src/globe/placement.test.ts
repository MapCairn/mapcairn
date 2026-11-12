// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { LatLng, PixelPoint } from "../ports/geometry";
import type { MapProjection } from "../ports/map";
import {
  type MapPlacement,
  type PlacedPath,
  placePath,
  placePoint,
  visibleRuns,
} from "./placement";

/**
 * A placement that projects longitude and latitude straight to pixels, one
 * degree to ten pixels with no wrapping (as the engine does: 190 is one world
 * east of -170), and hides anything west of `hideWestOf`.
 */
function placement(
  projection: MapProjection,
  centre: LatLng,
  hideWestOf = Number.NEGATIVE_INFINITY,
  zoom = 2,
): MapPlacement {
  return {
    projection,
    view: { center: centre, zoom },
    project: (position) => ({ x: position.lng * 10, y: -position.lat * 10 }),
    isVisible: (position) =>
      projection === "flat" || position.lng >= hideWestOf,
  };
}

const p = (lng: number, lat: number): LatLng => ({ lat, lng });

describe("placePoint", () => {
  it("draws a point on the copy of the world nearest the view centre", () => {
    expect(placePoint(p(-170, 0), placement("flat", p(178, 0)))).toEqual({
      x: 1900,
      y: -0,
    });
    expect(placePoint(p(10, 5), placement("flat", p(0, 0)))).toEqual({
      x: 100,
      y: -50,
    });
  });

  it("draws nothing for a point beyond the horizon", () => {
    expect(placePoint(p(10, 5), placement("globe", p(0, 0), 20))).toBeNull();
  });
});

describe("placePath on a flat map", () => {
  it("keeps every segment straight, with one pixel per position", () => {
    const path = placePath(
      [p(0, 0), p(60, 40), p(-30, 20)],
      false,
      placement("flat", p(0, 0)),
    );
    expect(path.pixels).toEqual([
      { x: 0, y: -0 },
      { x: 600, y: -400 },
      { x: -300, y: -200 },
    ]);
    expect(path.vertices).toEqual([0, 1, 2]);
    expect(path.whole).toBe(true);
    expect(path.closed).toBe(false);
  });

  it("crosses the antimeridian the short way, from either side", () => {
    const line = [p(170, 10), p(-170, 10)];
    expect(
      placePath(line, false, placement("flat", p(178, 10))).pixels.map(
        (pixel) => pixel.x,
      ),
    ).toEqual([1700, 1900]);
    expect(
      placePath(line, false, placement("flat", p(-178, 10))).pixels.map(
        (pixel) => pixel.x,
      ),
    ).toEqual([-1900, -1700]);
  });
});

describe("placePath on a globe", () => {
  it("bends a long segment along its great circle", () => {
    const path = placePath(
      [p(-0.1, 51.5), p(-74, 40.7)],
      false,
      placement("globe", p(-40, 45)),
    );
    // At normalised zoom 2 and latitude 45 the step is about 7.5 degrees, so
    // the 50 degree arc is cut into 7 pieces.
    expect(path.pixels).toHaveLength(8);
    expect(path.vertices).toEqual([0, 7]);
    const highest = Math.min(...path.pixels.map((pixel) => pixel.y));
    expect(highest).toBeLessThan(-515);
  });

  it("leaves a short segment as it is", () => {
    const path = placePath(
      [p(18.4, -33.9), p(18.5, -33.9)],
      false,
      placement("globe", p(18.4, -33.9), Number.NEGATIVE_INFINITY, 10),
    );
    expect(path.pixels).toHaveLength(2);
  });

  it("bends the closing segment of a ring as well", () => {
    const path = placePath(
      [p(0, 0), p(40, 0), p(40, 40)],
      true,
      placement("globe", p(20, 20)),
    );
    expect(path.vertices).toEqual([0, 5, 10]);
    expect(path.pixels.length).toBeGreaterThan(11);
    expect(path.closed).toBe(true);
  });

  it("crosses the antimeridian the short way", () => {
    const path = placePath(
      [p(170, 10), p(-170, 10)],
      false,
      placement("globe", p(178, 10)),
    );
    const xs = path.pixels.map((pixel) => pixel.x);
    expect(xs[0]).toBe(1700);
    expect(xs.at(-1)).toBe(1900);
    for (let index = 1; index < xs.length; index += 1) {
      expect(xs[index]).toBeGreaterThan(xs[index - 1] as number);
    }
  });

  it("marks the pieces beyond the horizon as hidden", () => {
    const path = placePath(
      [p(0, 0), p(60, 0)],
      false,
      placement("globe", p(0, 0), Number.NEGATIVE_INFINITY, 2),
    );
    expect(path.whole).toBe(true);
    const cut = placePath(
      [p(0, 0), p(60, 0)],
      false,
      placement("globe", p(0, 0), 30, 2),
    );
    expect(cut.whole).toBe(false);
    expect(cut.visible.at(-1)).toBe(true);
    expect(cut.visible[0]).toBe(false);
  });

  it("ends a line exactly where it goes over the horizon, not a piece short of it", () => {
    const cut = placePath(
      [p(0, 0), p(60, 0)],
      false,
      placement("globe", p(0, 0), 31, 2),
    );
    const [run] = visibleRuns(cut);
    // Pieces are 60 / 7 degrees long, so none ends at 31; the added point does.
    expect(run?.[0]?.x).toBeCloseTo(310, 0);
    expect(run?.at(-1)?.x).toBe(600);
    expect(cut.vertices).toEqual([0, 8]);
  });

  it("adds the horizon point on the closing segment of a ring, at the end", () => {
    const ring = placePath(
      [p(25, 0), p(26, 0), p(26, 1), p(19, 0.5)],
      true,
      placement("globe", p(25, 0), 20, 2),
    );
    expect(ring.pixels).toHaveLength(6);
    expect(ring.visible.at(-1)).toBe(true);
    expect(ring.pixels.at(-1)?.x).toBeCloseTo(200, 0);
    expect(ring.whole).toBe(false);
  });
});

function path(
  pixels: PixelPoint[],
  visible: boolean[],
  closed: boolean,
): PlacedPath {
  return {
    pixels,
    visible,
    whole: visible.every(Boolean),
    closed,
    vertices: pixels.map((_, index) => index),
  };
}

const PIXELS: PixelPoint[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 20, y: 0 },
  { x: 30, y: 0 },
  { x: 40, y: 0 },
];

describe("visibleRuns", () => {
  it("splits an open path where it goes out of sight", () => {
    expect(
      visibleRuns(path(PIXELS, [true, true, false, true, true], false)),
    ).toEqual([PIXELS.slice(0, 2), PIXELS.slice(3)]);
  });

  it("drops a lone visible point, which makes no segment", () => {
    expect(
      visibleRuns(path(PIXELS, [true, false, true, false, true], false)),
    ).toEqual([]);
  });

  it("returns a wholly visible ring as one run back to its start", () => {
    const ring = PIXELS.slice(0, 3);
    expect(visibleRuns(path(ring, [true, true, true], true))).toEqual([
      [...ring, ring[0]],
    ]);
  });

  it("joins the runs on either side of a ring's closing segment", () => {
    expect(
      visibleRuns(path(PIXELS, [true, true, false, true, true], true)),
    ).toEqual([[PIXELS[3], PIXELS[4], PIXELS[0], PIXELS[1]]]);
  });

  it("returns nothing for a hidden ring or an empty path", () => {
    expect(
      visibleRuns(
        path(
          PIXELS,
          PIXELS.map(() => false),
          true,
        ),
      ),
    ).toEqual([]);
    expect(visibleRuns(path([], [], true))).toEqual([]);
  });
});
