// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { type HorizonCamera, isBeyondHorizon } from "./globeHorizon";

/** The plane of the unit sphere's points a quarter of the way round or less from `lng`, `lat`. */
function planeFacing(
  lng: number,
  lat: number,
): [number, number, number, number] {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lng * Math.PI) / 180;
  return [
    Math.sin(lambda) * Math.cos(phi),
    Math.sin(phi),
    Math.cos(lambda) * Math.cos(phi),
    0,
  ];
}

const NEVER_USED = class {
  constructor(
    readonly lng: number,
    readonly lat: number,
  ) {}
};

describe("isBeyondHorizon", () => {
  describe("on an engine that keeps the camera's projection (6.19 and later)", () => {
    const perspective = (lng: number, lat: number) => ({
      projection: "vertical-perspective" as const,
      clippingPlane: planeFacing(lng, lat),
    });

    it("hides a place on the far side of the planet and shows the near side", () => {
      const camera: HorizonCamera = { projectedCamera: perspective(10, 20) };
      expect(isBeyondHorizon(camera, { lng: 10, lat: 20 }, NEVER_USED)).toBe(
        false,
      );
      expect(isBeyondHorizon(camera, { lng: 190, lat: -20 }, NEVER_USED)).toBe(
        true,
      );
      expect(isBeyondHorizon(camera, { lng: 40, lat: 20 }, NEVER_USED)).toBe(
        false,
      );
      expect(isBeyondHorizon(camera, { lng: 120, lat: 20 }, NEVER_USED)).toBe(
        true,
      );
    });

    it("uses the vertical perspective of a globe that is still drawing as one", () => {
      const camera: HorizonCamera = {
        projectedCamera: {
          projection: "globe",
          globeness: 0.4,
          verticalPerspective: perspective(0, 0),
        },
      };
      expect(isBeyondHorizon(camera, { lng: 180, lat: 0 }, NEVER_USED)).toBe(
        true,
      );
      expect(isBeyondHorizon(camera, { lng: 0, lat: 0 }, NEVER_USED)).toBe(
        false,
      );
    });

    it("hides nothing once the globe has turned into mercator, or on a flat map", () => {
      const turned: HorizonCamera = {
        projectedCamera: {
          projection: "globe",
          globeness: 0,
          verticalPerspective: perspective(0, 0),
        },
      };
      const flat: HorizonCamera = {
        projectedCamera: { projection: "mercator" },
      };
      expect(isBeyondHorizon(turned, { lng: 180, lat: 0 }, NEVER_USED)).toBe(
        false,
      );
      expect(isBeyondHorizon(flat, { lng: 180, lat: 0 }, NEVER_USED)).toBe(
        false,
      );
    });
  });

  describe("on an engine that keeps a transform (6.18)", () => {
    it("asks the transform with the engine's own LngLat", () => {
      const asked: unknown[] = [];
      const camera: HorizonCamera = {
        transform: {
          isLocationOccluded: (lngLat) => {
            asked.push(lngLat);
            return true;
          },
        },
      };
      expect(isBeyondHorizon(camera, { lng: 5, lat: 6 }, NEVER_USED)).toBe(
        true,
      );
      expect(asked).toEqual([new NEVER_USED(5, 6)]);
    });
  });

  it("hides nothing when the engine offers neither, so a marker is never lost to an engine change", () => {
    expect(isBeyondHorizon({}, { lng: 180, lat: 0 }, NEVER_USED)).toBe(false);
  });
});
