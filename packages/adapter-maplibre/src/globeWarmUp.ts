// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * The longest, in milliseconds, a warm-up may take. It ends sooner, when the
 * map is idle again; this bounds it for a map that is never drawn (a hidden
 * page) or never idle (a tile that never answers).
 */
export const GLOBE_WARM_UP_LIMIT_MS = 3000;

/**
 * How long, in milliseconds, the map has to be idle before the warm-up starts,
 * so it never competes with the first load or the first things a person does
 * with the map.
 */
export const GLOBE_WARM_UP_DELAY_MS = 1500;

/** The frame that draws the globe: the one after the flat frame the copy is taken from. */
const GLOBE_FRAME = 2;

/** The frame that draws the flat map again, after which the copy goes. */
const FLAT_AGAIN_FRAME = 3;

/**
 * A still copy of what the canvas shows, laid over it. It is drawn inside the
 * engine's `render` event, the one moment the canvas can be read, so it is
 * the frame the person keeps seeing while the canvas itself draws the globe.
 * Undefined when the browser gives no 2D context.
 */
function copyOf(canvas: HTMLCanvasElement): HTMLCanvasElement | undefined {
  const copy = document.createElement("canvas");
  const context = copy.getContext("2d");
  if (!context) {
    return undefined;
  }
  copy.width = canvas.width;
  copy.height = canvas.height;
  context.drawImage(canvas, 0, 0);
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  });
  canvas.after(copy);
  return copy;
}

/**
 * Has the engine draw one frame as a globe, with a still copy of the flat map
 * shown in its place, so its globe shader programs are built before the person
 * asks for the globe. Building them is the whole cost of the first flat to
 * globe switch (see ARCHITECTURE.md, "Cost of the switch"), and the engine
 * offers no call that builds them without drawing. It runs once per map,
 * and the adapter ignores the map's busy state while it is {@link active}.
 */
export class GlobeWarmUp {
  private started = false;
  private delay: ReturnType<typeof setTimeout> | undefined;
  private undo: (() => void) | undefined;
  private restored = false;

  /**
   * @param restore Puts the shape the person chose back on the map, so a
   *   choice made during a warm-up is the one kept.
   * @param onEnd Runs when a warm-up that ran to its end has put the map back.
   */
  constructor(
    private readonly restore: (map: MapLibreMap) => void,
    private readonly onEnd: () => void,
  ) {}

  /** True from the start of the warm-up until the map is back and idle. */
  get active(): boolean {
    return this.undo !== undefined;
  }

  /**
   * Warms the globe programs on `map` once, {@link GLOBE_WARM_UP_DELAY_MS}
   * after this is first called, when the map is still and `wanted` says it is
   * still drawn flat. Calling it again while it waits, or after it ran, does
   * nothing.
   */
  schedule(map: MapLibreMap, wanted: () => boolean): void {
    if (this.started || this.delay !== undefined) {
      return;
    }
    this.delay = setTimeout(() => {
      this.delay = undefined;
      if (wanted() && !map.isMoving()) {
        this.run(map);
      }
    }, GLOBE_WARM_UP_DELAY_MS);
  }

  /**
   * Cancels a waiting warm-up, or ends a running one and leaves the shape to
   * the caller, who is about to set it. A waiting one that is cancelled may
   * be scheduled again.
   */
  abandon(): void {
    clearTimeout(this.delay);
    this.delay = undefined;
    this.undo?.();
  }

  /** Forgets the map: a map made next has programs of its own to warm. */
  reset(): void {
    this.abandon();
    this.started = false;
    this.restored = false;
  }

  /**
   * Frame 1 is a flat frame asked for now, which the copy is taken from and
   * after which the globe is asked for; frame 2 is the globe, after which the
   * chosen shape is asked for; frame 3 is the flat map again, after which the
   * copy goes.
   */
  private run(map: MapLibreMap): void {
    this.started = true;
    const canvas = map.getCanvas();
    const shown = canvas.style.opacity;
    let copy: HTMLCanvasElement | undefined;
    let frames = 0;
    const timer = setTimeout(() => this.finish(map), GLOBE_WARM_UP_LIMIT_MS);
    const subscriptions = [
      map.on("render", () => {
        frames += 1;
        if (frames === 1) {
          copy = copyOf(canvas);
          canvas.style.opacity = "0";
          map.setProjection({ type: "globe" });
        }
        if (frames === GLOBE_FRAME) {
          this.putBack(map);
        }
        if (frames === FLAT_AGAIN_FRAME) {
          canvas.style.opacity = shown;
          copy?.remove();
        }
      }),
      map.on("idle", () => {
        if (frames >= FLAT_AGAIN_FRAME) {
          this.finish(map);
        }
      }),
    ];
    this.undo = () => {
      clearTimeout(timer);
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
      canvas.style.opacity = shown;
      copy?.remove();
      this.undo = undefined;
    };
    map.triggerRepaint();
  }

  private finish(map: MapLibreMap): void {
    this.undo?.();
    this.putBack(map);
    this.onEnd();
  }

  /** Sets the chosen shape on the map, once, however the warm-up ends. */
  private putBack(map: MapLibreMap): void {
    if (!this.restored) {
      this.restored = true;
      this.restore(map);
    }
  }
}
