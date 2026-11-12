// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type FeatureRef,
  featureRefKey,
  isFeedLayer,
  type LayerDefinition,
  type LayerFeature,
} from "@mapcairn/core";
import type { DataLayerState } from "./useDataLayers";

/** A selected reference whose feature can be shown, with the definition of the layer that holds it. */
export interface ShownSelection {
  readonly status: "shown";
  readonly ref: FeatureRef;
  readonly definition: LayerDefinition;
  readonly feature: LayerFeature;
}

/**
 * A selected reference with nothing to show: its layer is off, still loading,
 * not in the catalogue or not selectable. It stays selected and counts.
 */
export interface HiddenSelection {
  readonly status: "not-shown";
  readonly ref: FeatureRef;
}

/** One selected reference, resolved against the layers as they are now. */
export type SelectedEntry = ShownSelection | HiddenSelection;

/** The features kept for selected references, by {@link featureRefKey}. */
export type SelectionSnapshots = ReadonlyMap<string, LayerFeature>;

/**
 * The references whose layer is a feed layer in the list, whether it is on or
 * not: the only ones a person can select. A reference to a tile, heatmap or
 * vector tile layer, or to a layer not in the list, is dropped.
 */
export function selectableRefs(
  refs: readonly FeatureRef[],
  layers: readonly DataLayerState[],
): readonly FeatureRef[] {
  const selectable = new Set(
    layers
      .filter((layer) => isFeedLayer(layer.definition))
      .map((layer) => layer.definition.id),
  );
  return refs.filter((ref) => selectable.has(ref.layerId));
}

/** What the layers hold for a reference: its layer's definition, and its loaded feature if the layer has it. */
interface Found {
  readonly definition: LayerDefinition;
  readonly loaded: LayerFeature | undefined;
}

/**
 * Each features array indexed by feature id, once. The array a layer holds
 * keeps its identity until the layer loads again, so a map move, which makes
 * new layer states but not new features, indexes nothing.
 */
const indexes = new WeakMap<
  readonly LayerFeature[],
  ReadonlyMap<string, LayerFeature>
>();

function indexOf(
  features: readonly LayerFeature[],
): ReadonlyMap<string, LayerFeature> {
  let index = indexes.get(features);
  if (!index) {
    index = new Map(features.map((feature) => [feature.id, feature]));
    indexes.set(features, index);
  }
  return index;
}

/**
 * A lookup from a reference to what an enabled, selectable layer holds for it,
 * or null when its layer is not in the list, is off or is not a feed layer.
 */
function lookupIn(
  layers: readonly DataLayerState[],
): (ref: FeatureRef) => Found | null {
  const byId = new Map(layers.map((layer) => [layer.definition.id, layer]));
  return (ref) => {
    const layer = byId.get(ref.layerId);
    if (!layer?.enabled || !isFeedLayer(layer.definition)) {
      return null;
    }
    return {
      definition: layer.definition,
      loaded: indexOf(layer.features).get(ref.featureId),
    };
  };
}

/** Whether two entries are for the same reference and show the same feature of the same definition, or both show nothing. */
function sameEntry(previous: SelectedEntry, next: SelectedEntry): boolean {
  if (
    previous.status !== next.status ||
    featureRefKey(previous.ref) !== featureRefKey(next.ref)
  ) {
    return false;
  }
  return (
    previous.status === "not-shown" ||
    (next.status === "shown" &&
      previous.feature === next.feature &&
      previous.definition === next.definition)
  );
}

/**
 * The selected references resolved against the layers, in selection order. A
 * reference shows its layer's loaded feature, else the snapshot kept for it,
 * but only while its layer is on and selectable: a layer that is off, absent
 * or not a feed layer leaves it not shown, whatever snapshot there is.
 *
 * Pass the `previous` result to keep what did not change: an entry that
 * resolves to the same feature of the same definition is the previous entry
 * itself, and when every entry is, so is the array. A map move makes new layer
 * states with the same features, and the selection's consumers must not render
 * for it.
 */
export function resolveSelection(
  refs: readonly FeatureRef[],
  layers: readonly DataLayerState[],
  snapshots: SelectionSnapshots,
  previous: readonly SelectedEntry[] = [],
): readonly SelectedEntry[] {
  const lookup = lookupIn(layers);
  const next = refs.map((ref, position): SelectedEntry => {
    const found = lookup(ref);
    const feature = found?.loaded ?? snapshots.get(featureRefKey(ref));
    const entry: SelectedEntry =
      found && feature
        ? { status: "shown", ref, definition: found.definition, feature }
        : { status: "not-shown", ref };
    const kept = previous[position];
    return kept && sameEntry(kept, entry) ? kept : entry;
  });
  return next.length === previous.length &&
    next.every((entry, position) => entry === previous[position])
    ? previous
    : next;
}

function sameSnapshots(
  left: SelectionSnapshots,
  right: SelectionSnapshots,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, feature] of left) {
    if (right.get(key) !== feature) {
      return false;
    }
  }
  return true;
}

/**
 * The snapshots for the selected references, given the layers as they are
 * now: each reference's loaded feature when its layer lists one (taking the
 * snapshot, or refreshing it), else the snapshot it had, so a feature a query
 * layer stops listing, or a layer that is turned off, leaves it as it was. A
 * reference no longer selected loses its snapshot. Returns `previous` itself
 * when nothing changed, so storing the result in state causes no render.
 */
export function reconcileSnapshots(
  previous: SelectionSnapshots,
  refs: readonly FeatureRef[],
  layers: readonly DataLayerState[],
): SelectionSnapshots {
  const lookup = lookupIn(layers);
  const next = new Map<string, LayerFeature>();
  for (const ref of refs) {
    const key = featureRefKey(ref);
    const feature = lookup(ref)?.loaded ?? previous.get(key);
    if (feature) {
      next.set(key, feature);
    }
  }
  return sameSnapshots(previous, next) ? previous : next;
}
