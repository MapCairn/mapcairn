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
import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { type CatalogueView, loadFailed } from "./catalogueView";
import * as styles from "./Layers.css";

/** Props for {@link CatalogueStatus}. */
export interface CatalogueStatusProps {
  readonly catalogue: CatalogueView;
  /** How many layers the catalogue holds, to tell an empty list from a shown one. */
  readonly layerCount: number;
  /** Asks the catalogue to load again (`DataLayers.retryCatalogue`). */
  readonly onRetry: () => void;
  /**
   * Called when a retry that Try again started has recovered and Try again has
   * gone, so the section can put focus where the button was.
   */
  readonly onRecovered: () => void;
}

/** The words of the failure row: the retry in progress, or what failed. */
function failureText(catalogue: CatalogueView, retrying: boolean): string {
  if (retrying) {
    return describeLayersLoading();
  }
  return catalogue.status === "failed"
    ? describeLayersLoadFailed()
    : describeLayersRefreshFailed();
}

/**
 * What the Layers section says about the catalogue: loading, failed (or a
 * failed refresh, with the last list still shown) with Try again, empty, and
 * how many definitions could not be shown. It is plain text, not a live
 * region: `useDataLayers` says each transition once through the shared one,
 * so nothing here is read twice.
 *
 * @remarks Try again stays in place while it retries, busy, so focus stays on
 *   it. When the retry recovers it goes, and focus moves to `onRecovered`'s
 *   target, but only if focus was left with nothing (on the page itself):
 *   someone who moved on is left alone. If the retry fails again the button is
 *   still there and keeps focus. A refresh the host started that is only
 *   loading shows nothing: the list stays as it was.
 */
export function CatalogueStatus({
  catalogue,
  layerCount,
  onRetry,
  onRecovered,
}: CatalogueStatusProps) {
  const [retrying, setRetrying] = useState(false);
  const loading =
    catalogue.status === "loading" || catalogue.refresh === "loading";
  const failed = loadFailed(catalogue);
  const retryingNow = retrying && loading;
  const showsRetry = failed || retryingNow;

  useEffect(() => {
    if (!retrying || loading) {
      return;
    }
    setRetrying(false);
    const focused = document.activeElement;
    if (!failed && (focused === null || focused === document.body)) {
      onRecovered();
    }
  }, [retrying, loading, failed, onRecovered]);

  const retry = () => {
    setRetrying(true);
    onRetry();
  };

  return (
    <>
      {showsRetry ? (
        <div className={styles.status} data-testid="catalogue-status">
          <span className={retryingNow ? undefined : styles.statusError}>
            {retryingNow ? null : <Icon icon={TriangleAlert} />}
            {failureText(catalogue, retryingNow)}
          </span>
          <Button
            variant="secondary"
            icon={RotateCw}
            busy={loading}
            data-testid="catalogue-retry"
            onClick={retry}
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
