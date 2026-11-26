// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { boundsAroundPoint, type LocationFix } from "@mapcairn/core";
import { useMap } from "@mapcairn/map";
import { useEffect } from "react";

/** The closest zoom a location fix is fitted to. */
const LOCATE_ZOOM = 15;
/** The most of a coarse fix's accuracy circle that is fitted, in metres, so a very coarse fix does not zoom the map out to a region. */
const LOCATE_MAX_FIT_RADIUS_METRES = 25_000;
/** Space kept clear around the fitted circle, in pixels. */
const LOCATE_FIT_PADDING_PX = 32;

/**
 * Moves the map to each new location fix, fitting its accuracy circle so a
 * coarse fix shows its whole circle. Call it inside the map's chrome, where
 * the adapter is known.
 */
export function useShowFix(fix: LocationFix | null): void {
  const { adapter } = useMap();
  useEffect(() => {
    if (!fix || !adapter) {
      return;
    }
    const padding = LOCATE_FIT_PADDING_PX;
    adapter.fitBounds(
      boundsAroundPoint(
        fix.position,
        Math.min(fix.accuracyMetres, LOCATE_MAX_FIT_RADIUS_METRES),
      ),
      {
        maxZoom: LOCATE_ZOOM,
        padding: {
          top: padding,
          right: padding,
          bottom: padding,
          left: padding,
        },
      },
    );
  }, [adapter, fix]);
}
