import {
  isFeedLayer,
  type LayerFeature,
  type MapAdapter,
  type MapFeatureTap,
  tileUrl,
} from "@karta/core";
import { useLatestRef } from "@karta/react";
import { useEffect, useRef } from "react";
import { useMap } from "../host";
import { roundPixel } from "../host/overlays/geometry";
import * as styles from "./Layers.css";
import { featurePosition, paletteColour, toMapFeatures } from "./mapFeatures";
import type { DataLayerState, DataLayers } from "./useDataLayers";

/**
 * The map id of the affected area. Definition ids cannot contain a colon,
 * so it never meets a layer's own id.
 */
export const DETAIL_LAYER_ID = ":detail";

/** Props for {@link MapDataLayers}. */
export interface MapDataLayersProps {
  readonly layers: DataLayers;
  /** Called after a tap on a point has selected it, so the app can open its card. */
  readonly onFeatureTap?: (tap: MapFeatureTap) => void;
  /** True while taps on the map mean something else, such as measuring. */
  readonly ignoreTaps?: boolean;
}

/** What was last handed to the adapter for one layer, to skip redrawing it unchanged. */
interface Drawn {
  readonly features?: readonly LayerFeature[];
  readonly tiles?: string;
  readonly opacity?: number;
}

function opacityOf(layer: DataLayerState): number {
  const control = layer.definition.controls.find((c) => c.kind === "opacity");
  const value = control ? Number(layer.controls[control.id]) : 1;
  return Number.isFinite(value) ? value : 1;
}

/** Hands one enabled layer to the adapter, unless it is unchanged. Returns what was drawn, or null. */
function draw(
  adapter: MapAdapter,
  layer: DataLayerState,
  previous: Drawn | undefined,
  now: number,
): Drawn | null {
  const { definition } = layer;
  if (isFeedLayer(definition)) {
    if (layer.features.length === 0) {
      return null;
    }
    if (previous?.features !== layer.features) {
      adapter.setFeatureLayer(
        definition.id,
        toMapFeatures(definition.style, layer.features),
      );
    }
    return { features: layer.features };
  }
  const tiles = tileUrl(definition, layer.controls, now);
  const opacity = opacityOf(layer);
  if (previous?.tiles !== tiles || previous.opacity !== opacity) {
    adapter.setTileLayer(definition.id, {
      tiles,
      tileSize: definition.source.tileSize,
      maxzoom: definition.source.maxzoom,
      opacity,
    });
  }
  return { tiles, opacity };
}

/**
 * Draws the layers that are on, and a shown affected area, through the map
 * adapter, and turns a tap on a point into a selection. Renders nothing; put
 * it inside `MapView`. Every layer is drawn from its definition, so nothing
 * here names one.
 */
export function MapDataLayers({
  layers,
  onFeatureTap,
  ignoreTaps = false,
}: MapDataLayersProps) {
  const { adapter } = useMap();
  const drawn = useRef(new Map<string, Drawn>());
  const { now, layers: states, detail } = layers;

  useEffect(() => {
    if (!adapter) {
      return;
    }
    const next = new Map<string, Drawn>();
    for (const layer of states) {
      const id = layer.definition.id;
      const result = layer.enabled
        ? draw(adapter, layer, drawn.current.get(id), now())
        : null;
      if (result) {
        next.set(id, result);
      }
    }
    for (const id of drawn.current.keys()) {
      if (!next.has(id) && id !== DETAIL_LAYER_ID) {
        adapter.removeLayer(id);
      }
    }
    const detailLayer = states.find(
      (layer) => layer.definition.id === detail?.layerId,
    )?.definition;
    if (
      detail?.status === "shown" &&
      detailLayer &&
      isFeedLayer(detailLayer) &&
      detailLayer.detail
    ) {
      if (drawn.current.get(DETAIL_LAYER_ID)?.features !== detail.shapes) {
        adapter.setShapeLayer(DETAIL_LAYER_ID, {
          geometries: detail.shapes.map((shape) => shape.geometry),
          colour: paletteColour(detailLayer.detail.colour),
        });
      }
      next.set(DETAIL_LAYER_ID, { features: detail.shapes });
    } else if (drawn.current.has(DETAIL_LAYER_ID)) {
      adapter.removeLayer(DETAIL_LAYER_ID);
    }
    drawn.current = next;
  }, [adapter, states, detail, now]);

  useEffect(
    () => () => {
      for (const id of drawn.current.keys()) {
        adapter?.removeLayer(id);
      }
      drawn.current = new Map();
    },
    [adapter],
  );

  const latest = useLatestRef({
    select: layers.select,
    onFeatureTap,
    ignoreTaps,
  });
  useEffect(() => {
    if (!adapter) {
      return;
    }
    return adapter.on("featureTap", (tap) => {
      const current = latest.current;
      if (current.ignoreTaps) {
        return;
      }
      current.select(tap.layerId, tap.featureId, { focus: true });
      current.onFeatureTap?.(tap);
    });
  }, [adapter, latest]);

  return null;
}

/** Props for {@link SelectionMarker}. */
export interface SelectionMarkerProps {
  readonly layers: DataLayers;
}

/**
 * A ring around the selected point, so the card and the map agree on which
 * one it is. Render it inside `MapOverlayLayer`; like every overlay it is a
 * picture of state the card already gives in words.
 */
export function SelectionMarker({ layers }: SelectionMarkerProps) {
  const { adapter } = useMap();
  const position = layers.selected
    ? featurePosition(layers.selected.feature)
    : null;
  if (!adapter || !position) {
    return null;
  }
  const { x, y } = adapter.project(position);
  return (
    <g
      transform={`translate(${roundPixel(x)} ${roundPixel(y)})`}
      data-testid="selection-marker"
    >
      <circle className={styles.selectionHalo} r={16} />
      <circle className={styles.selectionRing} r={16} />
    </g>
  );
}
