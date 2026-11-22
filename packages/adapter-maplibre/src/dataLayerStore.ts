// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  MapFeature,
  MapFeatureHit,
  MapFeatureTap,
  MapTileOverlay,
} from "@mapcairn/core";
import type {
  LayerSpecification,
  Map as MapLibreMap,
  SourceSpecification,
} from "maplibre-gl";
import {
  basemapFont,
  type DataLayer,
  dataLayerEngineIds,
  planDataLayer,
  tileTemplateOf,
} from "./dataLayerPlan";
import type { DataLayerTileRequests } from "./dataLayerTileRequests";
import {
  MARKER_PIXEL_RATIO,
  markerImage,
  markerImageName,
} from "./markerImages";
import {
  PATTERN_NAMES,
  PATTERN_PIXEL_RATIO,
  patternImage,
  patternImageName,
} from "./patternImages";

/**
 * What a tile data layer has told the ui about its tiles so far: nothing, that
 * it is slow (`tileLayerSlow`), or that none came (`tileLayerUnavailable`),
 * which follows slow when the tile that held the layer up is answered with a
 * failure.
 */
export type TileLayerReport = "none" | "slow" | "unavailable";

/**
 * The hook through which the adapter's tile traffic follows the tile layers
 * the store draws and erases. The store tells it when a tile source is drawn
 * or erased and keeps nothing of what it counts.
 */
export interface TileSourceRegistry {
  /**
   * What a tile layer about to be drawn again for `tiles` starts out as having
   * reported. Asked before the layer is erased, which drops what it knew.
   */
  carriedReport(source: string, tiles: string): TileLayerReport;
  /** A tile layer was drawn, with the report it carries; its tiles are counted from here. */
  register(
    source: string,
    layerId: string,
    tiles: string,
    report: TileLayerReport,
  ): void;
  /** A tile layer's source was erased, or drawn over; it is no longer counted. */
  release(source: string): void;
}

/** What the store needs from the adapter that owns the map and the style's lifecycle. */
export interface DataLayerStoreHost {
  /** The map, when its style can take sources and layers; otherwise undefined. */
  readyMap(): MapLibreMap | undefined;
  /** A layer was set, drawn again or removed, so a picture taken of the map earlier may be out of date. */
  changed(): void;
  /** Follows the tile layers that are drawn. */
  readonly tileSources: TileSourceRegistry;
  /** Keeps the tile requests of the drawn layers apart from the basemap's. */
  readonly tileRequests: DataLayerTileRequests;
}

/** Lowest first: imagery, vector tiles, styled shapes, detail shapes, heatmaps, then points. */
const DATA_KIND_ORDER: readonly DataLayer["kind"][] = [
  "tiles",
  "vector",
  "styled",
  "shapes",
  "heatmap",
  "features",
];

/** How far from a tap, in CSS pixels, a point still counts as tapped (a fingertip). */
const TAP_TOLERANCE_PX = 16;

/**
 * What the engine holds for one data layer: its source and style layers
 * (bottom first), and which of them a tap can land on. Kept so a layer is
 * erased and stacked without searching the style.
 */
interface DrawnEngineLayers {
  readonly source: string;
  readonly layers: string[];
  readonly points: readonly string[];
  readonly lines: readonly string[];
  readonly polygons: readonly string[];
}

/** Keeps only JSON primitives, so no engine object or geometry leaves the adapter. */
export function toPropertyBag(properties: unknown): Record<string, unknown> {
  const bag: Record<string, unknown> = {};
  if (typeof properties !== "object" || properties === null) {
    return bag;
  }
  for (const [key, value] of Object.entries(properties)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      bag[key] = value;
    }
  }
  return bag;
}

function sameBounds(
  a: MapTileOverlay["bounds"],
  b: MapTileOverlay["bounds"],
): boolean {
  if (!(a && b)) {
    return a === b;
  }
  return a.every((value, index) => value === b[index]);
}

function sameTiles(a: MapTileOverlay, b: MapTileOverlay): boolean {
  return (
    a.tiles === b.tiles &&
    a.tileSize === b.tileSize &&
    a.maxzoom === b.maxzoom &&
    sameBounds(a.bounds, b.bounds)
  );
}

