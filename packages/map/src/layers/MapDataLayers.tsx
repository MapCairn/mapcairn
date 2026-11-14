// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFormatterRegistry,
  type FormatterRegistry,
  isFeedLayer,
  isHeatmapLayer,
  isQueryLayer,
  isShapeStyle,
  isVectorTileLayer,
  type LayerDefinition,
  type LayerFeature,
  type MapAdapter,
  type MapFeatureTap,
  tileUrl,
} from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import { useEffect, useRef } from "react";
import { useMap } from "../host";
import { roundPixel } from "../host/overlays/geometry";
import * as styles from "./Layers.css";
import {
  featureOutlines,
  featurePosition,
  paletteColour,
  toMapFeatures,
  toMapHeatmap,
  toMapVector,
  toStyledShapes,
  toVectorHeatmaps,
} from "./mapFeatures";
import type { DataLayerState, DataLayers } from "./useDataLayers";

const DEFAULT_FORMATTERS = createFormatterRegistry();

/**
 * The map id of the affected area. Definition ids cannot contain a colon,
 * so it never meets a layer's own id.
 */
export const DETAIL_LAYER_ID = ":detail";

/** How long the map must stay still, in milliseconds, before query layers ask for its view. */
export const VIEW_SETTLE_MS = 400;

/** Props for {@link MapDataLayers}. */
export interface MapDataLayersProps {
  readonly layers: DataLayers;
  /** Called after a tap on a point has selected it, so the app can open its card. */
  readonly onFeatureTap?: (tap: MapFeatureTap) => void;
  /** True while taps on the map mean something else, such as measuring. */
  readonly ignoreTaps?: boolean;
  /** The formatters label templates may name. Defaults to the built-ins. */
  readonly formatters?: FormatterRegistry;
}

/**
 * What was last handed to the adapter under one map id, to skip redrawing it
 * unchanged. A layer is also drawn again when its definition is another
 * object, so a refreshed list that replaces a definition redraws it even when
 * its URL, controls and features are the same. `partitionDefinitions` keeps
 * the old object for a definition that did not change, so a refresh that
 * changes nothing redraws nothing.
 */
interface Drawn {
  /** The definition the layer was drawn from, compared by identity. */
  readonly definition?: LayerDefinition;
  readonly features?: readonly LayerFeature[];
  readonly tiles?: string;
  readonly opacity?: number;
  /** The control values a heatmap or vector layer was drawn with. */
  readonly controls?: DataLayerState["controls"];
}

/**
 * The map id of one heatmap source layer of a vector tile definition. Ids
 * with a colon never meet a layer's own id.
 */
function heatmapId(layerId: string, index: number): string {
  return `${layerId}:heatmap:${index}`;
}

function opacityOf(layer: DataLayerState): number {
  const control = layer.definition.controls.find((c) => c.kind === "opacity");
  const value = control ? Number(layer.controls[control.id]) : 1;
  return Number.isFinite(value) ? value : 1;
}

/**
 * Hands one enabled layer to the adapter, unless it is unchanged. Returns
 * what is drawn, by map id: one id for most layers, and one more for each
 * heatmap source layer of a vector tile layer.
 */
function draw(
  adapter: MapAdapter,
  layer: DataLayerState,
  previous: (id: string) => Drawn | undefined,
  now: number,
  formatters: FormatterRegistry,
): [string, Drawn][] {
  const { definition } = layer;
  const own = previous(definition.id);
  const replaced = own?.definition !== definition;
  if (isHeatmapLayer(definition)) {
    if (layer.features.length === 0) {
      return [];
    }
    if (
      replaced ||
      own.features !== layer.features ||
      own.controls !== layer.controls
    ) {
      adapter.setHeatmapLayer(
        definition.id,
        toMapHeatmap(definition, layer.features, layer.controls),
      );
    }
    return [
      [
        definition.id,
        { definition, features: layer.features, controls: layer.controls },
      ],
    ];
  }
  if (isVectorTileLayer(definition)) {
    if (replaced || own.controls !== layer.controls) {
      adapter.setVectorLayer(
        definition.id,
        toMapVector(definition, layer.controls, now),
      );
    }
    const heatmaps = toVectorHeatmaps(definition, layer.controls, now);
    let index = 0;
    const drawnHeatmaps = definition.sourceLayers.flatMap(
      (sourceLayer, position): [string, Drawn][] => {
        if (!("heatmap" in sourceLayer)) {
          return [];
        }
        const id = heatmapId(definition.id, position);
        const heatmap = heatmaps[index];
        index += 1;
        const before = previous(id);
        if (
          heatmap &&
          (before?.definition !== definition ||
            before.controls !== layer.controls)
        ) {
          adapter.setHeatmapLayer(id, heatmap);
        }
        return [[id, { definition, controls: layer.controls }]];
      },
    );
    return [
      [definition.id, { definition, controls: layer.controls }],
      ...drawnHeatmaps,
    ];
  }
  if (isFeedLayer(definition)) {
    if (layer.features.length === 0) {
      return [];
    }
    if (replaced || own.features !== layer.features) {
      const { style } = definition;
      if (isShapeStyle(style)) {
        adapter.setStyledShapes(
          definition.id,
          toStyledShapes(
            { ...definition, style },
            layer.features,
            formatters,
            now,
          ),
        );
      } else {
        adapter.setFeatureLayer(
          definition.id,
          toMapFeatures(style, layer.features),
        );
      }
    }
    return [[definition.id, { definition, features: layer.features }]];
  }
  const tiles = tileUrl(definition, layer.controls, now);
  const opacity = opacityOf(layer);
  if (replaced || own.tiles !== tiles || own.opacity !== opacity) {
    adapter.setTileLayer(definition.id, {
      tiles,
      tileSize: definition.source.tileSize,
      maxzoom: definition.source.maxzoom,
      bounds: definition.source.bounds,
      opacity,
    });
  }
  return [[definition.id, { definition, tiles, opacity }]];
}

