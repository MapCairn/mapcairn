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

/** The engine events that start the camera moving, which the warm-up gives way to. */
const CAMERA_START_EVENTS = ["movestart", "zoomstart", "dragstart"] as const;

/** The frame that draws the globe: the one after the flat frame the copy is taken from. */
const GLOBE_FRAME = 2;

/** The frame that draws the flat map again, after which the copy goes. */
const FLAT_AGAIN_FRAME = 3;

/**
 * A still copy of what the canvas shows, laid over it. It is drawn inside the
 * engine's `render` event, the one moment the canvas can be read, so it is
 * the frame the person keeps seeing while the canvas itself draws the globe.
 * Undefined when the canvas has no size or the browser gives no 2D context or
 * refuses the copy.
 */
function copyOf(canvas: HTMLCanvasElement): HTMLCanvasElement | undefined {
  if (canvas.width === 0 || canvas.height === 0) {
    return undefined;
  }
  const copy = document.createElement("canvas");
  const context = copy.getContext("2d");
  if (!context) {
    return undefined;
  }
  copy.width = canvas.width;
  copy.height = canvas.height;
  try {
    context.drawImage(canvas, 0, 0);
  } catch {
    return undefined;
  }
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

/** What a running warm-up holds: its map, how to stop listening, and how to show the canvas again. */
interface Running {
  readonly map: MapLibreMap;
  readonly stopListening: () => void;
  readonly uncover: () => void;
}

/**
 * Has the engine draw one frame as a globe, with a still copy of the flat map
 * shown in its place, so its globe shader programs are built before the person
 * asks for the globe. Building them is the whole cost of the first flat to
 * globe switch (see ARCHITECTURE.md, "Cost of the switch"), and the engine
 * offers no call that builds them without drawing. It runs once per map, and
 * the adapter ignores the map's busy state while it is {@link active}.
 */
export class GlobeWarmUp {
  private started = false;
  private delay: ReturnType<typeof setTimeout> | undefined;
  private running: Running | undefined;
  /** True from the moment the engine is asked for the globe until the chosen shape is asked for again. */
  private globeAsked = false;

  /**
   * @param restore Asks the engine for the shape the person chose, so a
   *   choice made during a warm-up is the one kept.
   * @param onEnd Runs when a warm-up has ended on its own or given way to
   *   the camera, so the busy state it held back is read again.
   */
  constructor(
    private readonly restore: () => void,
    private readonly onEnd: () => void,
  ) {}

  /** True from the start of the warm-up until it has ended. */
  get active(): boolean {
    return this.running !== undefined;
  }

  /**
   * Waits {@link GLOBE_WARM_UP_DELAY_MS}, then warms the globe programs on
   * `map` once, if the page is visible, the map is still and `wanted` says it
   * is still drawn flat. Calling it again while it waits, or after it ran,
   * does nothing. A wait that ends without a warm-up (the page was hidden, the
   * map was moving) or is cancelled by {@link abandon} may be started again by
   * a later call, which the adapter makes each time the map goes idle; a page
   * that is hidden at that moment therefore loses the warm-up until the map
   * next goes idle, which may be never. Its first globe switch then pays the
   * full cost, as it did before.
   */
  schedule(map: MapLibreMap, wanted: () => boolean): void {
    if (this.started || this.delay !== undefined) {
      return;
    }
    this.delay = setTimeout(() => {
      this.delay = undefined;
      if (!document.hidden && wanted() && !map.isMoving()) {
        this.run(map);
      }
    }, GLOBE_WARM_UP_DELAY_MS);
  }

  /**
   * Cancels a waiting warm-up, or ends a running one: the chosen shape is
   * asked for again if the globe was, and the canvas is shown after the next
   * frame. It does not read the busy state again; the caller does.
   */
  abandon(): void {
    clearTimeout(this.delay);
    this.delay = undefined;
    this.end();
  }

  /** Forgets the map, which is gone or going: a map made next has programs of its own to warm. */
  reset(): void {
    clearTimeout(this.delay);
    this.delay = undefined;
    this.running?.stopListening();
    this.running?.uncover();
    this.running = undefined;
    this.globeAsked = false;
    this.started = false;
  }

  /**
   * Frame 1 is a flat frame asked for now, which the copy is taken from and
   * after which the globe is asked for; frame 2 is the globe, after which the
   * chosen shape is asked for; frame 3 is the flat map again, after which the
   * copy goes. With no copy the warm-up is skipped, for good: it asked for one
   * frame, and a retry on the idle that follows would ask again.
   */
  private run(map: MapLibreMap): void {
    this.started = true;
    const canvas = map.getCanvas();
    const shown = canvas.style.opacity;
    let copy: HTMLCanvasElement | undefined;
    let frames = 0;
    const uncover = () => {
      canvas.style.opacity = shown;
      copy?.remove();
    };
    const interrupt = () => {
      this.abandon();
      this.onEnd();
    };
    const onHidden = () => {
      if (document.hidden) {
        interrupt();
      }
    };
    const timer = setTimeout(() => this.finish(), GLOBE_WARM_UP_LIMIT_MS);
    const subscriptions = [
      map.on("render", () => {
        frames += 1;
        if (frames === 1) {
          copy = copyOf(canvas);
          if (!copy) {
            this.finish();
            return;
          }
          canvas.style.opacity = "0";
          this.globeAsked = true;
          map.setProjection({ type: "globe" });
        }
        if (frames === GLOBE_FRAME) {
          this.putBack();
        }
        if (frames === FLAT_AGAIN_FRAME) {
          uncover();
        }
      }),
      map.on("idle", () => {
        if (frames >= FLAT_AGAIN_FRAME) {
          this.finish();
        }
      }),
      ...CAMERA_START_EVENTS.map((type) => map.on(type, interrupt)),
    ];
    document.addEventListener("visibilitychange", onHidden);
    this.running = {
      map,
      uncover,
      stopListening: () => {
        clearTimeout(timer);
        for (const subscription of subscriptions) {
          subscription.unsubscribe();
        }
        document.removeEventListener("visibilitychange", onHidden);
      },
    };
    map.triggerRepaint();
  }

  /** Ends the warm-up on its own and has the busy state read again. */
  private finish(): void {
    this.end();
    this.onEnd();
  }

  /**
   * Stops listening and puts the chosen shape back. When that undoes the
   * globe, the canvas stays covered until the flat frame it asks for is
   * drawn, so the globe frame is never shown.
   */
  private end(): void {
    const running = this.running;
    if (!running) {
      return;
    }
    this.running = undefined;
    running.stopListening();
    if (!this.globeAsked) {
      running.uncover();
      return;
    }
    this.putBack();
    const flat = running.map.on("render", () => {
      flat.unsubscribe();
      running.uncover();
    });
  }

  /** Asks the engine for the chosen shape, once, if it was asked for the globe. */
  private putBack(): void {
    if (this.globeAsked) {
      this.globeAsked = false;
      this.restore();
    }
  }
}
