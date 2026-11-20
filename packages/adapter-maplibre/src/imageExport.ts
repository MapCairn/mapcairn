// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  MapImageDrawing,
  MapImageOptions,
  MapImageSize,
  MapImageView,
  PixelPoint,
  RequestedImage,
  VisibleMap,
} from "@mapcairn/core";
import {
  MapEngineError,
  MapImageExportError,
  type MapPlacement,
  placePath,
  placePoint,
  planRequestedImage,
  visibleRuns,
} from "@mapcairn/core";
import { tokenValues } from "@mapcairn/theme";
import type { Map as MapLibreMap } from "maplibre-gl";
import { rgbaColour } from "./markerImages";

/**
 * How long an export of the map on screen waits for the map to finish
 * loading, and then for a frame, before it goes on with what is there or
 * gives up.
 */
export const IMAGE_WAIT_MS = 3000;

/**
 * How long a requested image waits for the tiles of its view to load before
 * it fails with a `timed-out` error. A view the browser has not fetched yet
 * can need many tiles over a slow connection, so this is longer than
 * {@link IMAGE_WAIT_MS}.
 */
export const IMAGE_TILES_WAIT_MS = 15_000;

/** The type an exported image is encoded as. */
const IMAGE_MIME_TYPE = "image/png";

/** The size of an exported image's credit text, in CSS pixels. */
const ATTRIBUTION_SIZE_PX = 11;

/** The padding around an exported image's credit text, in CSS pixels. */
const ATTRIBUTION_PADDING_PX = 4;

/** The gap between lines of an exported image's credit text, as a multiple of the text size. */
const ATTRIBUTION_LINE_SPACING = 1.2;

/** The opacity of the strip behind an exported image's credit text. */
const ATTRIBUTION_STRIP_OPACITY = 0.8;

/** The sizes of drawn shapes in an exported image, in CSS pixels, as on screen. */
const MARK_LINE_PX = 4;
const MARK_HALO_PX = 4;
const MARK_DASH_PX = 8;
const MARK_DOT_RADIUS_PX = 7;
const MARK_FILL_OPACITY = 0.18;

/** The fewest corners a ring needs to enclose an area worth filling. */
const MIN_FILLED_RING_VERTICES = 3;

/** The angle of a full circle, in radians, for drawing a dot. */
const FULL_CIRCLE_RADIANS = 2 * Math.PI;

/** What an export reads from the adapter that owns the map. */
export interface MapImageExportHost {
  /**
   * The map while the adapter is mounted, and undefined before `mount`, after
   * `destroy` or after a failed mount. Asked again at each step after an
   * `await`, because the adapter can be destroyed while an export waits.
   */
  mountedMap(): MapLibreMap | undefined;
  /**
   * Whether a basemap swap is still loading, so the pixels would be of
   * neither basemap alone. Asked again at each step, because a swap can start
   * while an export is under way.
   */
  isSwapPending(): boolean;
  /**
   * How the ui places its overlay marks on `map`, so the image agrees with
   * what it draws: the map on screen, or the render map of a requested image.
   */
  placement(map: MapLibreMap): MapPlacement;
  /** The size and view of the map on screen, which a request falls back to. */
  visibleMap(): VisibleMap;
  /** Aborts when the adapter is destroyed, so an export waiting for tiles stops at once. */
  closed(): AbortSignal;
  /**
   * A number that changes whenever the map on screen's basemap, data layers
   * or projection change, so an export that waited in the queue can tell the
   * style it would draw is not the one its view and credits were read with.
   */
  styleVersion(): number;
  /**
   * Starts a map of its own beside the one on screen, in `container`, that
   * draws the style and data layers the map on screen has now at the view and
   * pixel ratio asked for. It must not move, repaint or otherwise touch the
   * map on screen, and it adds no source the map on screen does not have. The
   * exporter removes the map and the container when it is done.
   * @throws MapEngineError when the engine cannot start, or the adapter is
   *   destroyed while it starts.
   */
  openRenderMap(request: RenderMapRequest): Promise<RenderMap>;
}

/** What {@link MapImageExportHost.openRenderMap} is asked for. */
export interface RenderMapRequest {
  /** An attached, hidden element already the size of the map, in CSS pixels. */
  readonly container: HTMLElement;
  /** Image pixels for each CSS pixel of the container. */
  readonly pixelRatio: number;
  /** What the map shows, north-up. */
  readonly view: MapImageView;
}

