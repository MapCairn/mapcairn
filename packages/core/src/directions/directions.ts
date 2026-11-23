// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatLatLng } from "../format/format";
import { geometryArea } from "../geometry/queries";
import { message } from "../messages/formatMessage";
import type { RoutingErrorKind } from "../ports/errors";
import type { Bounds, LatLng } from "../ports/geometry";
import type { Message } from "../ports/messages";
import type {
  ReachableAreaFeature,
  RouteLeg,
  TravelMode,
} from "../ports/routing";
import { boundsOfPoints } from "../spatial/boundsOfPoints";

/** One place a route passes through. */
export interface DirectionStop {
  /** Stable for the life of the stop, so a list keeps its rows when stops move. */
  readonly id: string;
  /** Where the stop is. */
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

const MODE_LABEL_MESSAGES = {
  drive: message("directions.mode.drive", {}),
  walk: message("directions.mode.walk", {}),
  cycle: message("directions.mode.cycle", {}),
} as const satisfies Readonly<Record<TravelMode, Message>>;

const MODE_PARTICIPLE_MESSAGES = {
  drive: message("directions.participle.drive", {}),
  walk: message("directions.participle.walk", {}),
  cycle: message("directions.participle.cycle", {}),
} as const satisfies Readonly<Record<TravelMode, Message>>;

/** The short name of a travel mode, as it labels a choice: "Drive", "Walk" or "Cycle", as a message to format. */
export function travelModeLabel(mode: TravelMode): Message {
  return MODE_LABEL_MESSAGES[mode];
}

/** A travel mode as it reads in a sentence: "driving", "walking" or "cycling", as a message to format. */
export function travelModeParticiple(mode: TravelMode): Message {
  return MODE_PARTICIPLE_MESSAGES[mode];
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

/** A stop for a screen reader: "Stop A, Paris", or its coordinates when it has no name, as a message to format. */
export function describeStop(
  index: number,
  stop: DirectionStop,
): Message<"directions.stop"> {
  return message("directions.stop", {
    letter: stopLetter(index),
    place: stop.label ?? formatLatLng(stop.position),
  });
}

/**
 * The smallest box that holds every line or ring of the features, or `null`
 * when they hold no position. Takes the short way across the antimeridian, as
 * {@link boundsOfPoints} does. Safe for a route of any length.
 */
export function routeBounds(
  features: readonly (RouteLeg | ReachableAreaFeature)[],
): Bounds | null {
  const positions: LatLng[] = [];
  const visit = (position: readonly number[]) => {
    const [lng, lat] = position;
    if (lng !== undefined && lat !== undefined) {
      positions.push({ lat, lng });
    }
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
  return boundsOfPoints(positions) ?? null;
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
 * The message that tells a person a route or area request failed, saying what
 * happened and what to do next. Not for `aborted`, which is never shown.
 */
export function routingErrorMessage(
  kind: Exclude<RoutingErrorKind, "aborted">,
  request: RoutingRequestKind,
): Message {
  switch (kind) {
    case "network":
      return message("error.routing.network", {});
    case "rate-limited":
      return message("error.routing.rateLimited", {});
    case "no-route":
      return request === "route"
        ? message("error.routing.noRoute", {})
        : message("error.routing.noReachableArea", {});
    case "invalid":
      return message("error.routing.invalid", {});
    case "unsupported":
      return message("error.routing.unsupported", {});
  }
}
