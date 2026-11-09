import {
  announceMeasureTotal,
  formatArea,
  formatDistance,
  type LatLng,
  measureLineDistance,
  measurePolygonArea,
  type UnitSystem,
} from "@karta/core";
import { useLatestRef } from "@karta/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAnnounce } from "../../ui/LiveRegion";

/** What is being measured. */
export type MeasureMode = "distance" | "area";

/** How long the points must stay still before the total is announced. */
export const MEASURE_ANNOUNCE_DELAY_MS = 800;

/** What {@link useMeasure} returns. */
export interface UseMeasure {
  readonly mode: MeasureMode;
  /** The vertices, in the order they were added. */
  readonly points: readonly LatLng[];
  /**
   * The total in metres (`distance`) or square metres (`area`), measured
   * along the geodesic. `null` until there are enough points: two for a
   * distance, three for an area.
   */
  readonly total: number | null;
  /** The total as text in the chosen units, for example "1.25 km". "0 m" or "0 m²" until there are enough points. */
  readonly readout: string;
  /** Adds a vertex at the end. */
  readonly addPoint: (point: LatLng) => void;
  /** Moves the vertex at `index`, for example while it is dragged. Out-of-range indexes are ignored. */
  readonly movePoint: (index: number, point: LatLng) => void;
  /** Removes the last vertex. Does nothing with no points. */
  readonly undo: () => void;
  /** Removes every vertex. */
  readonly clear: () => void;
  /** Switches between distance and area, keeping the points. */
  readonly setMode: (mode: MeasureMode) => void;
}

/**
 * The state of one measurement: the points the user has placed, the mode and
 * the total, worked out with the core geodesic maths (WGS 84, not flat
 * pixels).
 *
 * The total is announced through the app-wide announcer only after the points
 * have been still for {@link MEASURE_ANNOUNCE_DELAY_MS}, so adding points in
 * quick succession or dragging a vertex gives one announcement at the end,
 * not one per change. Nothing is announced before there is a total.
 * @param units - The unit system for the readout and the announcement.
 */
export function useMeasure(units: UnitSystem): UseMeasure {
  const announce = useAnnounce();
  const announceRef = useLatestRef(announce);
  const [mode, setModeState] = useState<MeasureMode>("distance");
  const [points, setPoints] = useState<readonly LatLng[]>([]);

  const total = useMemo(() => {
    // The maths takes [longitude, latitude], the reverse of LatLng.
    const positions = points.map((point) => [point.lng, point.lat]);
    if (mode === "distance") {
      const kilometres = measureLineDistance(positions);
      return kilometres === null ? null : kilometres * 1000;
    }
    return measurePolygonArea(positions);
  }, [mode, points]);

  const readout =
    mode === "distance"
      ? formatDistance(total ?? 0, units)
      : formatArea(total ?? 0, units);

  useEffect(() => {
    if (total === null) {
      return;
    }
    const timer = setTimeout(() => {
      announceRef.current(announceMeasureTotal(mode, total, units));
    }, MEASURE_ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mode, total, units, announceRef]);

  const addPoint = useCallback((point: LatLng) => {
    setPoints((current) => [...current, point]);
  }, []);

  const movePoint = useCallback((index: number, point: LatLng) => {
    setPoints((current) =>
      index < 0 || index >= current.length
        ? current
        : current.map((existing, at) => (at === index ? point : existing)),
    );
  }, []);

  const undo = useCallback(() => {
    setPoints((current) =>
      current.length === 0 ? current : current.slice(0, -1),
    );
  }, []);

  const clear = useCallback(() => {
    setPoints((current) => (current.length === 0 ? current : []));
  }, []);

  const setMode = useCallback((next: MeasureMode) => {
    setModeState(next);
  }, []);

  return {
    mode,
    points,
    total,
    readout,
    addPoint,
    movePoint,
    undo,
    clear,
    setMode,
  };
}
