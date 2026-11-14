// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceDetent,
  clampHeight,
  computeDetentHeights,
  cycleDetent,
  type DetentHeights,
  nextDetent,
  resolveSnap,
  type SheetDetent,
} from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import { X } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { IconButton, useAnnounce } from "../../ui";
import { useChromeLayout } from "../layoutContext";
import { useChromeSurface } from "../MapChrome/chromeSurface";
import * as styles from "./Sheet.css";

/** How far, in px, a press may move before it counts as a drag rather than a tap. */
const DRAG_SLOP_PX = 4;

/** The window, in ms, over which release velocity is measured. */
const VELOCITY_WINDOW_MS = 100;

/**
 * Everything that can take keyboard focus inside the sheet, in tab order,
 * apart from the focus sentinels.
 */
const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"]):not([data-focus-sentinel])',
].join(", ");

/** Props for {@link Sheet}. */
export interface SheetProps {
  /** The element id, for `aria-controls` on the control that opens it. */
  readonly id: string;
  readonly open: boolean;
  /** The heading text, which also names the dialog or region. */
  readonly title: string;
  /** The app's single close action (Close button and Escape). */
  readonly onClose: () => void;
  /** The current detent. Used only in the sheet layout. */
  readonly detent: SheetDetent;
  readonly onDetentChange: (detent: SheetDetent) => void;
  /**
   * Called with true while the sheet is modal (open at the full detent in the
   * sheet layout), and false otherwise. The app passes it on to `MapChrome`'s
   * `modal`, which makes everything else `inert`.
   */
  readonly onModalChange?: (modal: boolean) => void;
  /** Called after the sheet closes, to put focus back where it came from. */
  readonly restoreFocus?: () => void;
  /** Sets `data-testid`. Defaults to the id. */
  readonly testId?: string;
  /**
   * A decorative brand (a host's mark and name) shown in a row above the
   * title. It is `aria-hidden`, so the title stays the accessible name; pass
   * nothing for no row. In the sheet layout the row is left out at the peek
   * detent, where there is no room for it.
   */
  readonly brand?: ReactNode;
  readonly children: ReactNode;
}

interface Sample {
  readonly time: number;
  readonly y: number;
}

interface Drag {
  readonly pointerId: number;
  /**
   * The element that was pressed, which holds pointer capture. Capturing on
   * the pressed element rather than the header keeps the press and the
   * release on one element, so the browser sends the click that ends a mouse
   * press to the handle and not to the header.
   */
  readonly capture: Element;
  /** Whether the press started on the handle, which receives the click after it. */
  readonly fromHandle: boolean;
  readonly startY: number;
  readonly startHeight: number;
  height: number;
  moved: boolean;
  samples: Sample[];
}

/**
 * Velocity in px/s from the oldest sample in the last
 * {@link VELOCITY_WINDOW_MS} to the release; positive when expanding. A
 * pointer held still for longer than the window releases at zero.
 */
/** The way an arrow key moves the sheet from its handle, or null for any other key. */
function handleDirection(key: string): "up" | "down" | null {
  if (key === "ArrowUp") {
    return "up";
  }
  return key === "ArrowDown" ? "down" : null;
}

function releaseVelocity(samples: readonly Sample[], release: Sample): number {
  const first = samples.reduce(
    (oldest, sample) =>
      release.time - sample.time <= VELOCITY_WINDOW_MS &&
      sample.time < oldest.time
        ? sample
        : oldest,
    release,
  );
  const elapsed = release.time - first.time;
  return elapsed > 0 ? ((first.y - release.y) / elapsed) * 1000 : 0;
}

/** The controls in the sheet that Tab can reach, in order. */
function tabbableIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(TABBABLE)];
}

/**
 * Moves Tab and Shift+Tab around the ends of the sheet, so focus cannot
 * leave it. Returns true when it moved focus.
 */
