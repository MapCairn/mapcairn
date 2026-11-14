// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  BasemapDefinition,
  Bounds,
  LatLng,
  MapAdapter,
  MapBasemapOptions,
  MapClickEvent,
  MapEditHandle,
  MapEvents,
  MapFeature,
  MapFeatureHit,
  MapFeatureTap,
  MapFitOptions,
  MapHeatmap,
  MapHostElement,
  MapImageOptions,
  MapImageView,
  MapMountOptions,
  MapMoveOptions,
  MapProjection,
  MapShapes,
  MapStyledShapes,
  MapTileOverlay,
  MapVectorTiles,
  PixelPoint,
  ViewState,
  VisibleMap,
} from "@mapcairn/core";
import {
  clampZoom,
  MAX_IMAGE_SIDE_PX,
  MAX_MERCATOR_LATITUDE,
  MapEngineError,
  MapImageExportError,
  type MapPlacement,
  mapMetresPerPixel,
  omittedLayers,
  refuseBoxOnGlobe,
  toEngineZoom,
  toNormalisedZoom,
} from "@mapcairn/core";
import type {
  AnimationOptions,
  GeoJSONSourceSpecification,
  LayerSpecification,
  MapEventType,
  Map as MapLibreMap,
  MapOptions,
  SourceSpecification,
  StyleSpecification,
  Subscription,
} from "maplibre-gl";
import { withCacheKey } from "../../constants/workerCacheKey";
import { Emitter } from "../shared/emitter";
import { EditHandleController } from "./editHandles";
import { heatmapLayer } from "./heatmapLayer";
import {
  MapImageExporter,
  notMounted,
  type RenderMap,
  type RenderMapRequest,
} from "./imageExport";
import { propertyLook, ruleLook } from "./lookExpressions";
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
import { positionOf } from "./positionOf";
import { addDataLayerImages, coversBounds, dataLayerImages } from "./renderMap";
import {
  areaLayers,
  type EngineLayer,
  engineWindow,
  labelLayer,
  lineLayers,
  type ShapeSource,
} from "./shapeLayers";

export { IMAGE_TILES_WAIT_MS, IMAGE_WAIT_MS } from "./imageExport";

type MapLibreModule = typeof import("maplibre-gl");

let engineLoader: Promise<MapLibreModule> | undefined;

/**
 * Loads `maplibre-gl` and its stylesheet once, and points MapLibre at its
 * bundled worker before any map exists.
 * @remarks MapLibre finds its worker from `import.meta.url`, which inside a
 *   bundle names the current chunk rather than the worker, so without
 *   `setWorkerUrl` the worker never starts and the map stays blank
 *   (maplibre/maplibre-gl-js#8002). Vite's `?worker&url` builds the worker as
 *   a self-contained same-origin asset, so the production CSP's
 *   `worker-src 'self'` covers it, including on iOS. The worker URL is
 *   imported dynamically too: the build groups every `maplibre-gl` module
 *   into one vendor chunk, so a static import of the URL would load the whole
 *   engine with this module. A rejected load is not cached, so a chunk that
 *   failed to download (for example offline) is fetched again on the next
 *   mount.
 * @remarks A worker script enforces the Content Security Policy of its own
 *   response, and the hashed worker file is cached as immutable, so a copy
 *   fetched before the policy changed would keep the old policy for a year.
 *   `workerCacheKey` is added to the worker URL so that a changed policy is a
 *   new address and every device fetches the worker again.
 * @param workerCacheKey - Names the policy the worker is served with; the
 *   worker URL is left as it is when this is absent.
 */
export function loadEngine(workerCacheKey?: string): Promise<MapLibreModule> {
  engineLoader ??= Promise.all([
    import("maplibre-gl"),
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ])
    .then(([maplibre, worker]) => {
      maplibre.setWorkerUrl(
        workerCacheKey === undefined
          ? worker.default
          : withCacheKey(worker.default, workerCacheKey),
      );
      return maplibre;
    })
    .catch((error: unknown) => {
      engineLoader = undefined;
      throw error;
    });
  return engineLoader;
}

/** Where a position is on `map`, in CSS pixels from its top left, or the origin when there is no map. */
function pixelOf(map: MapLibreMap | undefined, latlng: LatLng): PixelPoint {
  if (!map) {
    return { x: 0, y: 0 };
  }
  const point = map.project([latlng.lng, latlng.lat]);
  return { x: point.x, y: point.y };
}

/** Bearing in degrees clockwise, in the range [0, 360) and never -0. */
function normaliseBearing(bearing: number): number {
  const normalised = ((bearing % 360) + 360) % 360;
  return normalised === 0 ? 0 : normalised;
}

