// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  MapImageDrawing,
  MapImageOptions,
  PixelPoint,
} from "@mapcairn/core";
import {
  MapEngineError,
  type MapPlacement,
  placePath,
  placePoint,
  visibleRuns,
} from "@mapcairn/core";
import { tokenValues } from "@mapcairn/theme";
import type { Map as MapLibreMap } from "maplibre-gl";
import { rgbaColour } from "./markerImages";

/**
 * How long an export waits for the map to finish loading, and then for a
 * frame, before it goes on with what is there or gives up.
 */
export const IMAGE_WAIT_MS = 3000;

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
  /** How the ui places its overlay marks, so the image agrees with what it draws. */
  placement(): MapPlacement;
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
 */
export class MapImageExporter {
  constructor(private readonly host: MapImageExportHost) {}

  /**
   * Saves the map as it is now, with the credit text and the ui's drawn shapes
   * on it when the options carry them.
   * @throws MapEngineError with reason `export-failed` for every failure:
   *   the adapter is not mounted (or is destroyed while the export waits), a
   *   swap is still loading, or the browser blocks reading or encoding the
   *   canvas.
   */
  async toImage(options: MapImageOptions = {}): Promise<Blob> {
    const map = this.readyOrRefuse();
    try {
      await untilLoaded(map);
      // A swap can start, or a failed one can put a basemap back, while the
      // map finishes loading.
      this.readyOrRefuse();
      const frame = await this.captureFrame(map);
      await fontsReady();
      // The pixels are already copied, so a swap no longer matters, but a
      // destroyed adapter can no longer place marks.
      this.mountedOrRefuse();
      const { drawing } = options;
      if (drawing && drawing.marks.length > 0) {
        drawMarks(frame, map, this.host.placement(), drawing);
      }
      drawAttribution(frame, map, options.attribution);
      return await encodePng(frame.canvas);
    } catch (error) {
      throw toExportError(error);
    }
  }

  /** The map, or an `export-failed` error when the adapter is not mounted. */
  private mountedOrRefuse(): MapLibreMap {
    const map = this.host.mountedMap();
    if (!map) {
      throw new MapEngineError("export-failed", "The map is not mounted.");
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
  frame: Frame,
  map: MapLibreMap,
  placement: MapPlacement,
  drawing: MapImageDrawing,
): void {
  const { context } = frame;
  const scale = imageScale(frame, map);
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
  frame: Frame,
  map: MapLibreMap,
  attribution: string | undefined,
): void {
  const text = attribution?.trim();
  if (!text) {
    return;
  }
  const { canvas, context } = frame;
  const scale = imageScale(frame, map);
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
