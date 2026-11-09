import { announceTileError } from "@karta/core";
import { StatusMessage, useMap } from "@karta/map";
import { useEffect, useState } from "react";
import { useReloadPage } from "./ErrorPage";
import * as styles from "./MapBanners.css";
import type { MapApp } from "./useMapApp";

/** Shown after a vector basemap failed for lack of WebGL. */
export const FALLBACK_NOTICE =
  "This device cannot draw vector maps, so a simpler map is shown.";

/** Shown when no engine could start. */
export const ENGINE_FAILED_MESSAGE =
  "The map could not start. Reload the page to try again.";

/** Props for {@link MapBanners}. */
export interface MapBannersProps {
  readonly app: MapApp;
}

/**
 * Whether {@link MapBanners} has anything to show, so the chrome can leave
 * the bottom-centre slot out when it is empty.
 */
export function hasBanners(
  app: MapApp,
  map: { readonly tileError: boolean; readonly error: unknown },
): boolean {
  return (
    app.fallbackNotice ||
    app.locate.state === "error" ||
    map.tileError ||
    map.error !== null
  );
}

/**
 * The status banners in the bottom-centre slot: a tile error with Retry, a
 * location error, the notice that a simpler map is shown, and a map that
 * could not start, with Reload.
 *
 * @remarks Each banner is a `StatusMessage`, which is a live region itself
 *   (an alert for errors, a status for the notice). So nothing here is also
 *   sent to the announcer, and `useLocate` is told not to announce errors:
 *   every message is spoken once. Errors stay until dismissed.
 */
export function MapBanners({ app }: MapBannersProps) {
  const map = useMap();
  const reload = useReloadPage();
  const [tileErrorDismissed, setTileErrorDismissed] = useState(false);
  const [engineErrorDismissed, setEngineErrorDismissed] = useState(false);

  // A dismissed banner comes back for the next failure, not the same one.
  useEffect(() => {
    if (!map.tileError) {
      setTileErrorDismissed(false);
    }
  }, [map.tileError]);
  useEffect(() => {
    if (map.error === null) {
      setEngineErrorDismissed(false);
    }
  }, [map.error]);

  const engineFailed =
    map.error !== null && map.error.reason !== "webgl-unavailable";

  return (
    <div className={styles.stack} data-testid="map-banners">
      {map.tileError && !tileErrorDismissed ? (
        <StatusMessage
          variant="error"
          data-testid="tile-error"
          action={{ label: "Retry", onClick: map.retry }}
          onDismiss={() => setTileErrorDismissed(true)}
        >
          {announceTileError()}
        </StatusMessage>
      ) : null}
      {app.locate.state === "error" ? (
        <StatusMessage
          variant="error"
          data-testid="locate-error"
          action={{ label: "Try again", onClick: app.locate.locate }}
          onDismiss={app.locate.cancel}
        >
          {app.locate.message}
        </StatusMessage>
      ) : null}
      {app.fallbackNotice ? (
        <StatusMessage
          variant="info"
          data-testid="engine-fallback"
          onDismiss={app.dismissFallbackNotice}
        >
          {FALLBACK_NOTICE}
        </StatusMessage>
      ) : null}
      {engineFailed && !engineErrorDismissed ? (
        <StatusMessage
          variant="error"
          data-testid="engine-error"
          action={{ label: "Reload", onClick: reload }}
          onDismiss={() => setEngineErrorDismissed(true)}
        >
          {ENGINE_FAILED_MESSAGE}
        </StatusMessage>
      ) : null}
    </div>
  );
}
