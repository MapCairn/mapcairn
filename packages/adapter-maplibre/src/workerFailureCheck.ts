// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Map as MapLibreMap, Subscription } from "maplibre-gl";

/**
 * How long, after a worker error on a loaded map, the adapter waits for signs
 * that the engine still works before it reports `fatalError`.
 */
export const WORKER_FAILURE_GRACE_MS = 5000;

/** A running check of whether the engine survived a worker error. */
interface RunningCheck {
  readonly timer: ReturnType<typeof setTimeout>;
  readonly idle: Subscription;
}

/**
 * Decides whether a worker error on a loaded map stopped the engine. One check
 * runs at a time; a burst of errors is judged once. If the map goes idle
 * meanwhile, or has everything loaded when the grace ends, the engine still
 * works; otherwise it stopped.
 */
export class WorkerFailureCheck {
  private running: RunningCheck | undefined;

  constructor(
    private readonly graceMs: number,
    private readonly judged: (engineStopped: boolean) => void,
  ) {}

  /** Starts judging an error on `map`, unless a check is already running. */
  begin(map: MapLibreMap): void {
    if (this.running) {
      return;
    }
    const finish = (stopped: boolean) => {
      this.cancel();
      this.judged(stopped);
    };
    this.running = {
      idle: map.on("idle", () => finish(false)),
      timer: setTimeout(() => finish(!map.loaded()), this.graceMs),
    };
  }

  /** Drops a running check without a verdict. */
  cancel(): void {
    const check = this.running;
    if (!check) {
      return;
    }
    this.running = undefined;
    clearTimeout(check.timer);
    check.idle.unsubscribe();
  }
}
