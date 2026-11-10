/** Height of one control, in CSS pixels (the 48 px `size.control` token). */
const CONTROL_PX = 48;
/** The gap between groups (the 12 px `space.sm` token). */
const GAP_PX = 12;
/** One hairline between grouped buttons, plus the surface border. */
const HAIRLINE_PX = 1;

/**
 * The height the end stack needs to show the zoom group under the main
 * group: four main controls (Map options, Measure, Locate me and Settings),
 * two zoom controls, the gap between the groups and eight hairlines (the
 * dividers between neighbours and the groups' borders), plus the compass and
 * its gap while it shows, and one more control and hairline while the
 * Directions or Draw shapes button shows. Below this, and only when the user
 * has not chosen to show zoom buttons, the zoom group yields.
 *
 * @remarks The stack's own padding is not counted. It lives in its own file,
 *   with no styles, so that the browser tests can read it too.
 */
export function endStackMinHeightForZoom(
  compassShown: boolean,
  directionsShown = false,
  drawShown = false,
): number {
  const extra =
    ((directionsShown ? 1 : 0) + (drawShown ? 1 : 0)) *
    (CONTROL_PX + HAIRLINE_PX);
  const groups = 6 * CONTROL_PX + GAP_PX + 8 * HAIRLINE_PX + extra;
  return compassShown ? groups + CONTROL_PX + GAP_PX : groups;
}
