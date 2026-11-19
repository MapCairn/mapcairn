// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useLatestRef } from "@mapcairn/react";
import { createContext, type ReactNode, useCallback, useContext } from "react";

/** A function that moves focus to a stable stop. */
type FocusFallback = () => void;

const StatusMessageFocusContext = createContext<FocusFallback | null>(null);

/** Props for {@link StatusMessageFocusProvider}. */
export interface StatusMessageFocusProviderProps {
  /**
   * Moves focus to a stable stop, such as the map region. A `StatusMessage`
   * below the provider calls it when it goes away with focus inside it and the
   * element focus came from cannot take focus. The latest function is used.
   */
  readonly fallback: () => void;
  readonly children: ReactNode;
}

/**
 * Says where focus goes when a `StatusMessage` below it goes away and focus
 * cannot return to where it came from. `MapView` supplies its own map region,
 * so each map restores to itself; a host that renders messages without a
 * `MapView` can supply its own stop. Without a provider, focus is left alone.
 */
export function StatusMessageFocusProvider({
  fallback,
  children,
}: StatusMessageFocusProviderProps) {
  const latest = useLatestRef(fallback);
  const stable = useCallback(() => latest.current(), [latest]);
  return (
    <StatusMessageFocusContext.Provider value={stable}>
      {children}
    </StatusMessageFocusContext.Provider>
  );
}

/**
 * The fallback focus function the nearest {@link StatusMessageFocusProvider}
 * supplies, or null without one. Internal to `StatusMessage`, which calls it
 * when it goes away with focus inside it; the package index does not export it.
 */
export function useStatusMessageFocusFallback(): FocusFallback | null {
  return useContext(StatusMessageFocusContext);
}