/** Keeps only JSON primitives, so no engine object or geometry leaves the adapter. */
function toPropertyBag(properties: unknown): Record<string, unknown> {
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

/** MapLibre tags errors from a tile or a source with these fields; style and worker failures carry neither. */
function isTileOrSourceError(event: object): boolean {
  const { tile, sourceId } = event as { tile?: unknown; sourceId?: unknown };
  return tile !== undefined || sourceId !== undefined;
}

/**
 * The message maplibre-gl (6.17) gives the `error` event it fires for any
 * `error` event of a web worker (`createActors` in `src/util/actor.ts`): a
 * worker script that never loaded, but also an uncaught exception inside a
 * running worker. The event has no type, tile or source of its own, so the
 * message is the only way to tell it from other source-less errors.
 */
const WORKER_FAILED_MESSAGE = "Worker failed to load.";

/** Whether an engine `error` event came from a web worker. */
function isWorkerFailure(event: object): boolean {
  const { error } = event as { error?: unknown };
  return (
    !isTileOrSourceError(event) &&
    error instanceof Error &&
    error.message.startsWith(WORKER_FAILED_MESSAGE)
  );
}

/**
 * How long, after a worker error on a loaded map, the adapter waits for signs
 * that the engine still works before it reports `fatalError`.
 */
export const WORKER_FAILURE_GRACE_MS = 5000;

/**
 * How often, in milliseconds, the map is painted while a tile layer's tiles,
 * or the basemap's own, load, so that it reports `idle` (and the basemap is
 * seen to be in) once they are all in, or all missing.
 */
export const TILE_SETTLE_NUDGE_MS = 250;

/**
 * How long, in milliseconds, the map on screen keeps painting after the last
 * tile of a tile layer or the basemap was asked for. A tile the provider
 * answers with a 404 is seen to be in within a few frames, so painting for
 * longer only serves a tile that never answers, which keeps the engine from
 * going idle however often it is painted.
 */
const TILE_SETTLE_GIVE_UP_MS = 30_000;

/** Options for {@link MapLibreMapAdapter}. */
export interface MapLibreMapAdapterOptions {
  /** Overrides {@link WORKER_FAILURE_GRACE_MS}, for example 0 in a test. */
  readonly workerFailureGraceMs?: number;
  /**
   * Added to the engine worker's URL, so a worker cached under an older
   * Content Security Policy is fetched again when the policy changes.
   */
  readonly workerCacheKey?: string;
  /** Overrides {@link IMAGE_TILES_WAIT_MS}, for example a few milliseconds in a test. */
  readonly imageTilesWaitMs?: number;
}

/** Whether a camera event came from the person (a gesture), not from code. */
function isUserEvent(event: object): boolean {
  return (event as { originalEvent?: unknown }).originalEvent !== undefined;
}

/** The id of the source a tile event is about, or undefined when the event is not about a tile. */
function tileEventSource(event: object): string | undefined {
  const { tile, sourceId } = event as { tile?: unknown; sourceId?: unknown };
  return tile !== undefined && typeof sourceId === "string"
    ? sourceId
    : undefined;
}

/** The id of the source and layer of an inline raster style. */
const RASTER_ID = "basemap";

/** The start of every engine id the adapter makes for a data layer. */
const ENGINE_ID_PREFIX = "mapcairn:";

/** Tile traffic of the basemap's own sources (see `MapLibreMapAdapter`). */
interface BasemapTiles {
  readonly basemap?: BasemapDefinition;
  loaded: number;
  failed: number;
  reported: boolean;
}

/** Counters that blame no basemap, for before a style has loaded. */
function idleBasemapTiles(): BasemapTiles {
  return { loaded: 0, failed: 0, reported: false };
}

/**
 * Tile traffic of one tile data layer since its source was last drawn. The
 * engine fires no `error` for a tile the provider answers with a 404, so the
 * layer is judged by what was asked for and what arrived, not by failures.
 */
interface TileLayerTraffic {
  readonly layerId: string;
  /** The tile template the source was drawn from. */
  readonly tiles: string;
  requested: number;
  aborted: number;
  loaded: number;
  reported: boolean;
}

/**
 * Whether a tile layer drawn again for `tiles` is still one that reported no
 * tiles: its earlier drawing reported and loaded none, for the same tiles. The
 * report was made to the ui and its status is still showing, so the new
 * drawing's first tile has to end it.
 */
function isStillUnavailable(
  earlier: TileLayerTraffic | undefined,
  tiles: string,
): boolean {
  return (
    earlier?.reported === true &&
    earlier.loaded === 0 &&
    earlier.tiles === tiles
  );
}

/** The id of the image source and layer under a hybrid basemap's labels. */
const IMAGERY_ID = "basemap-imagery";

/**
 * Whether an engine source id belongs to the basemap's own style (or the
 * imagery a hybrid basemap adds) and not to a data layer or an overlay, whose
 * ids all start with {@link ENGINE_ID_PREFIX}.
 */
function isBasemapSource(sourceId: unknown): sourceId is string {
  return typeof sourceId === "string" && !sourceId.startsWith(ENGINE_ID_PREFIX);
}

/** The ids of the sources in the engine's loaded style that belong to the basemap. */
function ownSourceIds(map: MapLibreMap): readonly string[] {
  return Object.keys(map.getStyle().sources).filter(isBasemapSource);
}

/**
 * Whether an engine source's tiles decide if a basemap is available: any of
 * the basemap's own sources (never a data layer's), except that only the
 * imagery counts for a hybrid basemap, whose labels can load while the
 * imagery is down and would otherwise hide that it is.
 */
function decidesAvailability(
  basemap: BasemapDefinition | undefined,
  sourceId: unknown,
): boolean {
  if (!isBasemapSource(sourceId)) {
    return false;
  }
  return basemap?.source.kind !== "hybrid" || sourceId === IMAGERY_ID;
}

/** The parts of a style layer the hybrid basemap reads. */
interface StyleLayerLike {
  readonly id: string;
  readonly type?: string;
  readonly source?: string;
  readonly "source-layer"?: string;
}

/**
 * Removes style layers, and any source only they drew from. A layer the
 * style does not have is skipped.
 * @returns The layers left in the style, bottom first.
 */
function removeStyleLayers(
  map: MapLibreMap,
  ids: readonly string[],
): readonly StyleLayerLike[] {
  const sources = new Set<string>();
  for (const id of ids) {
    const layer = map.getLayer(id);
    if (layer) {
      if (layer.source !== undefined) {
        sources.add(layer.source);
      }
      map.removeLayer(id);
    }
  }
  const remaining = map.getStyle().layers as StyleLayerLike[];
  for (const { source } of remaining) {
    if (source !== undefined) {
      sources.delete(source);
    }
  }
  for (const source of sources) {
    if (map.getSource(source)) {
      map.removeSource(source);
    }
  }
  return remaining;
}

/** The id of the plain ground a hybrid basemap lays under its imagery. */
const GROUND_ID = "basemap-ground";

/** The kinds of layer a hybrid basemap keeps from its label style: lines and labels, never areas. */
const LABEL_LAYER_TYPES: ReadonlySet<string> = new Set(["line", "symbol"]);

/**
 * Turns the label style a hybrid basemap loaded into the hybrid. It keeps only
 * the line and symbol layers that draw from the basemap's `labelSourceLayers`,
 * less any named in `labelOmitLayers`, so no area of the style (land, water,
 * buildings, road areas) covers the imagery. It then adds the imagery as a
 * raster source and layer under them, and under that a plain ground in the
 * basemap's `swatch` colour, if it has one, so a dark map is not pale before
 * its imagery draws. The imagery's `maxzoom` is the deepest tile level with
 * real detail, so MapLibre enlarges those tiles further in and requests
 * nothing deeper. Does nothing for another basemap.
 * @remarks The thumbnail script (`scripts/generateBasemapThumbnails.mjs`)
 *   mirrors this; change both together.
 */
function composeHybrid(
  map: MapLibreMap,
  basemap: BasemapDefinition | undefined,
): void {
  const source = basemap?.source;
  if (source?.kind !== "hybrid") {
    return;
  }
  const keep = new Set(source.labelSourceLayers);
  const omit = new Set(source.labelOmitLayers);
  const kept = (layer: StyleLayerLike) =>
    LABEL_LAYER_TYPES.has(layer.type ?? "") &&
    keep.has(layer["source-layer"] ?? "") &&
    !omit.has(layer.id);
  const remaining = removeStyleLayers(
    map,
    (map.getStyle().layers as StyleLayerLike[])
      .filter((layer) => !kept(layer))
      .map((layer) => layer.id),
  );
  const lowest = remaining[0]?.id;
  map.addSource(IMAGERY_ID, {
    type: "raster",
    tiles: [source.tileUrl],
    tileSize: source.tileSize,
    maxzoom: source.maxTileZoom,
  });
  map.addLayer({ id: IMAGERY_ID, type: "raster", source: IMAGERY_ID }, lowest);
  if (basemap?.swatch !== undefined) {
    map.addLayer(
      {
        id: GROUND_ID,
        type: "background",
        paint: { "background-color": basemap.swatch },
      },
      IMAGERY_ID,
    );
  }
}

/**
 * The engine ids for one data layer: its source and the style layers drawn
 * from it. All start with `mapcairn:` so they never meet a basemap's own ids.
 * Styled shapes, vector tiles and heatmaps own several style layers each
 * (their ids are `mapcairn:<id>:<part>`, and the part never has a colon), which
 * the adapter lists as it draws them.
 */
export function dataLayerEngineIds(id: string) {
  return {
    source: `${ENGINE_ID_PREFIX}${id}`,
    points: `${ENGINE_ID_PREFIX}${id}:points`,
    tiles: `${ENGINE_ID_PREFIX}${id}:tiles`,
    fill: `${ENGINE_ID_PREFIX}${id}:fill`,
    line: `${ENGINE_ID_PREFIX}${id}:line`,
    heat: `${ENGINE_ID_PREFIX}${id}:heat`,
  } as const;
}

/** A data layer the adapter keeps, so it can draw it again after a basemap swap. */
type DataLayer =
  | { readonly kind: "features"; readonly features: readonly MapFeature[] }
  | { readonly kind: "tiles"; readonly overlay: MapTileOverlay }
  | { readonly kind: "shapes"; readonly shapes: MapShapes }
  | { readonly kind: "styled"; readonly layer: MapStyledShapes }
  | { readonly kind: "vector"; readonly tiles: MapVectorTiles }
  | { readonly kind: "heatmap"; readonly heatmap: MapHeatmap };

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

/** The translucent fill of a shape layer, so the map under it stays readable. */
const SHAPE_FILL_OPACITY = 0.18;

/** The width of a shape layer's lines, in CSS pixels, unless the caller sets one. */
const SHAPE_LINE_WIDTH = 2;

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

/** What a data layer needs to be drawn, before any engine call. */
interface DrawPlan {
  readonly source: Record<string, unknown>;
  readonly layers: readonly EngineLayer[];
  readonly points?: readonly string[];
  readonly lines?: readonly string[];
  readonly polygons?: readonly string[];
}

/** The GeoJSON geometry types each kind of styled shape layer draws. */
const STYLED_GEOMETRY_TYPES = {
  area: ["Polygon", "MultiPolygon"],
  line: ["LineString", "MultiLineString"],
} as const;

/**
 * A literal font stack from a style layer's `text-font`, or undefined when
 * the layout has none (it may be an expression, which cannot be reused).
 * @remarks A stack of font names and a short expression such as
 *   `["get", "font"]` are both arrays of strings. An expression starts with
 *   an operator, which is all lower case with no space, and a font name the
 *   glyph servers in use hold is not, so such a start means an expression.
 */
function literalFont(layout: unknown): readonly string[] | undefined {
  const font = (layout as { "text-font"?: unknown } | undefined)?.["text-font"];
  const stack =
    Array.isArray(font) && font[0] === "literal" ? (font[1] as unknown) : font;
  return Array.isArray(stack) &&
    stack.length > 0 &&
    stack.every((name) => typeof name === "string") &&
    !/^[a-z][a-z-]*$/.test(stack[0] as string)
    ? (stack as string[])
    : undefined;
}

/**
 * The font stack for labels: the first one a symbol layer of the loaded
 * basemap names, which its glyph server is known to have. Undefined when the
 * basemap has no glyph server, such as an inline raster style, because a
 * label cannot be drawn then and no other glyph host may be assumed.
 */
function basemapFont(map: MapLibreMap): readonly string[] | undefined {
  const style = map.getStyle();
  if (!style.glyphs) {
    return undefined;
  }
  for (const layer of style.layers as {
    type?: string;
    layout?: unknown;
  }[]) {
    if (layer.type === "symbol") {
      const font = literalFont(layer.layout);
      if (font) {
        return font;
      }
    }
  }
  return undefined;
}

function pointCollection(id: string, features: readonly MapFeature[]) {
  return {
    type: "FeatureCollection" as const,
    features: features.map((feature) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [feature.position.lng, feature.position.lat],
      },
      properties: {
        "mapcairn:layer": id,
        "mapcairn:id": feature.id,
        icon: markerImageName(feature.shape, feature.colour, feature.radius),
        // Larger points are drawn first, so smaller ones stay on top and tappable.
        sort: -feature.radius,
      },
    })),
  };
}

