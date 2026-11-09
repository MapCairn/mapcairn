import type { LatLng, SearchResult } from "@karta/core";
import { useEffect, useState } from "react";
import { useSearchProvider } from "../../services/hooks";

/** Where the address lookup for a position stands. */
export type AddressState =
  | { readonly status: "loading" }
  | { readonly status: "found"; readonly text: string }
  | { readonly status: "none" }
  | { readonly status: "error" };

/** Joins a place's label and secondary label into one address line. */
function addressLine(result: SearchResult): string {
  return result.secondaryLabel
    ? `${result.label}, ${result.secondaryLabel}`
    : result.label;
}

/**
 * Looks up the address at a position with the search provider's `reverse`.
 * Moving the position, or unmounting, aborts the lookup in flight, and an
 * aborted lookup never changes state. A failed lookup is `error`; callers
 * show nothing for it, because an address is a nicety and the coordinates
 * are the answer.
 */
export function useReverseAddress({ lat, lng }: LatLng): AddressState {
  const provider = useSearchProvider();
  const [state, setState] = useState<AddressState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    provider.reverse({ lat, lng }, { signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) {
          return;
        }
        setState(
          result === null
            ? { status: "none" }
            : { status: "found", text: addressLine(result) },
        );
      },
      () => {
        if (!controller.signal.aborted) {
          setState({ status: "error" });
        }
      },
    );
    return () => controller.abort();
  }, [provider, lat, lng]);

  return state;
}
