import type { LatLng } from "./geometry";

/** How the traveller moves, which decides the roads and the speed. */
export type TravelMode = "drive" | "walk" | "cycle";

/**
 * A line of `[longitude, latitude]` positions, as GeoJSON writes a
 * `LineString`. It uses plain arrays, so it passes straight to code typed
 * with the GeoJSON types, and the geometry helpers in core accept it.
 */
export interface RouteLineGeometry {
  readonly type: "LineString";
  readonly coordinates: number[][];
}

/** One stretch of a route, between two consecutive stops. */
export interface RouteLeg {
  readonly type: "Feature";
  readonly geometry: RouteLineGeometry;
  readonly properties: {
    /** Length of this leg, in metres. */
    readonly distance: number;
    /** Time to travel this leg, in seconds. */
    readonly duration: number;
  };
}

/** A request for a route through the stops, in order. */
export interface RouteRequest {
  /** At least two positions: where to start, any stops between, and where to end. */
  readonly stops: readonly LatLng[];
  readonly mode: TravelMode;
  readonly signal?: AbortSignal;
}

/** A route: one line feature for each leg, with totals. */
export interface RouteResult {
  /** One feature for each pair of consecutive stops, in order. */
  readonly features: readonly RouteLeg[];
  /** The whole route's length, in metres. */
  readonly distance: number;
  /** The whole route's travel time, in seconds. */
  readonly duration: number;
}

/**
 * The outline of an area, as GeoJSON writes a `Polygon` (a ring, then any
 * holes) or a `MultiPolygon`. It uses plain arrays, so it passes straight to
 * code typed with the GeoJSON types, and the geometry helpers in core accept it.
 */
export type AreaGeometry =
  | { readonly type: "Polygon"; readonly coordinates: number[][][] }
  | { readonly type: "MultiPolygon"; readonly coordinates: number[][][][] };

/** One area that can be reached within a time. */
export interface ReachableAreaFeature {
  readonly type: "Feature";
  readonly geometry: AreaGeometry;
  readonly properties: {
    /** The travel time this area is reachable within, in minutes. */
    readonly minutes: number;
  };
}

/** A request for the area reachable from a place within a time. */
export interface ReachableAreaRequest {
  readonly origin: LatLng;
  /** The travel time, in minutes. Greater than zero. */
  readonly minutes: number;
  readonly mode: TravelMode;
  readonly signal?: AbortSignal;
}

/** The areas reachable from an origin: usually one, and more when the network is split. */
export interface ReachableAreaResult {
  readonly features: readonly ReachableAreaFeature[];
}

/**
 * Finds routes and travel-time areas. Implementations reject with a
 * `RoutingError` (`network`, `invalid`, `no-route`, `rate-limited`,
 * `unsupported`, or `aborted` when the signal fires first). The ui treats
 * `aborted` as "ignore this result".
 *
 * MapCairn ships no provider. A host supplies one for the service it chooses,
 * and lists on its privacy page what the provider sends: the stops or the
 * origin, and the mode. A service's own usage limits belong to its
 * implementation, since every caller shares them. The service is optional:
 * a host that supplies none gets no routing, and the ui must cope.
 */
export interface RoutingProvider {
  /**
   * Finds the route through `stops` in order. Rejects with `invalid` for
   * fewer than two stops or a position that is not on the globe, `no-route`
   * when no route links the stops, and `unsupported` for a mode the provider
   * does not offer.
   */
  route(request: RouteRequest): Promise<RouteResult>;
  /**
   * Finds the area reachable from `origin` within `minutes`. Rejects with
   * `invalid` for a position that is not on the globe or minutes that are
   * not greater than zero, `no-route` when nothing is reachable, and
   * `unsupported` for a mode the provider does not offer.
   */
  reachableArea(request: ReachableAreaRequest): Promise<ReachableAreaResult>;
}
