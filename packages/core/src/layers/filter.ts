// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LayerFeature } from "../ports/layers";
import type { FeatureFilter } from "./definition";

/**
 * Whether a decoded feature passes a definition's filter. Filters split one
 * feed into several layers, such as one per event type.
 */
export function matchesFilter(
  feature: LayerFeature,
  filter: FeatureFilter,
): boolean {
  const value = feature.fields[filter.field];
  return (
    value !== undefined &&
    value !== null &&
    typeof value !== "boolean" &&
    filter.in.includes(value)
  );
}
