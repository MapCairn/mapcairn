// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { CHROME_GAP_PX } from "../chromeSpacing";

/** Height of one control, in CSS pixels (the 48 px `size.control` token). */
const CONTROL_PX = 48;
/** One hairline between grouped buttons, plus the surface border. */
const HAIRLINE_PX = 1;
/** Zoom in and Zoom out. */
const ZOOM_CONTROLS = 2;
/** The divider between the two zoom buttons and the group's two borders. */
const ZOOM_HAIRLINES = 3;

/** The tools of the main group a host normally passes: Map options, Measure, Locate me and Settings. */
const DEFAULT_TOOL_COUNT = 4;

/**
 * The height the end stack needs to show the zoom group under the main
 * group: the tools shown (four by default: Map options, Measure, Locate me and
 * Settings), the two zoom controls, the gap between the groups and the
 * hairlines (the dividers between neighbours and the groups' borders), plus
 * the compass and its gap while it shows, and one more control and hairline
 * while the Directions or Draw shapes button shows. With no control in the
 * main group there is no group, so no gap and no hairlines of its own. Below
 * this, and only when the user has not chosen to show zoom buttons, the zoom
 * group yields.
 *
 * @param compassShown - The compass shows.
 * @param directionsShown - The Directions button shows.
 * @param drawShown - The Draw shapes button shows.
 * @param toolsShown - How many of Map options, Measure, Locate me and
 *   Settings show. Defaults to all four.
 * @remarks The stack's own padding is not counted. It lives in its own file,
 *   with no styles, so that the browser tests can read it too.
 */
export function endStackMinHeightForZoom(
  compassShown: boolean,
  directionsShown = false,
  drawShown = false,
  toolsShown = DEFAULT_TOOL_COUNT,
): number {
  const mainControls =
    toolsShown + (directionsShown ? 1 : 0) + (drawShown ? 1 : 0);
  const mainGroup =
    mainControls === 0
      ? 0
      : mainControls * (CONTROL_PX + HAIRLINE_PX) + HAIRLINE_PX + CHROME_GAP_PX;
  const zoomGroup = ZOOM_CONTROLS * CONTROL_PX + ZOOM_HAIRLINES * HAIRLINE_PX;
  const groups = mainGroup + zoomGroup;
  return compassShown ? groups + CONTROL_PX + CHROME_GAP_PX : groups;
}
