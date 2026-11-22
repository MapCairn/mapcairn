// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * Whether an icon flips when the page reads right to left: `mirrors` for one
 * that points along the reading direction, `fixed` for every other. The
 * reason is the decision in words, so the next person adding a similar icon
 * can follow it.
 */
export interface IconMirroring {
  readonly decision: "mirrors" | "fixed";
  readonly reason: string;
}

const mirrors = (reason: string): IconMirroring => ({
  decision: "mirrors",
  reason,
});
const fixed = (reason: string): IconMirroring => ({
  decision: "fixed",
  reason,
});

/**
 * The mirroring decision for every icon in `APP_ICONS`, by Phosphor name. A unit
 * test (`iconMirroring.test.ts`) fails when an icon the app imports has no
 * entry here, when an entry has no icon, and when the code passes
 * `mirrorInRtl` for an icon decided `fixed` or leaves it off one decided
 * `mirrors`. DESIGN.md ("Right to left") has the rule.
 */
export const ICON_MIRRORING: Readonly<Record<string, IconMirroring>> = {
  ArrowLeft: mirrors("A back arrow points along the reading direction."),
  Bicycle: fixed("A pictogram of a thing, not a direction."),
  Car: fixed("A pictogram of a thing, not a direction."),
  Check: fixed("A tick means done in every direction."),
  CaretDown: fixed("Vertical: it points down in both directions."),
  CaretLeft: mirrors("A previous chevron points along the reading direction."),
  CaretRight: mirrors("A next chevron points along the reading direction."),
  CaretUp: fixed("Vertical: it points up in both directions."),
  CheckCircle: fixed("A tick means done in every direction."),
  MinusCircle: fixed("A minus sign has no direction."),
  PlusCircle: fixed("A plus sign has no direction."),
  Copy: fixed("Two sheets of paper, not a direction."),
  Crosshair: fixed("A symmetric target."),
  DownloadSimple: fixed("Points down in both directions."),
  FileXls: fixed("A pictogram of a file."),
  FileText: fixed("A pictogram of a file."),
  FileArrowUp: fixed("Points up in both directions."),
  Footprints: fixed("A pictogram of a thing, not a direction."),
  Heart: fixed("A symmetric shape."),
  Hourglass: fixed("A symmetric shape."),
  Info: fixed("A letter in a circle."),
  Stack: fixed("A stack of sheets, not a direction."),
  Link: fixed("A chain, not a direction."),
  CircleNotch: fixed("A spinner turns the same way in every direction."),
  GpsFix: fixed("A symmetric target."),
  MapPin: fixed("A pin, not a direction."),
  MapPinArea: fixed("A pin, not a direction."),
  Minus: fixed("A minus sign has no direction."),
  NavigationArrow: fixed(
    "A map direction stays physical: the arrow points north.",
  ),
  Polygon: fixed("A symmetric shape."),
  Plus: fixed("A plus sign has no direction."),
  ArrowUUpRight: mirrors(
    "Redo points along the reading direction, away from undo.",
  ),
  ArrowClockwise: fixed(
    "A clockwise turn follows the clock face, which does not mirror.",
  ),
  Path: fixed("A winding path between two points, not a direction."),
  Ruler: fixed("A pictogram of a thing, not a direction."),
  MagnifyingGlass: fixed("The magnifier is a pictogram, as DESIGN.md records."),
  Gear: fixed("A cog, not a direction."),
  Shapes: fixed("A group of shapes, not a direction."),
  Trash: fixed("A bin, not a direction."),
  Warning: fixed("A warning sign, not a direction."),
  ArrowUUpLeft: mirrors("Undo points along the reading direction, back."),
  X: fixed("A cross has no direction."),
};
