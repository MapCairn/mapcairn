import {
  type ChromeLayout,
  chooseLayout,
  computeBottomSlotLayout,
  computeEndStackMaxHeight,
  type SheetDetent,
} from "@karta/core";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePreferences } from "../../services";
import { ChromeLayoutProvider, type ChromeLayoutValue } from "../layoutContext";
import { ChromeSurfaceContext, type ChromeSurfaceValue } from "./chromeSurface";
import { chromeVars } from "./chromeVars";
import * as styles from "./MapChrome.css";

/** The screen inset and the gap between slots, in CSS pixels (the 12 px tokens). */
const INSET_PX = 12;
const GAP_PX = 12;

/** Props for {@link MapChrome}. */
export interface MapChromeProps {
  /** The map, drawn full-bleed behind everything inside the `main` landmark. */
  readonly background: ReactNode;
  /** Search pill. */
  readonly topStart?: ReactNode;
  /** Compass, main control group and zoom group (`EndStack`). */
  readonly endStack?: ReactNode;
  /** Scale bar and cursor coordinates (`MapReadout`). */
  readonly bottomStart?: ReactNode;
  /** Attribution. */
  readonly bottomEnd?: ReactNode;
  /** Measure toolbar, toasts and the tile-error banner. */
  readonly bottomCentre?: ReactNode;
  /**
   * A credit a basemap's provider requires to stay visible (`PermanentCredit`).
   * It gets a row of its own under the bottom row, which the bottom sheet and
   * every other slot stay clear of, and it is never hidden or made inert.
   */
  readonly credit?: ReactNode;
  /**
   * The `Sheet` (bottom sheet or side panel). Rendered outside every inert
   * group, so it stays operable while the rest of the chrome is inert.
   */
  readonly sheet?: ReactNode;
  /** True while the sheet is modal: everything but the sheet becomes `inert`. */
  readonly modal: boolean;
  /** Called when the measured container size changes. */
  readonly onViewportChange?: (viewport: {
    readonly width: number;
    readonly height: number;
  }) => void;
}

/** Layout boxes read from the slots, in px from the container's top edge. */
interface Measurements {
  readonly width: number;
  readonly height: number;
  readonly topStartBottom: number;
  readonly endStackTop: number;
  readonly endStackBottom: number;
  readonly endStackWidth: number;
  /** Top of the bottom row (bottom-start and bottom-end) before any lift. */
  readonly bottomRowTop: number;
  /** Top of the bottom-end slot before any lift. */
  readonly bottomEndTop: number;
  /** Gap between the bottom row and the container's bottom edge (inset plus safe area). */
  readonly bottomInset: number;
  /** Top of the bottom-centre slot before any lift, or null while it is empty. */
  readonly bottomCentreTop: number | null;
  /** Top of the credit row, or null while there is none. */
  readonly creditTop: number | null;
  /** Height of the credit row, zero while there is none. */
  readonly creditHeight: number;
}

type SlotName =
  | "top-start"
  | "end-stack"
  | "bottom-start"
  | "bottom-centre"
  | "bottom-end"
  | "credit";

/** Layout box of a slot, ignoring transforms (which only lift or shift it). */
function box(slots: Map<SlotName, HTMLElement>, name: SlotName) {
  const element = slots.get(name);
  return element
    ? {
        top: element.offsetTop,
        height: element.offsetHeight,
        width: element.offsetWidth,
      }
    : null;
}

