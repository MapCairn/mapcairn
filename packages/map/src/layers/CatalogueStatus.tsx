// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  describeLayersLoadFailed,
  describeLayersLoading,
  describeLayersRefreshFailed,
  describeLayersSkipped,
  describeNoLayers,
} from "@mapcairn/core";
import { LoaderCircle, RotateCw, TriangleAlert } from "lucide-react";
import { type FocusEvent, useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import type { CatalogueView } from "./catalogueView";
import * as styles from "./Layers.css";

/** Props for {@link CatalogueStatus}. */
export interface CatalogueStatusProps {
  readonly catalogue: CatalogueView;
  /** How many layers the catalogue holds, to tell an empty list from a shown one. */
  readonly layerCount: number;
  /** Asks the catalogue to load again (`DataLayers.retryCatalogue`). */
  readonly onRetry: () => void;
  /**
   * Called when Try again has gone because the catalogue recovered, and it had
   * focus or had just been pressed, so the section can put focus where the
   * button was.
   */
  readonly onRecovered: () => void;
}

/** The words of the failure row when nothing is being retried: what failed. */
function failureText(catalogue: CatalogueView): string {
  return catalogue.status === "failed"
    ? describeLayersLoadFailed()
    : describeLayersRefreshFailed();
}

/**
 * Whether a retry that Try again started is under way. It starts at the press
 * and ends once the catalogue has been seen loading and has stopped, so a
 * catalogue that publishes `loading` only after `refresh()` has returned is
 * still taken as one retry.
 */
function useRetry(loading: boolean) {
  const [retrying, setRetrying] = useState(false);
  const sawLoading = useRef(false);
  useEffect(() => {
    if (!retrying) {
      return;
    }
    if (loading) {
      sawLoading.current = true;
      return;
    }
    if (sawLoading.current) {
      sawLoading.current = false;
      setRetrying(false);
    }
  }, [retrying, loading]);
  return {
    retrying,
    startRetry: () => {
      sawLoading.current = false;
      setRetrying(true);
    },
  };
}

/**
 * Hands focus on when the failure row (Try again) goes. It acts only if the
 * button had focus when it went, or a retry it started has just recovered, and
 * focus has been left with nothing (on the page itself): someone who moved on
 * is left alone. The returned handlers go on the button, to know it had focus.
 */
function useFocusHandoff(shown: boolean, retried: boolean, onGone: () => void) {
  const wasShown = useRef(false);
  const hadFocus = useRef(false);
  useEffect(() => {
    const gone = wasShown.current && !shown;
    wasShown.current = shown;
    if (!gone) {
      return;
    }
    const mine = hadFocus.current || retried;
    hadFocus.current = false;
    const focused = document.activeElement;
    if (mine && (focused === null || focused === document.body)) {
      onGone();
    }
  }, [shown, retried, onGone]);
  return {
    onFocus: () => {
      hadFocus.current = true;
    },
    // A blur from a button still on the page is a person moving on. One from a
    // button that has gone is the focused button leaving, which the handoff follows.
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (event.currentTarget.isConnected) {
        hadFocus.current = false;
      }
    },
  };
}

/**
 * What the Layers section says about the catalogue: loading, failed (or a
 * failed refresh, with the last list still shown) with Try again, empty, and
 * how many definitions could not be shown. It is plain text, not a live
 * region: `useDataLayers` says each transition once through the shared one,
 * so nothing here is read twice.
 *
 * @remarks Try again stays in place while it retries, busy, so focus stays on
 *   it. When the catalogue recovers it goes, and focus moves to
 *   `onRecovered`'s target (see {@link useFocusHandoff}), whether the retry was
 *   this button's or a refresh the host started. If a retry fails again the
 *   button is still there and keeps focus. A refresh the host started that is
 *   only loading shows nothing: the list stays as it was.
 */
export function CatalogueStatus({
  catalogue,
  layerCount,
  onRetry,
  onRecovered,
}: CatalogueStatusProps) {
  const loading =
    catalogue.status === "loading" || catalogue.refresh === "loading";
  const { retrying, startRetry } = useRetry(loading);
  const retryingNow = retrying && loading;
  const showsRetry = catalogue.failed || retryingNow;
  const focusHandoff = useFocusHandoff(showsRetry, retrying, onRecovered);

  const retry = () => {
    startRetry();
    onRetry();
  };

  return (
    <>
      {showsRetry ? (
        <div className={styles.status} data-testid="catalogue-status">
          {retryingNow ? (
            <span>{describeLayersLoading()}</span>
          ) : (
            <span className={styles.statusError}>
              <Icon icon={TriangleAlert} />
              {failureText(catalogue)}
            </span>
          )}
          <Button
            variant="secondary"
            icon={RotateCw}
            busy={loading}
            data-testid="catalogue-retry"
            onClick={retry}
            {...focusHandoff}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {!showsRetry && catalogue.status === "loading" ? (
        <p className={styles.status} data-testid="catalogue-status">
          <Icon icon={LoaderCircle} spinning />
          {describeLayersLoading()}
        </p>
      ) : null}
      {catalogue.status === "ready" && layerCount === 0 ? (
        <p className={styles.status} data-testid="catalogue-status">
          {describeNoLayers()}
        </p>
      ) : null}
      {catalogue.skipped > 0 ? (
        <p className={styles.status} data-testid="catalogue-skipped">
          {describeLayersSkipped(catalogue.skipped)}
        </p>
      ) : null}
    </>
  );
}
