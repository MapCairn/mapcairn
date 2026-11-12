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

/** The size of an exported image's credit text, in CSS pixels. */
const ATTRIBUTION_SIZE_PX = 11;

/** The sizes of drawn shapes in an exported image, in CSS pixels, as on screen. */
const MARK_LINE_PX = 4;
const MARK_HALO_PX = 4;
const MARK_DASH_PX = 8;
const MARK_DOT_RADIUS_PX = 7;
const MARK_FILL_OPACITY = 0.18;

/** The gap between lines of an exported image's credit text, as a multiple of the text size. */
const ATTRIBUTION_LINE_SPACING = 1.2;

/** The opacity of the strip behind an exported image's credit text. */
const ATTRIBUTION_STRIP_OPACITY = 0.8;

/** The padding around an exported image's credit text, in CSS pixels. */
const ATTRIBUTION_PADDING_PX = 4;

/** What an export reads from the adapter that owns the map. */
export interface MapImageExportHost {
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
   * @throws MapEngineError with reason `export-failed` for every failure,
   *   including a swap that is still loading and a browser that blocks
   *   reading the canvas.
   */
  async toImage(map: MapLibreMap, options: MapImageOptions): Promise<Blob> {
    this.refuseWhileSwapping();
    try {
      await untilLoaded(map);
      // A swap can start, or a failed one can put a basemap back, while the
      // map finishes loading.
      this.refuseWhileSwapping();
      const frame = await this.captureFrame(map);
      await fontsReady();
      this.drawMarks(frame, map, options.drawing);
      drawAttribution(frame, map, options.attribution);
      return await encodePng(frame.canvas);
    } catch (error) {
      throw toExportError(error);
    }
  }

  /** Throws when an image of the map must not be made now. */
  private refuseWhileSwapping(): void {
    if (this.host.isSwapPending()) {
      throw new MapEngineError(
        "export-failed",
        "The basemap is still loading, so the map cannot be saved yet.",
      );
    }
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
          this.refuseWhileSwapping();
          resolve(copyCanvas(map.getCanvas()));
        } catch (error) {
          reject(error);
        }
      });
      map.triggerRepaint();
    });
  }

  /**
   * Draws the ui's own marks (drawn shapes) over the copied map, at the
   * image's scale: translucent fills, a halo under each outline and dots.
   */
  private drawMarks(
    frame: Frame,
    map: MapLibreMap,
    drawing: MapImageDrawing | undefined,
  ): void {
    if (!drawing || drawing.marks.length === 0) {
      return;
    }
    const { context } = frame;
    const scale = imageScale(frame, map);
    const placement = this.host.placement();
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
      drawOutline(context, lines, {
        ring,
        fill: mark.fill && ring && path.pixels.length >= 3,
        dashed: mark.dashed,
        scale,
        drawing,
      });
    }
    context.setLineDash([]);
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
    }, "image/png");
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

/** Starts a canvas path through the given points, closing it when `closed`; the caller fills or strokes it. */
function tracePath(
  context: CanvasRenderingContext2D,
  points: readonly PixelPoint[],
  closed: boolean,
): void {
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  if (closed) {
    context.closePath();
  }
}

/** Draws a dot mark: a filled circle with a halo around it. */
function drawDot(
  context: CanvasRenderingContext2D,
  at: PixelPoint,
  scale: number,
  drawing: MapImageDrawing,
): void {
  context.beginPath();
  context.arc(at.x, at.y, MARK_DOT_RADIUS_PX * scale, 0, 2 * Math.PI);
  context.fillStyle = drawing.colour;
  context.fill();
  context.lineWidth = MARK_HALO_PX * scale;
  context.strokeStyle = drawing.halo;
  context.stroke();
}

/** How a path mark is drawn, beyond the lines themselves. */
interface OutlineStyle {
  /** Whether the lines form a closed ring that is drawn closed. */
  readonly ring: boolean;
  /** Whether the ring is filled. */
  readonly fill: boolean;
  readonly dashed: boolean;
  /** Image pixels per CSS pixel. */
  readonly scale: number;
  readonly drawing: MapImageDrawing;
}

/** Draws a line or shape mark: an optional translucent fill, then each line with a halo under it. */
function drawOutline(
  context: CanvasRenderingContext2D,
  lines: readonly (readonly PixelPoint[])[],
  { ring, fill, dashed, scale, drawing }: OutlineStyle,
): void {
  if (fill) {
    tracePath(context, lines[0] as readonly PixelPoint[], true);
    context.fillStyle = rgbaColour(drawing.colour, MARK_FILL_OPACITY);
    context.fill();
  }
  context.setLineDash(
    dashed ? [MARK_DASH_PX * scale, MARK_DASH_PX * scale] : [],
  );
  for (const line of lines) {
    tracePath(context, line, ring);
    context.lineWidth = (MARK_LINE_PX + MARK_HALO_PX) * scale;
    context.strokeStyle = drawing.halo;
    context.stroke();
    tracePath(context, line, ring);
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
