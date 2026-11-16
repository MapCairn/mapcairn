// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { announceTileError } from "@mapcairn/core";
import {
  type MapContextValue,
  StatusMessage,
  useFormatMessage,
  useMap,
  useMessages,
} from "@mapcairn/map";
import { useEffect, useState } from "react";
import { useReloadPage } from "./ErrorPage";
import * as styles from "./MapBanners.css";
import type { MapApp } from "./useMapApp";

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
  map: Pick<MapContextValue, "tileError" | "error">,
): boolean {
  return (
    app.locate.state === "error" ||
    app.basemapFailure !== null ||
    map.tileError ||
    engineFailed(map)
  );
}

/** The engine could not start for a reason a reload might fix. */
function engineFailed(map: Pick<MapContextValue, "error">): boolean {
  return map.error !== null && map.error.reason !== "webgl-unavailable";
}

/**
 * The status banners in the bottom-centre slot: a tile error with Retry, a
 * location error, a basemap that could not load (the map keeps the previous
 * one, so it offers to go back to it rather than Reload, and dismissing it
 * goes back too, so the picker always matches the map), and a map that could
 * not start or stopped working, with
 * Reload. Reload rather than a remount: the engine stops when its worker
 * script fails to load (a wrong URL, or one the CSP blocks), and a new map
 * would fetch the same script and fail the same way. Missing WebGL
 * is not a banner: `MapUnavailable` shows it in place of the map.
 *
 * @remarks Each banner is a `StatusMessage`, which is a live region itself
 *   (an alert for errors, a status for the notice). So nothing here is also
 *   sent to the announcer, and `useLocate` is told not to announce errors:
 *   every message is spoken once. Errors stay until dismissed.
 */
export function MapBanners({ app }: MapBannersProps) {
  const map = useMap();
  const format = useFormatMessage();
  const { t } = useMessages();
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

  const basemapMessage = app.basemapFailure?.unavailable
    ? t("app.banner.basemapUnavailable", { name: app.basemapFailure.name })
    : t("app.banner.basemapFailed", {});
  const engineMessage =
    map.error?.reason === "stopped"
      ? t("app.banner.engineStopped", {})
      : t("app.banner.engineFailed", {});

  return (
    <div className={styles.stack} data-testid="map-banners">
      {map.tileError &&
      !tileErrorDismissed &&
      !app.basemapFailure?.unavailable ? (
        <StatusMessage
          variant="error"
          data-testid="tile-error"
          action={{ label: t("app.banner.retry", {}), onClick: map.retry }}
          onDismiss={() => setTileErrorDismissed(true)}
        >
          {format(announceTileError())}
        </StatusMessage>
      ) : null}
      {app.locate.state === "error" ? (
        <StatusMessage
          variant="error"
          data-testid="locate-error"
          action={{
            label: t("app.banner.tryAgain", {}),
            onClick: app.locate.locate,
          }}
          onDismiss={app.locate.cancel}
        >
          {app.locate.message}
        </StatusMessage>
      ) : null}
      {app.basemapFailure !== null ? (
        <StatusMessage
          variant="error"
          data-testid="basemap-error"
          action={
            app.basemapFailure.stayed
              ? undefined
              : {
                  label: t("app.banner.usePreviousBasemap", {}),
                  onClick: app.restorePreviousBasemap,
                }
          }
          onDismiss={app.restorePreviousBasemap}
        >
          {basemapMessage}
        </StatusMessage>
      ) : null}
      {engineFailed(map) && !engineErrorDismissed ? (
        <StatusMessage
          variant="error"
          data-testid="engine-error"
          action={{ label: t("app.reload", {}), onClick: reload }}
          onDismiss={() => setEngineErrorDismissed(true)}
        >
          {engineMessage}
        </StatusMessage>
      ) : null}
    </div>
  );
}
