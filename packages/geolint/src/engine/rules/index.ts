// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import type { Rule } from "../types.js";
import { antimeridianRule } from "./antimeridian.js";
import { coordinateOrderRule } from "./coordinate-order.js";
import { deprecatedCrsMemberRule } from "./deprecated-crs-member.js";
import { duplicateVerticesRule } from "./duplicate-vertices.js";
import { emptyGeometryRule } from "./empty-geometry.js";
import { nullIslandRule } from "./null-island.js";
import { precisionRule } from "./precision.js";
import { projectedCoordsRule } from "./projected-coords.js";
import { regionMismatchRule } from "./region-mismatch.js";
import { selfIntersectionRule } from "./self-intersection.js";
import { structureRule } from "./structure.js";
import { unclosedRingRule } from "./unclosed-ring.js";
import { windingOrderRule } from "./winding-order.js";

/**
 * Every rule, in the order `--rules` lists them and the order they run in. To
 * add a rule, write it in its own file and add it here; nothing else changes.
 */
export const rules: readonly Rule[] = [
  structureRule,
  windingOrderRule,
  unclosedRingRule,
  selfIntersectionRule,
  duplicateVerticesRule,
  coordinateOrderRule,
  projectedCoordsRule,
  deprecatedCrsMemberRule,
  precisionRule,
  antimeridianRule,
  emptyGeometryRule,
  nullIslandRule,
  regionMismatchRule,
];
