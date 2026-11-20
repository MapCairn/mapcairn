// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerFailureCheck } from "./workerFailureCheck";

const GRACE_MS = 500;

function setUp(loaded: boolean) {
  const idle: { run?: () => void } = {};
  const unsubscribe = vi.fn();
  const map = {
    loaded: () => loaded,
    on: (_type: string, listener: () => void) => {
      idle.run = listener;
      return { unsubscribe };
    },
  } as unknown as MapLibreMap;
  const judged = vi.fn();
  return {
    check: new WorkerFailureCheck(GRACE_MS, judged),
    map,
    idle,
    judged,
    unsubscribe,
  };
}

describe("WorkerFailureCheck", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("finds the engine stopped when the grace ends with the map not loaded", () => {
    const { check, map, judged } = setUp(false);
    check.begin(map);
    vi.advanceTimersByTime(GRACE_MS);
    expect(judged).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("finds the engine working when the grace ends with the map loaded", () => {
    const { check, map, judged } = setUp(true);
    check.begin(map);
    vi.advanceTimersByTime(GRACE_MS);
    expect(judged).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("finds the engine working when the map goes idle, and stops waiting", () => {
    const { check, map, idle, judged, unsubscribe } = setUp(false);
    check.begin(map);
    idle.run?.();
    vi.advanceTimersByTime(GRACE_MS);
    expect(judged).toHaveBeenCalledExactlyOnceWith(false);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("judges a burst of errors once", () => {
    const { check, map, judged } = setUp(false);
    check.begin(map);
    check.begin(map);
    vi.advanceTimersByTime(GRACE_MS);
    expect(judged).toHaveBeenCalledOnce();
  });

  it("gives no verdict once cancelled", () => {
    const { check, map, judged, unsubscribe } = setUp(false);
    check.begin(map);
    check.cancel();
    check.cancel();
    vi.advanceTimersByTime(GRACE_MS);
    expect(judged).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
