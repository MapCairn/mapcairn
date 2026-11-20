// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TileLayerTraffic } from "./tileLayerTraffic";

const SLOW_MS = 1000;

function setUp() {
  const reports = { slow: vi.fn(), recovered: vi.fn(), unavailable: vi.fn() };
  const traffic = new TileLayerTraffic(reports, SLOW_MS);
  traffic.register("src", "layer", "https://t/{z}", "none");
  return { reports, traffic };
}

describe("TileLayerTraffic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts only the sources it was told about", () => {
    const { traffic } = setUp();
    expect(traffic.has("src")).toBe(true);
    expect(traffic.has("other")).toBe(false);
    expect(traffic.has(undefined)).toBe(false);
    expect(traffic.recordRequested("other")).toBe(false);
    expect(traffic.recordRequested(undefined)).toBe(false);
    expect(traffic.hasOutstandingTile()).toBe(false);
  });

  it("holds a tile outstanding until it loads or is given up on", () => {
    const { traffic } = setUp();
    traffic.recordRequested("src");
    traffic.recordRequested("src");
    expect(traffic.hasOutstandingTile()).toBe(true);
    traffic.recordAborted("src");
    traffic.recordLoaded("src");
    expect(traffic.hasOutstandingTile()).toBe(false);
  });

  it("reports slow once, when a tile is still outstanding after the wait", () => {
    const { reports, traffic } = setUp();
    traffic.recordRequested("src");
    traffic.recordRequested("src");
    vi.advanceTimersByTime(SLOW_MS);
    expect(reports.slow).toHaveBeenCalledExactlyOnceWith({
      layerId: "layer",
      tiles: "https://t/{z}",
    });
  });

  it("does not report slow when nothing is outstanding at the end of the wait", () => {
    const { reports, traffic } = setUp();
    traffic.recordRequested("src");
    traffic.recordAborted("src");
    vi.advanceTimersByTime(SLOW_MS);
    expect(reports.slow).not.toHaveBeenCalled();
  });

  it("does not report slow once a tile has loaded", () => {
    const { reports, traffic } = setUp();
    traffic.recordRequested("src");
    traffic.recordLoaded("src");
    vi.advanceTimersByTime(SLOW_MS);
    expect(reports.slow).not.toHaveBeenCalled();
    expect(reports.recovered).not.toHaveBeenCalled();
  });

  it("reports unavailable, once, for a layer settled with tiles asked for and none loaded", () => {
    const { reports, traffic } = setUp();
    traffic.recordRequested("src");
    traffic.reportUnavailable();
    traffic.reportUnavailable();
    expect(reports.unavailable).toHaveBeenCalledExactlyOnceWith({
      layerId: "layer",
      tiles: "https://t/{z}",
    });
    vi.advanceTimersByTime(SLOW_MS);
    expect(reports.slow).not.toHaveBeenCalled();
  });

  it("does not report unavailable for tiles that were all given up on", () => {
    const { reports, traffic } = setUp();
    traffic.recordRequested("src");
    traffic.recordAborted("src");
    traffic.reportUnavailable();
    expect(reports.unavailable).not.toHaveBeenCalled();
  });

  it("reports recovery on the first tile after a report, and only then", () => {
    const { reports, traffic } = setUp();
    traffic.recordRequested("src");
    traffic.reportUnavailable();
    traffic.recordLoaded("src");
    traffic.recordLoaded("src");
    expect(reports.recovered).toHaveBeenCalledExactlyOnceWith({
      layerId: "layer",
      tiles: "https://t/{z}",
    });
  });

  it("carries an earlier report forward only for the same tiles and none loaded", () => {
    const { traffic } = setUp();
    traffic.recordRequested("src");
    traffic.reportUnavailable();
    expect(traffic.carriedReport("src", "https://t/{z}")).toBe("unavailable");
    expect(traffic.carriedReport("src", "https://other/{z}")).toBe("none");
    expect(traffic.carriedReport("missing", "https://t/{z}")).toBe("none");
    traffic.recordLoaded("src");
    expect(traffic.carriedReport("src", "https://t/{z}")).toBe("none");
  });

  it("stops the slow wait when the source is released or the timers are cleared", () => {
    const { reports, traffic } = setUp();
    traffic.recordRequested("src");
    traffic.release("src");
    traffic.register("again", "layer2", "t2", "none");
    traffic.recordRequested("again");
    traffic.clearTimers();
    vi.advanceTimersByTime(SLOW_MS);
    expect(reports.slow).not.toHaveBeenCalled();
    expect(traffic.has("src")).toBe(false);
  });
});
