import {
  type AreaGeometry,
  type LatLng,
  PortAbortError,
  type ReachableAreaFeature,
  type ReachableAreaRequest,
  type ReachableAreaResult,
  type RouteLeg,
  type RouteRequest,
  type RouteResult,
  RoutingError,
  type RoutingProvider,
  type TravelMode,
} from "@karta/core";
import { RequestSpacer } from "../shared/RequestSpacer";
import { decodePolyline } from "./polyline";

const DEFAULT_ENDPOINT = "https://valhalla1.openstreetmap.de";

/**
 * The least time between the starts of two requests. The public server is a
 * shared community service with no published quota, so the adapter keeps to
 * one request a second.
 */
const DEFAULT_MIN_INTERVAL_MS = 1000;

/** The Valhalla costing model for each travel mode. */
const COSTINGS: ReadonlyMap<TravelMode, string> = new Map([
  ["drive", "auto"],
  ["walk", "pedestrian"],
  ["cycle", "bicycle"],
]);

/**
 * Valhalla error codes that mean "nothing links these places": 170 (locations
 * in unconnected regions), 171 and 443 (no suitable road near a location) and
 * 442 (no path found).
 */
const NO_ROUTE_CODES: ReadonlySet<number> = new Set([170, 171, 442, 443]);
const NO_ROUTE_TEXT = /no path|no suitable edges|unable to find|no route/i;
const COSTING_TEXT = /costing/i;
/** Valhalla codes 124 and 125: the costing model is missing or not offered. */
const COSTING_CODES: ReadonlySet<number> = new Set([124, 125]);

/** Statuses that mean the server is busy or limiting callers, so trying later may work. */
const BUSY_STATUSES: ReadonlySet<number> = new Set([429, 503, 504]);

/** Options for {@link ValhallaRoutingProvider}. */
export interface ValhallaRoutingProviderOptions {
  /**
   * The `fetch` to use. Read lazily from `globalThis` when omitted, so a test
   * or a polyfill installed after construction is still honoured.
   */
  readonly fetch?: typeof fetch;
  /**
   * The service address. Defaults to the public Valhalla server run by the
   * FOSSGIS community, `https://valhalla1.openstreetmap.de`.
   */
  readonly endpoint?: string;
  /**
   * The least time between the starts of two requests, routes and areas
   * alike. Defaults to 1000.
   */
  readonly minIntervalMs?: number;
}

function defaultFetch(...args: Parameters<typeof fetch>) {
  return globalThis.fetch(...args);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function abortedError(): RoutingError {
  return new RoutingError("aborted", "The request was cancelled.");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw abortedError();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOnGlobe(position: LatLng): boolean {
  return (
    Number.isFinite(position.lat) &&
    Number.isFinite(position.lng) &&
    Math.abs(position.lat) <= 90 &&
    Math.abs(position.lng) <= 180
  );
}

function costingFor(mode: TravelMode): string {
  const costing = COSTINGS.get(mode);
  if (costing === undefined) {
    throw new RoutingError(
      "unsupported",
      `The ${String(mode)} mode is not offered.`,
    );
  }
  return costing;
}

function invalidBody(detail: string): RoutingError {
  return new RoutingError(
    "invalid",
    `The routing service sent a response that is not what it documents: ${detail}.`,
  );
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Reads one leg of a Valhalla trip: its polyline and its summary. */
function toLeg(raw: unknown): RouteLeg {
  if (!isRecord(raw) || typeof raw.shape !== "string") {
    throw invalidBody("a leg has no shape");
  }
  const summary = raw.summary;
  if (
    !isRecord(summary) ||
    !isNonNegativeNumber(summary.length) ||
    !isNonNegativeNumber(summary.time)
  ) {
    throw invalidBody("a leg has no length and time");
  }
  let coordinates: number[][];
  try {
    coordinates = decodePolyline(raw.shape, 6);
  } catch {
    throw invalidBody("a leg's shape cannot be decoded");
  }
  if (coordinates.length < 2) {
    throw invalidBody("a leg's shape has fewer than two positions");
  }
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties: { distance: summary.length * 1000, duration: summary.time },
  };
}

/** Turns a Valhalla trip into a route with one feature for each of its legs. */
function toRoute(body: unknown): RouteResult {
  if (!isRecord(body) || !isRecord(body.trip)) {
    throw invalidBody("there is no trip");
  }
  const legs = body.trip.legs;
  if (!Array.isArray(legs) || legs.length === 0) {
    throw invalidBody("the trip has no legs");
  }
  const features = legs.map(toLeg);
  return {
    features,
    distance: features.reduce((sum, leg) => sum + leg.properties.distance, 0),
    duration: features.reduce((sum, leg) => sum + leg.properties.duration, 0),
  };
}

/** Reads a position, keeping the longitude and latitude and dropping any altitude. */
function toPosition(raw: unknown): number[] {
  if (
    !Array.isArray(raw) ||
    raw.length < 2 ||
    typeof raw[0] !== "number" ||
    typeof raw[1] !== "number" ||
    !Number.isFinite(raw[0]) ||
    !Number.isFinite(raw[1])
  ) {
    throw invalidBody("an area has a position that is not a pair of numbers");
  }
  return [raw[0], raw[1]];
}

function toRing(raw: unknown): number[][] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw invalidBody("an area has an empty ring");
  }
  return raw.map(toPosition);
}

