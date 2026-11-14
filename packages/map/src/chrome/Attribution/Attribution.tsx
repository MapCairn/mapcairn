// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapDefinition,
  buildAttribution,
  type LayerAttribution,
  type ViewState,
} from "@mapcairn/core";
import { Info } from "lucide-react";
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useMap } from "../../host";
import { usePreferences } from "../../services";
import { IconButton } from "../../ui";
import { CHROME_GAP_PX } from "../chromeSpacing";
import * as styles from "./Attribution.css";

/**
 * How long the credits stay on screen by themselves once the map has
 * started, if the person does nothing with the map first.
 */
export const ATTRIBUTION_INTRO_MS = 5000;

/** How long the credits take to fade out after their first showing. */
export const ATTRIBUTION_FADE_MS = 200;

/**
 * Where the credits popover sits: straight above the bottom row, or, when the
 * list would have to scroll there, beside the end stack where there is more
 * height (a short landscape phone).
 */
type Placement = "above" | "beside";

/** Smaller differences than this, in degrees or zoom levels, are not a move. */
const VIEW_EPSILON = 1e-9;

/** Whether two views show the same place at the same zoom and bearing. */
function sameView(a: ViewState, b: ViewState): boolean {
  return (
    Math.abs(a.center.lat - b.center.lat) < VIEW_EPSILON &&
    Math.abs(a.center.lng - b.center.lng) < VIEW_EPSILON &&
    Math.abs(a.zoom - b.zoom) < VIEW_EPSILON &&
    Math.abs(a.bearing - b.bearing) < VIEW_EPSILON
  );
}

/**
 * Whether the open credits popover starts a gap after the end edge of the
 * readout in bottom-start, so the two share no width and the popover need not
 * rise over the readout's height. True when the chrome has no readout. It is
 * measured before the popover is painted and again whenever the popover, the
 * readout or the chrome changes size (the cursor coordinates widen the readout
 * as the pointer enters the map) and whenever the readout finishes sliding
 * sideways (the side panel opening or closing moves it with a transform and
 * no change of size). Nothing is observed while the popover is closed.
 */
function useClearOfReadout(
  regionRef: RefObject<HTMLElement | null>,
  open: boolean,
  placement: Placement,
): boolean {
  const [clear, setClear] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the placement moves the popover sideways, which is what is measured.
  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!open || region === null) {
      return;
    }
    const chrome = region.closest("[data-chrome-root]");
    const readout =
      chrome?.querySelector<HTMLElement>('[data-chrome="bottom-start"]') ??
      null;
    const measure = () => {
      setClear(
        readout === null ||
          region.getBoundingClientRect().left >=
            readout.getBoundingClientRect().right + CHROME_GAP_PX,
      );
    };
    measure();
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === readout && event.propertyName === "transform") {
        measure();
      }
    };
    readout?.addEventListener("transitionend", onTransitionEnd);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    for (const element of [region, chrome, readout]) {
      if (element) {
        observer?.observe(element);
      }
    }
    return () => {
      readout?.removeEventListener("transitionend", onTransitionEnd);
      observer?.disconnect();
    };
  }, [open, placement, regionRef]);
  return clear;
}

const NO_CREDITS: readonly LayerAttribution[] = [];

/** Props for {@link Attribution}. */
export interface AttributionProps {
  /** The active basemap. Its credits, plus the engine's, are listed. */
  readonly basemap: BasemapDefinition;
  /** Credits of the data layers that are on, listed after the map's own. */
  readonly layerCredits?: readonly LayerAttribution[];
}

/**
 * The map credits for the bottom-end slot: a compact "Map credits" button
 * (a 44 px target around a small info glyph) that expands into a labelled
 * region of credit links built with `buildAttribution`.
 *
 * @remarks The credits are shown by themselves once, when the map has
 *   started, because the OpenStreetMap attribution guidelines allow them to
 *   be collapsed only after they have been seen. That first showing moves no
 *   focus and is a plain region, not a dialog or live region, so nothing is
 *   announced. It collapses on the first map interaction (a zoom the person
 *   makes, the map moving, a press outside it) or after
 *   {@link ATTRIBUTION_INTRO_MS}, whichever comes first, fading out unless
 *   reduced motion is on. Focus moving into it during that time keeps it
 *   open as if the person had opened it.
 *
 *   After that it behaves as a popover the person opens. It opens above the
 *   bottom row, clear of the readout beside the button; where it starts a gap
 *   after the readout's end edge, so the two share no width, it sits next to
 *   the button instead of rising over the readout's height, and it is
 *   measured again when the readout resizes or slides sideways. If the
 *   credits would scroll there, it moves beside the end stack before it is
 *   painted, where
 *   `MapChrome` measures more room; it scrolls only if that is not enough
 *   either. Opening moves focus to the first link.
 *   The popover closes on Escape, on a second press of the button, on a
 *   pointer down outside it, and when the map moves; if focus was inside it,
 *   focus goes back to the button with an explicit `focus()` (Safari does not
 *   focus buttons on click). The credits are always reachable through the
 *   button; nothing here hides or removes them. Reads the map with
 *   `useMap()`, so it must sit inside the map context.
 */