function shapeCollection(shapes: MapShapes) {
  return {
    type: "FeatureCollection" as const,
    features: shapes.geometries.map((geometry) => ({
      type: "Feature" as const,
      geometry,
      properties: {},
    })),
  };
}

/**
 * The styled shapes of the layer's geometry kind, each carrying its look as
 * properties the engine layers read per feature. Shapes of the other kind are
 * left out.
 */
function styledCollection(id: string, layer: MapStyledShapes) {
  const types: readonly string[] = STYLED_GEOMETRY_TYPES[layer.geometry];
  return {
    type: "FeatureCollection" as const,
    features: layer.shapes
      .filter((shape) => types.includes(shape.geometry.type))
      .map((shape) => ({
        type: "Feature" as const,
        geometry: shape.geometry,
        properties: {
          "mapcairn:layer": id,
          "mapcairn:id": shape.id,
          colour: shape.look.colour,
          fillOpacity: shape.look.fillOpacity,
          pattern: shape.look.pattern,
          dash: shape.look.dash,
          width: shape.look.width,
          label: shape.label ?? "",
        },
      })),
  };
}

function weightedPoints(
  heatmap: Extract<MapHeatmap["source"], { kind: "points" }>,
) {
  return {
    type: "FeatureCollection" as const,
    features: heatmap.points.map((point) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [point.position.lng, point.position.lat],
      },
      properties: { weight: point.weight ?? 1 },
    })),
  };
}

/** The engine's vector tile source for a port vector source. Its zoom limits are tile levels, so they are not converted. */
function vectorSource(source: MapVectorTiles["source"]) {
  return {
    type: "vector",
    tiles: [source.tiles],
    minzoom: source.minzoom,
    maxzoom: source.maxzoom,
  };
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
 * What MapLibre draws for a basemap: a vector basemap's style URL, an
 * imagery basemap's label style URL (`composeHybrid` adds the imagery once
 * it loads), or an inline style with one raster source and layer for a
 * raster basemap.
 * @remarks `tileSize` must be passed: MapLibre assumes 512 px raster tiles
 *   otherwise and would request the wrong level. The source `maxzoom` is a
 *   tile level, which for 256 px tiles is the normalised zoom, so it is the
 *   basemap's `maxZoom` unconverted; MapLibre overzooms nothing beyond it.
 *   Credits are shown by the ui, so the source carries no attribution.
 */
function styleFor(basemap: BasemapDefinition): string | StyleSpecification {
  const { source } = basemap;
  if (source.kind === "vector") {
    return source.styleUrl;
  }
  if (source.kind === "hybrid") {
    return source.labelStyleUrl;
  }
  return {
    version: 8,
    sources: {
      [RASTER_ID]: {
        type: "raster",
        tiles: [source.tileUrl],
        tileSize: source.tileSize,
        maxzoom: basemap.maxZoom,
      },
    },
    layers: [{ id: RASTER_ID, type: "raster", source: RASTER_ID }],
  };
}

function isElement(host: MapHostElement): host is MapHostElement & HTMLElement {
  return typeof HTMLElement !== "undefined" && host instanceof HTMLElement;
}

/**
 * Removes MapLibre's own accessibility semantics so the ui's map host stays
 * the single focus stop and the single "Map" region.
 * @remarks MapLibre sets `role="region"`, `aria-label="Map"` and
 *   `tabindex="0"` on its `<canvas>` (not the canvas container) once, when the
 *   map is built. This removes all three and sets `aria-hidden="true"` on the
 *   canvas. Without a `tabindex` the canvas is not focusable, so clicking it
 *   focuses the host. MapLibre's keyboard handler listens on the canvas
 *   container, so it can only receive keys while focus is inside it.
 */
function neutraliseEngineAccessibility(map: MapLibreMap): void {
  const canvas = map.getCanvas();
  canvas.removeAttribute("role");
  canvas.removeAttribute("aria-label");
  canvas.removeAttribute("tabindex");
  canvas.setAttribute("aria-hidden", "true");
}

interface PendingLoad {
  readonly settleOn: "load" | "style.load";
  readonly resolve: () => void;
  readonly reject: (error: MapEngineError) => void;
  /**
   * True once the style document of this load has been parsed
   * (`style.load`). MapLibre fetches the sprite and glyphs only after that,
   * so a source-less error from then on is not the style document's.
   */
  styleLoaded: boolean;
}

/** A running check of whether the engine survived a worker error. */
interface WorkerCheck {
  readonly timer: ReturnType<typeof setTimeout>;
  readonly idle: Subscription;
}

/**
 * The {@link MapAdapter}, running `maplibre-gl` natively with MapLibre owning
 * every pointer and touch gesture. Vector basemaps load their style URL;
 * raster basemaps are drawn from an inline raster style.
 * @remarks The port speaks normalised (256 px tile) zoom, and MapLibre counts
 *   512 px tiles, so every zoom crossing the boundary goes through
 *   `toEngineZoom` and `toNormalisedZoom`. Pitch is locked at 0 because the
 *   app is a flat 2D map; rotation is supported. The adapter adds no controls,
 *   markers or popups: the pin, measure line and other overlays are drawn by
 *   the ui from `project()`. Data layers (feed points, tile overlays, detail
 *   shapes) are the exception, because hundreds of points or a tiled image
 *   belong in the engine: each is kept by id, drawn as `mapcairn:<id>` sources
 *   and layers above the basemap (tiles, then shapes, then points), and drawn
 *   again after every `style.load`, because a full style swap drops them.
 *   Points are symbols whose images are rasterised in `markerImages.ts`, so
 *   squares and triangles carry meaning beside colour.
 *   `maplibre-gl` and its stylesheet are imported the first time `mount` runs.
 *
 *   In Save data mode each style that loads has the basemap's
 *   `saveDataOmitLayers` removed in the `style.load` handler (see
 *   `omitSaveDataLayers`), so no code here names a basemap. MapLibre's
 *   `transformStyle` option is avoided on purpose: with it set, a style swap
 *   waits for the current style to load, so after a failed swap the last good
 *   basemap would never be put back.
 *
 *   Engine `error` events are classified once:
 *   - a tile or source failure leaves the map working (`tileError`), except
 *     one of a raster tile data layer, which that layer reports itself as
 *     `tileLayerUnavailable` when the map settles (see `reportUnavailableTileLayers`);
 *   - a source-less error before the pending style document has loaded
 *     (`style.load`) means that document failed: it rejects the pending
 *     mount or swap, and a failed swap puts the last basemap that loaded
 *     back. A worker error also rejects a pending mount, which could never
 *     finish without its workers;
 *   - a worker error on a loaded map starts a grace check of
 *     `workerFailureGraceMs`: if the map goes idle meanwhile, or has
 *     everything loaded when it ends, the engine still works and the error
 *     is a `tileError`; otherwise it is a `fatalError`. MapLibre reports an
 *     uncaught exception inside a running worker with the same message as a
 *     worker that never started, so the message alone cannot tell them apart;
 *   - anything else, such as a missing sprite or glyph, is a `tileError`.
 */
export class MapLibreMapAdapter implements MapAdapter {
  private readonly emitter = new Emitter<MapEvents>();
  /** The edit handles live here, not in the style, so a basemap swap keeps them. */
  private readonly editHandles = new EditHandleController({
    placement: () => this.placement(),
    emitDrag: (drag) => this.emitter.emit("handleDrag", drag),
    emitHover: (id) => this.emitter.emit("handleHover", id),
  });
  private readonly imageExporter: MapImageExporter;
  /** Aborts when the adapter is destroyed, for an export that is waiting. */
  private readonly lifetime = new AbortController();
  /** Counts the changes to the basemap, data layers and projection, for an export that waited in the queue. */
  private styleVersion = 0;
  private readonly workerFailureGraceMs: number;
  private readonly workerCacheKey: string | undefined;
  private map: MapLibreMap | undefined;
  private host: MapHostElement | undefined;
  private basemap: BasemapDefinition | undefined;
  /** The basemap whose style document last loaded: what a failed swap goes back to. */
  private committedBasemap: BasemapDefinition | undefined;
  private mountView: ViewState | undefined;
  private subscriptions: Subscription[] = [];
  private pending: PendingLoad | undefined;

