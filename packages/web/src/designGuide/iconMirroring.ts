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
 * The mirroring decision for every icon in `APP_ICONS`, by Lucide name. A unit
 * test (`iconMirroring.test.ts`) fails when an icon the app imports has no
 * entry here, when an entry has no icon, and when the code passes
 * `mirrorInRtl` for an icon decided `fixed` or leaves it off one decided
 * `mirrors`. DESIGN.md ("Right to left") has the rule.
 */
export const ICON_MIRRORING: Readonly<Record<string, IconMirroring>> = {
  Accessibility: fixed("A figure with open arms, not a direction."),
  AppWindow: fixed("A window, drawn symmetric, not a direction."),
  ArrowLeft: mirrors("A back arrow points along the reading direction."),
  Bike: fixed("A pictogram of a thing, not a direction."),
  Car: fixed("A pictogram of a thing, not a direction."),
  Check: fixed("A tick means done in every direction."),
  ChevronDown: fixed("Vertical: it points down in both directions."),
  ChevronLeft: mirrors(
    "A previous chevron points along the reading direction.",
  ),
  ChevronRight: mirrors("A next chevron points along the reading direction."),
  ChevronUp: fixed("Vertical: it points up in both directions."),
  CircleCheck: fixed("A tick means done in every direction."),
  CircleMinus: fixed("A minus sign has no direction."),
  CirclePlus: fixed("A plus sign has no direction."),
  CodeXml: fixed("Code brackets read the same way in every language."),
  Compass: fixed("A map direction stays physical: north does not move."),
  Copy: fixed("Two sheets of paper, not a direction."),
  Crosshair: fixed("A symmetric target."),
  Download: fixed("Points down in both directions."),
  FileSpreadsheet: fixed("A pictogram of a file."),
  FileText: fixed("A pictogram of a file."),
  FileUp: fixed("Points up in both directions."),
  Footprints: fixed("A pictogram of a thing, not a direction."),
  Heart: fixed("A symmetric shape."),
  Hourglass: fixed("A symmetric shape."),
  Info: fixed("A letter in a circle."),
  Layers: fixed("A stack of sheets, not a direction."),
  Link: fixed("A chain, not a direction."),
  LoaderCircle: fixed("A spinner turns the same way in every direction."),
  LocateFixed: fixed("A symmetric target."),
  MapPin: fixed("A pin, not a direction."),
  MapPinned: fixed("A pin, not a direction."),
  Minus: fixed("A minus sign has no direction."),
  Navigation2: fixed("A map direction stays physical: the arrow points north."),
  Palette: fixed("A painter's palette, not a direction."),
  Pentagon: fixed("A symmetric shape."),
  Plug: fixed("A plug, not a direction."),
  Plus: fixed("A plus sign has no direction."),
  Redo2: mirrors("Redo points along the reading direction, away from undo."),
  RotateCw: fixed(
    "A clockwise turn follows the clock face, which does not mirror.",
  ),
  Route: fixed("A winding path between two points, not a direction."),
  Ruler: fixed("A pictogram of a thing, not a direction."),
  Search: fixed("The magnifier is a pictogram, as DESIGN.md records."),
  Settings: fixed("A cog, not a direction."),
  Shapes: fixed("A group of shapes, not a direction."),
  ShieldCheck: fixed("A shield with a tick, symmetric, not a direction."),
  Trash2: fixed("A bin, not a direction."),
  TriangleAlert: fixed("A warning sign, not a direction."),
  Undo2: mirrors("Undo points along the reading direction, back."),
  X: fixed("A cross has no direction."),
};
