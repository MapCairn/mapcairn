import {
  evaluatePointStyle,
  type LatLng,
  type LayerFeature,
  type MapFeature,
  type PaletteSlot,
  type PointStyle,
} from "@karta/core";
import { tokenValues } from "@karta/theme";

const PALETTE: Readonly<Record<string, string>> = tokenValues.dataPalette;

/**
 * The hex value of a palette slot. Definitions name slots, `@karta/theme`
 * holds the values, and the definition schema only accepts slots that exist,
 * so a missing value is a wiring bug.
 */
export function paletteColour(slot: PaletteSlot): string {
  const colour = PALETTE[slot];
  if (colour === undefined) {
    throw new Error(`The data palette has no colour "${slot}".`);
  }
  return colour;
}

/** Where a point feature is, or null for any other geometry. */
export function featurePosition(feature: LayerFeature): LatLng | null {
  const { geometry } = feature;
  if (geometry.type !== "Point") {
    return null;
  }
  const [lng, lat] = geometry.coordinates;
  return { lat, lng };
}

/**
 * Works out how each point of a feed layer is drawn, so the map adapter gets
 * plain colours, sizes and shapes and needs no style rule.
 */
export function toMapFeatures(
  style: PointStyle,
  features: readonly LayerFeature[],
): MapFeature[] {
  return features.flatMap((feature) => {
    const position = featurePosition(feature);
    if (!position) {
      return [];
    }
    const marker = evaluatePointStyle(style, feature.fields);
    return [
      {
        id: feature.id,
        position,
        colour: paletteColour(marker.colour),
        radius: marker.radius,
        shape: marker.shape,
      },
    ];
  });
}