  /**
   * Tile traffic of the basemap's own sources since its style last loaded:
   * the basemap that style belongs to (none between a swap being asked for
   * and its style loading), how many tiles loaded and how many failed, and
   * whether `basemapUnavailable` has been reported for it.
   */
  private basemapTiles: BasemapTiles = idleBasemapTiles();
  /**
   * Tile traffic of each tile data layer, by engine source id: counted from
   * the moment its source is drawn, so a new template or a basemap swap
   * starts it afresh.
   */
  private readonly tileTraffic = new Map<string, TileLayerTraffic>();
  /** The interval that paints the map while tile layer tiles load (see `repaintUntilIdle`). */
  private tileSettleNudge: ReturnType<typeof setInterval> | undefined;
  /** The timer that ends that interval when no tile has been asked for for {@link TILE_SETTLE_GIVE_UP_MS}. */
  private tileSettleGiveUp: ReturnType<typeof setTimeout> | undefined;
  /** Whether the style, or the style of a requested basemap still arriving, is loading. */
  private styleLoading = false;
  /**
   * The ids of the loaded style's own sources (the basemap's, and the imagery
   * of a hybrid one), read from the engine when the style loads; `undefined`
   * until then. Data layer sources are never here: a tile of one that never
   * answers keeps the engine from going idle, and must not hold the map's busy
   * state. Whether each is in is asked of the engine (`isSourceLoaded`), not
   * inferred from events, because a tile the provider answers with a 404 fires
   * none.
   */
  private basemapSourceIds: readonly string[] | undefined;
  /**
   * Whether the engine has gone idle since the style started loading. A style
   * with no source of its own has nothing to ask, so it is in only once the
   * engine says so.
   */
  private idleSinceStyle = false;
  private workerCheck: WorkerCheck | undefined;
  private started = false;
  private destroyed = false;
  private animationEnabled = true;
  /** Whether the basemap's `saveDataOmitLayers` are left out of its style. */
  private saveData = false;
  /** The shape the ui chose. It wins over any projection a style asks for. */
  private projection: MapProjection = "flat";
  /** MapLibre's `LngLat`, kept from the engine load, for the occlusion test. */
  private lngLat: MapLibreModule["LngLat"] | undefined;
  private loadEmitted = false;
  private loading = false;
  /** Data layers by id, in the order they were first set. */
  private readonly dataLayers = new Map<string, DataLayer>();
  /** True between a style's `style.load` and the next swap: only then can sources be added. */
  private styleReady = false;
  /** What the engine holds for each data layer, by id. */
  private readonly drawn = new Map<string, DrawnEngineLayers>();
  /** The label font of the loaded style: undefined until read, null when it has none. */
  private labelFontCache: readonly string[] | null | undefined;

  constructor(options: MapLibreMapAdapterOptions = {}) {
    this.workerFailureGraceMs =
      options.workerFailureGraceMs ?? WORKER_FAILURE_GRACE_MS;
    this.workerCacheKey = options.workerCacheKey;
    this.imageExporter = new MapImageExporter(
      {
        mountedMap: () => (this.destroyed ? undefined : this.map),
        isSwapPending: () => this.pending !== undefined,
        placement: (map) => this.placement(map),
        visibleMap: () => this.visibleMap(),
        closed: () => this.lifetime.signal,
        styleVersion: () => this.styleVersion,
        openRenderMap: (request) => this.openRenderMap(request),
      },
      options.imageTilesWaitMs,
    );
  }

  async mount(host: MapHostElement, options: MapMountOptions): Promise<void> {
    if (this.started || this.destroyed) {
      throw new MapEngineError(
        "load-failed",
        "This map adapter has already been mounted or destroyed.",
      );
    }
    this.started = true;
    const { basemap, view, reducedMotion } = options;
    if (!isElement(host)) {
      throw new MapEngineError(
        "load-failed",
        "The map host is not an HTML element.",
      );
    }
    this.host = host;
    this.basemap = basemap;
    this.mountView = view;
    this.animationEnabled = !reducedMotion;
    this.saveData = options.saveData ?? false;
    this.projection = options.projection ?? "flat";

    let maplibre: MapLibreModule;
    try {
      maplibre = await loadEngine(this.workerCacheKey);
    } catch (error) {
      throw new MapEngineError(
        "load-failed",
        `MapLibre could not be loaded: ${String(error)}`,
      );
    }
    if (this.destroyed) {
      return;
    }
    this.lngLat = maplibre.LngLat;

    let map: MapLibreMap;
    try {
      map = new maplibre.Map(this.createOptions(host, view, reducedMotion));
    } catch (error) {
      // MapLibre throws its exported GPUInitializationError when it cannot
      // create a WebGL2 context.
      const reason =
        error instanceof maplibre.GPUInitializationError
          ? "webgl-unavailable"
          : "load-failed";
      throw new MapEngineError(
        reason,
        `MapLibre could not start: ${String(error)}`,
      );
    }
    this.map = map;
    neutraliseEngineAccessibility(map);
    this.applyInertia();

    const loaded = new Promise<void>((resolve, reject) => {
      this.pending = { settleOn: "load", resolve, reject, styleLoaded: false };
    });
    this.subscribe(map);
    // The constructor already started the style fetch, before these listeners existed.
    this.startStyleLoad();
    this.updateLoading();
    try {
      await loaded;
    } catch (error) {
      this.teardownMap();
      throw error;
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    // An export waiting for its tiles stops at once and removes its render map.
    this.lifetime.abort();
    // An intentional teardown is not a failure, so a waiting caller just resolves.
    this.settlePending();
    this.teardownMap();
    this.emitter.clear();
  }

  getView(): ViewState {
    return this.viewOf(this.map);
  }

  /** The view of `map`, or the view it mounted with when there is no map. */
  private viewOf(map: MapLibreMap | undefined): ViewState {
    if (!map) {
      return (
        this.mountView ?? { center: { lat: 0, lng: 0 }, zoom: 0, bearing: 0 }
      );
    }
    const center = map.getCenter();
    return {
      center: { lat: center.lat, lng: center.lng },
      zoom: toNormalisedZoom(map.getZoom()),
      bearing: normaliseBearing(map.getBearing()),
    };
  }

  setView(view: Partial<ViewState>, options?: MapMoveOptions): void {
    const camera: {
      center?: [number, number];
      zoom?: number;
      bearing?: number;
    } = {};
    if (view.center) {
      camera.center = [view.center.lng, view.center.lat];
    }
    if (view.zoom !== undefined) {
      camera.zoom = this.engineZoom(view.zoom);
    }
    if (view.bearing !== undefined) {
      camera.bearing = view.bearing;
    }
    this.moveCamera(camera, options);
  }

  zoomIn(options?: MapMoveOptions): void {
    this.map?.zoomIn(this.animation(options));
  }

  zoomOut(options?: MapMoveOptions): void {
    this.map?.zoomOut(this.animation(options));
  }

  panBy(dx: number, dy: number, options?: MapMoveOptions): void {
    this.map?.panBy([dx, dy], this.animation(options));
  }

  rotateBy(degrees: number, options?: MapMoveOptions): void {
    const map = this.map;
    if (!map) {
      return;
    }
    this.moveCamera({ bearing: map.getBearing() + degrees }, options);
  }

  resetBearing(options?: MapMoveOptions): void {
    this.moveCamera({ bearing: 0 }, options);
  }

  fitBounds(bounds: Bounds, options?: MapFitOptions): void {
    const map = this.map;
    if (!map) {
      return;
    }
    map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      {
        ...(options?.padding ? { padding: { ...options.padding } } : {}),
        ...(options?.maxZoom !== undefined
          ? { maxZoom: this.engineZoom(options.maxZoom) }
          : {}),
        // Without this MapLibre fits north-up and drops the user's rotation.
        bearing: map.getBearing(),
        ...this.animation(options),
      },
    );
  }

  getMinZoom(): number {
    return this.basemap?.minZoom ?? 0;
  }

  getMaxZoom(): number {
    return this.basemap?.maxZoom ?? 0;
  }

  project(latlng: LatLng): PixelPoint {
    return pixelOf(this.map, latlng);
  }

  /**
   * Asks the engine's own horizon test, which hides a place when the planet
   * lies between the camera and it. A flat map hides nothing.
   */
  isVisible(latlng: LatLng): boolean {
    return this.visibleOn(this.map, latlng);
  }

  /** The horizon test of {@link MapLibreMapAdapter.isVisible}, on any map the adapter made. */
  private visibleOn(map: MapLibreMap | undefined, latlng: LatLng): boolean {
    const LngLat = this.lngLat;
    if (!map || !LngLat || this.projection === "flat") {
      return true;
    }
    // `_camera.transform` is what MapLibre's own `Marker` asks. The public
    // `map.transform` is gone from the 6.x typings, and no public call tests
    // the horizon. The adapter contract suite covers it against the stand-in.
    return !map._camera.transform.isLocationOccluded(
      new LngLat(latlng.lng, latlng.lat),
    );
  }

  setProjection(projection: MapProjection): void {
    this.styleVersion += 1;
    this.projection = projection;
    this.applyProjection();
  }

  unproject(point: PixelPoint): LatLng {
    const map = this.map;
    if (!map) {
      return this.getView().center;
    }
    return positionOf(map.unproject([point.x, point.y]));
  }

