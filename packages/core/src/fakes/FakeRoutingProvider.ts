// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { buffer, type GeometryError } from "../geometry";
import { RoutingError, type RoutingErrorKind } from "../ports/errors";
import type { LatLng } from "../ports/geometry";
import type {
  ReachableAreaRequest,
  ReachableAreaResult,
  RouteLeg,
  RouteRequest,
  RouteResult,
  RoutingProvider,
  TravelMode,
} from "../ports/routing";
import { measureLineDistance } from "../spatial/measurement";
import {
  abortable,
  createDeferred,
  type Deferred,
  type HeldCall,
} from "./internal";

/** The failures {@link FakeRoutingProvider.failWith} can script. */
export type FakeRoutingFailure = Exclude<RoutingErrorKind, "aborted">;

/** Handle for a route request held with {@link FakeRoutingProvider.holdNextRoute}. */
export type HeldRouteCall = HeldCall<RouteResult>;

/** Handle for an area request held with {@link FakeRoutingProvider.holdNextReachableArea}. */
export type HeldReachableAreaCall = HeldCall<ReachableAreaResult>;

/** Metres per second for each mode: 50, 15 and 5 kilometres an hour. */
const SPEEDS: Readonly<Record<TravelMode, number>> = {
  drive: 50 / 3.6,
  cycle: 15 / 3.6,
  walk: 5 / 3.6,
};

const ALL_MODES = Object.keys(SPEEDS) as TravelMode[];

function isOnGlobe(position: LatLng): boolean {
  return (
    Number.isFinite(position.lat) &&
    Number.isFinite(position.lng) &&
    Math.abs(position.lat) <= 90 &&
    Math.abs(position.lng) <= 180
  );
}

/**
 * A scripted {@link RoutingProvider} with no network and no timers.
 *
 * How to script it:
 * - With no script, `route` joins the stops with a straight line for each leg,
 *   measured in metres, and works out the time from a speed for the mode (50,
 *   15 and 5 kilometres an hour). `reachableArea` draws a ring around the
 *   origin as far as that speed goes in the minutes given.
 * - `setRoute(result)` and `setReachableArea(result)` answer every later
 *   request with that result; `null` goes back to the default.
 * - `setSupportedModes(modes)` makes any other mode reject as `unsupported`.
 * - `failWith(kind)` makes every request reject with a `RoutingError` until
 *   `clearFailure()`.
 * - `holdNextRoute()` and `holdNextReachableArea()` keep the next request of
 *   that kind pending until the returned handle resolves or rejects it. Holds
 *   queue in order.
 * - A request is checked first: fewer than two stops, a position off the
 *   globe or minutes that are not greater than zero reject as `invalid`, and
 *   a mode the fake does not offer rejects as `unsupported`. The check comes
 *   before any hold or failure, so a bad request never uses a script.
 * - Every request honours its `AbortSignal` by rejecting with a
 *   `RoutingError` of kind `aborted`.
 * - `routeCalls` and `reachableAreaCalls` record what the ui asked.
 */
export class FakeRoutingProvider implements RoutingProvider {
  readonly routeCalls: RouteRequest[] = [];
  readonly reachableAreaCalls: ReachableAreaRequest[] = [];

  #route: RouteResult | null = null;
  #area: ReachableAreaResult | null = null;
  #modes: readonly TravelMode[] = ALL_MODES;
  #failure: FakeRoutingFailure | null = null;
  readonly #routeHolds: Deferred<RouteResult>[] = [];
  readonly #areaHolds: Deferred<ReachableAreaResult>[] = [];

  /** Answers every later `route` with `result`. `null` restores the default. */
  setRoute(result: RouteResult | null): void {
    this.#route = result;
  }

  /** Answers every later `reachableArea` with `result`. `null` restores the default. */
  setReachableArea(result: ReachableAreaResult | null): void {
    this.#area = result;
  }

  /** Limits the modes the fake offers. Any other mode rejects as `unsupported`. */
  setSupportedModes(modes: readonly TravelMode[]): void {
    this.#modes = modes;
  }

