import {
  addStop,
  announceAreaFound,
  announceDirectionsCleared,
  announceRouteFound,
  announceRoutingCancelled,
  announceRoutingError,
  announceStopAdded,
  announceStopLimit,
  announceStopMoved,
  announceStopRemoved,
  type DirectionStop,
  type LatLng,
  MAX_DIRECTION_STOPS,
  moveStop,
  type ReachableAreaFeature,
  type RouteLeg,
  RoutingError,
  type RoutingErrorKind,
  type RoutingProvider,
  type RoutingRequestKind,
  reachableAreaSize,
  removeStop,
  canAddStop as stopsHaveRoom,
  type TravelMode,
  type UnitSystem,
} from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRoutingProvider } from "../../services/hooks";
import { useAnnounce } from "../../ui/LiveRegion";

/** The failures a person is told about. A cancelled request is never one of them. */
export type DirectionsFailure = Exclude<RoutingErrorKind, "aborted">;

/** A route that is on the map. */
export interface RouteOutcome {
  readonly kind: "route";
  readonly mode: TravelMode;
  /** The stops it was found for, in order. */
  readonly stops: readonly DirectionStop[];
  /** One line for each pair of consecutive stops. */
  readonly legs: readonly RouteLeg[];
  /** The whole route's length, in metres. */
  readonly distance: number;
  /** The whole route's travel time, in seconds. */
  readonly duration: number;
}

/** A travel-time area that is on the map. */
export interface AreaOutcome {
  readonly kind: "area";
  readonly mode: TravelMode;
  readonly minutes: number;
  /** Where the area is reachable from: the first stop. */
  readonly origin: LatLng;
  readonly features: readonly ReachableAreaFeature[];
  /** The ground area, in square metres. */
  readonly size: number;
}

/** What the directions tool has put on the map. */
export type DirectionsOutcome = RouteOutcome | AreaOutcome;

/** Where the directions tool stands. Exactly one of these is true at a time. */
export type DirectionsState =
  | { readonly status: "idle" }
  | {
      readonly status: "loading";
      readonly request: RoutingRequestKind;
      /** The travel time of an area request, so its button can show it is working. */
      readonly minutes?: number;
    }
  | { readonly status: "done"; readonly result: DirectionsOutcome }
  | {
      readonly status: "error";
      readonly request: RoutingRequestKind;
      readonly kind: DirectionsFailure;
    };

/** What {@link useDirections} returns. */
export interface UseDirections {
  /** Whether the host provides a routing service. Without one the tool is not offered. */
  readonly available: boolean;
  /** The stops, in order. */
  readonly stops: readonly DirectionStop[];
  readonly mode: TravelMode;
  readonly state: DirectionsState;
  /** The route or area on the map, or null. */
  readonly result: DirectionsOutcome | null;
  /** Whether another stop fits. */
  readonly canAddStop: boolean;
  /** Adds a stop at the end, naming it when `label` is given. Says so when the list is full. */
  readonly addStop: (position: LatLng, label?: string) => void;
  readonly removeStop: (id: string) => void;
  /** Moves a stop one place earlier (`-1`) or later (`1`). */
  readonly moveStop: (id: string, direction: -1 | 1) => void;
  /** Chooses how to travel. A different mode clears the result, which was for the old one. */
  readonly setMode: (mode: TravelMode) => void;
  /** Asks the service for a route through the stops. Needs at least two. */
  readonly requestRoute: () => void;
  /** Asks the service for the area reachable from the first stop within `minutes`. */
  readonly requestArea: (minutes: number) => void;
  /** Asks again for the request that failed. */
  readonly retry: () => void;
  /** Stops a request that is running. */
  readonly cancel: () => void;
  /** Removes every stop and the result, and stops a request that is running. */
  readonly clear: () => void;
}

type Request =
  | { readonly kind: "route" }
  | { readonly kind: "area"; readonly minutes: number };

const IDLE: DirectionsState = { status: "idle" };

/** Asks the service for what `request` describes, and shapes the answer as an outcome. */
async function find(
  service: RoutingProvider,
  request: Request,
  places: readonly DirectionStop[],
  mode: TravelMode,
  signal: AbortSignal,
): Promise<DirectionsOutcome> {
  if (request.kind === "route") {
    const found = await service.route({
      stops: places.map((stop) => stop.position),
      mode,
      signal,
    });
    return {
      kind: "route",
      mode,
      stops: places,
      legs: found.features,
      distance: found.distance,
      duration: found.duration,
    };
  }
  const origin = places[0]?.position as LatLng;
  const found = await service.reachableArea({
    origin,
    minutes: request.minutes,
    mode,
    signal,
  });
  return {
    kind: "area",
    mode,
    minutes: request.minutes,
    origin,
    features: found.features,
    size: reachableAreaSize(found.features),
  };
}

/** The announcement for a route or area that has been found. */
function describeOutcome(
  outcome: DirectionsOutcome,
  units: UnitSystem,
): string {
  return outcome.kind === "route"
    ? announceRouteFound(
        outcome.distance,
        outcome.duration,
        outcome.mode,
        units,
      )
    : announceAreaFound(outcome.minutes, outcome.size, outcome.mode, units);
}

/**
 * The state of one set of directions: the stops, the travel mode and the
 * route or travel-time area the service found for them, with the requests
 * cancellable and nothing stored. A request is sent only when the person asks
 * (`requestRoute`, `requestArea`, `retry`), never as stops change.
 *
 * @remarks A result belongs to the stops and mode it was found for, so
 *   changing either goes back to idle: a line that no longer matches the
 *   stops is never left on the map. One request runs at a time; a newer one
 *   replaces it, and the answer to a replaced or cancelled request is ignored.
 *   Outcomes are announced through the app-wide announcer, errors assertively.
 *   Any failure the service does not describe is a `network` failure.
 * @param units - The unit system for the announcements.
 */
