// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type DrawShape,
  imageMarksFor,
  type MapImageDrawing,
} from "@mapcairn/core";
import { parseColour, toHex, tokenValues } from "@mapcairn/theme";

/**
 * The shapes as a drawing for a saved map image, in the overlay's colours for
 * the light theme, whatever theme is showing: the white halo under them shows
 * on every basemap, light or dark, so the image reads the same everywhere. Undefined when there is nothing to draw, so the image is the map
 * alone.
 *
 * @internal
 */
export function drawingForImage(
  shapes: readonly DrawShape[],
): MapImageDrawing | undefined {
  const marks = imageMarksFor(shapes);
  if (marks.length === 0) {
    return undefined;
  }
  const colours = tokenValues.themeValues.light.colour;
  return {
    colour: toHex(parseColour(colours.mapMeasureLine)),
    halo: toHex(parseColour(colours.mapHalo)),
    marks,
  };
}