  /** Makes every later request reject with a `RoutingError` of this kind. */
  failWith(kind: FakeRoutingFailure): void {
    this.#failure = kind;
  }

  /** Stops {@link FakeRoutingProvider.failWith} failing requests. */
  clearFailure(): void {
    this.#failure = null;
  }

  /** Holds the next `route` request until the handle settles it. */
  holdNextRoute(): HeldRouteCall {
    const deferred = createDeferred<RouteResult>();
    this.#routeHolds.push(deferred);
    return deferred;
  }

  /** Holds the next `reachableArea` request until the handle settles it. */
  holdNextReachableArea(): HeldReachableAreaCall {
    const deferred = createDeferred<ReachableAreaResult>();
    this.#areaHolds.push(deferred);
    return deferred;
  }

  route(request: RouteRequest): Promise<RouteResult> {
    this.routeCalls.push(request);
    return abortable(
      async () => {
        const { stops, mode } = request;
        if (stops.length < 2 || !stops.every(isOnGlobe)) {
          throw new RoutingError(
            "invalid",
            "A route needs at least two stops, each on the globe.",
          );
        }
        this.#checkMode(mode);
        return this.#answer(
          this.#routeHolds,
          () => this.#route ?? defaultRoute(stops, mode),
        );
      },
      request.signal,
      abortedError,
    );
  }

  reachableArea(request: ReachableAreaRequest): Promise<ReachableAreaResult> {
    this.reachableAreaCalls.push(request);
    return abortable(
      async () => {
        const { origin, minutes, mode } = request;
        if (!isOnGlobe(origin) || !Number.isFinite(minutes) || minutes <= 0) {
          throw new RoutingError(
            "invalid",
            "An area needs an origin on the globe and minutes above zero.",
          );
        }
        this.#checkMode(mode);
        return this.#answer(
          this.#areaHolds,
          () => this.#area ?? defaultArea(origin, minutes, mode),
        );
      },
      request.signal,
      abortedError,
    );
  }

  #checkMode(mode: TravelMode): void {
    if (!this.#modes.includes(mode)) {
      throw new RoutingError(
        "unsupported",
        `The ${String(mode)} mode is not offered.`,
      );
    }
  }

  #answer<T>(holds: Deferred<T>[], scripted: () => T): Promise<T> {
    const hold = holds.shift();
    if (hold !== undefined) {
      return hold.promise;
    }
    if (this.#failure !== null) {
      return Promise.reject(new RoutingError(this.#failure));
    }
    return Promise.resolve(scripted());
  }
}

function abortedError(): RoutingError {
  return new RoutingError("aborted", "The request was cancelled.");
}

function defaultRoute(stops: readonly LatLng[], mode: TravelMode): RouteResult {
  const features: RouteLeg[] = [];
  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1] as LatLng;
    const to = stops[index] as LatLng;
    const coordinates = [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ];
    const distance = (measureLineDistance(coordinates) ?? 0) * 1000;
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates },
      properties: { distance, duration: distance / SPEEDS[mode] },
    });
  }
  return {
    features,
    distance: features.reduce((sum, leg) => sum + leg.properties.distance, 0),
    duration: features.reduce((sum, leg) => sum + leg.properties.duration, 0),
  };
}

function defaultArea(
  origin: LatLng,
  minutes: number,
  mode: TravelMode,
): ReachableAreaResult {
  const reach = SPEEDS[mode] * minutes * 60;
  let ring: ReturnType<typeof buffer>;
  try {
    ring = buffer(
      { type: "Point", coordinates: [origin.lng, origin.lat] },
      reach,
    );
  } catch (error) {
    // The only way the ring fails is a reach the geometry helpers refuse,
    // such as an origin whose ring would cross the antimeridian.
    throw new RoutingError("unsupported", (error as GeometryError).message);
  }
  if (ring === null) {
    throw new RoutingError("no-route", "Nothing is reachable.");
  }
  return {
    features: [{ type: "Feature", geometry: ring, properties: { minutes } }],
  };
}
