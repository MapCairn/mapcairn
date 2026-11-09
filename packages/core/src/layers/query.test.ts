import { describe, expect, it } from "vitest";
import { SAMPLE_FEED_LAYER, SAMPLE_QUERY_LAYER } from "../fakes/layerFixtures";
import { feedUrl } from "./feed";
import { nextQueryWindow, queryWindow } from "./query";

const NOW = Date.UTC(2026, 10, 9, 8, 30);

const VIEW = { west: 2.2, south: 48.8, east: 2.5, north: 48.95 };

describe("queryWindow", () => {
  it("covers the view with a margin, on a grid, so small pans fall inside it", () => {
    const window = queryWindow(VIEW);
    expect(window.west).toBeLessThanOrEqual(VIEW.west);
    expect(window.south).toBeLessThanOrEqual(VIEW.south);
    expect(window.east).toBeGreaterThanOrEqual(VIEW.east);
    expect(window.north).toBeGreaterThanOrEqual(VIEW.north);
    // A small pan of the view stays inside the window.
    expect(window.west).toBeLessThan(VIEW.west - 0.03);
    expect(window.east).toBeGreaterThan(VIEW.east + 0.03);
  });

  it("gives the same window for views a few pixels apart", () => {
    const nudged = {
      west: VIEW.west + 0.001,
      south: VIEW.south - 0.001,
      east: VIEW.east + 0.001,
      north: VIEW.north - 0.001,
    };
    expect(queryWindow(nudged)).toEqual(queryWindow(VIEW));
  });

  it("clamps to the latitudes and longitudes a map has", () => {
    expect(
      queryWindow({ west: -190, south: -90, east: 200, north: 90 }),
    ).toEqual({ west: -180, south: -85, east: 180, north: 85 });
  });

  it("rounds away floating point noise", () => {
    const window = queryWindow(VIEW);
    for (const value of Object.values(window)) {
      expect(Number(value.toFixed(5))).toBe(value);
    }
  });

  it("handles a zero-size view", () => {
    const window = queryWindow({ west: 10, south: 20, east: 10, north: 20 });
    expect(window.west).toBeLessThanOrEqual(10);
    expect(window.east).toBeGreaterThanOrEqual(10);
    expect(window.north).toBeGreaterThanOrEqual(20);
  });
});

describe("nextQueryWindow", () => {
  it("keeps the last window while the view stays inside it and is not much smaller", () => {
    const first = nextQueryWindow(null, VIEW);
    const panned = {
      west: VIEW.west + 0.02,
      south: VIEW.south,
      east: VIEW.east + 0.02,
      north: VIEW.north,
    };
    expect(nextQueryWindow(first, panned)).toBe(first);
  });

  it("takes a new window when the view leaves the last one", () => {
    const first = nextQueryWindow(null, VIEW);
    const moved = { west: 5, south: 48.8, east: 5.3, north: 48.95 };
    const next = nextQueryWindow(first, moved);
    expect(next).not.toBe(first);
    expect(next.west).toBeLessThanOrEqual(5);
  });

  it("takes a smaller window after zooming in far enough, so fewer features are asked for", () => {
    const first = nextQueryWindow(null, VIEW);
    const zoomed = {
      west: 2.3,
      south: 48.85,
      east: 2.34,
      north: 48.87,
    };
    const next = nextQueryWindow(first, zoomed);
    expect(next.east - next.west).toBeLessThan(first.east - first.west);
  });

  it("keeps the window after a small zoom in", () => {
    const first = nextQueryWindow(null, VIEW);
    const slightly = {
      west: 2.25,
      south: 48.83,
      east: 2.45,
      north: 48.92,
    };
    expect(nextQueryWindow(first, slightly)).toBe(first);
  });
});

describe("feedUrl for a query layer", () => {
  it("fills the box and a limit one above the cap", () => {
    expect(
      feedUrl(SAMPLE_QUERY_LAYER, {}, NOW, {
        west: 2.2,
        south: 48.8,
        east: 2.5,
        north: 48.95,
      }),
    ).toBe("https://query.test/items?bbox=2.2,48.8,2.5,48.95&limit=4");
  });

  it("needs a window, and a feed layer ignores one", () => {
    expect(() => feedUrl(SAMPLE_QUERY_LAYER, {}, NOW)).toThrow(/area/);
    expect(
      feedUrl(SAMPLE_FEED_LAYER, {}, NOW, {
        west: 0,
        south: 0,
        east: 1,
        north: 1,
      }),
    ).toBe("https://sample.test/feed/big_day.json");
  });
});
