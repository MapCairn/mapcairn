// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceOffline,
  announceTileError,
  resolveText,
} from "@mapcairn/core";
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
import type { ConnectionNotice } from "./useConnectionNotice";
import type { MapApp } from "./useMapApp";

/** Props for {@link MapBanners}. */
export interface MapBannersProps {
  readonly app: MapApp;
  readonly connection: ConnectionNotice;
}

/**
 * Whether {@link MapBanners} has anything to show, so the chrome can leave
 * the bottom-centre slot out when it is empty.
 */
export function hasBanners(
  app: MapApp,
  map: Pick<MapContextValue, "tileError" | "error">,
  connection: ConnectionNotice,
): boolean {
  return (
    connection.notice !== null ||
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
 * The status banners in the bottom-centre slot: the connection notice (the
 * device went offline, or is back with one Try again for what failed), a
 * tile error with Retry, a
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
 *   every message is spoken once. Errors stay until dismissed. The connection
 *   notice is a polite status that dismisses itself, and while it is up the
 *   tile error is left out: both would say that the map could not load.
 */
export function MapBanners({ app, connection }: MapBannersProps) {
  const map = useMap();
  const format = useFormatMessage();
  const messages = useMessages();
  const { t } = messages;
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

  const failedLayers = app.layers.layers.filter(
    ({ status }) => status.kind === "error",
  );
  const retryEverything = () => {
    map.retry();
    for (const { definition } of failedLayers) {
      app.layers.retry(definition.id);
    }
    connection.dismiss();
  };
  const hasFailures = map.tileError || failedLayers.length > 0;

  const basemapMessage = app.basemapFailure?.unavailable
    ? t("app.banner.basemapUnavailable", {
        name: resolveText(messages, app.basemapFailure.name),
      })
    : t("app.banner.basemapFailed", {});
  const engineMessage =
    map.error?.reason === "stopped"
      ? t("app.banner.engineStopped", {})
      : t("app.banner.engineFailed", {});

  return (
    <div className={styles.stack} data-testid="map-banners">
      {connection.notice === null ? null : (
        <StatusMessage
          key={connection.notice}
          variant="info"
          data-testid="connection-notice"
          action={
            connection.notice === "online" && hasFailures
              ? {
                  label: t("app.banner.tryAgain", {}),
                  onClick: retryEverything,
                }
              : undefined
          }
          onDismiss={connection.dismiss}
        >
          {connection.notice === "offline"
            ? format(announceOffline())
            : t("app.banner.online", {})}
        </StatusMessage>
      )}
      {map.tileError &&
      connection.notice === null &&
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