/**
 * The data layers the ui has set, and what the engine holds for each. It
 * draws, erases, stacks and redraws them, and answers which are under a tap.
 * The adapter owns the map and when its style is ready: the store draws only
 * on the map the host hands it, and keeps the layers it was given until they
 * are removed, so a new style gets them from {@link DataLayerStore.restore}.
 */
export class DataLayerStore {
  private readonly layers = new Map<string, DataLayer>();
  private readonly drawn = new Map<string, DrawnEngineLayers>();
  private labelFontCache: readonly string[] | null | undefined;

  constructor(private readonly host: DataLayerStoreHost) {}

  /** Keeps a layer and draws it afresh when the style is ready. */
  set(id: string, layer: DataLayer): void {
    this.host.changed();
    this.layers.set(id, layer);
    const map = this.host.readyMap();
    if (map) {
      this.draw(map, id);
    }
  }

  /**
   * Keeps a tile layer and draws it afresh when the style is ready, unless
   * only its opacity changed: then no tile is requested again, and the host is
   * not told, because the layer set a queued picture shows is the same.
   */
  setTiles(id: string, overlay: MapTileOverlay): void {
    const previous = this.layers.get(id);
    this.layers.set(id, { kind: "tiles", overlay });
    const map = this.host.readyMap();
    const tilesId = dataLayerEngineIds(id).tiles;
    if (
      map &&
      previous?.kind === "tiles" &&
      sameTiles(previous.overlay, overlay) &&
      map.getLayer(tilesId)
    ) {
      // Only the opacity changed: no tile is requested again.
      map.setPaintProperty(tilesId, "raster-opacity", overlay.opacity);
      return;
    }
    this.host.changed();
    if (map) {
      this.draw(map, id);
    }
  }

  /** Forgets a layer and erases what the engine holds for it; an id that is not held is ignored. */
  remove(id: string): void {
    if (!this.layers.delete(id)) {
      return;
    }
    this.host.changed();
    const map = this.host.readyMap();
    if (map) {
      this.erase(map, id);
    }
  }

  /**
   * Draws every kept layer again, then orders them once; a new style
   * starts with none, so ordering after each one would move layers that are
   * not back yet. A layer removed while the style was swapping is erased
   * here, which releases what the store and the tile traffic still hold for it.
   */
  restore(map: MapLibreMap): void {
    for (const id of [...this.drawn.keys()]) {
      if (!this.layers.has(id)) {
        this.erase(map, id);
      }
    }
    for (const id of this.layers.keys()) {
      this.draw(map, id, false);
    }
    this.order(map);
  }

  /** Forgets the label font read from the style that went, so the next draw reads the new style's. */
  styleChanged(): void {
    this.labelFontCache = undefined;
  }

  /**
   * Every tappable feature under a pixel, topmost first and once each: points
   * and lines within a fingertip, then polygons exactly. A vector tile
   * repeats a feature in each tile it crosses, so the same feature can come
   * back more than once. Empty when the map is not ready to be queried.
   */
  hitsAt(x: number, y: number): MapFeatureHit[] {
    const map = this.host.readyMap();
    if (!map) {
      return [];
    }
    const reach = TAP_TOLERANCE_PX;
    const box: [[number, number], [number, number]] = [
      [x - reach, y - reach],
      [x + reach, y + reach],
    ];
    const hits: MapFeatureHit[] = [];
    const seen = new Set<string>();
    try {
      for (const [kind, geometry] of [
        ["points", box],
        ["lines", box],
        ["polygons", [x, y] as [number, number]],
      ] as const) {
        const layers = this.tappable(map, kind);
        if (layers.length === 0) {
          continue;
        }
        for (const feature of map.queryRenderedFeatures(geometry, { layers })) {
          const properties = toPropertyBag(feature.properties);
          const layerId = properties["mapcairn:layer"];
          const featureId = properties["mapcairn:id"];
          const key = `${String(layerId)}\u0000${String(featureId)}`;
          if (
            typeof layerId === "string" &&
            typeof featureId === "string" &&
            !seen.has(key)
          ) {
            seen.add(key);
            hits.push({ layerId, featureId });
          }
        }
      }
    } catch {
      // Querying can throw while a style is still loading; nothing is tapped then.
      return [];
    }
    return hits;
  }

