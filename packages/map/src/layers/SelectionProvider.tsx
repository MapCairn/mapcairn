// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createContext, type ReactNode, useContext } from "react";
import type { FeatureSelectionState } from "./useFeatureSelection";

const SelectionContext = createContext<FeatureSelectionState | undefined>(
  undefined,
);

/** Props for {@link SelectionProvider}. */
export interface SelectionProviderProps {
  /** What {@link useFeatureSelection} returned: null when the host has no store. */
  readonly selection: FeatureSelectionState | null;
  readonly children?: ReactNode;
}

/**
 * Hands the selected set down to the components that show or change it, so
 * none needs a prop for it. Put it where the host calls `useFeatureSelection`,
 * around the map and the sheet. With `selection` null it provides nothing, so
 * a host with no store passes the hook's result as it is.
 */
export function SelectionProvider({
  selection,
  children,
}: SelectionProviderProps) {
  return (
    <SelectionContext.Provider value={selection ?? undefined}>
      {children}
    </SelectionContext.Provider>
  );
}

/**
 * The selected set, or undefined outside a {@link SelectionProvider} or when
 * the host offers no selection. A component that selects or lists features
 * renders nothing then.
 */
export function useSelection(): FeatureSelectionState | undefined {
  return useContext(SelectionContext);
}
