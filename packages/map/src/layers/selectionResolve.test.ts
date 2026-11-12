// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type LayerDefinition,
  type LayerFeature,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_TILE_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import {
  reconcileSnapshots,
  resolveSelection,
  type SelectionSnapshots,
  selectableRefs,
  selectionKey,
} from "./selectionResolve";
import type { DataLayerState } from "./useDataLayers";

const FEED = SAMPLE_FEED_LAYER.id;
const ALERTS = SAMPLE_ALERT_LAYER.id;
const NONE: SelectionSnapshots = new Map();

function layerState(
  definition: LayerDefinition,
  enabled: boolean,
  features: readonly LayerFeature[] = [],
): DataLayerState {
  return {
    definition,
    enabled,
    controls: {},
    status: enabled ? { kind: "on" } : { kind: "off" },
    features,
    sortId: "",
    sorted: features,
  };
}

const ref = (layerId: string, featureId: string) => ({ layerId, featureId });

describe("resolveSelection", () => {
  it("shows the feature its layer has loaded, with the layer", () => {
    const feature = samplePoint("a");
    const layer = layerState(SAMPLE_FEED_LAYER, true, [feature]);
    const [entry] = resolveSelection([ref(FEED, "a")], [layer], NONE);
    expect(entry).toEqual({
      status: "shown",
      ref: ref(FEED, "a"),
      layer,
      feature,
    });
    expect(entry?.status === "shown" && entry.feature).toBe(feature);
  });

  it("prefers the loaded feature to a snapshot", () => {
    const loaded = samplePoint("a", { title: "New" });
    const old = samplePoint("a", { title: "Old" });
    const layer = layerState(SAMPLE_FEED_LAYER, true, [loaded]);
    const [entry] = resolveSelection(
      [ref(FEED, "a")],
      [layer],
      new Map([[selectionKey(ref(FEED, "a")), old]]),
    );
    expect(entry?.status === "shown" && entry.feature).toBe(loaded);
  });

  it("falls back to the snapshot when the layer is on but does not list the feature", () => {
    const old = samplePoint("a", { title: "Old" });
    const layer = layerState(SAMPLE_FEED_LAYER, true, [samplePoint("b")]);
    const [entry] = resolveSelection(
      [ref(FEED, "a")],
      [layer],
      new Map([[selectionKey(ref(FEED, "a")), old]]),
    );
    expect(entry?.status === "shown" && entry.feature).toBe(old);
  });

  it("is not shown when the layer is off, even with a snapshot", () => {
    const layer = layerState(SAMPLE_FEED_LAYER, false);
    const [entry] = resolveSelection(
      [ref(FEED, "a")],
      [layer],
      new Map([[selectionKey(ref(FEED, "a")), samplePoint("a")]]),
    );
    expect(entry).toEqual({ status: "not-shown", ref: ref(FEED, "a") });
  });

  it("is not shown while the layer is on and has loaded nothing, with no snapshot", () => {
    const layer = layerState(SAMPLE_FEED_LAYER, true);
    expect(resolveSelection([ref(FEED, "a")], [layer], NONE)).toEqual([
      { status: "not-shown", ref: ref(FEED, "a") },
    ]);
  });

  it("is not shown when its layer is not in the catalogue", () => {
    expect(resolveSelection([ref("gone", "a")], [], NONE)).toEqual([
      { status: "not-shown", ref: ref("gone", "a") },
    ]);
  });

  it("is not shown for a layer that is not a feed layer", () => {
    const layers = [
      layerState(SAMPLE_TILE_LAYER, true, [samplePoint("a")]),
      layerState(SAMPLE_HEATMAP_LAYER, true, [samplePoint("a")]),
    ];
    const entries = resolveSelection(
      [ref(SAMPLE_TILE_LAYER.id, "a"), ref(SAMPLE_HEATMAP_LAYER.id, "a")],
      layers,
      NONE,
    );
    expect(entries.map((entry) => entry.status)).toEqual([
      "not-shown",
      "not-shown",
    ]);
  });

  it("keeps the selection's order and resolves each reference against its own layer", () => {
    const feed = layerState(SAMPLE_FEED_LAYER, true, [samplePoint("a")]);
    const alerts = layerState(SAMPLE_ALERT_LAYER, true, [samplePoint("a")]);
    const entries = resolveSelection(
      [ref(ALERTS, "a"), ref(FEED, "missing"), ref(FEED, "a")],
      [feed, alerts],
      NONE,
    );
    expect(
      entries.map((entry) =>
        entry.status === "shown" ? entry.layer.definition.id : null,
      ),
    ).toEqual([ALERTS, null, FEED]);
  });

  it("does not mistake two ids that join to the same text for one reference", () => {
    const layer = layerState(SAMPLE_FEED_LAYER, true, [samplePoint("a")]);
    const [entry] = resolveSelection(
      [ref(`${FEED}\u0000a`, "")],
      [layer],
      NONE,
    );
    expect(entry?.status).toBe("not-shown");
  });
});