function measure(
  root: HTMLElement,
  slots: Map<SlotName, HTMLElement>,
): Measurements {
  const { width, height } = root.getBoundingClientRect();
  const topStart = box(slots, "top-start");
  const endStack = box(slots, "end-stack");
  const bottomStart = box(slots, "bottom-start");
  const bottomEnd = box(slots, "bottom-end");
  const bottomCentre = box(slots, "bottom-centre");
  const credit = box(slots, "credit");
  const creditShown = credit !== null && credit.height > 0;
  // With a credit row the bottom row rests a gap above it.
  const restingBottom = creditShown ? credit.top - GAP_PX : height - INSET_PX;
  const shown = [bottomStart, bottomEnd].filter(
    (slot): slot is NonNullable<typeof slot> =>
      slot !== null && slot.height > 0,
  );
  const rowBottom =
    shown.length > 0
      ? Math.max(...shown.map((slot) => slot.top + slot.height))
      : restingBottom;
  return {
    width,
    height,
    topStartBottom: topStart ? topStart.top + topStart.height : INSET_PX,
    endStackTop: endStack?.top ?? INSET_PX,
    endStackBottom: endStack ? endStack.top + endStack.height : INSET_PX,
    endStackWidth: endStack?.width ?? 0,
    bottomRowTop:
      shown.length > 0 ? Math.min(...shown.map((slot) => slot.top)) : rowBottom,
    bottomEndTop: bottomEnd && bottomEnd.height > 0 ? bottomEnd.top : rowBottom,
    bottomInset: Math.max(0, height - rowBottom),
    bottomCentreTop:
      bottomCentre && bottomCentre.height > 0 ? bottomCentre.top : null,
    creditTop: creditShown ? credit.top : null,
    creditHeight: creditShown ? credit.height : 0,
  };
}

/**
 * Vertical room between the end stack and the bottom row, once the bottom row
 * has been lifted by `lift` (zero or negative). The end stack stops a gap
 * above that row, and the credits popover, which grows up from bottom-end,
 * stops a gap below the end stack. Placed beside the end stack instead, the
 * popover may rise to a gap below the top-start slot.
 */
function verticalRoom(m: Measurements, lift: number) {
  const liftedRowTop = m.bottomRowTop + lift;
  return {
    endStackMaxHeight: computeEndStackMaxHeight({
      viewportHeight: m.height,
      topOffset: m.endStackTop,
      bottomReserved: m.height - liftedRowTop + GAP_PX - INSET_PX,
      inset: INSET_PX,
    }),
    bottomEndRoom: Math.max(
      0,
      m.bottomEndTop + lift - GAP_PX - m.endStackBottom,
    ),
    bottomEndBesideRoom: Math.max(
      0,
      m.bottomEndTop + lift - GAP_PX - m.topStartBottom,
    ),
  };
}

function sameMeasurements(a: Measurements | null, b: Measurements): boolean {
  return (
    a !== null &&
    (Object.keys(b) as (keyof Measurements)[]).every((key) => a[key] === b[key])
  );
}

/**
 * The one owner of everything floating over the map. It draws the map
 * full-bleed inside `main`, lays the slots out with flow layout, and keeps
 * the bottom slots clear of the sheet, the side panel and the measure
 * toolbar.
 *
 * @remarks
 * - DOM order is reading order: top-start, end-stack, the sheet, the map
 *   (`main`), then bottom-start, bottom-centre and bottom-end. The app renders
 *   the skip link before this component and the page's h1 itself.
 * - While `modal`, every group except the sheet gets `inert`. That is one
 *   inert attribute per group rather than one wrapper, because the sheet sits
 *   between the groups in reading order.
 * - The container ignores the pointer; each slot takes it back, so the map
 *   stays draggable in every gap. Every slot wrapper has `data-chrome` with
 *   its slot name; the sheet carries its own `data-chrome="sheet"`.
 * - A `ResizeObserver` measures the container (which already reflects the
 *   visual viewport) and the slots. From that it chooses the layout, gives
 *   `ChromeLayoutProvider` the viewport and the pointer preference, and sets
 *   the {@link chromeVars} on the root with CSSOM: never a `style` attribute,
 *   because production CSP is `style-src 'self'`.
 * - The sheet publishes its top edge (`publishSheetTop`) and detent, the side
 *   panel its right edge, and the measure toolbar its top edge
 *   (`publishToolbarTop`). Anything else shown in bottom-centre counts as an
 *   obstruction too. `computeBottomSlotLayout` turns these into the lift and
 *   shift of the bottom slots, which hide at the full detent.
 * - Before the first measurement (and in server rendering) the layout is the
 *   bottom sheet, the narrow-screen default.
 */