function loopFocus(container: HTMLElement, backwards: boolean): boolean {
  const tabbable = tabbableIn(container);
  const first = tabbable[0];
  const last = tabbable[tabbable.length - 1];
  if (!first || !last) {
    return false;
  }
  const index = tabbable.indexOf(
    container.ownerDocument.activeElement as HTMLElement,
  );
  if (backwards && index <= 0) {
    last.focus();
    return true;
  }
  if (!backwards && (index === -1 || index === tabbable.length - 1)) {
    first.focus();
    return true;
  }
  return false;
}

/**
 * Focuses the first or last control in the sheet. A focus sentinel calls it
 * when it receives focus.
 */
function focusEnd(container: HTMLElement | null, end: "first" | "last"): void {
  if (!container) {
    return;
  }
  const tabbable = tabbableIn(container);
  (end === "first" ? tabbable[0] : tabbable[tabbable.length - 1])?.focus();
}

/**
 * An empty element at one end of the modal sheet that is in the Tab order
 * only to catch focus about to leave the sheet. It never keeps focus: the
 * start sentinel hands it to the last control and the end sentinel to the
 * first. It is a `span` because Safari's default Tab skips buttons.
 */
function FocusSentinel({
  at,
  sheetRef,
}: {
  readonly at: "start" | "end";
  readonly sheetRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: it only forwards focus, at once, to a real control.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: it only forwards focus, at once, to a real control.
    <span
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a focus sentinel must be in the Tab order to catch focus leaving the modal sheet.
      tabIndex={0}
      data-focus-sentinel={at}
      className={styles.sentinel}
      onFocus={() =>
        focusEnd(sheetRef.current, at === "start" ? "last" : "first")
      }
    />
  );
}

/**
 * The map options surface: a bottom sheet with peek, half and full detents on
 * narrow screens, and a floating side panel in the panel layout. Rendered by
 * the app into `MapChrome`'s `sheet` slot, outside the inert wrapper.
 *
 * @remarks
 * Sheet layout: a `dialog` labelled by its heading. It is non-modal at peek
 * and half, so the map stays usable. At full it sets `aria-modal`, reports
 * `onModalChange(true)` (the app makes the rest of the chrome inert) and
 * loops Tab inside itself. Safari's default Tab skips links and buttons, so
 * the keydown loop cannot see focus reach the last control there; at full
 * the sheet also has an empty focus sentinel at each end, and the browser's
 * own Tab landing on one sends focus round to the other end. The handle is a "Resize panel" button: Enter or
 * Space cycles detents, the arrow keys step them, and the handle and header
 * can be dragged, with rubber-banding past the ends and a velocity-aware
 * snap on release. Detent changes are announced. The top edge and detent are
 * published for the bottom slots, once per animation frame while dragging.
 *
 * Panel layout: a `complementary` region labelled by its heading, never
 * modal, with no handle. It publishes its right edge so bottom-start can move
 * clear of it.
 *
 * Both: focus moves to the heading on open; Escape and Close call `onClose`;
 * `restoreFocus` runs after closing. One element serves both layouts (its
 * role and `data-layout` change) so content stays mounted across a rotation.
 * The detent heights take no bottom safe-area inset; the content pads for it.
 */