/** A map made to draw one requested image. */
export interface RenderMap {
  readonly map: MapLibreMap;
  /**
   * Resolves when the map has loaded every tile its view needs and drawn
   * them. It is listened for from the moment the map exists, so an `idle`
   * before the exporter asks is not missed. It never rejects; a map that does
   * not settle is cut off by the exporter's own timeout.
   */
  readonly idle: Promise<void>;
}

/** A copy of the map's canvas, and the 2D context it was drawn with. */
interface Frame {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

/**
 * Draws the map as a PNG without asking MapLibre to keep its drawing buffer,
 * which would cost every frame. The buffer is only readable in the frame that
 * has just been drawn, so a repaint is asked for and the canvas is copied
 * inside its `render` event, before the browser clears it.
 *
 * A request with a size, a pixel ratio or a view is drawn the same way on a
 * second map made for it, so the map on screen is never resized or moved.
 */
export class MapImageExporter {
  /** The requested export under way or last queued, which the next waits for. */
  private turn: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly host: MapImageExportHost,
    private readonly tilesWaitMs = IMAGE_TILES_WAIT_MS,
  ) {}

  /**
   * Runs a requested export once the ones asked for before it have finished,
   * so only one render map, with its WebGL context and the largest canvas
   * allowed, is open at a time. A failed export does not hold up
   * the next. The queue has no cap and a caller cannot cancel an export in it.
   */
  private inTurn<T>(task: () => Promise<T>): Promise<T> {
    const run = this.turn.then(task);
    this.turn = run.catch(() => undefined);
    return run;
  }

  /**
   * Saves the map, with the credit text and the ui's drawn shapes on it when
   * the options carry them: as it is on screen when they name no size, pixel
   * ratio or view, and otherwise as requested, on a map of its own.
   * @throws MapEngineError with reason `export-failed` for every failure:
   *   the adapter is not mounted (or is destroyed while the export waits), a
   *   swap is still loading, or the browser blocks reading or encoding the
   *   canvas.
   * @throws MapImageExportError (an `export-failed` error) of kind `invalid`
   *   or `too-large` for a request the size limits refuse, which it does
   *   before drawing anything, of kind `too-large` for an image the device
   *   cannot draw, and of kind `timed-out` when the tiles do not load in time.
   */
  async toImage(options: MapImageOptions = {}): Promise<Blob> {
    const map = this.readyOrRefuse();
    try {
      const requested = planRequestedImage(options, this.host.visibleMap());
      if (!requested) {
        return await this.saveVisible(map, options);
      }
      // The view and size were read now, and the style is read when the
      // export's turn comes, so a change in between would mix the two.
      const styleVersion = this.host.styleVersion();
      return await this.inTurn(() =>
        this.saveRequested(requested, options, styleVersion),
      );
    } catch (error) {
      throw toExportError(error);
    }
  }

  /** Saves the map on screen as it is, going on with what has loaded if a tile is stuck. */
  private async saveVisible(
    map: MapLibreMap,
    options: MapImageOptions,
  ): Promise<Blob> {
    await untilLoaded(map);
    // A swap can start, or a failed one can put a basemap back, while the
    // map finishes loading.
    this.readyOrRefuse();
    const frame = await this.captureFrame(map);
    return this.finish(frame, map, options, imageScale(frame, map));
  }

  /**
   * Draws a requested image on a hidden map of its own, so the map on screen
   * is not moved or resized, and removes that map and its container whatever
   * happens.
   */
  private async saveRequested(
    request: RequestedImage,
    options: MapImageOptions,
    styleVersion: number,
  ): Promise<Blob> {
    // The adapter can have been destroyed, or a swap started, while this
    // export waited for the one before it.
    this.readyOrRefuse();
    if (this.host.styleVersion() !== styleVersion) {
      throw new MapEngineError(
        "export-failed",
        "The map changed while the image was waiting.",
      );
    }
    const container = renderContainer(request.size);
    document.body.append(container);
    let render: RenderMap | undefined;
    try {
      render = await this.host.openRenderMap({
        container,
        pixelRatio: request.pixelRatio,
        view: request.view,
      });
      await untilTilesLoaded(render.idle, this.tilesWaitMs, this.host.closed());
      // A `destroy()` during the next step waits for its 3 second frame timer.
      const frame = await this.captureFrame(render.map);
      checkFrameSize(frame, request);
      return await this.finish(frame, render.map, options, request.pixelRatio);
    } finally {
      try {
        render?.map.remove();
      } finally {
        container.remove();
      }
    }
  }