  metresPerPixel(lat?: number): number {
    const { center, zoom } = this.getView();
    return mapMetresPerPixel(
      this.projection,
      lat ?? center.lat,
      center.lat,
      zoom,
    );
  }

  /**
   * How the ui places its overlay marks on `map` (the map on screen unless an
   * export asks for its render map), so presses and the exported image agree
   * with what it draws.
   */
  private placement(map = this.map): MapPlacement {
    return {
      projection: this.projection,
      view: this.viewOf(map),
      project: (position) => pixelOf(map, position),
      isVisible: (position) => this.visibleOn(map, position),
    };
  }

  /**
   * The size of the map on screen, and where it looks, for an export that
   * names neither. The size is the layout size in whole pixels
   * (`clientWidth`), which is what the engine sizes its canvas from;
   * `getBoundingClientRect` is fractional.
   */
  private visibleMap(): VisibleMap {
    const { clientWidth, clientHeight } = this.host as HTMLElement;
    return {
      size: { width: clientWidth, height: clientHeight },
      view: this.getView(),
    };
  }

  /**
   * Starts a map of its own from the style of the map on screen, so it draws
   * the same basemap and data layers and requests nothing else, at the view
   * and pixel ratio of a requested image. The map on screen is only read.
   */
  private async openRenderMap({
    container,
    pixelRatio,
    view,
  }: RenderMapRequest): Promise<RenderMap> {
    refuseBoxOnGlobe(view, this.projection);
    const maplibre = await loadEngine(this.workerCacheKey);
    // The adapter can be destroyed while the engine loads.
    const source = this.destroyed ? undefined : this.map;
    if (!source) {
      throw notMounted();
    }
    const images = dataLayerImages(source);
    const map = new maplibre.Map({
      container,
      style: source.getStyle(),
      ...this.renderCamera(view),
      bearing: 0,
      pitch: 0,
      minZoom: toEngineZoom(this.getMinZoom()),
      maxZoom: toEngineZoom(this.getMaxZoom()),
      maxPitch: 0,
      interactive: false,
      attributionControl: false,
      maplibreLogo: false,
      // Nothing fades in, so the first full frame is the finished one.
      fadeDuration: 0,
      pixelRatio,
      // The engine lowers the ratio of a canvas over this size, so it is
      // the cap the port enforces, not MapLibre's smaller default.
      maxCanvasSize: [MAX_IMAGE_SIDE_PX, MAX_IMAGE_SIDE_PX],
    });
    // The constructor keeps its default camera when it cannot fit the box,
    // and MapLibre keeps the camera inside what the projection allows, so a
    // box can come back cropped. Either would save the wrong place.
    if ("bounds" in view && !coversBounds(map.getBounds(), view.bounds)) {
      map.remove();
      throw new MapImageExportError(
        "invalid",
        "The view cannot be framed at this size.",
      );
    }
    // A style's own projection can differ from the app's, which wins; and
    // `getStyle()` leaves out the images the data layers use.
    map.on("style.load", () => {
      this.applyProjection(map);
      addDataLayerImages(map, images);
    });
    return { map, idle: this.untilSettled(map) };
  }

  /**
   * Resolves when the render map reports `idle`. A tile that answers 404
   * fires no event and asks for no frame, so a map over a sparse tile layer
   * would never report it (see {@link TILE_SETTLE_NUDGE_MS}); it is painted
   * every {@link TILE_SETTLE_NUDGE_MS} until it does, or until it is removed.
   * This is the render map that exports an image; the live map's own nudge,
   * started by a tile layer's or the basemap's tiles, is `repaintUntilIdle`.
   */
  private untilSettled(map: MapLibreMap): Promise<void> {
    return new Promise((resolve) => {
      const nudge = setInterval(() => {
        map.triggerRepaint();
      }, TILE_SETTLE_NUDGE_MS);
      map.on("remove", () => clearInterval(nudge));
      map.on("idle", () => {
        clearInterval(nudge);
        resolve();
      });
    });
  }

  /** The engine's camera options for a requested view, north-up. */
  private renderCamera(view: MapImageView): Partial<MapOptions> {
    if ("bounds" in view) {
      const [bounds, fitBoundsOptions] = this.fitOf(view.bounds);
      return { bounds, fitBoundsOptions };
    }
    return {
      center: [view.center.lng, view.center.lat],
      zoom: this.engineZoom(view.zoom),
    };
  }

  /** A box and the options to fit it with, never past the basemap's deepest zoom. */
  private fitOf({
    west,
    south,
    east,
    north,
  }: Bounds): [[[number, number], [number, number]], { maxZoom: number }] {
    return [
      [
        [west, south],
        [east, north],
      ],
      { maxZoom: toEngineZoom(this.getMaxZoom()) },
    ];
  }

  setBasemap(
    basemap: BasemapDefinition,
    options: MapBasemapOptions = {},
  ): Promise<void> {
    const map = this.map;
    if (!map || this.destroyed) {
      return Promise.reject(
        new MapEngineError("load-failed", "The map is not mounted."),
      );
    }
    this.styleVersion += 1;
    this.settlePending();
    this.saveData = options.saveData ?? false;
    const swapped = new Promise<void>((resolve, reject) => {
      this.pending = {
        settleOn: "style.load",
        resolve,
        reject,
        styleLoaded: false,
      };
    });
    this.drawBasemap(map, basemap);
    return swapped;
  }

  setAnimationEnabled(enabled: boolean): void {
    this.animationEnabled = enabled;
    if (!enabled) {
      this.map?.stop();
    }
    this.applyInertia();
  }

  setKeyboardEnabled(enabled: boolean): void {
    const map = this.map;
    if (!map) {
      return;
    }
    if (enabled) {
      map.keyboard.enable();
    } else {
      map.keyboard.disable();
    }
  }

  focus(): void {
    this.host?.focus({ preventScroll: true });
  }

