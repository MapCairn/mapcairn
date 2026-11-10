import {
  type DrawShape,
  imageMarksFor,
  type MapImageDrawing,
} from "@mapcairn/core";
import { parseColour, toHex, tokenValues } from "@mapcairn/theme";

/**
 * The shapes as a drawing for a saved map image, in the overlay's colours for
 * the light theme (the basemap never follows the theme, so the image does not
 * either). Undefined when there is nothing to draw, so the image is the map
 * alone.
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
