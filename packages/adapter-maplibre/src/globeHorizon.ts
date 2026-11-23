// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LatLng } from "@mapcairn/core";

/** A plane `[a, b, c, d]`: a point `p` on the unit sphere is on its visible side when `a*px + b*py + c*pz + d >= 0`. */
type ClippingPlane = readonly [number, number, number, number];

/** The part of the engine's camera projection the horizon test reads. */
type ProjectedCameraHorizon =
  | { readonly projection: "mercator" }
  | {
      readonly projection: "vertical-perspective";
      readonly clippingPlane: ClippingPlane;
    }
  | {
      readonly projection: "globe";
      readonly globeness: number;
      readonly verticalPerspective: {
        readonly clippingPlane: ClippingPlane;
      };
    };

/**
 * What the engine's camera (`map._camera`) offers for the horizon test, in
 * the two shapes the supported MapLibre versions have: a `transform` that
 * answers it (6.18), and a `projectedCamera` that holds the clipping plane of
 * the globe (6.19 and later, which dropped `transform`). The engine has no
 * public call for it. Both are internal, so nothing here may throw when one is
 * missing.
 */
export interface HorizonCamera {
  readonly transform?: {
    isLocationOccluded(lngLat: unknown): boolean;
  };
  readonly projectedCamera?: ProjectedCameraHorizon;
}

/** The engine's `LngLat` constructor, which the 6.18 transform needs. */
type LngLatConstructor = new (lng: number, lat: number) => unknown;

const DEGREES_TO_RADIANS = Math.PI / 180;

/** The plane the globe is clipped with, or undefined when the camera draws a flat map. */
function clippingPlaneOf(
  camera: ProjectedCameraHorizon,
): ClippingPlane | undefined {
  switch (camera.projection) {
    case "vertical-perspective":
      return camera.clippingPlane;
    case "globe":
      return camera.globeness > 0
        ? camera.verticalPerspective.clippingPlane
        : undefined;
    case "mercator":
      return undefined;
  }
}

/** Where `place` is on the unit sphere, in the engine's axes: y towards the north pole, z towards longitude 0 on the equator. */
function onUnitSphere(place: LatLng): [number, number, number] {
  const lambda = place.lng * DEGREES_TO_RADIANS;
  const phi = place.lat * DEGREES_TO_RADIANS;
  return [
    Math.sin(lambda) * Math.cos(phi),
    Math.sin(phi),
    Math.cos(lambda) * Math.cos(phi),
  ];
}

/**
 * The engine's own horizon test: whether the planet lies between the camera
 * and `place`. It is false when the camera draws a flat map and when the
 * engine offers no way to ask, so a place is never hidden by a guess.
 */
export function isBeyondHorizon(
  camera: HorizonCamera,
  place: LatLng,
  LngLat: LngLatConstructor,
): boolean {
  if (camera.projectedCamera) {
    const plane = clippingPlaneOf(camera.projectedCamera);
    if (!plane) {
      return false;
    }
    const [x, y, z] = onUnitSphere(place);
    return plane[0] * x + plane[1] * y + plane[2] * z + plane[3] < 0;
  }
  return (
    camera.transform?.isLocationOccluded(new LngLat(place.lng, place.lat)) ??
    false
  );
}
