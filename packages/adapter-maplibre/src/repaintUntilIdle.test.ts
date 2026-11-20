// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepaintUntilIdle, TILE_SETTLE_NUDGE_MS } from "./repaintUntilIdle";

const GIVE_UP_MS = 30_000;

describe("RepaintUntilIdle", () => {
  const triggerRepaint = vi.fn();
  const map = { triggerRepaint } as unknown as MapLibreMap;

  beforeEach(() => {
    vi.useFakeTimers();
    triggerRepaint.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("paints on every nudge until stopped", () => {
    const repaint = new RepaintUntilIdle();
    repaint.start(map);
    vi.advanceTimersByTime(TILE_SETTLE_NUDGE_MS * 3);
    expect(triggerRepaint).toHaveBeenCalledTimes(3);
    repaint.stop();
    vi.advanceTimersByTime(TILE_SETTLE_NUDGE_MS * 3);
    expect(triggerRepaint).toHaveBeenCalledTimes(3);
  });

  it("runs one interval however often it is started", () => {
    const repaint = new RepaintUntilIdle();
    repaint.start(map);
    repaint.start(map);
    vi.advanceTimersByTime(TILE_SETTLE_NUDGE_MS);
    expect(triggerRepaint).toHaveBeenCalledOnce();
    repaint.stop();
  });

  it("gives up a fixed time after the last start", () => {
    const repaint = new RepaintUntilIdle();
    repaint.start(map);
    vi.advanceTimersByTime(GIVE_UP_MS - 1);
    repaint.start(map);
    vi.advanceTimersByTime(GIVE_UP_MS - 1);
    const before = triggerRepaint.mock.calls.length;
    vi.advanceTimersByTime(1);
    vi.advanceTimersByTime(TILE_SETTLE_NUDGE_MS * 4);
    expect(triggerRepaint.mock.calls.length).toBe(before);
  });
});
