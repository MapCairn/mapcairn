// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceLocationError,
  announceLocationFound,
  LocationError,
  type LocationErrorKind,
  type LocationFix,
  PortAbortError,
  type UnitSystem,
} from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocationProvider } from "../../services/hooks";
import { useAnnounce } from "../../ui/LiveRegion";

/** The text shown while a fix is being found. */
export const LOCATING_MESSAGE = "Finding your location...";

/** Where a locate request stands. */
export type LocateState = "idle" | "locating" | "found" | "error";

/** Options for {@link useLocate}. */
export interface UseLocateOptions {
  /** Passed to the provider, which decides its own default when absent. */
  readonly timeoutMs?: number;
  /**
   * Whether to announce errors through the announcer. Defaults to true. Pass
   * false when the app shows `message` in an error `StatusMessage`, which is
   * an alert itself, so the error is spoken once. A fix is always announced.
   */
  readonly announceErrors?: boolean;
}

/** What {@link useLocate} returns. */
export interface UseLocate {
  readonly state: LocateState;
  /** The latest fix. Set only while `state` is `found`. */
  readonly fix: LocationFix | null;
  /** Why the last request failed. Set only while `state` is `error`. */
  readonly error: LocationErrorKind | null;
  /**
   * Visible status text for the app to show in a `StatusMessage`: empty when
   * idle, "Finding your location..." while locating, the accuracy when found
   * and what went wrong, with a next step, on an error. The text for an error
   * must stay on screen until the user dismisses it.
   */
  readonly message: string;
  /**
   * Asks for the user's location. Call it only from a user action, such as a
   * click on "Locate me": the browser may show a permission prompt. A second
   * call cancels the first.
   */
  readonly locate: () => void;
  /**
   * Cancels a request in flight and returns to `idle`. Calling it after a
   * result or an error also returns to `idle`, which is how the app dismisses
   * the status message.
   */
  readonly cancel: () => void;
}

/**
 * Finds the user's location through the services' `LocationProvider`, one
 * request at a time. Each request has its own `AbortController`, aborted by
 * a newer request, by `cancel` and on unmount; a cancelled request never
 * changes state or announces anything.
 *
 * The outcome is announced through the app-wide announcer, and `message`
 * carries the same wording for the visible status.
 * @remarks Announcing and showing the same error means a screen reader may
 *   hear it twice if the app puts `message` in an alert `StatusMessage`;
 *   pass `announceErrors: false` in that case.
 */
export function useLocate(
  units: UnitSystem,
  { timeoutMs, announceErrors = true }: UseLocateOptions = {},
): UseLocate {
  const provider = useLocationProvider();
  const announce = useAnnounce();
  const providerRef = useLatestRef(provider);
  const announceRef = useLatestRef(announce);
  const unitsRef = useLatestRef(units);
  const timeoutRef = useLatestRef(timeoutMs);
  const announceErrorsRef = useLatestRef(announceErrors);
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<LocateState>("idle");
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [error, setError] = useState<LocationErrorKind | null>(null);
  const [message, setMessage] = useState("");

  const abort = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  const locate = useCallback(() => {
    abort();
    const own = new AbortController();
    controller.current = own;
    setState("locating");
    setFix(null);
    setError(null);
    setMessage(LOCATING_MESSAGE);
    providerRef.current
      .locate({ signal: own.signal, timeoutMs: timeoutRef.current })
      .then(
        (found) => {
          if (own.signal.aborted) {
            return;
          }
          const text = announceLocationFound(
            found.accuracyMetres,
            unitsRef.current,
          );
          setState("found");
          setFix(found);
          setMessage(text);
          announceRef.current(text);
        },
        (failure: unknown) => {
          if (own.signal.aborted || failure instanceof PortAbortError) {
            return;
          }
          const kind: LocationErrorKind =
            failure instanceof LocationError ? failure.kind : "unavailable";
          const text = announceLocationError(kind);
          setState("error");
          setError(kind);
          setMessage(text);
          if (announceErrorsRef.current) {
            announceRef.current(text, { priority: "assertive" });
          }
        },
      );
  }, [
    abort,
    providerRef,
    timeoutRef,
    unitsRef,
    announceRef,
    announceErrorsRef,
  ]);

  const cancel = useCallback(() => {
    abort();
    setState("idle");
    setFix(null);
    setError(null);
    setMessage("");
  }, [abort]);

  useEffect(() => abort, [abort]);

  return { state, fix, error, message, locate, cancel };
}