function toPolygon(raw: unknown): number[][][] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw invalidBody("an area has an empty polygon");
  }
  return raw.map(toRing);
}

/** Reads a feature's geometry, or `null` for one that is not a polygon. */
function toAreaGeometry(raw: unknown): AreaGeometry | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (raw.type === "Polygon") {
    return { type: "Polygon", coordinates: toPolygon(raw.coordinates) };
  }
  if (raw.type === "MultiPolygon") {
    if (!Array.isArray(raw.coordinates) || raw.coordinates.length === 0) {
      throw invalidBody("an area has an empty multipolygon");
    }
    return {
      type: "MultiPolygon",
      coordinates: raw.coordinates.map(toPolygon),
    };
  }
  return null;
}

/** Turns a Valhalla isochrone collection into areas, each marked with the minutes asked for. */
function toAreas(body: unknown, minutes: number): ReachableAreaResult {
  if (
    !isRecord(body) ||
    body.type !== "FeatureCollection" ||
    !Array.isArray(body.features)
  ) {
    throw invalidBody("there is no feature collection");
  }
  const features: ReachableAreaFeature[] = [];
  for (const raw of body.features) {
    if (!isRecord(raw)) {
      throw invalidBody("an area is not an object");
    }
    const geometry = toAreaGeometry(raw.geometry);
    if (geometry !== null) {
      features.push({ type: "Feature", geometry, properties: { minutes } });
    }
  }
  if (features.length === 0) {
    throw new RoutingError("no-route", "Nothing is reachable.");
  }
  return { features };
}

/**
 * Sorts a failed response (a 4xx or any other status that is not OK) into a
 * {@link RoutingError}, using the `error_code` and `error` text of the JSON
 * body Valhalla sends with a refusal.
 */
function classifyRefusal(status: number, body: unknown): RoutingError {
  const code = isRecord(body) ? body.error_code : undefined;
  const text =
    isRecord(body) && typeof body.error === "string" ? body.error : "";
  const message = `The routing service refused the request: HTTP ${status}.`;
  if (
    (typeof code === "number" && NO_ROUTE_CODES.has(code)) ||
    NO_ROUTE_TEXT.test(text)
  ) {
    return new RoutingError("no-route", message);
  }
  if (
    (typeof code === "number" && COSTING_CODES.has(code)) ||
    COSTING_TEXT.test(text)
  ) {
    return new RoutingError("unsupported", message);
  }
  return new RoutingError("invalid", message);
}

