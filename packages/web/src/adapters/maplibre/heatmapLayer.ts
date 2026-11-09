import type { MapHeatmapStyle } from "@karta/core";
import { rgbaColour as rgba } from "./markerImages";
import type { EngineLayer, ZoomWindow } from "./shapeLayers";

/**
 * The `heatmap-color` ramp: clear where there is no density, then the colours
 * from the lowest density to the highest, spread evenly up to 1. The clear
 * stop has the first colour's hue, so the engine blends between them without
 * a dark fringe.
 */
export function heatmapColour(ramp: readonly string[]): unknown {
  const stops = ramp.flatMap((colour, index) => [
    (index + 1) / ramp.length,
    rgba(colour, 1),
  ]);
  return [
    "interpolate",
    ["linear"],
    ["heatmap-density"],
    0,
    rgba(ramp[0] as string, 0),
    ...stops,
  ];
}

/** What a heatmap layer needs besides its style. */
export interface HeatmapLayerOptions {
  readonly id: string;
  readonly source: string;
  /** The layer inside a vector tile source. */
  readonly sourceLayer?: string;
  /** The engine expression for each point's weight. */
  readonly weight: unknown;
  readonly zoom: ZoomWindow;
}

/** The engine layer of a heatmap. */
export function heatmapLayer(
  options: HeatmapLayerOptions,
  style: MapHeatmapStyle,
): EngineLayer {
  return {
    id: options.id,
    type: "heatmap",
    source: options.source,
    ...(options.sourceLayer === undefined
      ? {}
      : { "source-layer": options.sourceLayer }),
    ...options.zoom,
    paint: {
      "heatmap-weight": options.weight,
      "heatmap-radius": style.radius,
      "heatmap-intensity": style.intensity,
      "heatmap-opacity": style.opacity,
      "heatmap-color": heatmapColour(style.ramp),
    },
  };
}
