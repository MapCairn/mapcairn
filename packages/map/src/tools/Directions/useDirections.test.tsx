// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  MAX_DIRECTION_STOPS,
  type ReachableAreaResult,
  type RouteResult,
  RoutingError,
  type Services,
} from "@mapcairn/core";
import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { CLEAR_MS, THROTTLE_MS } from "../../ui/LiveRegion/announcer";
import { useDirections } from "./useDirections";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const PARIS = { lat: 48.8566, lng: 2.3522 };
const BERLIN = { lat: 52.52, lng: 13.405 };
const ROME = { lat: 41.9028, lng: 12.4964 };

function setup(overrides: Partial<Services> = {}) {
  const services = createFakeServices(overrides);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>
      <LiveRegionProvider>{children}</LiveRegionProvider>
    </ServicesProvider>
  );
  const view = renderHook(() => useDirections("metric"), { wrapper });
  return { ...view, services };
}

/** Lets the announcer's throttle window pass, then reads one live region. */
async function said(testId: string) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(THROTTLE_MS + CLEAR_MS + 10);
  });
  return screen.getByTestId(testId).textContent;
}
const polite = () => said("live-region-polite");
const assertive = () => said("live-region-assertive");

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function withTwoStops(overrides: Partial<Services> = {}) {
  const setupResult = setup(overrides);
  act(() => setupResult.result.current.addStop(PARIS, "Paris"));
  act(() => setupResult.result.current.addStop(BERLIN));
  return setupResult;
}

describe("availability", () => {
  it("is available when the host provides a routing service", () => {
    expect(setup().result.current.available).toBe(true);
  });

  it("is unavailable without one, and asking for a route does nothing", () => {
    const { result } = setup({ routing: undefined });
    expect(result.current.available).toBe(false);
    act(() => result.current.addStop(PARIS));
    act(() => result.current.addStop(BERLIN));
    act(() => result.current.requestRoute());
    expect(result.current.state).toEqual({ status: "idle" });
  });
});

describe("stops", () => {
  it("adds stops in order with ids and optional labels, and announces each", async () => {
    const { result } = setup();
    act(() => result.current.addStop(PARIS, "Paris"));
    expect(await polite()).toBe("Stop A added, 1 stop");
    act(() => result.current.addStop(BERLIN));
    expect(await polite()).toBe("Stop B added, 2 stops");
    expect(result.current.stops.map((stop) => stop.position)).toEqual([
      PARIS,
      BERLIN,
    ]);
    expect(result.current.stops[0]?.label).toBe("Paris");
    expect(result.current.stops[1]?.label).toBeUndefined();
    expect(new Set(result.current.stops.map((stop) => stop.id)).size).toBe(2);
  });

  it("refuses stops past the maximum and says why", async () => {
    const { result } = setup();
    for (let index = 0; index < MAX_DIRECTION_STOPS; index += 1) {
      act(() => result.current.addStop({ lat: index, lng: index }));
    }
    expect(result.current.canAddStop).toBe(false);
    act(() => result.current.addStop(PARIS));
    expect(result.current.stops).toHaveLength(MAX_DIRECTION_STOPS);
    expect(await polite()).toBe(
      `You can add up to ${MAX_DIRECTION_STOPS} stops. Remove one to add another.`,
    );
  });

  it("removes and moves stops and announces both", async () => {
    const { result } = withTwoStops();
    const second = result.current.stops[1]?.id ?? "";
    act(() => result.current.moveStop(second, -1));
    expect(result.current.stops[0]?.position).toEqual(BERLIN);
    expect(await polite()).toBe("Stop moved to position 1 of 2, now stop A");
    act(() => result.current.removeStop(second));
    expect(result.current.stops).toHaveLength(1);
    expect(await polite()).toBe("Stop A removed");
  });

  it("ignores moving or removing a stop that is not there", () => {
    const { result } = withTwoStops();
    const before = result.current.stops;
    act(() => result.current.moveStop("nope", 1));
    act(() => result.current.removeStop("nope"));
    expect(result.current.stops).toBe(before);
  });

  it("takes two stops added in the same tick", () => {
    const { result } = setup();
    act(() => {
      result.current.addStop(PARIS);
      result.current.addStop(BERLIN);
    });
    expect(result.current.stops).toHaveLength(2);
  });
});

