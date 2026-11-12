// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { MapImageExportError } from "../ports/errors";
import type { ViewState } from "../ports/geometry";
import { MAX_MERCATOR_LATITUDE } from "../zoom/zoom";
import {
  DEFAULT_IMAGE_PIXEL_RATIO,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE_PX,
  planRequestedImage,
  refuseBoxOnGlobe,
  type VisibleMap,
} from "./plan";

const VIEW: ViewState = {
  center: { lat: -33.9, lng: 18.4 },
  zoom: 11,
  bearing: 40,
};
const VISIBLE: VisibleMap = { size: { width: 800, height: 600 }, view: VIEW };
const BOUNDS = { south: -34, west: 18, north: -33, east: 19 };

/** The error a request is refused with, or undefined when it is accepted. */
function refusal(
  ...args: Parameters<typeof planRequestedImage>
): MapImageExportError | undefined {
  try {
    planRequestedImage(...args);
  } catch (error) {
    return error as MapImageExportError;
  }
  return undefined;
}

describe("refuseBoxOnGlobe", () => {
  it("refuses a box on a globe as invalid, and accepts a box on a flat map and a centre on either", () => {
    expect(() => refuseBoxOnGlobe({ bounds: BOUNDS }, "globe")).toThrowError(
      expect.objectContaining({ kind: "invalid" }),
    );
    const centre = { center: { lat: 0, lng: 0 }, zoom: 3 };
    expect(() => refuseBoxOnGlobe({ bounds: BOUNDS }, "flat")).not.toThrow();
    expect(() => refuseBoxOnGlobe(centre, "globe")).not.toThrow();
    expect(() => refuseBoxOnGlobe(centre, "flat")).not.toThrow();
  });
});

