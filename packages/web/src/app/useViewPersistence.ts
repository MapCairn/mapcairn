import type { ViewState } from "@karta/core";
import { useSettings, useUrlState } from "@karta/map";
import { useCallback, useEffect, useRef } from "react";

/** Quiet time after the map stops before the view is saved for next time. */
export const SAVE_VIEW_DELAY_MS = 1000;

/** What {@link useViewPersistence} returns. */
export interface ViewPersistence {
  /** Pass to `MapView`'s `onViewChange` (called on `moveEnd`). */
  readonly onViewChange: (view: ViewState) => void;
  /** The last view the map reported, or the initial view before that. */
  readonly latestView: () => ViewState;
}

/**
 * Keeps the shareable link and the saved view in step with the map.
 *
 * @remarks Every settled view and every basemap choice is written to the
 *   link through `UrlState`, which debounces and uses `replaceState`. The
 *   view is also saved as `lastView`, after {@link SAVE_VIEW_DELAY_MS} of
 *   quiet, and at once when the app unmounts.
 */
export function useViewPersistence(
  initialView: ViewState,
  basemapChoice: string,
): ViewPersistence {
  const url = useUrlState();
  const { update } = useSettings();
  const viewRef = useRef(initialView);
  const choiceRef = useRef(basemapChoice);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(() => {
    pending.current = null;
    update({ lastView: viewRef.current });
  }, [update]);

  const onViewChange = useCallback(
    (view: ViewState) => {
      viewRef.current = view;
      url.write({ view, basemapId: choiceRef.current });
      if (pending.current !== null) {
        clearTimeout(pending.current);
      }
      pending.current = setTimeout(save, SAVE_VIEW_DELAY_MS);
    },
    [url, save],
  );

  useEffect(() => {
    if (choiceRef.current === basemapChoice) {
      return;
    }
    choiceRef.current = basemapChoice;
    url.write({ view: viewRef.current, basemapId: basemapChoice });
  }, [url, basemapChoice]);

  useEffect(
    () => () => {
      if (pending.current !== null) {
        clearTimeout(pending.current);
        save();
      }
    },
    [save],
  );

  const latestView = useCallback(() => viewRef.current, []);
  return { onViewChange, latestView };
}
