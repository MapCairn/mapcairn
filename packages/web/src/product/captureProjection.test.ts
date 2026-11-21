// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { type CaptureView, projectToPixel } from "./captureProjection";

/** A view over Cape Town, the size and place of the hero's capture. */
const CAPE_TOWN: CaptureView = {
  latitude: -33.9365,
  longitude: 18.407,
  zoom: 13,
  width: 400,
  height: 520,
};

describe("projectToPixel", () => {
  it("puts the view's centre at the middle of the capture", () => {
    const { x, y } = projectToPixel(CAPE_TOWN, -33.9365, 18.407);
    expect(x).toBeCloseTo(200, 6);
    expect(y).toBeCloseTo(260, 6);
  });

  it("puts places north of the centre higher and east of it further along", () => {
    const north = projectToPixel(CAPE_TOWN, -33.9, 18.407);
    const east = projectToPixel(CAPE_TOWN, -33.93, 18.43);
    expect(north.y).toBeLessThan(260);
    expect(east.x).toBeGreaterThan(200);
  });

  it("moves one tile width, 256 px at the zoom's world size, for each 360 / 2^zoom degrees", () => {
    const view = { ...CAPE_TOWN, zoom: 4 };
    const step = 360 / 2 ** 4;
    const { x } = projectToPixel(view, -33.9365, 18.407 + step);
    expect(x - 200).toBeCloseTo(256, 6);
  });
});
