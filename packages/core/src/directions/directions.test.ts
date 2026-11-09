import { describe, expect, it } from "vitest";
import type { ReachableAreaFeature, RouteLeg } from "../ports/routing";
import {
  AREA_MINUTES,
  addStop,
  canAddStop,
  type DirectionStop,
  describeStop,
  MAX_DIRECTION_STOPS,
  moveStop,
  reachableAreaSize,
  removeStop,
  routeBounds,
  routingErrorMessage,
  stopLetter,
  TRAVEL_MODES,
  travelModeLabel,
} from "./directions";

const PARIS = { lat: 48.8566, lng: 2.3522 };
const BERLIN = { lat: 52.52, lng: 13.405 };

function stop(id: string, position = PARIS, label?: string): DirectionStop {
  return label === undefined ? { id, position } : { id, position, label };
}

describe("stop list", () => {
  it("adds a stop at the end without changing the list it was given", () => {
    const before = [stop("a")];
    const after = addStop(before, stop("b", BERLIN));
    expect(after.map((item) => item.id)).toEqual(["a", "b"]);
    expect(before).toHaveLength(1);
  });

  it("refuses a stop past the maximum and says so", () => {
    let stops: readonly DirectionStop[] = [];
    for (let index = 0; index < MAX_DIRECTION_STOPS; index += 1) {
      expect(canAddStop(stops)).toBe(true);
      stops = addStop(stops, stop(`s${index}`));
    }
    expect(canAddStop(stops)).toBe(false);
    expect(addStop(stops, stop("extra"))).toBe(stops);
  });

  it("removes a stop by id and ignores an unknown id", () => {
    const stops = [stop("a"), stop("b"), stop("c")];
    expect(removeStop(stops, "b").map((item) => item.id)).toEqual(["a", "c"]);
    expect(removeStop(stops, "zzz")).toBe(stops);
  });

  it("moves a stop up or down one place", () => {
    const stops = [stop("a"), stop("b"), stop("c")];
    expect(moveStop(stops, "b", -1).map((item) => item.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(moveStop(stops, "b", 1).map((item) => item.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("leaves the list alone when a stop cannot move that way", () => {
    const stops = [stop("a"), stop("b")];
    expect(moveStop(stops, "a", -1)).toBe(stops);
    expect(moveStop(stops, "b", 1)).toBe(stops);
    expect(moveStop(stops, "zzz", 1)).toBe(stops);
  });
});

describe("naming stops", () => {
  it("letters stops from A", () => {
    expect(stopLetter(0)).toBe("A");
    expect(stopLetter(1)).toBe("B");
    expect(stopLetter(9)).toBe("J");
  });

  it("describes a stop by its label, or by its coordinates when it has none", () => {
    expect(describeStop(0, stop("a", PARIS, "Paris"))).toBe("Stop A, Paris");
    expect(describeStop(1, stop("b", BERLIN))).toBe(
      "Stop B, 52.52000, 13.40500",
    );
  });
});

describe("travel modes", () => {
  it("offers drive, walk and cycle with names for each", () => {
    expect(TRAVEL_MODES).toEqual(["drive", "walk", "cycle"]);
    expect(TRAVEL_MODES.map(travelModeLabel)).toEqual([
      "Drive",
      "Walk",
      "Cycle",
    ]);
  });

  it("offers four travel times for an area", () => {
    expect(AREA_MINUTES).toEqual([5, 10, 15, 30]);
  });
});

describe("route bounds", () => {
  const legs: RouteLeg[] = [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [2.35, 48.85],
          [4.4, 50.85],
        ],
      },
      properties: { distance: 1, duration: 1 },
    },
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [4.4, 50.85],
          [13.4, 52.5],
        ],
      },
      properties: { distance: 1, duration: 1 },
    },
  ];

  it("covers every leg", () => {
    expect(routeBounds(legs)).toEqual({
      south: 48.85,
      west: 2.35,
      north: 52.5,
      east: 13.4,
    });
  });

  it("copes with a very long line without spreading it into arguments", () => {
    const coordinates = Array.from({ length: 300_000 }, (_, index) => [
      index / 10_000,
      index / 20_000,
    ]);
    const bounds = routeBounds([
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: { distance: 1, duration: 1 },
      },
    ]);
    expect(bounds?.west).toBe(0);
    expect(bounds?.north).toBeCloseTo(14.99995, 5);
  });

  it("is null when there is nothing to cover", () => {
    expect(routeBounds([])).toBeNull();
  });

  it("covers the rings of an area", () => {
    const area: ReachableAreaFeature = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [2, 48],
            [3, 48],
            [3, 49],
            [2, 48],
          ],
        ],
      },
      properties: { minutes: 10 },
    };
    expect(routeBounds([area])).toEqual({
      south: 48,
      west: 2,
      north: 49,
      east: 3,
    });
  });

  it("covers every polygon of a multipolygon", () => {
    const area: ReachableAreaFeature = {
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
          [
            [
              [5, 5],
              [6, 5],
              [6, 6],
              [5, 5],
            ],
          ],
        ],
      },
      properties: { minutes: 10 },
    };
    expect(routeBounds([area])).toEqual({
      south: 0,
      west: 0,
      north: 6,
      east: 6,
    });
  });
});

describe("reachable area size", () => {
  it("sums the area of every polygon, in square metres", () => {
    const square: ReachableAreaFeature = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [0.01, 0],
            [0.01, 0.01],
            [0, 0.01],
            [0, 0],
          ],
        ],
      },
      properties: { minutes: 5 },
    };
    const one = reachableAreaSize([square]);
    expect(one).toBeGreaterThan(1_200_000);
    expect(one).toBeLessThan(1_300_000);
    expect(reachableAreaSize([square, square])).toBeCloseTo(one * 2, 3);
    expect(reachableAreaSize([])).toBe(0);
  });
});

describe("routing error messages", () => {
  it("says what happened and what to do next for each failure", () => {
    expect(routingErrorMessage("network", "route")).toMatch(
      /could not be reached.*offline/i,
    );
    expect(routingErrorMessage("rate-limited", "route")).toMatch(/busy/i);
    expect(routingErrorMessage("invalid", "route")).toMatch(/move/i);
    expect(routingErrorMessage("unsupported", "area")).toMatch(/another/i);
  });

  it("words a missing result for the route or the area", () => {
    expect(routingErrorMessage("no-route", "route")).toMatch(/No route/);
    expect(routingErrorMessage("no-route", "area")).toMatch(/Nothing/);
  });

  it("has a message for every kind that reaches a person", () => {
    for (const kind of [
      "network",
      "invalid",
      "no-route",
      "rate-limited",
      "unsupported",
    ] as const) {
      expect(routingErrorMessage(kind, "route").length).toBeGreaterThan(10);
    }
  });
});
