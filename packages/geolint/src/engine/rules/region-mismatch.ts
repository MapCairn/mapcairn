// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { type LeafGeometry, leafGeometries } from "../geometry/walk.js";
import type { Finding, Rule, RuleContext } from "../types.js";
import {
  coordinateOrderRule,
  type Lookup,
  listRegions,
  regionLookup,
} from "./coordinate-order.js";
import { eachPosition, samplePositions } from "./positionSample.js";

/**
 * The most positions of one geometry tested against the outlines, spread
 * evenly and always including the first and the last, so a huge geometry costs
 * bounded time.
 */
const SAMPLE_SIZE = 1000;

/** A bounding box as west, south, east, north. */
type Box = readonly [number, number, number, number];

/** Whether at least half of the sampled positions are inside the outline of some country (not one of the regions). */
function mostlyElsewhere(
  leaves: readonly LeafGeometry[],
  lookup: Lookup,
): boolean {
  const sampled = leaves.flatMap((leaf) => samplePositions(leaf, SAMPLE_SIZE));
  const elsewhere = sampled.filter(
    ({ position: [longitude = 0, latitude = 0] }) =>
      lookup.countries.locate(longitude, latitude) !== undefined,
  );
  return sampled.length > 0 && elsewhere.length * 2 >= sampled.length;
}

/** Whether any sampled position of the geometry is inside a region. */
function touchesRegion(leaf: LeafGeometry, lookup: Lookup): boolean {
  return samplePositions(leaf, SAMPLE_SIZE).some(
    ({ position: [longitude = 0, latitude = 0] }) =>
      lookup.regions.some((code) =>
        lookup.countries.contains(code, longitude, latitude),
      ),
  );
}

/** The bounding box and the number of readable positions of the geometries; the box is meaningless when the count is 0. */
function measure(leaves: readonly LeafGeometry[]): {
  box: Box;
  count: number;
} {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const leaf of leaves) {
    for (const [longitude = 0, latitude = 0] of eachPosition(leaf)) {
      west = Math.min(west, longitude);
      east = Math.max(east, longitude);
      south = Math.min(south, latitude);
      north = Math.max(north, latitude);
      count += 1;
    }
  }
  return { box: [west, south, east, north], count };
}

/**
 * Whether the box swallows a region whole. A polygon big enough to contain a
 * country need not have a vertex inside it, so it is not a mismatch.
 */
function swallowsRegion(box: Box, lookup: Lookup): boolean {
  return lookup.regions.some((code) => {
    const region = lookup.countries.bounds(code);
    return (
      region !== undefined &&
      box[0] <= region[0] &&
      box[1] <= region[1] &&
      box[2] >= region[2] &&
      box[3] >= region[3]
    );
  });
}

const NUMBER = new Intl.NumberFormat("en-GB");

/** How many positions were tested against the outlines: at most `SAMPLE_SIZE` for each geometry. */
function checkedCount(leaves: readonly LeafGeometry[]): number {
  return leaves.reduce(
    (sum, leaf) => sum + samplePositions(leaf, SAMPLE_SIZE).length,
    0,
  );
}

/**
 * The start of the sentence. When a big feature was sampled, it says how many
 * positions were checked and how many the feature holds, as the others were
 * not looked at.
 */
function subject(count: number, checked: number): string {
  if (count === 1) {
    return "The only position in this feature is";
  }
  if (checked < count) {
    return `All ${NUMBER.format(checked)} positions checked in this feature (of ${NUMBER.format(count)}) are`;
  }
  return `All ${NUMBER.format(count)} positions in this feature are`;
}

/** The first geometry that has a readable position. */
function firstPopulated(
  leaves: readonly LeafGeometry[],
): LeafGeometry | undefined {
  return leaves.find((leaf) => eachPosition(leaf).next().done === false);
}

function check(feature: unknown, context: RuleContext): Finding[] {
  const lookup = regionLookup(context);
  const leaves = leafGeometries(feature);
  const populated = firstPopulated(leaves);
  if (lookup === undefined || populated === undefined) {
    return [];
  }
  if (leaves.some((leaf) => touchesRegion(leaf, lookup))) {
    return [];
  }
  if (!mostlyElsewhere(leaves, lookup)) {
    return [];
  }
  const { box, count } = measure(leaves);
  const checked = checkedCount(leaves);
  if (
    swallowsRegion(box, lookup) ||
    coordinateOrderRule.check(feature, context).length > 0
  ) {
    return [];
  }
  return [
    {
      ruleId: "region-mismatch",
      severity: "warning",
      confidence: "medium",
      path: populated.pointer,
      message: `${subject(count, checked)} outside ${listRegions(lookup.regions)}, even allowing for a coarse coastline, so the feature may belong to another place.`,
      fixable: false,
      data: { regions: lookup.regions, positions: count, checked },
    },
  ];
}

/**
 * Reports a feature whose positions are all outside the region the data should
 * be in. It is conservative: it skips a feature that a swap of latitude and
 * longitude explains (`coordinate-order` reports that), a feature with no
 * readable position, and a feature whose bounding box covers a whole region.
 * It also stays quiet unless at least half of the positions are inside another
 * country's outline: open sea, and islands the 1:110m outlines leave out (the
 * Canaries, Réunion, Marion Island), look like "outside" but are not known to be
 * elsewhere. It does nothing without a region.
 */
export const regionMismatchRule: Rule = {
  id: "region-mismatch",
  severity: "warning",
  confidence: "medium",
  summary: "A feature that lies wholly outside the region it should be in.",
  fixable: false,
  needsRegion: true,
  check,
};