describe("planRequestedImage", () => {
  it("plans nothing when the caller asks only for the map as it is, with or without credits and marks", () => {
    expect(planRequestedImage({}, VISIBLE)).toBeUndefined();
    expect(
      planRequestedImage(
        {
          attribution: "© Example",
          drawing: { colour: "#000000", halo: "#ffffff", marks: [] },
        },
        VISIBLE,
      ),
    ).toBeUndefined();
  });

  it("fills in the size of the map on screen, a pixel ratio of 1 and its view north-up", () => {
    const plan = planRequestedImage({ pixelRatio: 1 }, VISIBLE);
    expect(plan).toEqual({
      size: { width: 800, height: 600 },
      pixelRatio: DEFAULT_IMAGE_PIXEL_RATIO,
      view: { center: VIEW.center, zoom: VIEW.zoom },
      pixelWidth: 800,
      pixelHeight: 600,
    });
    expect(DEFAULT_IMAGE_PIXEL_RATIO).toBe(1);
  });

  it("uses the size, ratio and view it is given, and rounds the pixel size as the engine does", () => {
    const plan = planRequestedImage(
      {
        size: { width: 333, height: 250 },
        pixelRatio: 1.5,
        view: { bounds: BOUNDS },
      },
      VISIBLE,
    );
    expect(plan).toMatchObject({
      size: { width: 333, height: 250 },
      pixelRatio: 1.5,
      view: { bounds: BOUNDS },
      pixelWidth: 500,
      pixelHeight: 375,
    });
  });

  it("rounds a fractional size to whole CSS pixels, as the engine sizes a canvas, and plans from the rounded size", () => {
    const plan = planRequestedImage(
      { size: { width: 390.4, height: 700.6 }, pixelRatio: 2 },
      VISIBLE,
    );
    expect(plan).toMatchObject({
      size: { width: 390, height: 701 },
      pixelWidth: 780,
      pixelHeight: 1402,
    });
    const fractional = planRequestedImage(
      { pixelRatio: 2 },
      { ...VISIBLE, size: { width: 390.4, height: 700.4 } },
    );
    expect(fractional?.size).toEqual({ width: 390, height: 700 });
  });

  it("brings the longitude of the view on screen into range, and accepts a box at the Web Mercator limit", () => {
    const wrapped = planRequestedImage(
      { pixelRatio: 1 },
      {
        ...VISIBLE,
        view: { center: { lat: 0, lng: 190 }, zoom: 4, bearing: 0 },
      },
    );
    expect(wrapped?.view).toEqual({ center: { lat: 0, lng: -170 }, zoom: 4 });
    expect(
      planRequestedImage(
        {
          view: {
            bounds: { south: -85, west: -180, north: 85, east: 180 },
          },
        },
        VISIBLE,
      ),
    ).toBeDefined();
  });

  it("clamps the view on screen into range when a request names none, so a polar globe still gets an image", () => {
    const polar = (lat: number) =>
      planRequestedImage(
        { size: { width: 100, height: 100 } },
        {
          ...VISIBLE,
          view: { center: { lat, lng: 0 }, zoom: 2, bearing: 0 },
        },
      )?.view;
    expect(polar(89)).toEqual({
      center: { lat: MAX_MERCATOR_LATITUDE, lng: 0 },
      zoom: 2,
    });
    expect(polar(-90)).toEqual({
      center: { lat: -MAX_MERCATOR_LATITUDE, lng: 0 },
      zoom: 2,
    });
    // MapLibre's own limit is a hair above ours.
    expect(polar(85.051_129)).toMatchObject({
      center: { lat: MAX_MERCATOR_LATITUDE },
    });
  });

  it("accepts a centre and zoom view on its own, at the size on screen", () => {
    const view = { center: { lat: 1, lng: 2 }, zoom: 5 };
    expect(planRequestedImage({ view }, VISIBLE)).toMatchObject({
      size: VISIBLE.size,
      view,
    });
  });

  it("accepts the largest side and the largest area, and refuses one pixel more", () => {
    const widest = MAX_IMAGE_PIXELS / MAX_IMAGE_SIDE_PX;
    expect(
      planRequestedImage(
        { size: { width: MAX_IMAGE_SIDE_PX, height: widest } },
        VISIBLE,
      ),
    ).toMatchObject({ pixelWidth: MAX_IMAGE_SIDE_PX, pixelHeight: widest });
    expect(
      refusal({ size: { width: MAX_IMAGE_SIDE_PX + 1, height: 1 } }, VISIBLE),
    ).toMatchObject({ kind: "too-large" });
    expect(
      refusal(
        { size: { width: MAX_IMAGE_SIDE_PX, height: widest + 1 } },
        VISIBLE,
      ),
    ).toMatchObject({ kind: "too-large" });
  });

  it("counts the pixel ratio towards the limits", () => {
    const error = refusal(
      { size: { width: 4097, height: 100 }, pixelRatio: 2 },
      VISIBLE,
    );
    expect(error).toBeInstanceOf(MapImageExportError);
    expect(error).toMatchObject({ kind: "too-large", reason: "export-failed" });
    expect(error?.message).toContain("8194");
    expect(
      refusal({ size: { width: 3000, height: 3000 }, pixelRatio: 2 }, VISIBLE),
    ).toMatchObject({ kind: "too-large" });
  });

  it.each([
    ["a zero width", { size: { width: 0, height: 10 } }],
    ["a negative height", { size: { width: 10, height: -1 } }],
    [
      "a width that is not a number",
      { size: { width: Number.NaN, height: 5 } },
    ],
    [
      "an infinite height",
      { size: { width: 5, height: Number.POSITIVE_INFINITY } },
    ],
    ["a zero pixel ratio", { pixelRatio: 0 }],
    ["a pixel ratio that is not a number", { pixelRatio: Number.NaN }],
    [
      "a zoom that is not a number",
      { view: { center: { lat: 0, lng: 0 }, zoom: Number.NaN } },
    ],
    [
      "a centre off the planet",
      { view: { center: { lat: 91, lng: 0 }, zoom: 3 } },
    ],
    [
      "a centre past the Web Mercator limit",
      { view: { center: { lat: 86, lng: 0 }, zoom: 3 } },
    ],
    [
      "a centre beyond 180 degrees of longitude",
      { view: { center: { lat: 0, lng: 190 }, zoom: 3 } },
    ],
    [
      "a box past the Web Mercator limit",
      { view: { bounds: { south: -90, west: 0, north: 0, east: 1 } } },
    ],
    [
      "a box beyond 180 degrees of longitude",
      { view: { bounds: { south: 0, west: 170, north: 1, east: 190 } } },
    ],
    [
      "a box with its west beyond its east, as one across the antimeridian is",
      { view: { bounds: { south: 0, west: 170, north: 1, east: -170 } } },
    ],
    [
      "a box with no width",
      { view: { bounds: { south: 0, west: 5, north: 1, east: 5 } } },
    ],
    ["a size under half a pixel", { size: { width: 0.4, height: 300 } }],
    [
      "a box with its south above its north",
      { view: { bounds: { south: 5, west: 0, north: 4, east: 1 } } },
    ],
    [
      "a box with a coordinate that is not a number",
      { view: { bounds: { south: 0, west: Number.NaN, north: 4, east: 1 } } },
    ],
  ])("refuses %s as invalid", (_name, options) => {
    expect(refusal(options, VISIBLE)).toMatchObject({
      kind: "invalid",
      reason: "export-failed",
    });
  });

  it("refuses an image that is invalid for its size before it is too large for it", () => {
    expect(
      refusal(
        { size: { width: MAX_IMAGE_SIDE_PX * 2, height: 10 }, pixelRatio: 0 },
        VISIBLE,
      ),
    ).toMatchObject({ kind: "invalid" });
  });

  it("refuses a size and ratio that leave less than one pixel", () => {
    expect(
      refusal({ size: { width: 1, height: 1 }, pixelRatio: 0.2 }, VISIBLE),
    ).toMatchObject({ kind: "invalid" });
  });
});