  /**
   * Puts the drawn shapes and the credit text on a copied frame, `scale`
   * image pixels to a CSS pixel, and encodes it.
   */
  private async finish(
    frame: Frame,
    map: MapLibreMap,
    options: MapImageOptions,
    scale: number,
  ): Promise<Blob> {
    await fontsReady();
    // The pixels are already copied, so a swap no longer matters, but a
    // destroyed adapter can no longer place marks.
    this.mountedOrRefuse();
    const { drawing } = options;
    if (drawing && drawing.marks.length > 0) {
      drawMarks(frame, this.host.placement(map), drawing, scale);
    }
    drawAttribution(frame, options.attribution, scale);
    return encodePng(frame.canvas);
  }

  /** The map, or an `export-failed` error when the adapter is not mounted. */
  private mountedOrRefuse(): MapLibreMap {
    const map = this.host.mountedMap();
    if (!map) {
      throw notMounted();
    }
    return map;
  }

  /** The map, or an `export-failed` error when the adapter is not mounted or a swap is loading. */
  private readyOrRefuse(): MapLibreMap {
    const map = this.mountedOrRefuse();
    if (this.host.isSwapPending()) {
      throw new MapEngineError(
        "export-failed",
        "The basemap is still loading, so the map cannot be saved yet.",
      );
    }
    return map;
  }

  /**
   * Asks for a repaint and copies the canvas inside the `render` event that
   * follows, the only moment its drawing buffer can be read.
   */
  private captureFrame(map: MapLibreMap): Promise<Frame> {
    return new Promise((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer);
        render.unsubscribe();
      };
      const timer = setTimeout(() => {
        stop();
        reject(
          new MapEngineError(
            "export-failed",
            "The map did not draw a frame to save.",
          ),
        );
      }, IMAGE_WAIT_MS);
      const render = map.on("render", () => {
        stop();
        try {
          this.readyOrRefuse();
          resolve(copyCanvas(map.getCanvas()));
        } catch (error) {
          reject(error);
        }
      });
      map.triggerRepaint();
    });
  }
}

/** Resolves once the map has loaded everything, or after {@link IMAGE_WAIT_MS}, so a stuck tile cannot stall an export. */
function untilLoaded(map: MapLibreMap): Promise<void> {
  if (map.loaded()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      idle.unsubscribe();
      resolve();
    };
    const timer = setTimeout(done, IMAGE_WAIT_MS);
    const idle = map.on("idle", done);
  });
}

/**
 * Waits for the render map's tiles, and fails with a `timed-out` export error
 * when they have not loaded after `ms`, so a stuck tile cannot stall an
 * export or leave a gap in the image unreported.
 */
function untilTilesLoaded(
  idle: Promise<void>,
  ms: number,
  closed: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      closed.removeEventListener("abort", onClosed);
    };
    const onClosed = () => {
      stop();
      reject(notMounted());
    };
    const timer = setTimeout(() => {
      stop();
      reject(
        new MapImageExportError(
          "timed-out",
          "The tiles for the image did not finish loading in time.",
        ),
      );
    }, ms);
    closed.addEventListener("abort", onClosed);
    if (closed.aborted) {
      onClosed();
      return;
    }
    void idle.then(() => {
      stop();
      resolve();
    });
  });
}

/** The error for an export whose adapter is not mounted, or was destroyed while it waited. */
export function notMounted(): MapEngineError {
  return new MapEngineError("export-failed", "The map is not mounted.");
}

/**
 * Makes the element a render map is built in: attached and sized, so the
 * engine can measure it, but hidden from sight, from the pointer and from
 * assistive technology. It is sized through the style object, which the
 * production Content Security Policy allows, unlike a `style` attribute.
 */
