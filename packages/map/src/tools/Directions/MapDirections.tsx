// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type LayerGeometry, routeBounds } from "@mapcairn/core";
import { tokenValues } from "@mapcairn/theme";
import { useEffect } from "react";
import { useChromeLayout } from "../../chrome/layoutContext";
import { useMap } from "../../host";
import { FIT_MAX_ZOOM, fitPadding } from "../../layers/reveal";
import type { DirectionsOutcome } from "./useDirections";

/** Map ids of what directions draws. Definition ids cannot contain a colon, so they never meet a layer's. */
export const ROUTE_CASING_LAYER_ID = ":route-casing";
/** Map id of the route line. */
export const ROUTE_LAYER_ID = ":route";
/** Map id of the travel-time area. */
export const AREA_LAYER_ID = ":area";

/** Width of the route line, in pixels, and of the white casing under it. */
const ROUTE_WIDTH_PX = 5;
const ROUTE_CASING_WIDTH_PX = 9;

/** Props for {@link MapDirections}. */
export interface MapDirectionsProps {
  /** The route or area to draw, or null for none. */
  readonly result: DirectionsOutcome | null;
}

/**
 * Draws a route as a line with a white casing, or a travel-time area as an
 * outlined, tinted shape, through the map adapter's shape layers, and fits the
 * map to it, clear of the sheet or side panel. Renders nothing; put it inside
 * `MapView`. The engine draws the shapes, so they stay sharp while the map
 * moves and come back after a basemap swap.
 */
export function MapDirections({ result }: MapDirectionsProps) {
  const { adapter } = useMap();
  const { layout, viewport, panelEdge } = useChromeLayout();

  useEffect(() => {
    if (!adapter || !result) {
      return;
    }
    const colour = tokenValues.dataPalette.blue;
    if (result.kind === "route") {
      // The port's positions are readonly pairs; the features hold plain arrays.
      const geometries = result.legs.map(
        (leg) => leg.geometry as unknown as LayerGeometry,
      );
      adapter.setShapeLayer(ROUTE_CASING_LAYER_ID, {
        geometries,
        colour: tokenValues.dataMarker.halo,
        lineWidth: ROUTE_CASING_WIDTH_PX,
      });
      adapter.setShapeLayer(ROUTE_LAYER_ID, {
        geometries,
        colour,
        lineWidth: ROUTE_WIDTH_PX,
      });
    } else {
      adapter.setShapeLayer(AREA_LAYER_ID, {
        geometries: result.features.map(
          (feature) => feature.geometry as unknown as LayerGeometry,
        ),
        colour,
      });
    }
    return () => {
      adapter.removeLayer(ROUTE_CASING_LAYER_ID);
      adapter.removeLayer(ROUTE_LAYER_ID);
      adapter.removeLayer(AREA_LAYER_ID);
    };
  }, [adapter, result]);

  // The fit runs once for each new result, not when the panel moves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the result is the trigger; the layout is read as it is then.
  useEffect(() => {
    if (!adapter || !result) {
      return;
    }
    const bounds = routeBounds(
      result.kind === "route" ? result.legs : result.features,
    );
    if (!bounds) {
      return;
    }
    adapter.fitBounds(bounds, {
      maxZoom: FIT_MAX_ZOOM,
      padding: fitPadding({ layout, viewport, panelEdge }),
    });
  }, [adapter, result]);

  return null;
}
