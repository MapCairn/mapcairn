import { describe, expect, it } from "vitest";
import {
  type RoutingProviderSubject,
  runRoutingProviderContract,
} from "../contracts/routingProvider.contract";
import { geometryArea, pointInPolygon } from "../geometry";
import { PortAbortError, RoutingError } from "../ports/errors";
import type {
  ReachableAreaResult,
  RouteResult,
  TravelMode,
} from "../ports/routing";
import { measureLineDistance } from "../spatial/measurement";
import { FakeRoutingProvider } from "./FakeRoutingProvider";

runRoutingProviderContract(
  "FakeRoutingProvider",
  (): RoutingProviderSubject => {
    const provider = new FakeRoutingProvider();
    return {
      provider,
      controls: {
        willReturnRoute: (result) => provider.setRoute(result),
        willReturnArea: (result) => provider.setReachableArea(result),
        willFail: (kind) => provider.failWith(kind),
        hold: () => {
          provider.holdNextRoute();
          provider.holdNextReachableArea();
        },
      },
    };
  },
);

const NAIROBI = { lat: -1.2921, lng: 36.8219 };
const WESTLANDS = { lat: -1.2676, lng: 36.8108 };
const KAREN = { lat: -1.3197, lng: 36.7076 };

const SCRIPTED_ROUTE: RouteResult = {
  features: [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [36.8219, -1.2921],
          [36.8108, -1.2676],
        ],
      },
      properties: { distance: 10, duration: 20 },
    },
  ],
  distance: 10,
  duration: 20,
};

const SCRIPTED_AREA: ReachableAreaResult = {
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
      properties: { minutes: 3 },
    },
  ],
};

