// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatLatLng } from "../format/format";
import { geometryArea } from "../geometry/queries";
import type { RoutingErrorKind } from "../ports/errors";
import type { Bounds, LatLng } from "../ports/geometry";
import type {
  ReachableAreaFeature,
  RouteLeg,
  TravelMode,
} from "../ports/routing";

/** One place a route passes through. */
export interface DirectionStop {
  /** Stable for the life of the stop, so a list keeps its rows when stops move. */
  readonly id: string;
  readonly position: LatLng;
  /** A name for the place, such as a search result's label. Without it the coordinates are shown. */
  readonly label?: string;
}

/** The most stops a route may have. Services cap the count, and a longer list is hard to use. */
export const MAX_DIRECTION_STOPS = 10;

/** The travel times, in minutes, a person can ask a reachable area for. */
export const AREA_MINUTES = [5, 10, 15, 30] as const;

/** Every way of travelling, in the order the interface lists them. */
export const TRAVEL_MODES: readonly TravelMode[] = ["drive", "walk", "cycle"];

const MODE_LABELS: Readonly<Record<TravelMode, string>> = {
  drive: "Drive",
  walk: "Walk",
  cycle: "Cycle",
};

const MODE_PARTICIPLES: Readonly<Record<TravelMode, string>> = {
  drive: "driving",
  walk: "walking",
  cycle: "cycling",
};

/** The short name of a travel mode, as it labels a choice: "Drive", "Walk" or "Cycle". */
export function travelModeLabel(mode: TravelMode): string {
  return MODE_LABELS[mode];
}

/** A travel mode as it reads in a sentence: "driving", "walking" or "cycling". */
export function travelModeParticiple(mode: TravelMode): string {
  return MODE_PARTICIPLES[mode];
}

/** Whether another stop fits. */
export function canAddStop(stops: readonly DirectionStop[]): boolean {
  return stops.length < MAX_DIRECTION_STOPS;
}

/**
 * The stops with `stop` added at the end. Returns the same list when it is
 * already at {@link MAX_DIRECTION_STOPS}.
 */
export function addStop(
  stops: readonly DirectionStop[],
  stop: DirectionStop,
): readonly DirectionStop[] {
  return canAddStop(stops) ? [...stops, stop] : stops;
}

/** The stops without the one named by `id`. Returns the same list when there is no such stop. */
export function removeStop(
  stops: readonly DirectionStop[],
  id: string,
): readonly DirectionStop[] {
  const next = stops.filter((stop) => stop.id !== id);
  return next.length === stops.length ? stops : next;
}

/**
 * The stops with one moved a place earlier (`-1`) or later (`1`). Returns the
 * same list when there is no such stop or it is already at that end.
 */
export function moveStop(
  stops: readonly DirectionStop[],
  id: string,
  direction: -1 | 1,
): readonly DirectionStop[] {
  const from = stops.findIndex((stop) => stop.id === id);
  const to = from + direction;
  const moving = stops[from];
  const other = stops[to];
  if (from < 0 || moving === undefined || other === undefined) {
    return stops;
  }
  const next = [...stops];
  next[from] = other;
  next[to] = moving;
  return next;
}

/** The letter a stop is known by on the map and in the list: "A" for the first stop, "B" for the next. */
export function stopLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** A stop for a screen reader: "Stop A, Paris", or its coordinates when it has no name. */
export function describeStop(index: number, stop: DirectionStop): string {
  return `Stop ${stopLetter(index)}, ${stop.label ?? formatLatLng(stop.position)}`;
}

function extendBounds(
  bounds: { south: number; west: number; north: number; east: number },
  position: readonly number[],
): void {
  const lng = position[0];
  const lat = position[1];
  if (lng === undefined || lat === undefined) {
    return;
  }
  bounds.south = Math.min(bounds.south, lat);
  bounds.north = Math.max(bounds.north, lat);
  bounds.west = Math.min(bounds.west, lng);
  bounds.east = Math.max(bounds.east, lng);
}

/**
 * The smallest box that holds every line or ring of the features, or `null`
 * when they hold no position. Loops over the positions rather than spreading
 * them, so a route of any length is safe.
 */
export function routeBounds(
  features: readonly (RouteLeg | ReachableAreaFeature)[],
): Bounds | null {
  const bounds = {
    south: Number.POSITIVE_INFINITY,
    west: Number.POSITIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
  };
  let seen = false;
  const visit = (position: readonly number[]) => {
    seen = true;
    extendBounds(bounds, position);
  };
  for (const { geometry } of features) {
    switch (geometry.type) {
      case "LineString":
        geometry.coordinates.forEach(visit);
        break;
      case "Polygon":
        geometry.coordinates.flat().forEach(visit);
        break;
      case "MultiPolygon":
        geometry.coordinates.flat(2).forEach(visit);
        break;
    }
  }
  return seen ? bounds : null;
}

/** The ground area of the reachable areas together, in square metres. */
export function reachableAreaSize(
  features: readonly ReachableAreaFeature[],
): number {
  return features.reduce(
    (total, feature) => total + geometryArea(feature.geometry),
    0,
  );
}

/** What a routing request was for, which changes how a missing result is worded. */
export type RoutingRequestKind = "route" | "area";

/**
 * The text that tells a person a route or area request failed, saying what
 * happened and what to do next. Not for `aborted`, which is never shown.
 */
export function routingErrorMessage(
  kind: Exclude<RoutingErrorKind, "aborted">,
  request: RoutingRequestKind,
): string {
  switch (kind) {
    case "network":
      return "The routing service could not be reached. You may be offline. Check your connection and try again.";
    case "rate-limited":
      return "The routing service is busy. Wait a moment and try again.";
    case "no-route":
      return request === "route"
        ? "No route was found between these stops. Move a stop closer to a road or path, or choose another way to travel."
        : "Nothing is reachable from the first stop in that time. Move it closer to a road or path, or choose another way to travel.";
    case "invalid":
      return "The routing service could not use those stops. Move them and try again.";
    case "unsupported":
      return "That way of travelling is not available here. Choose another.";
  }
}