  /** The tap at a pixel, made by the topmost feature under it, or null when there are none. */
  tapAt(x: number, y: number): MapFeatureTap | null {
    const hits = this.hitsAt(x, y);
    const top = hits[0];
    return top
      ? { layerId: top.layerId, featureId: top.featureId, hits }
      : null;
  }

  private erase(map: MapLibreMap, id: string): void {
    const drawn = this.drawn.get(id);
    this.drawn.delete(id);
    if (!drawn) {
      return;
    }
    this.host.tileSources.release(drawn.source);
    this.host.tileRequests.release(drawn.source);
    for (const layerId of drawn.layers) {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    }
    if (map.getSource(drawn.source)) {
      map.removeSource(drawn.source);
    }
  }

  /** The labels' font stack for the loaded style, read once per style. */
  private labelFont(map: MapLibreMap): readonly string[] | undefined {
    if (this.labelFontCache === undefined) {
      this.labelFontCache = basemapFont(map) ?? null;
    }
    return this.labelFontCache ?? undefined;
  }

  /** Adds the marker images a features layer needs and the style does not have yet. */
  private ensureMarkerImages(
    map: MapLibreMap,
    features: readonly MapFeature[],
  ): void {
    for (const feature of features) {
      const name = markerImageName(
        feature.shape,
        feature.colour,
        feature.radius,
      );
      if (!map.hasImage(name)) {
        map.addImage(
          name,
          markerImage(feature.shape, feature.colour, feature.radius),
          { pixelRatio: MARKER_PIXEL_RATIO },
        );
      }
    }
  }

  /** Adds the fill pattern images a style does not have yet; a style swap drops them. */
  private ensurePatternImages(map: MapLibreMap): void {
    for (const pattern of PATTERN_NAMES) {
      const name = patternImageName(pattern);
      if (!map.hasImage(name)) {
        map.addImage(name, patternImage(pattern), {
          pixelRatio: PATTERN_PIXEL_RATIO,
        });
      }
    }
  }

  /** Draws one data layer afresh from what the store keeps, then restores the stacking order. */
  private draw(map: MapLibreMap, id: string, order = true): void {
    const layer = this.layers.get(id) as DataLayer;
    const source = dataLayerEngineIds(id).source;
    const carried =
      layer.kind === "tiles"
        ? this.host.tileSources.carriedReport(source, layer.overlay.tiles)
        : undefined;
    this.erase(map, id);
    if (layer.kind === "features") {
      this.ensureMarkerImages(map, layer.features);
    }
    const plan = planDataLayer(id, layer, () => this.labelFont(map));
    if (
      plan.layers.some((engineLayer) => engineLayer.id.endsWith("-pattern"))
    ) {
      this.ensurePatternImages(map);
    }
    // Tracked before the first engine call, so a failure part way is still erased next time.
    const drawn: DrawnEngineLayers = {
      source,
      layers: [],
      points: plan.points ?? [],
      lines: plan.lines ?? [],
      polygons: plan.polygons ?? [],
    };
    this.drawn.set(id, drawn);
    if (layer.kind === "tiles") {
      this.host.tileSources.register(
        source,
        id,
        layer.overlay.tiles,
        carried ?? "none",
      );
    }
    const template = tileTemplateOf(plan.source);
    if (template) {
      this.host.tileRequests.register(source, template);
    }
    map.addSource(source, plan.source as unknown as SourceSpecification);
    for (const engineLayer of plan.layers) {
      drawn.layers.push(engineLayer.id);
      map.addLayer(engineLayer as unknown as LayerSpecification);
    }
    if (order) {
      this.order(map);
    }
  }

  /** Moves every data layer to the top, lowest kind first, keeping the order they were set in. */
  private order(map: MapLibreMap): void {
    for (const kind of DATA_KIND_ORDER) {
      for (const [id, layer] of this.layers) {
        if (layer.kind !== kind) {
          continue;
        }
        for (const layerId of this.drawn.get(id)?.layers ?? []) {
          if (map.getLayer(layerId)) {
            map.moveLayer(layerId);
          }
        }
      }
    }
  }

  /** The drawn engine layers of one kind of tappable feature that the style has now. */
  private tappable(
    map: MapLibreMap,
    kind: "points" | "lines" | "polygons",
  ): string[] {
    return [...this.drawn.values()]
      .flatMap((drawn) => drawn[kind])
      .filter((layerId) => map.getLayer(layerId) !== undefined);
  }
}
