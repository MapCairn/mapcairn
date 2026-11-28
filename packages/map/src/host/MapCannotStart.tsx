// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapDefinition,
  MapEngineError,
  message,
} from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useMessages } from "../services";
import { useAnnounce } from "../ui/LiveRegion";
import * as styles from "./MapCannotStart.css";
import { landmarkName } from "./useLandmarkName";

/** What {@link MapCannotStart} takes from the map view that could not start. */
export interface MapCannotStartProps {
  readonly basemap: BasemapDefinition;
  readonly onEngineError?: (
    error: MapEngineError,
    basemap: BasemapDefinition,
  ) => void;
  readonly id?: string;
  readonly testId?: string;
  readonly label?: string;
}

/**
 * Moves focus to the target when the element that had it is gone because the
 * target replaced it. That element is read during the first render, while what
 * is being replaced is still in the page. Focus that is anywhere else on the
 * page stays where it is.
 */
function useFocusLeftBehind(target: RefObject<HTMLElement | null>) {
  const [held] = useState(() => document.activeElement);
  useLayoutEffect(() => {
    if (held !== null && !held.isConnected) {
      target.current?.focus();
    }
  }, [held, target]);
}

/**
 * What a map view draws in place of the map when its interface could not be
 * loaded: the notice that the map could not start, in a region named as the map
 * is. The engine is never started, because a map must not be drawn without its
 * controls and credits. The caller is told once, with an
 * `interface-load-failed` `MapEngineError`, which is not about the basemap. It
 * is told from a layout effect, so what it removes or adds in answer is on
 * screen in the same paint as the notice.
 *
 * @remarks The notice is announced once, assertively, through the shared
 *   announcer, rather than being a live region itself, so it is spoken once.
 *   It has no button: reloading the page is what it asks for. When it takes
 *   the place of a drawn view that had focus, the region takes the focus.
 */
export function MapCannotStart({
  basemap,
  onEngineError,
  id,
  testId,
  label,
}: MapCannotStartProps) {
  const messages = useMessages();
  const { t } = messages;
  const announce = useAnnounce();
  const text = t("app.banner.engineFailed", {});
  const caller = useLatestRef({ onEngineError, basemap });
  const told = useRef(false);

  const region = useRef<HTMLElement>(null);
  useFocusLeftBehind(region);

  useLayoutEffect(() => {
    if (told.current) {
      return;
    }
    told.current = true;
    caller.current.onEngineError?.(
      new MapEngineError(
        "interface-load-failed",
        "The map could not start: part of its interface did not load.",
      ),
      caller.current.basemap,
    );
  }, [caller]);

  const named = label !== undefined && label !== "";
  useEffect(() => {
    announce(named ? message("host.map.announcement", { label, text }) : text, {
      priority: "assertive",
    });
  }, [announce, named, label, text]);

  return (
    <section
      ref={region}
      id={id}
      aria-label={landmarkName(messages, "host.map.label", label)}
      // The target of a skip link to the map, so it takes focus.
      tabIndex={-1}
      data-map-host=""
      data-state="error"
      data-testid={testId}
      className={styles.root}
    >
      <p className={styles.notice}>{text}</p>
    </section>
  );
}