/**
 * A {@link RoutingProvider} backed by the public Valhalla routing service run
 * by the FOSSGIS community, which uses OpenStreetMap data.
 *
 * @remarks Privacy: a route request sends the stops and the travel mode, and
 *   an area request sends the origin, the time and the travel mode, to the
 *   server, and the browser sends the user's IP address with it. Nothing is
 *   sent until a route or an area is asked for. The page's CSP must allow
 *   `connect-src https://valhalla1.openstreetmap.de`. The requests are plain
 *   GETs with no custom header, so the browser sends no preflight, and they
 *   carry no cookies and no referrer.
 *
 *   Every request waits its turn in one queue per provider, so two starts are
 *   at least `minIntervalMs` apart (one second by default). A signal that
 *   fires while a request is queued abandons it without sending it.
 *
 *   A route's distance and duration are the sums over its legs, so they always
 *   agree with the legs. Each area feature carries the minutes that were asked
 *   for, not the service's own contour property.
 *
 *   Errors follow the port. A fetch that fails other than by abort is
 *   `network`, and an aborted signal is `aborted` at every stage (queued,
 *   during the fetch, or while the body is read). By HTTP status:
 *   - 429, 503 and 504 are `rate-limited`, because they mean the shared
 *     server is limiting or too busy and a later request may work.
 *   - Any other 5xx is `network`, a fault between the visitor and the server
 *     that is not about how often they ask.
 *   - A 4xx whose `error_code` is 170, 171, 442 or 443, or whose `error` text
 *     says "No path", "No suitable edges", "Unable to find" or "No route", is
 *     `no-route`.
 *   - A 4xx whose `error_code` is 124 or 125, or whose `error` text mentions
 *     the costing model, is `unsupported`.
 *   - Any other 4xx is `invalid`.
 *
 *   A 200 whose body is not the documented shape is `invalid`, and an
 *   isochrone with no polygon features is `no-route`. A request is checked
 *   before anything is sent: fewer than two stops, a position off the globe
 *   or minutes that are not greater than zero are `invalid`, and a mode other
 *   than drive, walk or cycle is `unsupported`.
 */
export class ValhallaRoutingProvider implements RoutingProvider {
  readonly #fetch: typeof fetch;
  readonly #endpoint: string;
  readonly #spacer: RequestSpacer;

  constructor(options: ValhallaRoutingProviderOptions = {}) {
    this.#fetch = options.fetch ?? defaultFetch;
    this.#endpoint = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, "");
    this.#spacer = new RequestSpacer(
      options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
    );
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    const { stops, mode, signal } = request;
    throwIfAborted(signal);
    if (stops.length < 2 || !stops.every(isOnGlobe)) {
      throw new RoutingError(
        "invalid",
        "A route needs at least two stops, each on the globe.",
      );
    }
    const costing = costingFor(mode);
    const body = await this.#get(
      "route",
      {
        locations: stops.map((stop) => ({ lat: stop.lat, lon: stop.lng })),
        costing,
      },
      signal,
    );
    return toRoute(body);
  }

  async reachableArea(
    request: ReachableAreaRequest,
  ): Promise<ReachableAreaResult> {
    const { origin, minutes, mode, signal } = request;
    throwIfAborted(signal);
    if (!isOnGlobe(origin) || !Number.isFinite(minutes) || minutes <= 0) {
      throw new RoutingError(
        "invalid",
        "An area needs an origin on the globe and minutes above zero.",
      );
    }
    const costing = costingFor(mode);
    const body = await this.#get(
      "isochrone",
      {
        locations: [{ lat: origin.lat, lon: origin.lng }],
        costing,
        contours: [{ time: minutes }],
        polygons: true,
      },
      signal,
    );
    return toAreas(body, minutes);
  }

  /** Requests one Valhalla endpoint and returns the parsed JSON body of a success. */
  async #get(
    path: "route" | "isochrone",
    query: object,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    try {
      await this.#spacer.wait(signal);
    } catch (error) {
      if (error instanceof PortAbortError) {
        throw abortedError();
      }
      throw error;
    }
    // The signal may have fired between the turn and this line.
    throwIfAborted(signal);
    const url = `${this.#endpoint}/${path}?json=${encodeURIComponent(JSON.stringify(query))}`;
    let response: Response;
    try {
      response = await this.#fetch(url, {
        signal,
        headers: { Accept: "application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        throw abortedError();
      }
      throw new RoutingError("network", "The routing service did not answer.");
    }
    if (response.ok) {
      try {
        return await response.json();
      } catch (error) {
        if (signal?.aborted || isAbortError(error)) {
          throw abortedError();
        }
        if (error instanceof SyntaxError) {
          throw invalidBody("the body is not JSON");
        }
        throw new RoutingError("network", "The response could not be read.");
      }
    }
    throw await this.#refusal(response, signal);
  }

  /** Builds the error for a response that is not OK. */
  async #refusal(
    response: Response,
    signal: AbortSignal | undefined,
  ): Promise<RoutingError> {
    const { status } = response;
    if (BUSY_STATUSES.has(status)) {
      return new RoutingError(
        "rate-limited",
        `The routing service is busy: HTTP ${status}.`,
      );
    }
    if (status >= 500 || status < 400) {
      return new RoutingError(
        "network",
        `The routing service failed: HTTP ${status}.`,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        return abortedError();
      }
      body = undefined;
    }
    return classifyRefusal(status, body);
  }
}
