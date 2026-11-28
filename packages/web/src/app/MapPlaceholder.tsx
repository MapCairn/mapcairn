// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  ChromeSkeleton,
  chromeSkeletonCopy,
  useMessages,
  VisuallyHidden,
} from "@mapcairn/map";
import { useLayoutEffect } from "react";
import { MAP_REGION_ID } from "./initialView";
import { NoScriptNotice } from "./NoScriptNotice";
import { mapPlaceholder, placeholderChrome } from "./shell.css";

/**
 * What stands where the map goes until it is drawn: a busy `main` in the map's
 * background colour with the map region's id, holding the loading text, the
 * decorative `ChromeSkeleton` and, where scripts do not run, the notice that
 * the map needs them. The server sends it, and the app keeps it up until
 * `MapView` has drawn.
 */
export function MapPlaceholder() {
  const messages = useMessages();
  const { t } = messages;
  return (
    <main
      className={mapPlaceholder}
      aria-busy="true"
      id={MAP_REGION_ID}
      data-testid="map-placeholder"
    >
      <noscript>
        <NoScriptNotice />
      </noscript>
      <div className={placeholderChrome}>
        <VisuallyHidden>{t("app.loadingMap", {})}</VisuallyHidden>
        <ChromeSkeleton copy={chromeSkeletonCopy(messages)} directions draw />
      </div>
    </main>
  );
}

/**
 * A child of `MapView`, which mounts its children only once it draws: it says
 * so before the browser paints, so the placeholder and the map are never on
 * screen together, nor neither of them.
 */
export function WhenDrawn({ onDrawn }: { readonly onDrawn: () => void }) {
  useLayoutEffect(() => {
    onDrawn();
  }, [onDrawn]);
  return null;
}