export function MapChrome({
  background,
  topStart,
  endStack,
  bottomStart,
  bottomEnd,
  bottomCentre,
  credit,
  sheet,
  modal,
  onViewportChange,
}: MapChromeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<SlotName, HTMLElement>());
  const { finePointer } = usePreferences();
  const [measurements, setMeasurements] = useState<Measurements | null>(null);
  const [sheetTop, publishSheetTop] = useState<number | null>(null);
  const [toolbarTop, publishToolbarTop] = useState<number | null>(null);
  const [sheetDetent, publishSheetDetent] = useState<SheetDetent | null>(null);
  const [panelEdge, publishPanelEdge] = useState<number | null>(null);

  const observerRef = useRef<ResizeObserver | null>(null);
  const update = useCallback(() => {
    const root = rootRef.current;
    if (!root || !observerRef.current) {
      return;
    }
    const next = measure(root, slots.current);
    // A container with no size has not been laid out (or is hidden); its
    // zero height would otherwise pick the panel layout.
    if (next.width === 0 && next.height === 0) {
      return;
    }
    setMeasurements((current) =>
      sameMeasurements(current, next) ? current : next,
    );
  }, []);

  // One stable ref callback per slot: a slot that appears later is observed
  // (which reports its first size), and one that goes triggers a re-measure.
  const slotRefs = useMemo(() => {
    const make = (name: SlotName) => (element: HTMLElement | null) => {
      const previous = slots.current.get(name);
      if (element) {
        slots.current.set(name, element);
        observerRef.current?.observe(element);
        return;
      }
      if (previous) {
        observerRef.current?.unobserve(previous);
      }
      slots.current.delete(name);
      update();
    };
    return {
      "top-start": make("top-start"),
      "end-stack": make("end-stack"),
      "bottom-start": make("bottom-start"),
      "bottom-centre": make("bottom-centre"),
      "bottom-end": make("bottom-end"),
      credit: make("credit"),
    } satisfies Record<SlotName, (element: HTMLElement | null) => void>;
  }, [update]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(update);
    observerRef.current = observer;
    observer.observe(root);
    for (const element of slots.current.values()) {
      observer.observe(element);
    }
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [update]);

  const width = measurements?.width ?? 0;
  const height = measurements?.height ?? 0;
  const viewport = useMemo(() => ({ width, height }), [width, height]);
  const layout: ChromeLayout = measurements ? chooseLayout(viewport) : "sheet";

  // A new layout changes the grid, which can move slots without resizing
  // any of them, so nothing would report it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the layout is the trigger; the measurement reads the DOM it produced.
  useLayoutEffect(() => {
    update();
  }, [layout, update]);

  const latestViewportChange = useRef(onViewportChange);
  latestViewportChange.current = onViewportChange;
  useEffect(() => {
    if (measurements) {
      latestViewportChange.current?.(viewport);
    }
  }, [viewport, measurements]);

  // Where the bottom row rests above the bottom edge. With a credit row that
  // is the credit's height and a gap more than the inset, which is still the
  // gap kept above a sheet or toolbar.
  const restingInset = measurements?.bottomInset ?? INSET_PX;
  const creditBlock =
    measurements?.creditTop == null ? 0 : measurements.creditHeight + GAP_PX;
  const inset = Math.max(0, restingInset - creditBlock);
  // How far the bottom sheet's bottom edge stands above the container's.
  const bottomReserve =
    measurements?.creditTop == null
      ? 0
      : measurements.height - measurements.creditTop + GAP_PX;
  const sheetOnly = computeBottomSlotLayout({
    layout,
    viewportWidth: width,
    viewportHeight: height,
    sheetTopEdge: sheetTop,
    sheetDetent,
    panelRightEdge: panelEdge,
    measureToolbarTop: null,
    inset,
    restingInset,
  });
  const centreTop =
    measurements?.bottomCentreTop == null
      ? null
      : measurements.bottomCentreTop + sheetOnly.bottomStartTranslateY;
  const obstructions = [toolbarTop, centreTop].filter(
    (top): top is number => top !== null,
  );
  const bottom = computeBottomSlotLayout({
    layout,
    viewportWidth: width,
    viewportHeight: height,
    sheetTopEdge: sheetTop,
    sheetDetent,
    panelRightEdge: panelEdge,
    measureToolbarTop:
      obstructions.length > 0 ? Math.min(...obstructions) : null,
    inset,
    restingInset,
  });

  const room = measurements
    ? verticalRoom(measurements, bottom.bottomEndTranslateY)
    : null;
  const endStackMaxHeight = room?.endStackMaxHeight ?? null;
  const bottomEndRoom = room?.bottomEndRoom ?? null;
  const bottomEndBesideRoom = room?.bottomEndBesideRoom ?? null;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (
      !root ||
      !measurements ||
      endStackMaxHeight === null ||
      bottomEndRoom === null ||
      bottomEndBesideRoom === null
    ) {
      return;
    }
    const set = (name: string, px: number) => {
      root.style.setProperty(name, `${px}px`);
    };
    set(chromeVars.width, measurements.width);
    set(chromeVars.topStartBottom, measurements.topStartBottom);
    set(chromeVars.endStackMaxHeight, endStackMaxHeight);
    set(chromeVars.endStackWidth, measurements.endStackWidth);
    set(chromeVars.bottomEndRoom, bottomEndRoom);
    set(chromeVars.bottomEndBesideRoom, bottomEndBesideRoom);
    set(chromeVars.bottomLift, bottom.bottomEndTranslateY);
    set(chromeVars.bottomStartX, bottom.bottomStartTranslateX);
    set(chromeVars.bottomCentreLift, sheetOnly.bottomStartTranslateY);
    set(chromeVars.creditReserve, bottomReserve);
  }, [
    measurements,
    bottomReserve,
    endStackMaxHeight,
    bottomEndRoom,
    bottomEndBesideRoom,
    bottom.bottomEndTranslateY,
    bottom.bottomStartTranslateX,
    sheetOnly.bottomStartTranslateY,
  ]);

  const layoutValue = useMemo<ChromeLayoutValue>(
    () => ({
      layout,
      viewport,
      finePointer,
      panelEdge,
      bottomReserve,
      publishSheetTop,
      publishToolbarTop,
    }),
    [layout, viewport, finePointer, panelEdge, bottomReserve],
  );
  const surfaceValue = useMemo<ChromeSurfaceValue>(
    () => ({
      publishSheetDetent,
      publishPanelEdge,
      endStackMaxHeight,
    }),
    [endStackMaxHeight],
  );

  // The credit is the one slot that stays operable while the sheet is modal:
  // a provider's credit must remain visible and usable at all times.
  const slot = (
    name: SlotName,
    className: string,
    content: ReactNode | undefined,
  ) =>
    content == null ? null : (
      <div
        ref={slotRefs[name]}
        data-chrome={name}
        className={className}
        inert={modal && name !== "credit"}
      >
        {content}
      </div>
    );

  return (
    <ChromeLayoutProvider value={layoutValue}>
      <ChromeSurfaceContext.Provider value={surfaceValue}>
        <div
          ref={rootRef}
          data-chrome-root=""
          data-testid="map-chrome"
          data-layout={layout}
          data-hide-bottom={bottom.hideBottomSlots ? "true" : "false"}
          data-credit={credit == null ? undefined : "true"}
          className={styles.root}
        >
          {slot("top-start", styles.topStart, topStart)}
          {slot("end-stack", styles.endStack, endStack)}
          {sheet}
          <main className={styles.background} inert={modal}>
            {background}
          </main>
          {slot("bottom-start", styles.bottomStart, bottomStart)}
          {slot("bottom-centre", styles.bottomCentre, bottomCentre)}
          {slot("bottom-end", styles.bottomEnd, bottomEnd)}
          {slot("credit", styles.credit, credit)}
        </div>
      </ChromeSurfaceContext.Provider>
    </ChromeLayoutProvider>
  );
}