function renderContainer({ width, height }: MapImageSize): HTMLElement {
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.inert = true;
  Object.assign(container.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: `${width}px`,
    height: `${height}px`,
    visibility: "hidden",
    pointerEvents: "none",
    zIndex: "-1",
  });
  return container;
}

/**
 * Fails with `too-large` when the copied canvas is not the size that was
 * asked for. MapLibre lowers the pixel ratio of a canvas the GPU cannot hold
 * rather than refusing it, which would quietly save a smaller image.
 */
function checkFrameSize(
  { canvas }: Frame,
  { pixelWidth, pixelHeight }: RequestedImage,
): void {
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    throw new MapImageExportError(
      "too-large",
      `This device could not draw the image at ${pixelWidth} by ${pixelHeight} pixels.`,
    );
  }
}

/**
 * Copies a canvas, pixel for pixel, onto a new 2D canvas, which keeps its
 * pixels after the engine clears its own drawing buffer. Must run inside the
 * frame that drew the source.
 */
function copyCanvas(source: HTMLCanvasElement): Frame {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new MapEngineError(
      "export-failed",
      "The browser could not make a canvas to draw the image on.",
    );
  }
  context.drawImage(source, 0, 0);
  return { canvas, context };
}

/** Waits for the page's fonts, so credit text is drawn in the right one. A font set that fails only costs the web font. */
async function fontsReady(): Promise<void> {
  try {
    await document.fonts?.ready;
  } catch {
    // Draw in whatever font the page falls back to.
  }
}

/** Encodes a canvas as a PNG, or fails with `export-failed` when the browser cannot. */
function encodePng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(
          new MapEngineError(
            "export-failed",
            "The browser could not encode the map as an image.",
          ),
        );
      }
    }, IMAGE_MIME_TYPE);
  });
}

/**
 * Turns whatever went wrong while saving into the port's error. A tainted
 * canvas throws a `SecurityError` when it is read, which means a layer on the
 * map came from a server that does not allow it to be copied.
 */
function toExportError(error: unknown): MapEngineError {
  if (error instanceof MapEngineError) {
    return error;
  }
  if ((error as { name?: unknown } | null)?.name === "SecurityError") {
    return new MapEngineError(
      "export-failed",
      "The browser blocked reading the map, so it cannot be saved as an image.",
    );
  }
  return new MapEngineError(
    "export-failed",
    `The map could not be saved as an image: ${String(error)}`,
  );
}

/**
 * How many image pixels one CSS pixel of the map is: the image is as wide as
 * the canvas, which is the map's CSS width times the device pixel ratio.
 */
function imageScale({ canvas }: Frame, map: MapLibreMap): number {
  const cssWidth =
    map.getCanvas().clientWidth ||
    canvas.width / (window.devicePixelRatio || 1);
  return cssWidth > 0 ? canvas.width / cssWidth : 1;
}

/**
 * Draws the ui's own marks (drawn shapes) over the copied map, at the image's
 * scale: translucent fills, a halo under each outline and dots.
 */
function drawMarks(
  { context }: Frame,
  placement: MapPlacement,
  drawing: MapImageDrawing,
  scale: number,
): void {
  const toImage = (point: PixelPoint) => ({
    x: point.x * scale,
    y: point.y * scale,
  });
  context.lineJoin = "round";
  context.lineCap = "round";
  for (const mark of drawing.marks) {
    if (mark.kind === "dot") {
      const placed = placePoint(mark.position, placement);
      if (placed) {
        drawDot(context, toImage(placed), scale, drawing);
      }
      continue;
    }
    // The same curves, copy of the world and horizon as the overlay, so
    // the image shows the shapes as the person saw them.
    const path = placePath(mark.positions, mark.closed, placement);
    const ring = mark.closed && path.whole;
    const lines = ring
      ? [path.pixels.map(toImage)]
      : visibleRuns(path).map((run) => run.map(toImage));
    const filled =
      mark.fill && ring && path.pixels.length >= MIN_FILLED_RING_VERTICES;
    drawOutline(context, lines, {
      ring,
      fillRing: filled ? lines[0] : undefined,
      dashed: mark.dashed,
      scale,
      drawing,
    });
  }
  context.setLineDash([]);
}

/** Starts a canvas path through the points; the caller fills or strokes it. */
function traceOpenPath(
  context: CanvasRenderingContext2D,
  points: readonly PixelPoint[],
): void {
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
}