export function Sheet({
  id,
  open,
  title,
  onClose,
  detent,
  onDetentChange,
  onModalChange,
  restoreFocus,
  testId,
  brand,
  children,
}: SheetProps) {
  const { layout, viewport, publishSheetTop } = useChromeLayout();
  const { publishSheetDetent, publishPanelEdge } = useChromeSurface();
  const announce = useAnnounce();
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const frameRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const isSheet = layout === "sheet";
  const modal = open && isSheet && detent === "full";
  const heights: DetentHeights = useMemo(
    () =>
      computeDetentHeights({
        viewportHeight: viewport.height,
        insetBottom: 0,
      }),
    [viewport.height],
  );

  const latest = useLatestRef({
    onModalChange,
    restoreFocus,
    publishSheetTop,
  });

  /** Places the sheet so `height` px of it shows. Transform only. */
  const applyHeight = (height: number) => {
    sheetRef.current?.style.setProperty(
      "--sheet-offset",
      `${heights.full - height}px`,
    );
  };

  // Size and place the sheet for the detent (also re-run after a drag ends,
  // since the detent may not have changed).
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !isSheet) {
      return;
    }
    sheet.style.setProperty("--sheet-full-height", `${heights.full}px`);
    sheet.style.setProperty(
      "--sheet-offset",
      `${heights.full - heights[detent]}px`,
    );
  }, [isSheet, heights, detent]);

  // Publish the edges the bottom slots ride above or beside.
  useEffect(() => {
    if (open && isSheet) {
      publishSheetTop(viewport.height - heights[detent]);
      publishSheetDetent(detent);
    } else {
      publishSheetTop(null);
      publishSheetDetent(null);
    }
  }, [
    open,
    isSheet,
    detent,
    heights,
    viewport.height,
    publishSheetTop,
    publishSheetDetent,
  ]);

  useEffect(() => {
    const panel = sheetRef.current;
    if (!panel || !open || isSheet) {
      publishPanelEdge(null);
      return;
    }
    const publish = () => {
      publishPanelEdge(panel.offsetLeft + panel.offsetWidth);
    };
    publish();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(publish);
    observer?.observe(panel);
    return () => {
      observer?.disconnect();
    };
  }, [open, isSheet, publishPanelEdge]);

  // Clear everything this sheet published when it unmounts.
  useEffect(
    () => () => {
      latest.current.publishSheetTop(null);
      publishSheetDetent(null);
      publishPanelEdge(null);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    [latest, publishSheetDetent, publishPanelEdge],
  );

  useEffect(() => {
    latest.current.onModalChange?.(modal);
  }, [latest, modal]);

  // Focus the heading on open; hand focus back after close.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      titleRef.current?.focus();
    }
    if (!open && wasOpen.current) {
      latest.current.restoreFocus?.();
    }
    wasOpen.current = open;
  }, [latest, open]);
  // The first render may already be open.
  useEffect(() => {
    if (wasOpen.current) {
      titleRef.current?.focus();
    }
  }, []);

  // Announce detent changes, but not the detent the sheet opened at.
  const announcedDetent = useRef<SheetDetent | null>(null);
  useEffect(() => {
    if (!open || !isSheet) {
      announcedDetent.current = null;
      return;
    }
    if (
      announcedDetent.current !== null &&
      announcedDetent.current !== detent
    ) {
      announce(announceDetent(detent));
    }
    announcedDetent.current = detent;
  }, [open, isSheet, detent, announce]);

  const schedulePublish = () => {
    if (frameRef.current !== null) {
      return;
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const drag = dragRef.current;
      if (drag) {
        latest.current.publishSheetTop(viewport.height - drag.height);
      }
    });
  };

  const endDrag = (drag: Drag) => {
    dragRef.current = null;
    sheetRef.current?.removeAttribute("data-dragging");
    if (drag.capture.hasPointerCapture?.(drag.pointerId)) {
      drag.capture.releasePointerCapture(drag.pointerId);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    const fromHandle = handleRef.current?.contains(target) === true;
    const onOtherButton = target.closest("button") !== null && !fromHandle;
    if (
      !isSheet ||
      !open ||
      dragRef.current !== null ||
      onOtherButton ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }
    // Capture on the pressed element, not the header: see `Drag.capture`.
    // Moves and the release still bubble to the header's handlers.
    target.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      capture: target,
      fromHandle,
      startY: event.clientY,
      startHeight: heights[detent],
      height: heights[detent],
      moved: false,
      samples: [{ time: performance.now(), y: event.clientY }],
    };
    suppressClickRef.current = false;
    sheetRef.current?.setAttribute("data-dragging", "true");
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const time = performance.now();
    const delta = drag.startY - event.clientY;
    drag.moved ||= Math.abs(delta) > DRAG_SLOP_PX;
    drag.height = clampHeight(drag.startHeight + delta, heights);
    drag.samples = [
      ...drag.samples.filter(
        (sample) => time - sample.time <= VELOCITY_WINDOW_MS * 2,
      ),
      { time, y: event.clientY },
    ];
    applyHeight(drag.height);
    schedulePublish();
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    endDrag(drag);
    if (!drag.moved) {
      // The wobble under the slop already moved the sheet; put it back.
      applyHeight(heights[detent]);
      publishSheetTop(viewport.height - heights[detent]);
      return;
    }
    // Only the handle gets a click after a drag; a flag set for a drag from
    // the heading would never be consumed.
    suppressClickRef.current = drag.fromHandle;
    const snapped = resolveSnap({
      heights,
      currentHeight: drag.height,
      velocityPxPerSecond: releaseVelocity(drag.samples, {
        time: performance.now(),
        y: event.clientY,
      }),
    });
    applyHeight(heights[snapped]);
    publishSheetTop(viewport.height - heights[snapped]);
    if (snapped !== detent) {
      onDetentChange(snapped);
    }
  };

  /**
   * Abandons a live drag and settles back on the current detent. Used for
   * `pointercancel` and for `lostpointercapture`, which also follows every
   * normal release (by then there is no live drag, so it does nothing).
   */
  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    endDrag(drag);
    applyHeight(heights[detent]);
    publishSheetTop(viewport.height - heights[detent]);
  };

  const onHandleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const suppress = suppressClickRef.current;
    suppressClickRef.current = false;
    // A click with no pointer press (detail 0, from Enter or Space) always
    // cycles, even when a drag left the flag set because no click followed it.
    if (suppress && event.detail !== 0) {
      return;
    }
    onDetentChange(cycleDetent(detent));
  };

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = handleDirection(event.key);
    if (!direction) {
      return;
    }
    event.preventDefault();
    const next = nextDetent(detent, direction);
    if (next !== detent) {
      onDetentChange(next);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (
      event.key === "Tab" &&
      modal &&
      loopFocus(event.currentTarget, event.shiftKey)
    ) {
      event.preventDefault();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape and the focus loop are handled for the whole surface (a dialog or complementary region).
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Escape and the focus loop are handled for the whole surface (a dialog or complementary region).
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is chosen per layout and both dialog and complementary take aria-labelledby.
    <div
      ref={sheetRef}
      id={id}
      role={isSheet ? "dialog" : "complementary"}
      aria-labelledby={titleId}
      aria-modal={modal ? true : undefined}
      inert={!open}
      data-chrome="sheet"
      data-testid={testId ?? id}
      data-layout={layout}
      data-state={open ? "open" : "closed"}
      data-detent={isSheet ? detent : undefined}
      className={styles.surface}
      onKeyDown={onKeyDown}
    >
      {modal ? <FocusSentinel at="start" sheetRef={sheetRef} /> : null}
      <div
        className={styles.header}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
      >
        {isSheet ? (
          <button
            ref={handleRef}
            type="button"
            aria-label="Resize panel"
            className={styles.handle}
            onClick={onHandleClick}
            onKeyDown={onHandleKeyDown}
          >
            <span className={styles.grabber} aria-hidden="true" />
          </button>
        ) : null}
        {brand == null ? null : (
          <div
            aria-hidden="true"
            className={styles.brand}
            data-testid="sheet-brand"
          >
            {brand}
          </div>
        )}
        <h2 ref={titleRef} id={titleId} tabIndex={-1} className={styles.title}>
          {title}
        </h2>
        <IconButton
          label="Close"
          icon={X}
          size="compact"
          className={styles.close}
          onClick={onClose}
        />
      </div>
      <div className={styles.content}>{children}</div>
      {modal ? <FocusSentinel at="end" sheetRef={sheetRef} /> : null}
    </div>
  );
}