export function Attribution({
  basemap,
  layerCredits = NO_CREDITS,
}: AttributionProps) {
  const { adapter, view, onUserZoom } = useMap();
  const { reducedMotion } = usePreferences();
  const [open, setOpen] = useState(false);
  // True while the credits show by themselves after the map started.
  const [intro, setIntro] = useState(false);
  // Set when the first showing has started, so a test or a caller can tell a
  // collapsed start (no map yet) from an intro that has finished.
  const [introStarted, setIntroStarted] = useState(false);
  const [fading, setFading] = useState(false);
  // Counts the openings the person asked for, each of which moves focus in.
  const [openRequest, setOpenRequest] = useState(0);
  const [placement, setPlacement] = useState<Placement>("above");
  const regionId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLElement>(null);
  const clearOfReadout = useClearOfReadout(regionRef, open, placement);
  const openedOnView = useRef(view);
  const introShown = useRef(false);
  // A credit the basemap already gives, such as OpenStreetMap's, is listed
  // once.
  const basemapEntries = buildAttribution(basemap);
  const entries = [
    ...basemapEntries,
    ...layerCredits
      .filter(
        (credit) => !basemapEntries.some((entry) => entry.text === credit.text),
      )
      .map((credit) => ({ text: credit.text, href: credit.url })),
  ];

  const close = useCallback(() => {
    const root = rootRef.current;
    const active = root?.ownerDocument.activeElement ?? null;
    const focusWasInside = active !== null && root?.contains(active) === true;
    setOpen(false);
    setIntro(false);
    setFading(false);
    if (focusWasInside) {
      root?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, []);

  /** Closes, fading out first if the credits are showing by themselves. */
  const dismiss = useCallback(() => {
    if (intro && !reducedMotion) {
      setIntro(false);
      setFading(true);
      return;
    }
    close();
  }, [close, intro, reducedMotion]);

  const toggle = () => {
    if (open && !fading) {
      close();
      return;
    }
    openedOnView.current = view;
    setPlacement("above");
    setIntro(false);
    setFading(false);
    setOpen(true);
    setOpenRequest((count) => count + 1);
  };

  // Shown once, when the map has started: before that there is no map to credit.
  useEffect(() => {
    if (adapter === null || introShown.current) {
      return;
    }
    introShown.current = true;
    openedOnView.current = view;
    setPlacement("above");
    setOpen(true);
    setIntro(true);
    setIntroStarted(true);
  }, [adapter, view]);

  useEffect(() => {
    if (!intro) {
      return;
    }
    const timer = setTimeout(dismiss, ATTRIBUTION_INTRO_MS);
    const unsubscribe = onUserZoom(dismiss);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [intro, dismiss, onUserZoom]);

  useEffect(() => {
    if (!fading) {
      return;
    }
    const timer = setTimeout(close, ATTRIBUTION_FADE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [fading, close]);

  // Before the first paint of an open popover: if the credits overflow the
  // room above the button, use the room beside the end stack instead.
  useLayoutEffect(() => {
    const region = regionRef.current;
    if (
      open &&
      placement === "above" &&
      region !== null &&
      region.scrollHeight > region.clientHeight
    ) {
      setPlacement("beside");
    }
  }, [open, placement]);

  // Focus moves into the popover when the person opens it.
  useEffect(() => {
    if (openRequest === 0) {
      return;
    }
    const region = regionRef.current;
    const first = region?.querySelector<HTMLElement>("a[href]");
    (first ?? region)?.focus();
  }, [openRequest]);

  // A pointer down anywhere outside closes it.
  useEffect(() => {
    const root = rootRef.current;
    if (!open || fading || !root) {
      return;
    }
    const doc = root.ownerDocument;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node && root.contains(event.target))) {
        dismiss();
      }
    };
    doc.addEventListener("pointerdown", onPointerDown);
    return () => {
      doc.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, fading, dismiss]);

  // Moving the map closes it, so it never hides what the user is looking at.
  // Compared by value: a resize reports the same view as a new object.
  useEffect(() => {
    if (open && !fading && !sameView(view, openedOnView.current)) {
      dismiss();
    }
  }, [open, fading, view, dismiss]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (open && event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  // Focus arriving during the first showing means the person is reading it.
  const onFocus = () => {
    if (intro) {
      setIntro(false);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape is handled for the button and the popover together.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Escape is handled for the button and the popover together.
    <div
      ref={rootRef}
      data-chrome="attribution"
      data-intro-started={introStarted ? "true" : undefined}
      className={styles.root}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      <IconButton
        label="Map credits"
        icon={Info}
        size="compact"
        className={styles.onMapIcon}
        expanded={open && !fading}
        controls={regionId}
        onClick={toggle}
      />
      <section
        ref={regionRef}
        id={regionId}
        aria-label="Map credits"
        tabIndex={-1}
        hidden={!open}
        data-chrome="attribution-popover"
        data-placement={placement}
        data-readout-clear={clearOfReadout ? "true" : undefined}
        data-closing={fading ? "true" : undefined}
        className={styles.popover}
      >
        <ul className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.text}>
              {entry.href ? (
                <a href={entry.href} rel="noopener" className={styles.link}>
                  {entry.text}
                </a>
              ) : (
                entry.text
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
