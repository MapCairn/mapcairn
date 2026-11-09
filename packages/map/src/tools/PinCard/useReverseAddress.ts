import { type LatLng, roundForLookup, type SearchResult } from "@karta/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchProvider } from "../../services/hooks";

/** Where the address lookup for a position stands. */
export type AddressState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "found"; readonly text: string }
  | { readonly status: "none" }
  | { readonly status: "error" };

/** What {@link useReverseAddress} returns. */
export interface ReverseAddress {
  /** Where the lookup stands. It is `idle` until `lookUp` is called. */
  readonly state: AddressState;
  /**
   * Sends the position, rounded to about 11 m, to the search provider.
   * Calling it again aborts a lookup still in flight and starts a new one.
   */
  readonly lookUp: () => void;
}

/** Joins a place's label and secondary label into one address line. */
function addressLine(result: SearchResult): string {
  return result.secondaryLabel
    ? `${result.label}, ${result.secondaryLabel}`
    : result.label;
}

interface Tracked {
  readonly lat: number;
  readonly lng: number;
  readonly state: AddressState;
}

/**
 * Looks up the address at a position with the search provider's `reverse`,
 * but only when `lookUp` is called, because the position leaves the device.
 * The provider receives the position rounded with `roundForLookup`.
 *
 * @remarks Moving the position, or unmounting, aborts the lookup in flight and
 *   returns the state to `idle`. An aborted lookup never changes state, and an
 *   answer is only ever shown for the position it was asked for. A failed
 *   lookup is `error`, which callers should show with a way to try again.
 */
export function useReverseAddress({ lat, lng }: LatLng): ReverseAddress {
  const provider = useSearchProvider();
  const [tracked, setTracked] = useState<Tracked>({
    lat,
    lng,
    state: { status: "idle" },
  });
  const controller = useRef<AbortController | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: lat and lng are the triggers, not values read in the effect
  useEffect(() => {
    setTracked({ lat, lng, state: { status: "idle" } });
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [provider, lat, lng]);

  const lookUp = useCallback(() => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const settle = (state: AddressState) => {
      if (!current.signal.aborted) {
        setTracked({ lat, lng, state });
      }
    };
    setTracked({ lat, lng, state: { status: "loading" } });
    provider
      .reverse(roundForLookup({ lat, lng }), { signal: current.signal })
      .then(
        (result) =>
          settle(
            result === null
              ? { status: "none" }
              : { status: "found", text: addressLine(result) },
          ),
        () => settle({ status: "error" }),
      );
  }, [provider, lat, lng]);

  // A state from another position is stale for the one render before the
  // effect resets it; never show it.
  const state: AddressState =
    tracked.lat === lat && tracked.lng === lng
      ? tracked.state
      : { status: "idle" };
  return { state, lookUp };
}
