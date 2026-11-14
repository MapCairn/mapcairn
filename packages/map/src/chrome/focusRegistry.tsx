// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FocusTarget } from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";

/** The controls focus can return to when a surface closes. */
export type FocusName = FocusTarget;

interface FocusRegistryValue {
  register(name: FocusName, element: HTMLElement | null): void;
  restore(name: FocusName | null): void;
  element(name: FocusName): HTMLElement | null;
}

const FocusRegistryContext = createContext<FocusRegistryValue | null>(null);

/** Props for {@link FocusRegistryProvider}. */
export interface FocusRegistryProviderProps {
  /** Focuses the map region. Used when the control that opened a surface no longer exists. */
  readonly focusMap: () => void;
  readonly children: ReactNode;
}

/**
 * Remembers the elements that open surfaces, so closing a surface can put
 * focus back on the control that opened it, or on the map when that control is
 * gone. Safari does not focus buttons on click, so focus is always moved with
 * an explicit `focus()` call.
 */
export function FocusRegistryProvider({
  focusMap,
  children,
}: FocusRegistryProviderProps) {
  const elements = useRef(new Map<FocusName, HTMLElement>());
  const focusMapRef = useLatestRef(focusMap);

  const register = useCallback(
    (name: FocusName, target: HTMLElement | null) => {
      if (target) {
        elements.current.set(name, target);
      } else {
        elements.current.delete(name);
      }
    },
    [],
  );

  const restore = useCallback(
    (name: FocusName | null) => {
      const element = name ? elements.current.get(name) : undefined;
      if (element?.isConnected) {
        element.focus();
        return;
      }
      focusMapRef.current();
    },
    [focusMapRef],
  );

  const element = useCallback((name: FocusName) => {
    const found = elements.current.get(name);
    return found?.isConnected ? found : null;
  }, []);

  const value = useMemo(
    () => ({ register, restore, element }),
    [register, restore, element],
  );
  return (
    <FocusRegistryContext.Provider value={value}>
      {children}
    </FocusRegistryContext.Provider>
  );
}

function useRegistry(): FocusRegistryValue {
  const value = useContext(FocusRegistryContext);
  if (!value) {
    throw new Error(
      "Focus registry hooks must be used inside a FocusRegistryProvider.",
    );
  }
  return value;
}

/**
 * Returns a ref callback to put on the control that opens a surface, so focus
 * can come back to it: `<IconButton ref={useFocusTarget("map-options")} />`.
 */
export function useFocusTarget(
  name: FocusName,
): (element: HTMLElement | null) => void {
  const { register } = useRegistry();
  return useCallback(
    (element: HTMLElement | null) => {
      register(name, element);
    },
    [register, name],
  );
}

/**
 * Returns `restore(name)`, which focuses the registered control, or the map
 * region when the name is null or the control is no longer in the document.
 */
export function useFocusReturn(): (name: FocusName | null) => void {
  return useRegistry().restore;
}

/**
 * Returns `element(name)`, the registered control in the document, or null.
 * Read-only: the first-visit tour uses it to ring the control a step names.
 */
export function useFocusElement(): (name: FocusName) => HTMLElement | null {
  return useRegistry().element;
}