/**
 * Draws the layers that are on, and a shown affected area, through the map
 * adapter, and turns a tap on a point into an open card. Renders nothing; put
 * it inside `MapView`. Every layer is drawn from its definition, so nothing
 * here names one.
 */
export function MapDataLayers({
  layers,
  onFeatureTap,
  ignoreTaps = false,
  formatters = DEFAULT_FORMATTERS,
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
      if (!layer.enabled) {
        continue;
      }
      const results = draw(
        adapter,
        layer,
        (id) => drawn.current.get(id),
        now(),
        formatters,
      );
      for (const [id, result] of results) {
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
      const own = drawn.current.get(DETAIL_LAYER_ID);
      if (own?.features !== detail.shapes || own.definition !== detailLayer) {
        adapter.setShapeLayer(DETAIL_LAYER_ID, {
          geometries: detail.shapes.map((shape) => shape.geometry),
          colour: paletteColour(detailLayer.detail.colour),
        });
      }
      next.set(DETAIL_LAYER_ID, {
        definition: detailLayer,
        features: detail.shapes,
      });
    } else if (drawn.current.has(DETAIL_LAYER_ID)) {
      adapter.removeLayer(DETAIL_LAYER_ID);
    }
    drawn.current = next;
  }, [adapter, states, detail, now, formatters]);

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
    choose: layers.choose,
    cancelIdentify: layers.cancelIdentify,
    setView: layers.setView,
    reportTilesUnavailable: layers.reportTilesUnavailable,
    reportTilesRecovered: layers.reportTilesRecovered,
    onFeatureTap,
    ignoreTaps,
  });
  useEffect(() => {
    if (!adapter) {
      return;
    }
    const stopUnavailable = adapter.on(
      "tileLayerUnavailable",
      ({ layerId, tiles }) => {
        latest.current.reportTilesUnavailable(layerId, tiles);
      },
    );
    const stopRecovered = adapter.on(
      "tileLayerRecovered",
      ({ layerId, tiles }) => {
        latest.current.reportTilesRecovered(layerId, tiles);
      },
    );
    return () => {
      stopUnavailable();
      stopRecovered();
    };
  }, [adapter, latest]);
  // Once taps mean something else (measuring, say), a raster layer's answer to
  // an earlier tap must not open a card over it.
  useEffect(() => {
    if (ignoreTaps) {
      latest.current.cancelIdentify();
    }
  }, [ignoreTaps, latest]);
  useEffect(() => {
    if (!adapter) {
      return;
    }
    return adapter.on("featureTap", (tap) => {
      const current = latest.current;
      if (current.ignoreTaps) {
        return;
      }
      // One feature opens its card; several open a list to choose from. Either
      // cancels a raster lookup in flight, so its late answer cannot replace it.
      current.choose(tap.hits, { focus: true });
      current.onFeatureTap?.(tap);
    });
  }, [adapter, latest]);

  // Query layers ask for what is in view, so they are told once the map has
  // settled (and straight away when one is turned on), never while it moves.
  const hasQuery = states.some(
    (layer) => layer.enabled && isQueryLayer(layer.definition),
  );
  useEffect(() => {
    if (!adapter || !hasQuery) {
      return;
    }
    const report = () => {
      latest.current.setView(adapter.getBounds(), adapter.getView().zoom);
    };
    report();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = adapter.on("moveEnd", () => {
      clearTimeout(timer);
      timer = setTimeout(report, VIEW_SETTLE_MS);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [adapter, hasQuery, latest]);

  return null;
}

/** An SVG path along a polygon's rings or a line, in map pixels, or null when it has none. */
function outlinePath(
  adapter: MapAdapter,
  feature: LayerFeature,
): string | null {
  const outlines = featureOutlines(feature);
  if (
    !outlines.every(({ points }) => points.every((p) => adapter.isVisible(p)))
  ) {
    return null;
  }
  const parts = outlines.map(({ points, closed }) => {
    const pixels = points.map((point) => {
      const { x, y } = adapter.project(point);
      return `${roundPixel(x)},${roundPixel(y)}`;
    });
    return `M${pixels.join(" L")}${closed ? " Z" : ""}`;
  });
  return parts.length > 0 ? parts.join(" ") : null;
}

/** Props for {@link SelectionMarker}. */
export interface SelectionMarkerProps {
  readonly layers: DataLayers;
}

/**
 * A ring around the point whose card is open, so the card and the map agree on which
 * one it is. Render it inside `MapOverlayLayer`; like every overlay it is a
 * picture of state the card already gives in words.
 */
export function SelectionMarker({ layers }: SelectionMarkerProps) {
  const { adapter } = useMap();
  const feature = layers.selected?.feature;
  if (!adapter || !feature) {
    return null;
  }
  if (feature.geometry.type !== "Point") {
    const path = outlinePath(adapter, feature);
    return path ? (
      <g data-testid="selection-marker">
        <path className={styles.selectionHalo} d={path} />
        <path className={styles.selectionRing} d={path} />
      </g>
    ) : null;
  }
  const position = featurePosition(feature);
  if (!position) {
    return null;
  }
  if (!adapter.isVisible(position)) {
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