export function useDirections(units: UnitSystem): UseDirections {
  const provider = useRoutingProvider();
  const announce = useAnnounce();
  const announceRef = useLatestRef(announce);
  const providerRef = useLatestRef(provider);
  const unitsRef = useLatestRef(units);

  const [stops, setStopsState] = useState<readonly DirectionStop[]>([]);
  const [mode, setModeState] = useState<TravelMode>("drive");
  const [state, setState] = useState<DirectionsState>(IDLE);
  const stateRef = useLatestRef(state);
  // Current values for callbacks that run before the next render.
  const stopsRef = useRef<readonly DirectionStop[]>([]);
  const modeRef = useRef<TravelMode>("drive");
  const controller = useRef<AbortController | null>(null);
  const lastRequest = useRef<Request | null>(null);
  const nextId = useRef(0);

  const abort = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  /** A result belongs to its stops and mode, so a change of either ends the request and the result. */
  const invalidate = useCallback(() => {
    abort();
    setState((current) => (current.status === "idle" ? current : IDLE));
  }, [abort]);

  const commitStops = useCallback(
    (next: readonly DirectionStop[]) => {
      stopsRef.current = next;
      setStopsState(next);
      invalidate();
    },
    [invalidate],
  );

  const addStopAction = useCallback(
    (position: LatLng, label?: string) => {
      const current = stopsRef.current;
      if (!stopsHaveRoom(current)) {
        announceRef.current(announceStopLimit(MAX_DIRECTION_STOPS), {
          priority: "polite",
        });
        return;
      }
      nextId.current += 1;
      const stop: DirectionStop =
        label === undefined
          ? { id: `stop-${nextId.current}`, position }
          : { id: `stop-${nextId.current}`, position, label };
      const next = addStop(current, stop);
      commitStops(next);
      announceRef.current(announceStopAdded(next.length - 1, next.length), {
        priority: "polite",
      });
    },
    [announceRef, commitStops],
  );

  const removeStopAction = useCallback(
    (id: string) => {
      const current = stopsRef.current;
      const index = current.findIndex((stop) => stop.id === id);
      const next = removeStop(current, id);
      if (next === current) {
        return;
      }
      commitStops(next);
      announceRef.current(announceStopRemoved(index), { priority: "polite" });
    },
    [announceRef, commitStops],
  );

  const moveStopAction = useCallback(
    (id: string, direction: -1 | 1) => {
      const current = stopsRef.current;
      const next = moveStop(current, id, direction);
      if (next === current) {
        return;
      }
      commitStops(next);
      const index = next.findIndex((stop) => stop.id === id);
      announceRef.current(announceStopMoved(index, next.length), {
        priority: "polite",
      });
    },
    [announceRef, commitStops],
  );

  const setMode = useCallback(
    (next: TravelMode) => {
      if (modeRef.current === next) {
        return;
      }
      modeRef.current = next;
      setModeState(next);
      invalidate();
    },
    [invalidate],
  );

  const run = useCallback(
    async (request: Request) => {
      const service = providerRef.current;
      const route = request.kind === "route";
      const places = stopsRef.current;
      const travelMode = modeRef.current;
      const origin = places[0]?.position;
      if (!service || (route ? places.length < 2 : origin === undefined)) {
        return;
      }
      abort();
      const own = new AbortController();
      controller.current = own;
      lastRequest.current = request;
      setState(
        request.kind === "area"
          ? { status: "loading", request: "area", minutes: request.minutes }
          : { status: "loading", request: "route" },
      );
      try {
        const outcome = await find(
          service,
          request,
          places,
          travelMode,
          own.signal,
        );
        if (own.signal.aborted) {
          return;
        }
        setState({ status: "done", result: outcome });
        announceRef.current(describeOutcome(outcome, unitsRef.current), {
          priority: "polite",
        });
      } catch (error) {
        if (own.signal.aborted) {
          return;
        }
        const kind: RoutingErrorKind =
          error instanceof RoutingError ? error.kind : "network";
        if (kind === "aborted") {
          setState(IDLE);
          return;
        }
        setState({ status: "error", request: request.kind, kind });
        announceRef.current(announceRoutingError(kind, request.kind), {
          priority: "assertive",
        });
      }
    },
    [abort, announceRef, providerRef, unitsRef],
  );

  const requestRoute = useCallback(() => {
    void run({ kind: "route" });
  }, [run]);

  const requestArea = useCallback(
    (minutes: number) => {
      void run({ kind: "area", minutes });
    },
    [run],
  );

  const retry = useCallback(() => {
    if (lastRequest.current) {
      void run(lastRequest.current);
    }
  }, [run]);

  const cancel = useCallback(() => {
    if (stateRef.current.status !== "loading") {
      return;
    }
    abort();
    setState(IDLE);
    announceRef.current(announceRoutingCancelled(), { priority: "polite" });
  }, [abort, announceRef, stateRef]);

  const clear = useCallback(() => {
    stopsRef.current = [];
    setStopsState([]);
    invalidate();
    lastRequest.current = null;
    announceRef.current(announceDirectionsCleared(), { priority: "polite" });
  }, [announceRef, invalidate]);

  useEffect(() => abort, [abort]);

  return {
    available: provider !== undefined,
    stops,
    mode,
    state,
    result: state.status === "done" ? state.result : null,
    canAddStop: stopsHaveRoom(stops),
    addStop: addStopAction,
    removeStop: removeStopAction,
    moveStop: moveStopAction,
    setMode,
    requestRoute,
    requestArea,
    retry,
    cancel,
    clear,
  };
}
