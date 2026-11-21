// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  EDGE_CLEARANCE,
  formatLatitude,
  formatLongitude,
  type PlateView,
  plateGeometry,
  projectToPixel,
} from "./plateGeometry";

/** A view over Cape Town, the size and place of the hero's capture. */
const CAPE_TOWN: PlateView = {
  latitude: -33.9365,
  longitude: 18.407,
  zoom: 13,
  width: 400,
  height: 520,
};

/** The seconds of arc a label such as 18°25′30″E carries past its whole degree. */
function arcSeconds(label: string): number {
  const [, minutes, seconds] = label.match(/°(\d\d)′(\d\d)″/) ?? [];
  return Number(minutes) * 60 + Number(seconds);
}

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

describe("latitude and longitude labels", () => {
  it("write degrees, minutes and seconds with a hemisphere letter", () => {
    expect(formatLatitude(-(33 + 56 / 60))).toBe("33°56′00″S");
    expect(formatLatitude(51.5)).toBe("51°30′00″N");
    expect(formatLongitude(18 + 25 / 60 + 30 / 3600)).toBe("18°25′30″E");
    expect(formatLongitude(-(7 / 60))).toBe("0°07′00″W");
  });

  it("carry a second that rounds up to sixty into the minute, and the minute into the degree", () => {
    expect(formatLatitude(-(33 + 59 / 60 + 59.9 / 3600))).toBe("34°00′00″S");
  });
});

describe("plateGeometry", () => {
  const geometry = plateGeometry(CAPE_TOWN);

  it("has a few ticks on each axis, each inside the capture and in order", () => {
    for (const ticks of [geometry.longitudeTicks, geometry.latitudeTicks]) {
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(4);
      for (const tick of ticks) {
        expect(tick.fraction).toBeGreaterThan(0);
        expect(tick.fraction).toBeLessThan(1);
      }
      const fractions = ticks.map((tick) => tick.fraction);
      expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
    }
  });

  it("keeps every tick clear of the capture's edges, so its label is not cut off", () => {
    for (const tick of geometry.longitudeTicks) {
      const pixels = tick.fraction * CAPE_TOWN.width;
      expect(pixels).toBeGreaterThanOrEqual(EDGE_CLEARANCE - 1e-6);
      expect(CAPE_TOWN.width - pixels).toBeGreaterThanOrEqual(
        EDGE_CLEARANCE - 1e-6,
      );
    }
    for (const tick of geometry.latitudeTicks) {
      const pixels = tick.fraction * CAPE_TOWN.height;
      expect(pixels).toBeGreaterThanOrEqual(EDGE_CLEARANCE - 1e-6);
      expect(CAPE_TOWN.height - pixels).toBeGreaterThanOrEqual(
        EDGE_CLEARANCE - 1e-6,
      );
    }
  });

  it("puts every tick on a round number of seconds of arc, with that angle for its label", () => {
    for (const tick of geometry.longitudeTicks) {
      expect(tick.label).toMatch(/^18°\d\d′\d\d″E$/);
    }
    for (const tick of geometry.latitudeTicks) {
      expect(tick.label).toMatch(/^33°\d\d′\d\d″S$/);
    }
  });

  it("places each tick where its label says, by the same projection the capture uses", () => {
    for (const tick of geometry.longitudeTicks) {
      const longitude = 18 + arcSeconds(tick.label) / 3600;
      const { x } = projectToPixel(CAPE_TOWN, CAPE_TOWN.latitude, longitude);
      expect(tick.fraction).toBeCloseTo(x / CAPE_TOWN.width, 9);
    }
    for (const tick of geometry.latitudeTicks) {
      const latitude = -(33 + arcSeconds(tick.label) / 3600);
      const { y } = projectToPixel(CAPE_TOWN, latitude, CAPE_TOWN.longitude);
      expect(tick.fraction).toBeCloseTo(y / CAPE_TOWN.height, 9);
    }
  });

  it("falls back to ten degrees for a view wider than any finer step suits", () => {
    const wide = plateGeometry({ ...CAPE_TOWN, zoom: 0 });
    for (const tick of wide.longitudeTicks) {
      expect(tick.label).toMatch(/^(0|\d*0)°00′00″[EW]$/);
    }
    expect(wide.longitudeTicks.length).toBeGreaterThan(4);
  });

  it("uses wider steps for a view that shows more ground", () => {
    const world = plateGeometry({ ...CAPE_TOWN, zoom: 5 });
    expect(world.longitudeTicks.length).toBeLessThanOrEqual(4);
    expect(world.longitudeTicks.length).toBeGreaterThanOrEqual(2);
  });
});