describe("getting a route", () => {
  it("needs two stops", () => {
    const { result, services } = setup();
    act(() => result.current.addStop(PARIS));
    act(() => result.current.requestRoute());
    expect(result.current.state.status).toBe("idle");
    expect(services.fakes.routing.routeCalls).toHaveLength(0);
  });

  it("asks the service for the stops and mode, shows the result and announces it", async () => {
    const { result, services } = withTwoStops();
    act(() => result.current.setMode("walk"));
    act(() => result.current.requestRoute());
    expect(result.current.state).toEqual({
      status: "loading",
      request: "route",
    });
    await flush();
    expect(services.fakes.routing.routeCalls).toHaveLength(1);
    expect(services.fakes.routing.routeCalls[0]).toMatchObject({
      stops: [PARIS, BERLIN],
      mode: "walk",
    });
    const state = result.current.state;
    expect(state.status).toBe("done");
    expect(result.current.result?.kind).toBe("route");
    expect(await polite()).toMatch(/^Route found, .+ walking$/);
  });

  it("keeps each leg, with the totals", async () => {
    const { result, services } = withTwoStops();
    const route: RouteResult = {
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [2.35, 48.85],
              [13.4, 52.5],
            ],
          },
          properties: { distance: 1050_000, duration: 36_000 },
        },
      ],
      distance: 1050_000,
      duration: 36_000,
    };
    services.fakes.routing.setRoute(route);
    act(() => result.current.requestRoute());
    await flush();
    expect(result.current.result).toMatchObject({
      kind: "route",
      distance: 1050_000,
      duration: 36_000,
      mode: "drive",
    });
  });

  it("goes back to idle when a stop or the mode changes, because the result is stale", async () => {
    const { result } = withTwoStops();
    act(() => result.current.requestRoute());
    await flush();
    expect(result.current.state.status).toBe("done");
    act(() => result.current.setMode("cycle"));
    expect(result.current.state).toEqual({ status: "idle" });
    act(() => result.current.requestRoute());
    await flush();
    act(() => result.current.addStop(ROME));
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("keeps a result when the mode is chosen again", async () => {
    const { result } = withTwoStops();
    act(() => result.current.requestRoute());
    await flush();
    act(() => result.current.setMode("drive"));
    expect(result.current.state.status).toBe("done");
  });

  it("cancels a request that is still running, and ignores its late answer", async () => {
    const { result, services } = withTwoStops();
    const held = services.fakes.routing.holdNextRoute();
    act(() => result.current.requestRoute());
    act(() => result.current.cancel());
    expect(result.current.state).toEqual({ status: "idle" });
    expect(await polite()).toBe("Cancelled");
    await act(async () => {
      held.resolve({ features: [], distance: 1, duration: 1 });
      await Promise.resolve();
    });
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("drops a request when a stop changes while it runs", async () => {
    const { result, services } = withTwoStops();
    const held = services.fakes.routing.holdNextRoute();
    act(() => result.current.requestRoute());
    act(() => result.current.addStop(ROME));
    await act(async () => {
      held.resolve({ features: [], distance: 1, duration: 1 });
      await Promise.resolve();
    });
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("lets a newer request replace one still running", async () => {
    const { result, services } = withTwoStops();
    const first = services.fakes.routing.holdNextRoute();
    act(() => result.current.requestRoute());
    act(() => result.current.requestRoute());
    await act(async () => {
      first.resolve({ features: [], distance: 1, duration: 1 });
      await Promise.resolve();
    });
    expect(result.current.result?.kind === "route").toBe(true);
    expect(
      result.current.result?.kind === "route" && result.current.result.distance,
    ).not.toBe(1);
  });

  it.each([
    ["network", /could not be reached/],
    ["rate-limited", /busy/],
    ["no-route", /No route was found/],
    ["invalid", /could not use those stops/],
    ["unsupported", /not available/],
  ] as const)("shows a %s failure and announces it", async (kind, text) => {
    const { result, services } = withTwoStops();
    services.fakes.routing.failWith(kind);
    act(() => result.current.requestRoute());
    await flush();
    expect(result.current.state).toEqual({
      status: "error",
      request: "route",
      kind,
    });
    expect(await assertive()).toMatch(text);
  });

  it("treats an unexpected failure as a network failure", async () => {
    const { result, services } = withTwoStops();
    const held = services.fakes.routing.holdNextRoute();
    act(() => result.current.requestRoute());
    await act(async () => {
      held.reject(new Error("boom"));
      await Promise.resolve();
    });
    expect(result.current.state).toMatchObject({
      status: "error",
      kind: "network",
    });
  });

  it("goes quiet, with no error, when the service reports an abort nobody asked for", async () => {
    const { result, services } = withTwoStops();
    const held = services.fakes.routing.holdNextRoute();
    act(() => result.current.requestRoute());
    await act(async () => {
      held.reject(new RoutingError("aborted"));
      await Promise.resolve();
    });
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("does nothing when there is no request to cancel", () => {
    const { result } = withTwoStops();
    act(() => result.current.cancel());
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("retries the same request after a failure", async () => {
    const { result, services } = withTwoStops();
    services.fakes.routing.failWith("rate-limited");
    act(() => result.current.requestRoute());
    await flush();
    services.fakes.routing.clearFailure();
    act(() => result.current.retry());
    await flush();
    expect(result.current.state.status).toBe("done");
    expect(services.fakes.routing.routeCalls).toHaveLength(2);
  });

  it("does nothing on retry when no request has failed", () => {
    const { result, services } = withTwoStops();
    act(() => result.current.retry());
    expect(services.fakes.routing.routeCalls).toHaveLength(0);
  });
});

describe("travel time area", () => {
  it("asks for an area around the first stop and reports its size", async () => {
    const { result, services } = withTwoStops();
    act(() => result.current.requestArea(15));
    expect(result.current.state).toEqual({
      status: "loading",
      request: "area",
      minutes: 15,
    });
    await flush();
    expect(services.fakes.routing.reachableAreaCalls[0]).toMatchObject({
      origin: PARIS,
      minutes: 15,
      mode: "drive",
    });
    const shown = result.current.result;
    expect(shown?.kind).toBe("area");
    expect(shown?.kind === "area" && shown.size).toBeGreaterThan(0);
    expect(await polite()).toMatch(
      /^Area reachable within 15 minutes driving found, covering /,
    );
  });

  it("needs a first stop", () => {
    const { result } = setup();
    act(() => result.current.requestArea(10));
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("replaces a route on the map and is replaced by the next route", async () => {
    const { result } = withTwoStops();
    act(() => result.current.requestRoute());
    await flush();
    act(() => result.current.requestArea(5));
    await flush();
    expect(result.current.result?.kind).toBe("area");
    act(() => result.current.requestRoute());
    await flush();
    expect(result.current.result?.kind).toBe("route");
  });

  it("keeps an area for another time out of the way once the stops change", async () => {
    const { result } = withTwoStops();
    act(() => result.current.requestArea(5));
    await flush();
    act(() => result.current.removeStop(result.current.stops[1]?.id ?? ""));
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("words a missing area for the area, and retries it with the same minutes", async () => {
    const { result, services } = withTwoStops();
    services.fakes.routing.failWith("no-route");
    act(() => result.current.requestArea(30));
    await flush();
    expect(result.current.state).toEqual({
      status: "error",
      request: "area",
      kind: "no-route",
    });
    expect(await assertive()).toMatch(/Nothing is reachable/);
    services.fakes.routing.clearFailure();
    const area: ReachableAreaResult = {
      features: [
        {
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
          properties: { minutes: 30 },
        },
      ],
    };
    services.fakes.routing.setReachableArea(area);
    act(() => result.current.retry());
    await flush();
    expect(result.current.result).toMatchObject({ kind: "area", minutes: 30 });
  });
});

describe("clearing", () => {
  it("removes the stops and the result and says so", async () => {
    const { result } = withTwoStops();
    act(() => result.current.requestRoute());
    await flush();
    act(() => result.current.clear());
    expect(result.current.stops).toEqual([]);
    expect(result.current.state).toEqual({ status: "idle" });
    expect(await polite()).toBe("Directions cleared");
  });

  it("stops a request that is running", async () => {
    const { result, services } = withTwoStops();
    const held = services.fakes.routing.holdNextRoute();
    act(() => result.current.requestRoute());
    act(() => result.current.clear());
    await act(async () => {
      held.resolve({ features: [], distance: 1, duration: 1 });
      await Promise.resolve();
    });
    expect(result.current.state).toEqual({ status: "idle" });
  });
});
