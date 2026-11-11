import { announceTileError } from "@mapcairn/core";
import { type MapContextValue, StatusMessage, useMap } from "@mapcairn/map";
import { useEffect, useState } from "react";
import { useReloadPage } from "./ErrorPage";
import * as styles from "./MapBanners.css";
import type { MapApp } from "./useMapApp";

/** Shown when the engine could not start for a reason other than missing WebGL. */
export const ENGINE_FAILED_MESSAGE =
  "The map could not start. Reload the page to try again.";

/** Shown when the engine stopped working after it had loaded (a worker failed). */
export const ENGINE_STOPPED_MESSAGE =
  "The map stopped working. Reload the page to try again.";

/** Shown when a chosen basemap could not load; the map keeps the previous one. */
export const BASEMAP_FAILED_MESSAGE = "That basemap could not be loaded.";

/** Shown when every tile of a basemap failed, which means its provider is down. */
export function basemapUnavailableMessage(name: string): string {
  return `${name} is not available right now.`;
}

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

  return (
    <div className={styles.stack} data-testid="map-banners">
      {map.tileError &&
      !tileErrorDismissed &&
      !app.basemapFailure?.unavailable ? (
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
      {app.basemapFailure !== null ? (
        <StatusMessage
          variant="error"
          data-testid="basemap-error"
          action={
            app.basemapFailure.stayed
              ? undefined
              : {
                  label: "Use previous basemap",
                  onClick: app.restorePreviousBasemap,
                }
          }
          onDismiss={app.restorePreviousBasemap}
        >
          {app.basemapFailure.unavailable
            ? basemapUnavailableMessage(app.basemapFailure.name)
            : BASEMAP_FAILED_MESSAGE}
        </StatusMessage>
      ) : null}
      {engineFailed(map) && !engineErrorDismissed ? (
        <StatusMessage
          variant="error"
          data-testid="engine-error"
          action={{ label: "Reload", onClick: reload }}
          onDismiss={() => setEngineErrorDismissed(true)}
        >
          {map.error?.reason === "stopped"
            ? ENGINE_STOPPED_MESSAGE
            : ENGINE_FAILED_MESSAGE}
        </StatusMessage>
      ) : null}
    </div>
  );
}