describe("selectableRefs", () => {
  it("keeps the references of feed layers in the list, on or off, and drops the rest", () => {
    const layers = [
      layerState(SAMPLE_FEED_LAYER, true),
      layerState(SAMPLE_ALERT_LAYER, false),
      layerState(SAMPLE_TILE_LAYER, true),
      layerState(SAMPLE_HEATMAP_LAYER, true),
    ];
    const refs = [
      ref(FEED, "a"),
      ref(SAMPLE_TILE_LAYER.id, "a"),
      ref(ALERTS, "b"),
      ref(SAMPLE_HEATMAP_LAYER.id, "a"),
      ref("gone", "a"),
    ];
    expect(selectableRefs(refs, layers)).toEqual([
      ref(FEED, "a"),
      ref(ALERTS, "b"),
    ]);
  });
});

describe("reconcileSnapshots", () => {
  const key = (layerId: string, featureId: string) =>
    selectionKey(ref(layerId, featureId));

  it("takes a snapshot of each selected feature its layer has loaded", () => {
    const feature = samplePoint("a");
    const layer = layerState(SAMPLE_FEED_LAYER, true, [
      feature,
      samplePoint("b"),
    ]);
    const next = reconcileSnapshots(NONE, [ref(FEED, "a")], [layer]);
    expect([...next.keys()]).toEqual([key(FEED, "a")]);
    expect(next.get(key(FEED, "a"))).toBe(feature);
  });

  it("keeps a snapshot when its layer no longer lists the feature or is off", () => {
    const old = samplePoint("a", { title: "Old" });
    const previous = new Map([[key(FEED, "a"), old]]);
    const refs = [ref(FEED, "a")];
    const unlisted = layerState(SAMPLE_FEED_LAYER, true, [samplePoint("b")]);
    const off = layerState(SAMPLE_FEED_LAYER, false);
    expect(
      reconcileSnapshots(previous, refs, [unlisted]).get(key(FEED, "a")),
    ).toBe(old);
    expect(reconcileSnapshots(previous, refs, [off]).get(key(FEED, "a"))).toBe(
      old,
    );
    expect(reconcileSnapshots(previous, refs, []).get(key(FEED, "a"))).toBe(
      old,
    );
  });

  it("refreshes a snapshot when the layer lists the feature again", () => {
    const fresh = samplePoint("a", { title: "New" });
    const previous = new Map([[key(FEED, "a"), samplePoint("a")]]);
    const layer = layerState(SAMPLE_FEED_LAYER, true, [fresh]);
    const next = reconcileSnapshots(previous, [ref(FEED, "a")], [layer]);
    expect(next.get(key(FEED, "a"))).toBe(fresh);
  });

  it("forgets the snapshot of a reference that is no longer selected", () => {
    const previous = new Map([
      [key(FEED, "a"), samplePoint("a")],
      [key(FEED, "b"), samplePoint("b")],
    ]);
    const next = reconcileSnapshots(previous, [ref(FEED, "b")], []);
    expect([...next.keys()]).toEqual([key(FEED, "b")]);
  });

  it("takes none for a layer that is off or not selectable", () => {
    const layers = [
      layerState(SAMPLE_FEED_LAYER, false, [samplePoint("a")]),
      layerState(SAMPLE_TILE_LAYER, true, [samplePoint("a")]),
    ];
    const next = reconcileSnapshots(
      NONE,
      [ref(FEED, "a"), ref(SAMPLE_TILE_LAYER.id, "a")],
      layers,
    );
    expect(next.size).toBe(0);
  });

  it("returns the same map when nothing changed, so state does not update", () => {
    const feature = samplePoint("a");
    const layer = layerState(SAMPLE_FEED_LAYER, true, [feature]);
    const first = reconcileSnapshots(NONE, [ref(FEED, "a")], [layer]);
    expect(reconcileSnapshots(first, [ref(FEED, "a")], [layer])).toBe(first);
    expect(reconcileSnapshots(NONE, [], [layer])).toBe(NONE);
  });
});