  on<K extends keyof MapEvents>(
    event: K,
    handler: (payload: MapEvents[K]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  setFeatureLayer(id: string, features: readonly MapFeature[]): void {
    this.setDataLayer(id, { kind: "features", features: [...features] });
  }

  setTileLayer(id: string, overlay: MapTileOverlay): void {
    const previous = this.dataLayers.get(id);
    this.dataLayers.set(id, { kind: "tiles", overlay });
    const map = this.readyMap();
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
    if (map) {
      this.drawDataLayer(map, id);
    }
  }

  setShapeLayer(id: string, shapes: MapShapes): void {
    this.setDataLayer(id, { kind: "shapes", shapes });
  }

  setStyledShapes(id: string, layer: MapStyledShapes): void {
    this.setDataLayer(id, { kind: "styled", layer });
  }

  setVectorLayer(id: string, tiles: MapVectorTiles): void {
    this.setDataLayer(id, { kind: "vector", tiles });
  }

  setHeatmapLayer(id: string, heatmap: MapHeatmap): void {
    this.setDataLayer(id, { kind: "heatmap", heatmap });
  }

  featuresAt(point: PixelPoint): readonly MapFeatureHit[] {
    return this.hitsAt(point.x, point.y);
  }

  getBounds(): Bounds {
    const map = this.map;
    if (!map) {
      return {
        west: -180,
        south: -MAX_MERCATOR_LATITUDE,
        east: 180,
        north: MAX_MERCATOR_LATITUDE,
      };
    }
    const bounds = map.getBounds();
    return {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    };
  }

  toImage(options?: MapImageOptions): Promise<Blob> {
    return this.imageExporter.toImage(options);
  }

  removeLayer(id: string): void {
    if (!this.dataLayers.delete(id)) {
      return;
    }
    this.styleVersion += 1;
    const map = this.readyMap();
    if (map) {
      this.eraseDataLayer(map, id);
    }
  }

  setEditHandles(handles: readonly MapEditHandle[]): void {
    this.editHandles.setHandles(handles);
  }

  private setDataLayer(id: string, layer: DataLayer): void {
    this.styleVersion += 1;
    this.dataLayers.set(id, layer);
    const map = this.readyMap();
    if (map) {
      this.drawDataLayer(map, id);
    }
  }

  /** Sets the chosen shape on the engine; a style that has not loaded gets it from its `style.load`. */
  private applyProjection(map = this.readyMap()): void {
    map?.setProjection({
      type: this.projection === "globe" ? "globe" : "mercator",
    });
  }

  /** The map, when its style can take sources and layers; otherwise undefined. */
  private readyMap(): MapLibreMap | undefined {
    return this.styleReady ? this.map : undefined;
  }

  private eraseDataLayer(map: MapLibreMap, id: string): void {
    const drawn = this.drawn.get(id);
    this.drawn.delete(id);
    if (!drawn) {
      return;
    }
    this.tileTraffic.delete(drawn.source);
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

  /** Works out the source and style layers of a data layer, without touching the engine. */
  private planDataLayer(
    map: MapLibreMap,
    id: string,
    layer: DataLayer,
  ): DrawPlan {
    const ids = dataLayerEngineIds(id);
    switch (layer.kind) {
      case "features": {
        for (const feature of layer.features) {
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
        return {
          source: {
            type: "geojson",
            data: pointCollection(id, layer.features),
          },
          layers: [
            {
              id: ids.points,
              type: "symbol",
              source: ids.source,
              layout: {
                "icon-image": ["get", "icon"],
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "symbol-sort-key": ["get", "sort"],
              },
            },
          ],
          points: [ids.points],
        };
      }
      case "tiles": {
        const { tiles, tileSize, maxzoom, bounds, opacity } = layer.overlay;
        return {
          source: {
            type: "raster",
            tiles: [tiles],
            tileSize,
            maxzoom,
            ...(bounds ? { bounds: [...bounds] } : {}),
          },
          layers: [
            {
              id: ids.tiles,
              type: "raster",
              source: ids.source,
              paint: { "raster-opacity": opacity },
            },
          ],
        };
      }
      case "shapes": {
        const { colour, lineWidth = SHAPE_LINE_WIDTH } = layer.shapes;
        return {
          source: {
            type: "geojson",
            // The port's positions are readonly tuples; the engine only reads them.
            data: shapeCollection(layer.shapes),
          },
          layers: [
            {
              id: ids.fill,
              type: "fill",
              source: ids.source,
              filter: [
                "match",
                ["geometry-type"],
                ["Polygon", "MultiPolygon"],
                true,
                false,
              ],
              paint: {
                "fill-color": colour,
                "fill-opacity": SHAPE_FILL_OPACITY,
              },
            },
            {
              id: ids.line,
              type: "line",
              source: ids.source,
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-color": colour, "line-width": lineWidth },
            },
          ],
        };
      }
      case "styled":
        return this.planStyledShapes(map, id, layer.layer);
      case "vector":
        return this.planVectorLayer(map, id, layer.tiles);
      case "heatmap":
        return this.planHeatmap(id, layer.heatmap);
    }
  }

  private planStyledShapes(
    map: MapLibreMap,
    id: string,
    styled: MapStyledShapes,
  ): DrawPlan {
    const source = dataLayerEngineIds(id).source;
    const collection = styledCollection(id, styled);
    const shape: ShapeSource = {
      prefix: `mapcairn:${id}:styled-`,
      source,
      zoom: {},
    };
    const look = propertyLook();
    const isArea = styled.geometry === "area";
    const layers = isArea ? areaLayers(shape, look) : lineLayers(shape, look);
    const font = this.labelFont(map);
    const labelled = collection.features.some(
      (feature) => feature.properties.label !== "",
    );
    if (font && labelled) {
      layers.push(
        labelLayer(shape, {
          text: ["get", "label"],
          font,
          along: !isArea,
          zoom: engineWindow({ minzoom: styled.labelMinZoom }),
          filter: ["!=", ["get", "label"], ""],
        }),
      );
    }
    const ofKind = (part: string) =>
      layers
        .map((layer) => layer.id)
        .filter((layerId) => layerId.startsWith(`${shape.prefix}${part}`));
    return {
      // The port's positions are readonly tuples; the engine only reads them.
      source: {
        type: "geojson",
        data: collection as unknown as GeoJSONSourceSpecification["data"],
      },
      layers,
      lines: isArea ? [] : ofKind("line-"),
      polygons: isArea ? ofKind("fill") : [],
    };
  }

  private planVectorLayer(
    map: MapLibreMap,
    id: string,
    vector: MapVectorTiles,
  ): DrawPlan {
    const source = dataLayerEngineIds(id).source;
    const font = this.labelFont(map);
    const layers: EngineLayer[] = [];
    vector.layers.forEach((sourceLayer, index) => {
      const look = ruleLook(sourceLayer.rule);
      if (!look) {
        return;
      }
      const shape: ShapeSource = {
        prefix: `mapcairn:${id}:v${index}-`,
        source,
        sourceLayer: sourceLayer.sourceLayer,
        zoom: engineWindow(vector, sourceLayer),
        only: sourceLayer.geometry,
      };
      const isArea = sourceLayer.geometry === "area";
      layers.push(
        ...(isArea ? areaLayers(shape, look) : lineLayers(shape, look)),
      );
      if (font && sourceLayer.label) {
        const text = ["to-string", ["get", sourceLayer.label.field]];
        layers.push(
          labelLayer(shape, {
            text,
            font,
            along: !isArea,
            zoom: engineWindow(vector, sourceLayer, sourceLayer.label),
            filter: ["!=", text, ""],
          }),
        );
      }
    });
    return { source: vectorSource(vector.source), layers };
  }

  private planHeatmap(id: string, heatmap: MapHeatmap): DrawPlan {
    const ids = dataLayerEngineIds(id);
    const { source, style } = heatmap;
    if (source.kind === "points") {
      return {
        source: {
          type: "geojson",
          data: weightedPoints(source),
        },
        layers: [
          heatmapLayer(
            {
              id: ids.heat,
              source: ids.source,
              weight: ["get", "weight"],
              zoom: {},
            },
            style,
          ),
        ],
      };
    }
    return {
      source: vectorSource(source.source),
      layers: [
        heatmapLayer(
          {
            id: ids.heat,
            source: ids.source,
            sourceLayer: source.sourceLayer,
            weight: source.weightField
              ? ["to-number", ["get", source.weightField], 1]
              : 1,
            zoom: engineWindow(source),
          },
          style,
        ),
      ],
    };
  }

  /** Draws one data layer afresh from what the adapter keeps, then restores the stacking order. */
  private drawDataLayer(map: MapLibreMap, id: string, order = true): void {
    const layer = this.dataLayers.get(id) as DataLayer;
    const earlierTraffic = this.tileTraffic.get(dataLayerEngineIds(id).source);
    this.eraseDataLayer(map, id);
    const plan = this.planDataLayer(map, id, layer);
    if (
      plan.layers.some((engineLayer) => engineLayer.id.endsWith("-pattern"))
    ) {
      this.ensurePatternImages(map);
    }
    const source = dataLayerEngineIds(id).source;
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
      this.tileTraffic.set(source, {
        layerId: id,
        tiles: layer.overlay.tiles,
        requested: 0,
        aborted: 0,
        loaded: 0,
        reported: isStillUnavailable(earlierTraffic, layer.overlay.tiles),
      });
    }
    map.addSource(source, plan.source as unknown as SourceSpecification);
    for (const engineLayer of plan.layers) {
      drawn.layers.push(engineLayer.id);
      map.addLayer(engineLayer as unknown as LayerSpecification);
    }
    if (order) {
      this.orderDataLayers(map);
    }
  }

  /** Moves every data layer to the top, lowest kind first, keeping the order they were set in. */
  private orderDataLayers(map: MapLibreMap): void {
    for (const kind of DATA_KIND_ORDER) {
      for (const [id, layer] of this.dataLayers) {
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

  /**
   * Draws every kept data layer again, then orders them once; a new style
   * starts with none, so ordering after each one would move layers that are
   * not back yet.
   */
  private restoreDataLayers(map: MapLibreMap): void {
    for (const id of this.dataLayers.keys()) {
      this.drawDataLayer(map, id, false);
    }
    this.orderDataLayers(map);
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

  /**
   * Every tappable feature under a pixel, topmost first and once each: points
   * and lines within a fingertip, then polygons exactly. A vector tile
   * repeats a feature in each tile it crosses, so the same feature can come
   * back more than once. Empty when the map is not ready to be queried.
   */
  private hitsAt(x: number, y: number): MapFeatureHit[] {
    const map = this.readyMap();
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

  /** The tap the topmost of `hits` makes, or null when there are none. */
  private featureTapOf(hits: readonly MapFeatureHit[]): MapFeatureTap | null {
    const top = hits[0];
    return top
      ? { layerId: top.layerId, featureId: top.featureId, hits }
      : null;
  }

  private createOptions(
    host: HTMLElement,
    view: ViewState,
    reducedMotion: boolean,
  ): MapOptions {
    const basemap = this.basemap as BasemapDefinition;
    return {
      container: host,
      style: styleFor(basemap),
      center: [view.center.lng, view.center.lat],
      zoom: this.engineZoom(view.zoom),
      bearing: view.bearing,
      pitch: 0,
      minZoom: toEngineZoom(basemap.minZoom),
      maxZoom: toEngineZoom(basemap.maxZoom),
      maxPitch: 0,
      attributionControl: false,
      maplibreLogo: false,
      // The ui implements the keys itself.
      keyboard: false,
      cooperativeGestures: false,
      boxZoom: false,
      dragPan: true,
      dragRotate: true,
      pitchWithRotate: false,
      touchPitch: false,
      touchZoomRotate: true,
      scrollZoom: true,
      doubleClickZoom: true,
      // Constructor-only in MapLibre 6. `reduceMotion` turns off gesture
      // inertia and wheel easing; it must always be passed explicitly because
      // MapLibre stores it globally and the ui already folds in the OS setting.
      reduceMotion: reducedMotion,
      ...(reducedMotion ? { fadeDuration: 0 } : {}),
    };
  }

  private subscribe(map: MapLibreMap): void {
    const listen = <T extends keyof MapEventType>(
      type: T,
      listener: (event: MapEventType[T]) => void,
    ) => {
      this.subscriptions.push(map.on(type, listener));
    };
    const emitView = (event: "move" | "moveEnd" | "rotate") => () => {
      this.emitter.emit(event, this.getView());
    };

    listen("move", emitView("move"));
    listen("moveend", emitView("moveEnd"));
    listen("zoom", (event) => {
      const view = this.getView();
      this.emitter.emit("zoom", view);
      if (isUserEvent(event)) {
        this.emitter.emit("userZoom", view);
      }
    });
    listen("rotate", emitView("rotate"));
    listen("mousedown", (event) => this.editHandles.press(event, "mouse"));
    listen("touchstart", (event) => {
      if (event.points.length === 1) {
        this.editHandles.press(event, "touch");
      }
    });
    listen("mousemove", (event) => this.editHandles.move(event, "mouse"));
    listen("touchmove", (event) => this.editHandles.move(event, "touch"));
    listen("mouseup", (event) => this.editHandles.release(event));
    listen("touchend", (event) => this.editHandles.release(event));
    listen("touchcancel", (event) => this.editHandles.release(event));
    listen("click", (event) => {
      if (this.editHandles.dropsClick()) {
        return;
      }
      const tap = this.featureTapOf(this.hitsAt(event.point.x, event.point.y));
      if (tap) {
        this.emitter.emit("featureTap", tap);
      }
      const click: MapClickEvent = {
        latlng: positionOf(event.lngLat),
        point: { x: event.point.x, y: event.point.y },
        features: this.renderedProperties(event.point.x, event.point.y),
      };
      this.emitter.emit("click", click);
    });
    listen("styledataloading", () => {
      this.startStyleLoad();
      this.updateLoading();
    });
    listen("style.load", () => {
      this.basemapTiles = { ...idleBasemapTiles(), basemap: this.basemap };
      // A style may ask for its own projection (VersaTiles Colorful asks for a
      // globe); the app's setting wins. See ARCHITECTURE.md.
      this.applyProjection(map);
      try {
        composeHybrid(map, this.basemap);
      } catch (error) {
        console.error("The hybrid basemap could not be put together", error);
        // A pending mount or swap fails, so it never hangs and a swap puts
        // the last basemap back; its style.load draws the data layers again.
        if (this.pending) {
          this.failPending(this.pending, error);
          return;
        }
      }
      this.omitSaveDataLayers(map);
      if (this.pending) {
        this.pending.styleLoaded = true;
      }
      this.styleReady = true;
      this.labelFontCache = undefined;
      this.styleLoading = false;
      this.basemapSourceIds = ownSourceIds(map);
      this.updateLoading();
      this.settlePending("style.load");
      try {
        this.restoreDataLayers(map);
      } catch (error) {
        // The basemap works without them; never let a data layer break a swap.
        console.error("Data layers could not be drawn again", error);
      }
    });
    listen("load", () => {
      this.emitLoad();
      this.settlePending("load");
    });
    listen("idle", () => {
      // An idle map has its style and every source in, data layers included.
      this.styleLoading = false;
      this.idleSinceStyle = true;
      this.basemapSourceIds ??= ownSourceIds(map);
      this.updateLoading();
      this.stopRepaintingUntilIdle();
      this.reportUnavailableBasemap();
      this.reportUnavailableTileLayers();
    });
    listen("render", () => {
      // A tile answered with a 404 fires no source event, so a frame is when
      // the last of the basemap's tiles can be seen to be in.
      if (this.loading) {
        this.updateLoading();
      }
    });
    listen("sourcedata", (event) => {
      this.trackBasemapSource(event, map);
      const sourceId = tileEventSource(event);
      if (sourceId === undefined) {
        return;
      }
      if (decidesAvailability(this.basemapTiles.basemap, sourceId)) {
        this.basemapTiles.loaded += 1;
      }
      this.recordLoadedTile(sourceId);
    });
    listen("sourcedataloading", (event) => {
      this.trackBasemapSource(event, map);
      if (this.countTileLayerTile(tileEventSource(event), "requested")) {
        this.repaintUntilIdle(map);
      }
    });
    listen("sourcedataabort", (event) => {
      this.trackBasemapSource(event, map);
      this.countTileLayerTile(tileEventSource(event), "aborted");
    });
    // The classification is described on the class.
    listen("error", (event) => {
      // Listening to "error" silences MapLibre's own console logging.
      console.error("MapLibre basemap error", event.error);
      if (isTileOrSourceError(event)) {
        this.trackBasemapSource(event, map);
        const { sourceId } = event as { sourceId?: unknown };
        if (decidesAvailability(this.basemapTiles.basemap, sourceId)) {
          this.basemapTiles.failed += 1;
        }
        // A tile layer is judged on its own, when the map settles.
        if (typeof sourceId !== "string" || !this.tileTraffic.has(sourceId)) {
          this.emitter.emit("tileError", undefined);
        }
        return;
      }
      const workerFailed = isWorkerFailure(event);
      const pending = this.pending;
      if (
        pending &&
        (!pending.styleLoaded || (workerFailed && pending.settleOn === "load"))
      ) {
        this.failPending(pending, event.error);
        return;
      }
      if (workerFailed) {
        this.checkEngineAfterWorkerError(map);
        return;
      }
      this.emitter.emit("tileError", undefined);
    });
  }

  /**
   * Reports `basemapUnavailable` once, when the map has settled with tiles
   * of the basemap's own sources failed and none loaded. A basemap that has
   * drawn any tile is not reported, however many tiles fail afterwards.
   */
  private reportUnavailableBasemap(): void {
    const { basemap, loaded, failed, reported } = this.basemapTiles;
    if (!basemap || reported || failed === 0 || loaded > 0) {
      return;
    }
    this.basemapTiles.reported = true;
    this.emitter.emit("basemapUnavailable", basemap);
  }

  /**
   * Counts one tile of a tile data layer's source that was asked for or given
   * up on; any other source is not counted.
   * @returns Whether the source is a tile data layer's.
   */
  private countTileLayerTile(
    sourceId: string | undefined,
    count: "requested" | "aborted",
  ): boolean {
    const traffic =
      sourceId === undefined ? undefined : this.tileTraffic.get(sourceId);
    if (!traffic) {
      return false;
    }
    traffic[count] += 1;
    return true;
  }

  /**
   * Counts one tile that loaded for a tile data layer's source (any other
   * source is not counted), and reports `tileLayerRecovered` if it is the
   * first since the layer reported `tileLayerUnavailable`. The recovery is
   * decided from the counters before the tile is added to them.
   */
  private recordLoadedTile(sourceId: string): void {
    const traffic = this.tileTraffic.get(sourceId);
    if (!traffic) {
      return;
    }
    const recovered = traffic.reported && traffic.loaded === 0;
    traffic.loaded += 1;
    if (recovered) {
      this.emitter.emit("tileLayerRecovered", {
        layerId: traffic.layerId,
        tiles: traffic.tiles,
      });
    }
  }

  /**
   * Paints the map every {@link TILE_SETTLE_NUDGE_MS} until it next reports
   * `idle`. A tile the provider answers with a 404 fires no event and asks
   * for no new frame, so a map whose last tiles were such tiles is never
   * painted again and never reports `idle`: the layer could not be judged,
   * and the map would stay busy. One interval serves every tile layer and the
   * basemap's own tiles. It stops at `idle`, and when the basemap is in and no
   * tile layer has a tile outstanding. A tile that never answers keeps the
   * engine from going idle however often the map is painted, and from
   * counting as in, so it also stops {@link TILE_SETTLE_GIVE_UP_MS} after the
   * last tile was asked for; a tile asked for later starts it again. The
   * counters cannot tell a tile that never answers from a 404, so only time
   * can.
   */
  private repaintUntilIdle(map: MapLibreMap): void {
    this.tileSettleNudge ??= setInterval(() => {
      map.triggerRepaint();
    }, TILE_SETTLE_NUDGE_MS);
    clearTimeout(this.tileSettleGiveUp);
    this.tileSettleGiveUp = setTimeout(
      () => this.stopRepaintingUntilIdle(),
      TILE_SETTLE_GIVE_UP_MS,
    );
  }

  private stopRepaintingUntilIdle(): void {
    clearInterval(this.tileSettleNudge);
    clearTimeout(this.tileSettleGiveUp);
    this.tileSettleNudge = undefined;
    this.tileSettleGiveUp = undefined;
  }

  /**
   * Reports `tileLayerUnavailable` once for each tile data layer the map has
   * settled on with tiles asked for and none loaded. A tile given up on (the
   * view moved on) does not count as asked for, and a layer that has drawn
   * any tile is not reported, however many fail afterwards.
   */
  private reportUnavailableTileLayers(): void {
    for (const traffic of this.tileTraffic.values()) {
      const { layerId, tiles, requested, aborted, loaded, reported } = traffic;
      if (reported || loaded > 0 || requested <= aborted) {
        continue;
      }
      traffic.reported = true;
      this.emitter.emit("tileLayerUnavailable", { layerId, tiles });
    }
  }

  /**
   * Removes the active basemap's `saveDataOmitLayers` from the style that has
   * just loaded, and any source only those layers drew from, while Save data
   * is on. It runs in `style.load`, before the first frame, so no tile of the
   * layers is requested; a layer or source the style does not have is skipped.
   */
  private omitSaveDataLayers(map: MapLibreMap): void {
    removeStyleLayers(
      map,
      this.basemap ? omittedLayers(this.basemap, this.saveData) : [],
    );
  }

  /** Sets a basemap's zoom limits and style on the engine. */
  private drawBasemap(map: MapLibreMap, basemap: BasemapDefinition): void {
    this.basemap = basemap;
    const minZoom = toEngineZoom(basemap.minZoom);
    const maxZoom = toEngineZoom(basemap.maxZoom);
    // MapLibre throws if a new minimum passes the current maximum, or the reverse.
    if (minZoom > map.getMaxZoom()) {
      map.setMaxZoom(maxZoom);
      map.setMinZoom(minZoom);
    } else {
      map.setMinZoom(minZoom);
      map.setMaxZoom(maxZoom);
    }
    this.loadEmitted = false;
    this.styleReady = false;
    // The new style has nothing in yet.
    this.startStyleLoad();
    // Tiles from here on belong to no basemap until the new style has loaded.
    this.basemapTiles = idleBasemapTiles();
    // A diffed swap fires no "style.load", so a swap could never settle.
    map.setStyle(styleFor(basemap), { diff: false });
    this.updateLoading();
  }

  /**
   * Rejects a mount or swap whose style could not load. MapLibre has already
   * dropped the old style for the failed one, so a failed swap draws the last
   * basemap that loaded again; the map keeps working on it.
   */
  private failPending(pending: PendingLoad, error: unknown): void {
    this.pending = undefined;
    const map = this.map;
    const previous = this.committedBasemap;
    if (pending.settleOn === "style.load" && map && previous) {
      this.drawBasemap(map, previous);
    }
    pending.reject(
      new MapEngineError(
        "load-failed",
        `The basemap style could not be loaded: ${String(error)}`,
      ),
    );
  }

  /**
   * Decides whether a worker error on a loaded map stopped the engine. One
   * check runs at a time; a burst of errors is judged once.
   */
  private checkEngineAfterWorkerError(map: MapLibreMap): void {
    if (this.workerCheck) {
      return;
    }
    const finish = (stopped: boolean) => {
      this.clearWorkerCheck();
      if (stopped) {
        this.emitter.emit(
          "fatalError",
          new MapEngineError(
            "stopped",
            "The map engine stopped working: its worker failed.",
          ),
        );
      } else {
        this.emitter.emit("tileError", undefined);
      }
    };
    this.workerCheck = {
      idle: map.on("idle", () => finish(false)),
      timer: setTimeout(() => finish(!map.loaded()), this.workerFailureGraceMs),
    };
  }

  private clearWorkerCheck(): void {
    const check = this.workerCheck;
    if (!check) {
      return;
    }
    this.workerCheck = undefined;
    clearTimeout(check.timer);
    check.idle.unsubscribe();
  }

  /** Plain property bags of every rendered feature at a pixel, for the click event. */
  private renderedProperties(x: number, y: number): Record<string, unknown>[] {
    try {
      return (this.map?.queryRenderedFeatures([x, y]) ?? []).map((feature) =>
        toPropertyBag(feature.properties),
      );
    } catch {
      // Querying can throw while a style is still loading; nothing is under the pointer then.
      return [];
    }
  }

  private emitLoad(): void {
    if (this.loadEmitted) {
      return;
    }
    this.loadEmitted = true;
    this.emitter.emit("load", undefined);
  }

  /** A style, or the style of a requested basemap, has started to load: nothing of it is in yet. */
  private startStyleLoad(): void {
    this.styleLoading = true;
    this.basemapSourceIds = undefined;
    this.idleSinceStyle = false;
  }

  /**
   * Re-reads the busy state when a source event is about one of the basemap's
   * own sources; a data layer's sources are ignored. A basemap tile being
   * asked for also starts the repaint that lets a map whose last tiles were
   * 404s see it is done (see `repaintUntilIdle`).
   */
  private trackBasemapSource(event: object, map: MapLibreMap): void {
    if (!isBasemapSource((event as { sourceId?: unknown }).sourceId)) {
      return;
    }
    this.updateLoading();
    if (this.loading) {
      this.repaintUntilIdle(map);
    }
  }

  /**
   * Whether the style is in and every one of its own sources says so. Asked of
   * the engine each time, so an event that never comes (a 404) cannot leave it
   * waiting.
   */
  private basemapIsIn(): boolean {
    const map = this.map;
    const ids = this.basemapSourceIds;
    if (this.styleLoading || !map || !ids) {
      return false;
    }
    if (ids.length === 0) {
      return this.idleSinceStyle;
    }
    return ids.every((id) => !map.getSource(id) || map.isSourceLoaded(id));
  }

  /**
   * Publishes the busy state: the style and the basemap's own tiles decide it,
   * so a data layer's tile that never answers cannot keep it on. The first
   * moment they are all in settles a waiting mount, because the engine's own
   * `load` waits for every source, data layers included.
   */
  private updateLoading(): void {
    const loading = !this.basemapIsIn();
    if (!loading) {
      this.emitLoad();
      this.settlePending("load");
      if (!this.tileLayerTilesOutstanding()) {
        this.stopRepaintingUntilIdle();
      }
    }
    this.setLoading(loading);
  }

  /** Whether any tile layer has asked for a tile that has neither loaded nor been given up on. */
  private tileLayerTilesOutstanding(): boolean {
    return [...this.tileTraffic.values()].some(
      ({ requested, aborted, loaded }) => requested > aborted + loaded,
    );
  }

  private setLoading(loading: boolean): void {
    if (this.loading === loading) {
      return;
    }
    this.loading = loading;
    this.emitter.emit("loading", loading);
  }

  /**
   * Resolves the waiting mount or swap; with `event`, only if it waits for
   * that event, and then its basemap becomes the one a failed swap goes back
   * to. Without one (superseded or destroyed) nothing has loaded.
   */
  private settlePending(event?: PendingLoad["settleOn"]): void {
    const pending = this.pending;
    if (!pending || (event !== undefined && pending.settleOn !== event)) {
      return;
    }
    this.pending = undefined;
    if (event !== undefined) {
      this.committedBasemap = this.basemap;
    }
    pending.resolve();
  }

  private teardownMap(): void {
    this.styleReady = false;
    this.editHandles.reset();
    this.clearWorkerCheck();
    this.stopRepaintingUntilIdle();
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions = [];
    // `remove()` also releases the WebGL context through WEBGL_lose_context.
    this.map?.remove();
    this.map = undefined;
  }

  /**
   * Pan inertia is the only gesture animation MapLibre 6 can change after
   * construction: a pan speed limit of zero leaves nothing to coast.
   */
  private applyInertia(): void {
    this.map?.dragPan.enable(
      this.animationEnabled ? undefined : { maxSpeed: 0 },
    );
  }

  private engineZoom(normalisedZoom: number): number {
    return toEngineZoom(
      clampZoom(normalisedZoom, this.getMinZoom(), this.getMaxZoom()),
    );
  }

  private animation(options?: MapMoveOptions): AnimationOptions {
    // `essential` stops MapLibre's global reduced-motion flag from overriding
    // an animation the app has allowed.
    return this.shouldAnimate(options)
      ? { essential: true }
      : { animate: false, duration: 0 };
  }

  private shouldAnimate(options?: MapMoveOptions): boolean {
    return this.animationEnabled && options?.animate !== false;
  }

  private moveCamera(
    camera: { center?: [number, number]; zoom?: number; bearing?: number },
    options?: MapMoveOptions,
  ): void {
    const map = this.map;
    if (!map) {
      return;
    }
    if (this.shouldAnimate(options)) {
      map.easeTo({ ...camera, essential: true });
    } else {
      map.jumpTo(camera);
    }
  }
}

/** Builds a fresh MapLibre adapter. The composition root's adapter factory. */
export function createMapLibreMapAdapter(
  options: MapLibreMapAdapterOptions = {},
): MapAdapter {
  return new MapLibreMapAdapter(options);
}