describe("FakeRoutingProvider route", () => {
  it("draws a straight leg between each pair of stops", async () => {
    const provider = new FakeRoutingProvider();
    const result = await provider.route({
      stops: [NAIROBI, WESTLANDS, KAREN],
      mode: "drive",
    });
    expect(result.features).toHaveLength(2);
    expect(result.features[0]?.geometry.coordinates).toEqual([
      [NAIROBI.lng, NAIROBI.lat],
      [WESTLANDS.lng, WESTLANDS.lat],
    ]);
    expect(result.features[1]?.geometry.coordinates).toEqual([
      [WESTLANDS.lng, WESTLANDS.lat],
      [KAREN.lng, KAREN.lat],
    ]);
  });

  it("measures each leg in metres and totals them", async () => {
    const provider = new FakeRoutingProvider();
    const result = await provider.route({
      stops: [NAIROBI, WESTLANDS, KAREN],
      mode: "drive",
    });
    const first = result.features[0];
    const expected =
      (measureLineDistance([
        [NAIROBI.lng, NAIROBI.lat],
        [WESTLANDS.lng, WESTLANDS.lat],
      ]) ?? 0) * 1000;
    expect(first?.properties.distance).toBeCloseTo(expected, 6);
    const legs = result.features.reduce(
      (sum, leg) => sum + leg.properties.distance,
      0,
    );
    expect(result.distance).toBeCloseTo(legs, 6);
  });

  it("takes longer on foot than by bicycle than by car", async () => {
    const provider = new FakeRoutingProvider();
    const stops = [NAIROBI, KAREN];
    const durations: Record<TravelMode, number> = {
      drive: (await provider.route({ stops, mode: "drive" })).duration,
      cycle: (await provider.route({ stops, mode: "cycle" })).duration,
      walk: (await provider.route({ stops, mode: "walk" })).duration,
    };
    expect(durations.walk).toBeGreaterThan(durations.cycle);
    expect(durations.cycle).toBeGreaterThan(durations.drive);
    expect(durations.drive).toBeGreaterThan(0);
  });

  it("returns what it was told to, until told to stop", async () => {
    const provider = new FakeRoutingProvider();
    provider.setRoute(SCRIPTED_ROUTE);
    const stops = [NAIROBI, WESTLANDS];
    expect(await provider.route({ stops, mode: "walk" })).toBe(SCRIPTED_ROUTE);
    provider.setRoute(null);
    expect(
      (await provider.route({ stops, mode: "walk" })).features[0]?.properties
        .distance,
    ).toBeGreaterThan(1000);
  });

  it("rejects a mode it was told not to offer", async () => {
    const provider = new FakeRoutingProvider();
    provider.setSupportedModes(["walk"]);
    const stops = [NAIROBI, WESTLANDS];
    await provider.route({ stops, mode: "walk" });
    await expect(
      provider.route({ stops, mode: "drive" }),
    ).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("fails until the failure is cleared", async () => {
    const provider = new FakeRoutingProvider();
    const stops = [NAIROBI, WESTLANDS];
    provider.failWith("rate-limited");
    await expect(
      provider.route({ stops, mode: "walk" }),
    ).rejects.toBeInstanceOf(RoutingError);
    provider.clearFailure();
    expect(
      (await provider.route({ stops, mode: "walk" })).features,
    ).toHaveLength(1);
  });

  it("checks the request before it uses any script", async () => {
    const provider = new FakeRoutingProvider();
    provider.failWith("network");
    provider.holdNextRoute();
    await expect(
      provider.route({ stops: [NAIROBI], mode: "walk" }),
    ).rejects.toMatchObject({ kind: "invalid" });
  });

  it("holds a request until the handle resolves it", async () => {
    const provider = new FakeRoutingProvider();
    const held = provider.holdNextRoute();
    let settled = false;
    const pending = provider
      .route({ stops: [NAIROBI, WESTLANDS], mode: "walk" })
      .then((result) => {
        settled = true;
        return result;
      });
    await Promise.resolve();
    expect(settled).toBe(false);
    held.resolve(SCRIPTED_ROUTE);
    expect(await pending).toBe(SCRIPTED_ROUTE);
    const next = await provider.route({
      stops: [NAIROBI, WESTLANDS],
      mode: "walk",
    });
    expect(next).not.toBe(SCRIPTED_ROUTE);
  });

  it("holds a request until the handle rejects it, even before the call arrives", async () => {
    const provider = new FakeRoutingProvider();
    const held = provider.holdNextRoute();
    held.reject(new RoutingError("network"));
    await expect(
      provider.route({ stops: [NAIROBI, WESTLANDS], mode: "walk" }),
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("ignores the outcome of a held request that was aborted", async () => {
    const provider = new FakeRoutingProvider();
    const held = provider.holdNextRoute();
    const controller = new AbortController();
    const pending = provider.route({
      stops: [NAIROBI, WESTLANDS],
      mode: "walk",
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: "aborted" });
    held.resolve(SCRIPTED_ROUTE);
    expect(
      await provider.route({ stops: [NAIROBI, WESTLANDS], mode: "walk" }),
    ).not.toBe(SCRIPTED_ROUTE);
  });

  it("does not consume a hold for a request that is already aborted", async () => {
    const provider = new FakeRoutingProvider();
    const held = provider.holdNextRoute();
    await expect(
      provider.route({
        stops: [NAIROBI, WESTLANDS],
        mode: "walk",
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ kind: "aborted" });
    const pending = provider.route({
      stops: [NAIROBI, WESTLANDS],
      mode: "walk",
    });
    held.resolve(SCRIPTED_ROUTE);
    expect(await pending).toBe(SCRIPTED_ROUTE);
  });

  it("rejects with a RoutingError, not a PortAbortError, when aborted", async () => {
    const provider = new FakeRoutingProvider();
    const error = await provider
      .route({
        stops: [NAIROBI, WESTLANDS],
        mode: "walk",
        signal: AbortSignal.abort(),
      })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(RoutingError);
    expect(error).not.toBeInstanceOf(PortAbortError);
  });

  it("propagates a rejection from a held request that has a signal", async () => {
    const provider = new FakeRoutingProvider();
    const held = provider.holdNextRoute();
    const controller = new AbortController();
    const pending = provider.route({
      stops: [NAIROBI, WESTLANDS],
      mode: "walk",
      signal: controller.signal,
    });
    held.reject(new RoutingError("no-route"));
    await expect(pending).rejects.toMatchObject({ kind: "no-route" });
  });

  it("records every request", async () => {
    const provider = new FakeRoutingProvider();
    const request = { stops: [NAIROBI, WESTLANDS], mode: "cycle" } as const;
    await provider.route(request);
    expect(provider.routeCalls).toEqual([request]);
    expect(provider.reachableAreaCalls).toEqual([]);
  });
});

describe("FakeRoutingProvider reachableArea", () => {
  it("draws a ring around the origin that holds the origin", async () => {
    const provider = new FakeRoutingProvider();
    const result = await provider.reachableArea({
      origin: NAIROBI,
      minutes: 15,
      mode: "walk",
    });
    expect(result.features).toHaveLength(1);
    const [area] = result.features;
    expect(area?.properties.minutes).toBe(15);
    expect(
      pointInPolygon(NAIROBI, (area as NonNullable<typeof area>).geometry),
    ).toBe(true);
  });

  it("covers more ground for more minutes and for a faster mode", async () => {
    const provider = new FakeRoutingProvider();
    const areaOf = async (minutes: number, mode: TravelMode) => {
      const result = await provider.reachableArea({
        origin: NAIROBI,
        minutes,
        mode,
      });
      return geometryArea(
        (result.features[0] as NonNullable<(typeof result.features)[0]>)
          .geometry,
      );
    };
    expect(await areaOf(20, "walk")).toBeGreaterThan(await areaOf(10, "walk"));
    expect(await areaOf(10, "cycle")).toBeGreaterThan(await areaOf(10, "walk"));
    expect(await areaOf(10, "drive")).toBeGreaterThan(
      await areaOf(10, "cycle"),
    );
  });

  it("returns what it was told to, until told to stop", async () => {
    const provider = new FakeRoutingProvider();
    provider.setReachableArea(SCRIPTED_AREA);
    const request = { origin: NAIROBI, minutes: 5, mode: "walk" } as const;
    expect(await provider.reachableArea(request)).toBe(SCRIPTED_AREA);
    provider.setReachableArea(null);
    expect(await provider.reachableArea(request)).not.toBe(SCRIPTED_AREA);
  });

  it("rejects a mode it was told not to offer", async () => {
    const provider = new FakeRoutingProvider();
    provider.setSupportedModes(["drive"]);
    await expect(
      provider.reachableArea({ origin: NAIROBI, minutes: 5, mode: "walk" }),
    ).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("fails until the failure is cleared", async () => {
    const provider = new FakeRoutingProvider();
    provider.failWith("no-route");
    await expect(
      provider.reachableArea({ origin: NAIROBI, minutes: 5, mode: "walk" }),
    ).rejects.toMatchObject({ kind: "no-route" });
    provider.clearFailure();
    expect(
      (
        await provider.reachableArea({
          origin: NAIROBI,
          minutes: 5,
          mode: "walk",
        })
      ).features,
    ).toHaveLength(1);
  });

  it("holds a request until the handle settles it", async () => {
    const provider = new FakeRoutingProvider();
    const held = provider.holdNextReachableArea();
    const pending = provider.reachableArea({
      origin: NAIROBI,
      minutes: 5,
      mode: "walk",
    });
    held.resolve(SCRIPTED_AREA);
    expect(await pending).toBe(SCRIPTED_AREA);
  });

  it("does not let a route hold catch an area request", async () => {
    const provider = new FakeRoutingProvider();
    provider.holdNextRoute();
    expect(
      (
        await provider.reachableArea({
          origin: NAIROBI,
          minutes: 5,
          mode: "walk",
        })
      ).features,
    ).toHaveLength(1);
  });

  it("refuses an origin whose ring would cross the antimeridian", async () => {
    const provider = new FakeRoutingProvider();
    await expect(
      provider.reachableArea({
        origin: { lat: 0, lng: 179.9999 },
        minutes: 5,
        mode: "walk",
      }),
    ).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("says nothing is reachable when the ring collapses to nothing", async () => {
    const provider = new FakeRoutingProvider();
    await expect(
      provider.reachableArea({
        origin: NAIROBI,
        minutes: Number.MIN_VALUE,
        mode: "walk",
      }),
    ).rejects.toMatchObject({ kind: "no-route" });
  });

  it("records every request", async () => {
    const provider = new FakeRoutingProvider();
    const request = { origin: NAIROBI, minutes: 5, mode: "walk" } as const;
    await provider.reachableArea(request);
    expect(provider.reachableAreaCalls).toEqual([request]);
    expect(provider.routeCalls).toEqual([]);
  });
});
