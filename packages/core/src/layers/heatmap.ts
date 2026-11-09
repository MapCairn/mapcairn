import type { ControlValues } from "../ports/layers";
import type { HeatmapSpec, HeatmapValue, LayerDefinition } from "./definition";

/** How opaque a heatmap is when its layer has no opacity control. */
export const DEFAULT_HEATMAP_OPACITY = 0.8;

/** The radius in pixels used when a control has no usable value. */
const FALLBACK_RADIUS = 20;

/** The intensity used when a control has no usable value. */
const FALLBACK_INTENSITY = 1;

function resolve(
  value: HeatmapValue,
  controls: ControlValues,
  fallback: number,
): number {
  if (typeof value === "number") {
    return value;
  }
  const number = Number(controls[value.control]);
  return Number.isFinite(number) ? number : fallback;
}

/** A heatmap's radius in pixels and intensity, from fixed numbers or the layer's controls. */
export function heatmapSettings(
  spec: HeatmapSpec,
  controls: ControlValues,
): { readonly radius: number; readonly intensity: number } {
  return {
    radius: resolve(spec.radius, controls, FALLBACK_RADIUS),
    intensity: resolve(spec.intensity, controls, FALLBACK_INTENSITY),
  };
}

/** A layer's opacity from its `opacity` control, or {@link DEFAULT_HEATMAP_OPACITY}. */
export function heatmapOpacity(
  definition: LayerDefinition,
  controls: ControlValues,
): number {
  const control = definition.controls.find((item) => item.kind === "opacity");
  const value = control ? Number(controls[control.id]) : Number.NaN;
  return Number.isFinite(value) ? value : DEFAULT_HEATMAP_OPACITY;
}
