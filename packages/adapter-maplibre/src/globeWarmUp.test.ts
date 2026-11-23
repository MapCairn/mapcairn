// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GLOBE_WARM_UP_DELAY_MS, GlobeWarmUp } from "./globeWarmUp";

afterEach(() => {
  vi.useRealTimers();
});

/** A map that records what it was asked for and fires no event of its own. */
function stillMap() {
  const setProjection = vi.fn();
  const map = {
    isMoving: () => false,
    getCanvas: () => document.createElement("canvas"),
    on: () => ({ unsubscribe: vi.fn() }),
    triggerRepaint: vi.fn(),
    setProjection,
  };
  return { map: map as unknown as MapLibreMap, repaint: map.triggerRepaint };
}

describe("GlobeWarmUp", () => {
  it("starts again for the next map once it has been reset", async () => {
    vi.useFakeTimers();
    const warmUp = new GlobeWarmUp(
      () => undefined,
      () => undefined,
    );
    const { map, repaint } = stillMap();
    warmUp.schedule(map, () => true);
    await vi.advanceTimersByTimeAsync(GLOBE_WARM_UP_DELAY_MS);
    expect(repaint).toHaveBeenCalledTimes(1);
    expect(warmUp.active).toBe(true);

    warmUp.schedule(map, () => true);
    await vi.advanceTimersByTimeAsync(GLOBE_WARM_UP_DELAY_MS);
    expect(repaint).toHaveBeenCalledTimes(1);

    warmUp.reset();
    expect(warmUp.active).toBe(false);
    warmUp.schedule(map, () => true);
    await vi.advanceTimersByTimeAsync(GLOBE_WARM_UP_DELAY_MS);
    expect(repaint).toHaveBeenCalledTimes(2);
  });
});
