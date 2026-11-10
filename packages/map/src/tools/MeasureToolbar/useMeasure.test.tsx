import type { LatLng, UnitSystem } from "@mapcairn/core";
import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { MEASURE_ANNOUNCE_DELAY_MS, useMeasure } from "./useMeasure";

const wrapper = ({ children }: { children: ReactNode }) => (
  <LiveRegionProvider>{children}</LiveRegionProvider>
);

function setup(units: UnitSystem = "metric") {
  return renderHook(({ unit }: { unit: UnitSystem }) => useMeasure(unit), {
    wrapper,
    initialProps: { unit: units },
  });
}

const polite = () => screen.getByTestId("live-region-polite").textContent;

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const ORIGIN: LatLng = { lat: 0, lng: 0 };
/** One degree of longitude on the equator, about 111.2 km. */
const ONE_DEGREE_EAST: LatLng = { lat: 0, lng: 1 };

function addAll(
  result: { current: ReturnType<typeof useMeasure> },
  points: readonly LatLng[],
) {
  for (const point of points) {
    act(() => result.current.addPoint(point));
  }
}

describe("useMeasure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("state", () => {
    it("starts empty in distance mode with a zero readout", () => {
      const { result } = setup();
      expect(result.current.mode).toBe("distance");
      expect(result.current.points).toEqual([]);
      expect(result.current.total).toBeNull();
      expect(result.current.readout).toBe("0 m");
    });

    it("adds points in order", () => {
      const { result } = setup();
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      expect(result.current.points).toEqual([ORIGIN, ONE_DEGREE_EAST]);
    });

    it("undo removes the last point, and does nothing when empty", () => {
      const { result } = setup();
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      act(() => result.current.undo());
      expect(result.current.points).toEqual([ORIGIN]);
      act(() => result.current.undo());
      const empty = result.current.points;
      act(() => result.current.undo());
      expect(result.current.points).toBe(empty);
      expect(result.current.points).toEqual([]);
    });

    it("clear removes every point, and keeps the same empty list when already empty", () => {
      const { result } = setup();
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      act(() => result.current.clear());
      expect(result.current.points).toEqual([]);
      const empty = result.current.points;
      act(() => result.current.clear());
      expect(result.current.points).toBe(empty);
    });

    it("moves one point and ignores an index out of range", () => {
      const { result } = setup();
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      const moved = { lat: 1, lng: 1 };
      act(() => result.current.movePoint(1, moved));
      expect(result.current.points).toEqual([ORIGIN, moved]);
      const before = result.current.points;
      act(() => result.current.movePoint(5, moved));
      act(() => result.current.movePoint(-1, moved));
      expect(result.current.points).toBe(before);
    });

    it("switches mode and keeps the points", () => {
      const { result } = setup();
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      act(() => result.current.setMode("area"));
      expect(result.current.mode).toBe("area");
      expect(result.current.points).toHaveLength(2);
    });
  });

  describe("distance", () => {
    it("has no total for a single point", () => {
      const { result } = setup();
      addAll(result, [ORIGIN]);
      expect(result.current.total).toBeNull();
      expect(result.current.readout).toBe("0 m");
    });

    it("measures metres along the geodesic", () => {
      const { result } = setup();
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      expect(result.current.total).toBeGreaterThan(111_000);
      expect(result.current.total).toBeLessThan(111_400);
      expect(result.current.readout).toBe("111 km");
    });

    it("sums every segment", () => {
      const { result } = setup();
      addAll(result, [ORIGIN, ONE_DEGREE_EAST, { lat: 0, lng: 2 }]);
      expect(result.current.total).toBeGreaterThan(222_000);
      expect(result.current.total).toBeLessThan(222_800);
    });

    it("reads latitude and longitude the right way round", () => {
      const { result } = setup();
      // One degree east at 60 degrees north is about half as long as one
      // degree north. Swapping the axes would reverse the two answers.
      addAll(result, [
        { lat: 60, lng: 0 },
        { lat: 60, lng: 1 },
      ]);
      const east = result.current.total ?? 0;
      act(() => result.current.clear());
      addAll(result, [
        { lat: 60, lng: 0 },
        { lat: 61, lng: 0 },
      ]);
      const north = result.current.total ?? 0;
      expect(east).toBeGreaterThan(55_000);
      expect(east).toBeLessThan(56_500);
      expect(north).toBeGreaterThan(111_000);
      expect(north).toBeLessThan(111_400);
    });

    it("shows short distances in metres", () => {
      const { result } = setup();
      addAll(result, [ORIGIN, { lat: 0, lng: 0.001 }]);
      expect(result.current.readout).toBe("111 m");
    });

    it("uses imperial units when asked", () => {
      const { result } = setup("imperial");
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      expect(result.current.readout).toBe("69.1 mi");
    });

    it("follows the units when they change", () => {
      const { result, rerender } = setup("metric");
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      rerender({ unit: "imperial" });
      expect(result.current.readout).toBe("69.1 mi");
    });

    it("updates the total as a point is undone", () => {
      const { result } = setup();
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      act(() => result.current.undo());
      expect(result.current.total).toBeNull();
      expect(result.current.readout).toBe("0 m");
    });
  });

  describe("area", () => {
    const TRIANGLE: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.01 },
      { lat: 0.01, lng: 0 },
    ];

    it("needs three points", () => {
      const { result } = setup();
      act(() => result.current.setMode("area"));
      addAll(result, TRIANGLE.slice(0, 2));
      expect(result.current.total).toBeNull();
      expect(result.current.readout).toBe("0 m²");
    });

    it("measures square metres, closing the ring itself", () => {
      const { result } = setup();
      act(() => result.current.setMode("area"));
      addAll(result, TRIANGLE);
      // Half of a 0.01 degree square at the equator, about 1.236 km².
      expect(result.current.total).toBeGreaterThan(600_000);
      expect(result.current.total).toBeLessThan(640_000);
      expect(result.current.readout).toBe("61.8 ha");
    });

    it("gives a different total in each mode for the same points", () => {
      const { result } = setup();
      addAll(result, TRIANGLE);
      const length = result.current.total;
      act(() => result.current.setMode("area"));
      expect(result.current.total).not.toBe(length);
    });

    it("uses imperial units when asked", () => {
      const { result } = setup("imperial");
      act(() => result.current.setMode("area"));
      addAll(result, TRIANGLE);
      expect(result.current.readout).toBe("153 ac");
    });
  });

  describe("announcements", () => {
    it("announces the total only after the points have been still", async () => {
      const { result } = setup();
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      await advance(MEASURE_ANNOUNCE_DELAY_MS - 1);
      expect(polite()).toBe("");
      await advance(1);
      expect(polite()).toBe("Total distance 111 kilometres");
    });

    it("announces nothing before there is a total", async () => {
      const { result } = setup();
      addAll(result, [ORIGIN]);
      await advance(5000);
      expect(polite()).toBe("");
    });

    it("announces once at the end of a run of changes, not on every one", async () => {
      const { result } = setup();
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      await advance(MEASURE_ANNOUNCE_DELAY_MS);
      expect(polite()).toBe("Total distance 111 kilometres");
      // Drag the second vertex every 300ms for two seconds.
      for (let step = 1; step <= 6; step += 1) {
        act(() => result.current.movePoint(1, { lat: 0, lng: 1 + step * 0.1 }));
        await advance(300);
        expect(polite()).toBe("Total distance 111 kilometres");
      }
      await advance(MEASURE_ANNOUNCE_DELAY_MS);
      expect(polite()).toBe("Total distance 178 kilometres");
    });

    it("does not announce a total that was undone before the pause ended", async () => {
      const { result } = setup();
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      await advance(400);
      act(() => result.current.undo());
      await advance(5000);
      expect(polite()).toBe("");
    });

    it("announces the total again when the mode changes", async () => {
      const { result } = setup();
      addAll(result, [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.01 },
        { lat: 0.01, lng: 0 },
      ]);
      await advance(MEASURE_ANNOUNCE_DELAY_MS);
      expect(polite()).toMatch(/^Total distance /);
      act(() => result.current.setMode("area"));
      await advance(MEASURE_ANNOUNCE_DELAY_MS);
      expect(polite()).toBe("Total area 61.8 hectares");
    });

    it("says the unit in the chosen system", async () => {
      const { result } = setup("imperial");
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      await advance(MEASURE_ANNOUNCE_DELAY_MS);
      expect(polite()).toBe("Total distance 69.1 miles");
    });

    it("stops a pending announcement on unmount", async () => {
      const { result, unmount } = setup();
      addAll(result, [ORIGIN, ONE_DEGREE_EAST]);
      unmount();
      await vi.advanceTimersByTimeAsync(5000);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
