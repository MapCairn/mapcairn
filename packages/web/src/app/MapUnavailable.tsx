// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { message } from "@mapcairn/core";
import { useAnnounce, useMap, useMessages } from "@mapcairn/map";
import { useEffect } from "react";
import * as styles from "./MapUnavailable.css";

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
  const { t } = useMessages();
  const unavailable = map.error?.reason === "webgl-unavailable";
  const title = t("app.webgl.title", {});
  const advice = t("app.webgl.advice", {});

  useEffect(() => {
    if (unavailable) {
      announce(message("common.followedBy", { first: title, second: advice }), {
        priority: "assertive",
      });
    }
  }, [unavailable, announce, title, advice]);

  if (!unavailable) {
    return null;
  }
  return (
    <div className={styles.cell} data-testid="webgl-unavailable">
      <div className={styles.card}>
        <p className={styles.title}>{title}</p>
        <p className={styles.message}>{advice}</p>
      </div>
    </div>
  );
}
