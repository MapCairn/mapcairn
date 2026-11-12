// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useAnnounce, useMap } from "@mapcairn/map";
import { useEffect } from "react";
import * as styles from "./MapUnavailable.css";

/** The headline shown in place of the map when the browser has no WebGL. */
export const WEBGL_UNAVAILABLE_TITLE = "MapCairn needs WebGL to draw the map.";

/** What the person can do about it. */
export const WEBGL_UNAVAILABLE_ADVICE =
  "This browser has WebGL turned off or does not support it. Try a different browser, or turn on hardware acceleration in your browser settings.";

/**
 * The message drawn in place of the map when the engine cannot start because
 * WebGL is missing. It sits inside the map region, in the cell the engine
 * would fill, so the region and the skip link still work. There is no Retry:
 * mounting again would fail the same way.
 *
 * @remarks It is announced once, assertively, through the shared announcer
 *   rather than being a live region itself, so it is spoken once and the
 *   app keeps a single set of live regions.
 */
export function MapUnavailable() {
  const map = useMap();
  const announce = useAnnounce();
  const unavailable = map.error?.reason === "webgl-unavailable";

  useEffect(() => {
    if (unavailable) {
      announce(`${WEBGL_UNAVAILABLE_TITLE} ${WEBGL_UNAVAILABLE_ADVICE}`, {
        priority: "assertive",
      });
    }
  }, [unavailable, announce]);

  if (!unavailable) {
    return null;
  }
  return (
    <div className={styles.cell} data-testid="webgl-unavailable">
      <div className={styles.card}>
        <p className={styles.title}>{WEBGL_UNAVAILABLE_TITLE}</p>
        <p className={styles.message}>{WEBGL_UNAVAILABLE_ADVICE}</p>
      </div>
    </div>
  );
}
