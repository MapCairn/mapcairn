// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ChromeLayout } from "@mapcairn/core";
import { createContext, type ReactNode, useContext } from "react";

/** What {@link MapChrome} tells the surfaces and slots inside it. */
export interface ChromeLayoutValue {
  /** Bottom sheet on narrow, tall screens; side panel from 768px wide or under 500px tall. */
  readonly layout: ChromeLayout;
  /** The size of the chrome container, in CSS pixels. */
  readonly viewport: { readonly width: number; readonly height: number };
  /** The primary input is a fine pointer, so zoom buttons and keyboard help make sense by default. */
  readonly finePointer: boolean;
  /** The open side panel's right edge, in px from the left of the container. Null in the sheet layout, or before the panel has measured. */
  readonly panelEdge: number | null;
  /**
   * The sheet publishes its current top edge (px from the top of the chrome
   * container) so the bottom slots can ride above it. Pass null when closed.
   */
  publishSheetTop(px: number | null): void;
  /** The measure toolbar publishes its top edge the same way. Pass null when hidden. */
  publishToolbarTop(px: number | null): void;
}

/** Used outside a `MapChrome`, for example in unit tests of a single component. */
const defaultValue: ChromeLayoutValue = {
  layout: "sheet",
  viewport: { width: 0, height: 0 },
  finePointer: true,
  panelEdge: null,
  publishSheetTop() {},
  publishToolbarTop() {},
};

const ChromeLayoutContext = createContext<ChromeLayoutValue>(defaultValue);

/** Props for {@link ChromeLayoutProvider}. */
export interface ChromeLayoutProviderProps {
  readonly value: ChromeLayoutValue;
  readonly children: ReactNode;
}

/** Provides layout facts and the edge-publishing callbacks. Only `MapChrome` mounts this. */
export function ChromeLayoutProvider({
  value,
  children,
}: ChromeLayoutProviderProps) {
  return (
    <ChromeLayoutContext.Provider value={value}>
      {children}
    </ChromeLayoutContext.Provider>
  );
}

/**
 * Reads the chrome layout. Outside a `MapChrome` it returns a harmless default
 * (sheet layout, no-op publishers) so a component can be tested on its own.
 */
export function useChromeLayout(): ChromeLayoutValue {
  return useContext(ChromeLayoutContext);
}