/** Starts a closed canvas path through the points; the caller fills or strokes it. */
function traceRing(
  context: CanvasRenderingContext2D,
  points: readonly PixelPoint[],
): void {
  traceOpenPath(context, points);
  context.closePath();
}

/** Draws a dot mark: a filled circle with a halo around it. */
function drawDot(
  context: CanvasRenderingContext2D,
  at: PixelPoint,
  scale: number,
  drawing: MapImageDrawing,
): void {
  context.beginPath();
  context.arc(at.x, at.y, MARK_DOT_RADIUS_PX * scale, 0, FULL_CIRCLE_RADIANS);
  context.fillStyle = drawing.colour;
  context.fill();
  context.lineWidth = MARK_HALO_PX * scale;
  context.strokeStyle = drawing.halo;
  context.stroke();
}

/** How a path mark is drawn, beyond the lines themselves. */
interface OutlineStyle {
  /** Whether the lines form one closed ring, drawn closed. */
  readonly ring: boolean;
  /** The ring to fill, or undefined when the mark has no fill. */
  readonly fillRing: readonly PixelPoint[] | undefined;
  readonly dashed: boolean;
  /** Image pixels per CSS pixel. */
  readonly scale: number;
  readonly drawing: MapImageDrawing;
}

/** Draws a line or shape mark: an optional translucent fill, then each line with a halo under it. */
function drawOutline(
  context: CanvasRenderingContext2D,
  lines: readonly (readonly PixelPoint[])[],
  { ring, fillRing, dashed, scale, drawing }: OutlineStyle,
): void {
  if (fillRing) {
    traceRing(context, fillRing);
    context.fillStyle = rgbaColour(drawing.colour, MARK_FILL_OPACITY);
    context.fill();
  }
  context.setLineDash(
    dashed ? [MARK_DASH_PX * scale, MARK_DASH_PX * scale] : [],
  );
  const trace = ring ? traceRing : traceOpenPath;
  for (const line of lines) {
    trace(context, line);
    context.lineWidth = (MARK_LINE_PX + MARK_HALO_PX) * scale;
    context.strokeStyle = drawing.halo;
    context.stroke();
    trace(context, line);
    context.lineWidth = MARK_LINE_PX * scale;
    context.strokeStyle = drawing.colour;
    context.stroke();
  }
}

/**
 * Splits credit text into lines no wider than `room` at the context's current
 * font, breaking only between words. A single word wider than `room` stays on
 * its own line, and the caller shrinks the text to fit it.
 */
function wrapLines(
  context: CanvasRenderingContext2D,
  text: string,
  room: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > room) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  lines.push(line);
  return lines;
}

/**
 * Draws the credit text on a semi-opaque strip along the bottom edge, in the
 * page's own font and the palette's ink, sized to the map's CSS size so it
 * reads the same on a high-density screen. Text too long for the image is
 * scaled down to fit.
 */
function drawAttribution(
  { canvas, context }: Frame,
  attribution: string | undefined,
  scale: number,
): void {
  const text = attribution?.trim();
  if (!text) {
    return;
  }
  const padding = ATTRIBUTION_PADDING_PX * scale;
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  let size = ATTRIBUTION_SIZE_PX * scale;
  context.font = `${size}px ${family}`;
  const room = canvas.width - 2 * padding;
  let lines = wrapLines(context, text, room);
  const widest = Math.max(
    ...lines.map((line) => context.measureText(line).width),
  );
  if (widest > room && room > 0) {
    size *= room / widest;
    context.font = `${size}px ${family}`;
    lines = wrapLines(context, text, room);
  }
  const lineHeight = size * ATTRIBUTION_LINE_SPACING;
  const height = size + (lines.length - 1) * lineHeight + 2 * padding;
  context.fillStyle = rgbaColour(
    tokenValues.dataMarker.halo,
    ATTRIBUTION_STRIP_OPACITY,
  );
  context.fillRect(0, canvas.height - height, canvas.width, height);
  context.fillStyle = tokenValues.dataMarker.edge;
  context.textAlign = "right";
  context.textBaseline = "middle";
  const top = canvas.height - height + padding + size / 2;
  lines.forEach((line, index) => {
    context.fillText(line, canvas.width - padding, top + index * lineHeight);
  });
}
