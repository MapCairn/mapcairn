// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type FeatureRef,
  isFeedLayer,
  type LayerFeature,
} from "@mapcairn/core";
import type { DataLayerState } from "./useDataLayers";

/** A selected reference whose feature can be shown, with the layer that holds it. */
export interface ShownSelection {
  readonly status: "shown";
  readonly ref: FeatureRef;
  readonly layer: DataLayerState;
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

/** The features kept for selected references, by {@link selectionKey}. */
export type SelectionSnapshots = ReadonlyMap<string, LayerFeature>;

/** A key equal for two references exactly when both ids are equal. */
export function selectionKey(ref: FeatureRef): string {
  return `${ref.layerId}\u0000${ref.featureId}`;
}

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

/** What the layers hold for a reference: the layer, and its loaded feature if it has it. */
interface Found {
  readonly layer: DataLayerState;
  readonly loaded: LayerFeature | undefined;
}

/**
 * A lookup from a reference to what an enabled, selectable layer holds for it,
 * or null when its layer is not in the list, is off or is not a feed layer. It
 * indexes a layer's features by id the first time a reference names the layer,
 * so resolving many references costs one pass over each layer.
 */
function lookupIn(
  layers: readonly DataLayerState[],
): (ref: FeatureRef) => Found | null {
  const byId = new Map(layers.map((layer) => [layer.definition.id, layer]));
  const indexes = new Map<string, ReadonlyMap<string, LayerFeature>>();
  const indexOf = (layer: DataLayerState) => {
    const id = layer.definition.id;
    let index = indexes.get(id);
    if (!index) {
      index = new Map(layer.features.map((feature) => [feature.id, feature]));
      indexes.set(id, index);
    }
    return index;
  };
  return (ref) => {
    const layer = byId.get(ref.layerId);
    if (!layer?.enabled || !isFeedLayer(layer.definition)) {
      return null;
    }
    return { layer, loaded: indexOf(layer).get(ref.featureId) };
  };
}

/**
 * The selected references resolved against the layers, in selection order. A
 * reference shows its layer's loaded feature, else the snapshot kept for it,
 * but only while its layer is on and selectable: a layer that is off, absent
 * or not a feed layer leaves it not shown, whatever snapshot there is.
 */
export function resolveSelection(
  refs: readonly FeatureRef[],
  layers: readonly DataLayerState[],
  snapshots: SelectionSnapshots,
): readonly SelectedEntry[] {
  const lookup = lookupIn(layers);
  return refs.map((ref): SelectedEntry => {
    const found = lookup(ref);
    const feature = found?.loaded ?? snapshots.get(selectionKey(ref));
    return found && feature
      ? { status: "shown", ref, layer: found.layer, feature }
      : { status: "not-shown", ref };
  });
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
    const key = selectionKey(ref);
    const feature = lookup(ref)?.loaded ?? previous.get(key);
    if (feature) {
      next.set(key, feature);
    }
  }
  return sameSnapshots(previous, next) ? previous : next;
}
