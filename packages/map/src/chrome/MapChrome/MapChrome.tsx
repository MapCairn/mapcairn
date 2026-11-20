// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type ChromeLayout,
  chooseLayout,
  computeBottomSlotLayout,
  computeEndStackMaxHeight,
  type SheetDetent,
} from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
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
import { CHROME_GAP_PX, CHROME_INSET_PX } from "../chromeSpacing";
import { ChromeLayoutProvider, type ChromeLayoutValue } from "../layoutContext";
import { ChromeSurfaceContext, type ChromeSurfaceValue } from "./chromeSurface";
import { chromeVars } from "./chromeVars";
import * as styles from "./MapChrome.css";
import {
  applyMapKeyPlacement,
  isMapKeyCrowded,
  placeMapKey,
} from "./mapKeyPlacement";
import { type Span, sharesWidth } from "./sharesWidth";

/** Props for {@link MapChrome}. */
export interface MapChromeProps {
  /** The map, drawn full-bleed behind everything inside the `main` landmark. */
  readonly background: ReactNode;
  /** Search pill. */
  readonly topStart?: ReactNode;
  /** Compass, main control group and zoom group (`EndStack`). */
  readonly endStack?: ReactNode;
  /** Scale bar, cursor coordinates and zoom level (`MapReadout`). */
  readonly bottomStart?: ReactNode;
  /** Attribution. */
  readonly bottomEnd?: ReactNode;
  /** Measure toolbar, toasts and the tile-error banner. */
  readonly bottomCentre?: ReactNode;
  /**
   * The first-visit tour card. It sits in the free space at the top of the
   * map: under the search pill on a narrow screen, and between the search
   * column and the end stack in the panel layout. It hides, like the bottom
   * slots, while the sheet is at full, and while the bottom row, lifted above
   * the sheet or a toolbar, would run into it.
   */
  readonly tour?: ReactNode;
  /**
   * In the panel layout, whether the tour card sits against the search
   * column and panel (`"start"`, the default) or against the end stack.
   */
  readonly tourSide?: "start" | "end";
  /**
   * The key to the layers that are on (`MapKey`). It sits above the scale
   * bar, rides above the sheet or beside the side panel with it, is as tall
   * as the room under the search pill allows, and hides when there is no room
   * for its chip, while the credits are open, and at the full detent. A
   * prop named `key` would be React's own, so it is `mapKey`.
   */
  readonly mapKey?: ReactNode;
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

/** What changes in the bottom-end slot that no change of size reports: the credits popover opening, moving or mounting. */
const POPOVER_CHANGES: MutationObserverInit = {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["hidden", "data-placement", "data-readout-clear"],
};

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
  /** Top of the bottom-start slot before any lift, or null while it is empty. */
  readonly bottomStartTop: number | null;
  /** Top of the bottom-end slot before any lift, or null while it is empty. */
  readonly bottomEndTop: number | null;
  /** Gap between the bottom row and the container's bottom edge (inset plus safe area). */
  readonly bottomInset: number;
  /** Top of the bottom-centre slot before any lift, or null while it is empty. */
  readonly bottomCentreTop: number | null;
  /**
   * Whether the bottom-centre slot shares width with the bottom-start slot
   * (as that slot will rest, once any side panel has moved it), so the slot
   * would cover it.
   */
  readonly centreSharesStart: boolean;
  /** Whether the bottom-centre slot shares width with the bottom-end slot. */
  readonly centreSharesEnd: boolean;
  /** Whether the bottom-centre slot shares width with the tour card's slot. */
  readonly centreSharesTour: boolean;
  /** Whether the bottom-centre slot shares width with the map key's slot. */
  readonly centreSharesKey: boolean;
  /**
   * How far the map key must rise to clear the bottom-centre slot: at least
   * the bottom-start slot's rise, and further where the key (wider than the
   * readout) shares width with the slot and the readout does not. Zero or
   * negative.
   */
  readonly mapKeyRaise: number;
  /**
   * How far the bottom-start slot must rise to clear the bottom-centre slot,
   * from the slot's own height: zero or negative, and zero while it is empty
   * or shares no width with the bottom-start slot.
   */
  readonly bottomStartRaise: number;
  /** The same for the bottom-end slot. */
  readonly bottomEndRaise: number;
  /**
   * How much further the open credits popover must rise, over the rise its
   * `transform` gives it, to clear the bottom-centre slot when it shares width
   * with that slot (the popover is wider than its button, so it can where the
   * button does not). Zero or positive, and zero while the popover is closed.
   */
  readonly popoverCentreRise: number;
  /** Bottom edge of the tour card's slot, or null while it is empty. */
  readonly tourBottom: number | null;
  /** Bottom edge of the map key's slot before any lift, or null while it is empty. */
  readonly mapKeyBottom: number | null;
  /** Height of the map key's slot as laid out, within its room cap. */
  readonly mapKeyHeight: number;
}

type SlotName =
  | "top-start"
  | "tour"
  | "map-key"
  | "end-stack"
  | "bottom-start"
  | "bottom-centre"
  | "bottom-end";

/** The layout box of a slot, as {@link box} reads it. */
type SlotBox = NonNullable<ReturnType<typeof box>>;

/** Layout box of a slot, ignoring transforms (which only lift or shift it). */
function box(slots: Map<SlotName, HTMLElement>, name: SlotName) {
  const element = slots.get(name);
  return element
    ? {
        top: element.offsetTop,
        left: element.offsetLeft,
        height: element.offsetHeight,
        width: element.offsetWidth,
      }
    : null;
}

/**
 * Where the bottom-start and bottom-centre slots will rest across the page,
 * from their layout boxes and the sideways shift the side panel asks of the
 * bottom-start slot (the bottom-centre slot takes half of it). The shift is a
 * transform, so a layout box leaves it out; it is a distance along the
 * reading direction, which a right-to-left page reverses.
 */
function restingSpan(
  slot: { readonly left: number; readonly width: number },
  shift: number,
  rtl: boolean,
): Span {
  return { left: slot.left + (rtl ? -shift : shift), width: slot.width };
}

/**
 * How far the map key rises: with the readout where it does, and further
 * where the key shares width with the bottom-centre slot and has to clear its
 * top instead (the key's resting place is a gap above the bottom row's top).
 */
function mapKeyRaiseAbove(
  centre: { readonly top: number; readonly height: number } | null,
  sharesCentre: boolean,
  startRaise: number,
  rowTop: number,
): number {
  if (!sharesCentre || centre === null || centre.height === 0) {
    return startRaise;
  }
  return Math.min(startRaise, centre.top - rowTop);
}

/**
 * How much further the open credits popover must rise to clear the
 * bottom-centre slot, from where `transform` has put it (`popoverRiseNow`
 * reads that). The popover is read from its own box, so a placement beside the
 * end stack, which moves it sideways, is counted.
 */
function popoverRiseOverCentre(
  root: HTMLElement,
  slots: {
    readonly start: SlotBox | null;
    readonly end: SlotBox | null;
    readonly centre: SlotBox | null;
  },
  centreSpan: Span | null,
  raises: { readonly start: number; readonly end: number },
): number {
  // MapChrome reads the credits popover through its `data-chrome` hook and its
  // `data-readout-clear` state, which is a coupling with `Attribution`: the
  // popover is the one floating element wider than its slot's box.
  const popover = root.querySelector<HTMLElement>(
    '[data-chrome="attribution-popover"]:not([hidden])',
  );
  const tops = {
    start: slots.start && slots.start.height > 0 ? slots.start.top : null,
    end: slots.end && slots.end.height > 0 ? slots.end.top : null,
    centre: slots.centre && slots.centre.height > 0 ? slots.centre.top : null,
  };
  if (!popover || tops.end === null || tops.centre === null) {
    return 0;
  }
  if (centreSpan === null) {
    return 0;
  }
  const rootBox = root.getBoundingClientRect();
  const popoverBox = popover.getBoundingClientRect();
  const popoverSpan = {
    left: popoverBox.left - rootBox.left,
    width: popoverBox.width,
  };
  if (!sharesWidth(centreSpan, popoverSpan, CHROME_GAP_PX)) {
    return 0;
  }
  // The rise its `transform` already gives it over a taller readout, from this
  // measurement (the same as `bottomEndRise` in `verticalRoom`).
  const rowRise =
    popover.dataset.readoutClear === "true" || tops.start === null
      ? 0
      : Math.max(0, tops.end + raises.end - (tops.start + raises.start));
  return Math.max(0, tops.end + raises.end - tops.centre - rowRise);
}

function measure(
  root: HTMLElement,
  slots: Map<SlotName, HTMLElement>,
  startShiftX: number,
): Measurements {
  const { width, height } = root.getBoundingClientRect();
  const topStart = box(slots, "top-start");
  const endStack = box(slots, "end-stack");
  const bottomStart = box(slots, "bottom-start");
  const bottomEnd = box(slots, "bottom-end");
  const bottomCentre = box(slots, "bottom-centre");
  const tour = box(slots, "tour");
  const mapKey = box(slots, "map-key");
  const restingBottom = height - CHROME_INSET_PX;
  const shown = [bottomStart, bottomEnd].filter(
    (slot): slot is NonNullable<typeof slot> =>
      slot !== null && slot.height > 0,
  );
  const rowBottom =
    shown.length > 0
      ? Math.max(...shown.map((slot) => slot.top + slot.height))
      : restingBottom;
  const bottomInset = Math.max(0, height - rowBottom);
  const rowTop =
    shown.length > 0 ? Math.min(...shown.map((slot) => slot.top)) : rowBottom;
  const rtl = getComputedStyle(root).direction === "rtl";
  const centreSpan =
    bottomCentre && bottomCentre.height > 0
      ? restingSpan(bottomCentre, startShiftX / 2, rtl)
      : null;
  const sharesWithCentre = (slot: typeof bottomStart, shift: number) =>
    centreSpan !== null &&
    slot !== null &&
    slot.height > 0 &&
    sharesWidth(centreSpan, restingSpan(slot, shift, rtl), CHROME_GAP_PX);
  const centreSharesStart = sharesWithCentre(bottomStart, startShiftX);
  const centreSharesEnd = sharesWithCentre(bottomEnd, 0);
  const centreSharesKey = sharesWithCentre(mapKey, startShiftX);
  const centreSharesTour = sharesWithCentre(tour, 0);
  const raise = bottomCentre ? -(bottomCentre.height + bottomInset) : 0;
  return {
    width,
    height,
    topStartBottom: topStart ? topStart.top + topStart.height : CHROME_INSET_PX,
    endStackTop: endStack?.top ?? CHROME_INSET_PX,
    endStackBottom: endStack ? endStack.top + endStack.height : CHROME_INSET_PX,
    endStackWidth: endStack?.width ?? 0,
    bottomRowTop: rowTop,
    bottomStartTop:
      bottomStart && bottomStart.height > 0 ? bottomStart.top : null,
    bottomEndTop: bottomEnd && bottomEnd.height > 0 ? bottomEnd.top : null,
    bottomInset,
    bottomCentreTop:
      bottomCentre && bottomCentre.height > 0 ? bottomCentre.top : null,
    centreSharesStart,
    centreSharesEnd,
    centreSharesKey,
    centreSharesTour,
    mapKeyRaise: mapKeyRaiseAbove(
      bottomCentre,
      centreSharesKey,
      centreSharesStart ? raise : 0,
      rowTop,
    ),
    bottomStartRaise: centreSharesStart ? raise : 0,
    bottomEndRaise: centreSharesEnd ? raise : 0,
    popoverCentreRise: popoverRiseOverCentre(
      root,
      { start: bottomStart, end: bottomEnd, centre: bottomCentre },
      centreSpan,
      {
        start: centreSharesStart ? raise : 0,
        end: centreSharesEnd ? raise : 0,
      },
    ),
    tourBottom: tour && tour.height > 0 ? tour.top + tour.height : null,
    mapKeyBottom:
      mapKey && mapKey.height > 0 ? mapKey.top + mapKey.height : null,
    mapKeyHeight: mapKey?.height ?? 0,
  };
}

/** How far each bottom slot is lifted (zero or negative), sheet and toolbar together. */
interface BottomLifts {
  readonly start: number;
  readonly end: number;
}

/**
 * The top of the bottom row once each slot has been lifted by its own lift:
 * the highest of the slots that show.
 */
function liftedRowTop(m: Measurements, lifts: BottomLifts): number {
  const tops = [
    m.bottomStartTop === null ? null : m.bottomStartTop + lifts.start,
    m.bottomEndTop === null ? null : m.bottomEndTop + lifts.end,
  ].filter((top): top is number => top !== null);
  return tops.length > 0
    ? Math.min(...tops)
    : m.bottomRowTop + Math.min(lifts.start, lifts.end);
}

/**
 * Whether the tour card has to give way: the bottom row (lifted above the
 * sheet or a toolbar) comes up to it, or a bottom-centre slot it shares width
 * with does.
 */
function isTourCrowded(
  m: Measurements | null,
  lifts: BottomLifts,
  centreTop: number | null,
): boolean {
  if (m === null || m.tourBottom === null) {
    return false;
  }
  const centreEdge =
    m.centreSharesTour && centreTop !== null
      ? centreTop
      : Number.POSITIVE_INFINITY;
  return (
    m.tourBottom + CHROME_GAP_PX > Math.min(liftedRowTop(m, lifts), centreEdge)
  );
}

/**
 * How far the map key is lifted for the key's placement: with the bottom-start
 * slot, and further where the key, which can be wider than the readout,
 * shares width with the bottom-centre slot and has to clear its top.
 */
function mapKeyLiftAbove(
  m: Measurements | null,
  lifts: BottomLifts,
  centreTop: number | null,
): number {
  return m?.centreSharesKey && centreTop !== null
    ? Math.min(lifts.start, centreTop - m.bottomRowTop)
    : lifts.start;
}

/**
 * Vertical room between the end stack and the bottom row, once each bottom
 * slot has been lifted. The end stack stops a gap above that row, and the
 * credits popover, which grows up from bottom-end and rises over the whole row
 * (`bottomEndRise` is how much higher than the bottom-end slot the row is),
 * stops a gap below the end stack. Placed beside the end stack instead, the
 * popover may rise to a gap below the top-start slot.
 */
function verticalRoom(m: Measurements, lifts: BottomLifts) {
  const rowTop = liftedRowTop(m, lifts);
  return {
    endStackMaxHeight: computeEndStackMaxHeight({
      viewportHeight: m.height,
      topOffset: m.endStackTop,
      bottomReserved: m.height - rowTop + CHROME_GAP_PX - CHROME_INSET_PX,
      inset: CHROME_INSET_PX,
    }),
    bottomEndRise:
      m.bottomStartTop === null || m.bottomEndTop === null
        ? 0
        : Math.max(
            0,
            m.bottomEndTop + lifts.end - (m.bottomStartTop + lifts.start),
          ),
    bottomEndRoom: Math.max(0, rowTop - CHROME_GAP_PX - m.endStackBottom),
    bottomEndBesideRoom: Math.max(0, rowTop - CHROME_GAP_PX - m.topStartBottom),
  };
}

function sameMeasurements(a: Measurements | null, b: Measurements): boolean {
  return (
    a !== null &&
    (Object.keys(b) as (keyof Measurements)[]).every((key) => a[key] === b[key])
  );
}

/** How far a fitted feature must stay above the visible key at the bottom. */
function clearanceAboveMapKey(
  measurements: Measurements | null,
  crowded: boolean,
  placement: ReturnType<typeof placeMapKey>,
): number | null {
  if (
    !measurements ||
    measurements.mapKeyBottom === null ||
    placement === null ||
    crowded
  ) {
    return null;
  }
  const top =
    measurements.mapKeyBottom - measurements.mapKeyHeight + placement.shift;
  return measurements.height - top;
}

/** Places the key from a complete measurement, when one exists. */
function mapKeyPlacementAt(
  measurements: Measurements | null,
  lift: number,
  tourBottom: number | null,
): ReturnType<typeof placeMapKey> {
  return measurements ? placeMapKey(measurements, lift, tourBottom) : null;
}

/** The tour edge that competes with the key, when the tour is shown. */
function keyTourBottom(
  hidden: boolean,
  measurements: Measurements | null,
): number | null {
  return hidden ? null : (measurements?.tourBottom ?? null);
}

/**
 * The one owner of everything floating over the map. It draws the map
 * full-bleed inside `main`, lays the slots out with flow layout, and keeps
 * the bottom slots clear of the sheet, the side panel and the measure
 * toolbar.
 *
 * @remarks
 * - DOM order is reading order: top-start, tour, end-stack, the sheet, the map
 *   (`main`), the map key, then bottom-start, bottom-centre and bottom-end.
 *   The app renders the skip link before this component and the page's h1
 *   itself.
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
 * - The sheet publishes its top edge (`publishSheetTop`) and detent, and the
 *   side panel its right edge. Whatever is shown in bottom-centre, a toolbar
 *   first, is an obstruction too, measured from its slot.
 *   `computeBottomSlotLayout` turns these into the lift and shift of the
 *   bottom slots, which hide at the full detent.
 * - The bottom row rides above the sheet with a `transform`, which slides, and
 *   above the bottom-centre slot with the separate `translate` property
 *   (`bottomStartRaise`, `bottomEndRaise` and `mapKeyRaise`, each zero for a slot
 *   that shares no width with the bottom-centre slot), which does not, and which
 *   the measuring observer sets in
 *   its own callback. A toolbar that changes height therefore never has the
 *   row over it, in any frame, with motion or without.
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
  tour,
  tourSide = "start",
  mapKey,
  sheet,
  modal,
  onViewportChange,
}: MapChromeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<SlotName, HTMLElement>());
  const { finePointer } = usePreferences();
  const [measurements, setMeasurements] = useState<Measurements | null>(null);
  const [sheetTop, publishSheetTop] = useState<number | null>(null);
  const [sheetDetent, publishSheetDetent] = useState<SheetDetent | null>(null);
  const [panelEdge, publishPanelEdge] = useState<number | null>(null);
  const mapKeyTourBottomRef = useRef<number | null>(null);
  // The sideways shift the bottom-start slot is about to rest at, which the
  // measurement needs to tell whether a toolbar would cover the slot.
  const startShiftXRef = useRef(0);

  const observerRef = useRef<ResizeObserver | null>(null);
  const popoverChangesRef = useRef<MutationObserver | null>(null);
  const update = useCallback(() => {
    const root = rootRef.current;
    if (!root || !observerRef.current) {
      return;
    }
    const next = measure(root, slots.current, startShiftXRef.current);
    // A container with no size has not been laid out (or is hidden); its
    // zero height would otherwise pick the panel layout.
    if (next.width === 0 && next.height === 0) {
      return;
    }
    // Written here, in the observer's own callback, and not from the render
    // that follows: the observer runs before the frame paints, so the bottom
    // row rises with the slot it clears in the frame that slot changes size,
    // where state set from here would be applied a frame later.
    root.style.setProperty(
      chromeVars.bottomStartRaise,
      `${next.bottomStartRaise}px`,
    );
    root.style.setProperty(
      chromeVars.bottomEndRaise,
      `${next.bottomEndRaise}px`,
    );
    root.style.setProperty(chromeVars.mapKeyRaise, `${next.mapKeyRaise}px`);
    root.style.setProperty(
      chromeVars.popoverCentreRise,
      `${next.popoverCentreRise}px`,
    );
    const popover = root.querySelector<HTMLElement>(
      '[data-chrome="attribution-popover"]',
    );
    if (popover) {
      observerRef.current.observe(popover);
    }
    applyMapKeyPlacement(
      root,
      placeMapKey(next, 0, mapKeyTourBottomRef.current),
    );
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
        if (name === "bottom-end") {
          popoverChangesRef.current?.observe(element, POPOVER_CHANGES);
        }
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
      tour: make("tour"),
      "map-key": make("map-key"),
      "end-stack": make("end-stack"),
      "bottom-start": make("bottom-start"),
      "bottom-centre": make("bottom-centre"),
      "bottom-end": make("bottom-end"),
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
    // The credits popover opens, closes and moves beside the end stack by
    // attribute, with no change of size that the observer above would report.
    // Only the slot that holds it is watched.
    const popoverChanges = new MutationObserver(() => {
      update();
    });
    popoverChangesRef.current = popoverChanges;
    const endSlot = slots.current.get("bottom-end");
    if (endSlot) {
      popoverChanges.observe(endSlot, POPOVER_CHANGES);
    }
    return () => {
      observer.disconnect();
      popoverChanges.disconnect();
      popoverChangesRef.current = null;
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

  // A slot that comes or goes can move another without resizing it (the row a
  // toolbar made taller shrinks back), and the measurement a slot's ref makes
  // as it leaves still sees it in the page, so measure once the page has
  // updated. On the reference site `mapKey == null` is never true, because
  // `<MapKey />` is always an element, so the map key's own resize is what
  // re-measures it.
  const presence = [
    topStart,
    tour,
    mapKey,
    endStack,
    bottomStart,
    bottomCentre,
    bottomEnd,
  ]
    .map((content) => (content == null ? "-" : "+"))
    .join("");
  const measuredPresence = useRef(presence);
  useLayoutEffect(() => {
    if (measuredPresence.current !== presence) {
      measuredPresence.current = presence;
      update();
    }
  }, [presence, update]);

  const onViewportChangeRef = useLatestRef(onViewportChange);
  useEffect(() => {
    if (measurements) {
      onViewportChangeRef.current?.(viewport);
    }
  }, [viewport, measurements, onViewportChangeRef]);

  // Where the bottom row rests above the bottom edge.
  const inset = measurements?.bottomInset ?? CHROME_INSET_PX;
  const sheetOnly = computeBottomSlotLayout({
    layout,
    viewportWidth: width,
    viewportHeight: height,
    sheetTopEdge: sheetTop,
    sheetDetent,
    panelRightEdge: panelEdge,
    measureToolbarTop: null,
    inset,
  });
  const centreTop =
    measurements?.bottomCentreTop == null
      ? null
      : measurements.bottomCentreTop + sheetOnly.bottomStartTranslateY;
  // A toolbar lifts only the slots it shares width with.
  const bottomAbove = (sharesWidthWithCentre: boolean | undefined) =>
    computeBottomSlotLayout({
      layout,
      viewportWidth: width,
      viewportHeight: height,
      sheetTopEdge: sheetTop,
      sheetDetent,
      panelRightEdge: panelEdge,
      measureToolbarTop: sharesWidthWithCentre ? centreTop : null,
      inset,
    });
  const startLayout = bottomAbove(measurements?.centreSharesStart);
  const endLayout = bottomAbove(measurements?.centreSharesEnd);
  const lifts: BottomLifts = {
    start: startLayout.bottomStartTranslateY,
    end: endLayout.bottomEndTranslateY,
  };
  const keyLift = mapKeyLiftAbove(measurements, lifts, centreTop);

  const room = measurements ? verticalRoom(measurements, lifts) : null;
  // The tour card does not shrink or scroll, so when the bottom row (lifted
  // above the sheet or a toolbar) comes up to it, it gives way, as it does at
  // the full detent, and returns when there is room. Only vertical edges are
  // compared: in the panel layout the row can sit beside the card, so the card
  // may hide where it would have fitted, which is accepted for the simpler rule.
  const tourCrowded = isTourCrowded(measurements, lifts, centreTop);
  const tourHidden = modal || tourCrowded;
  const keyTourEdge = keyTourBottom(tourHidden, measurements);
  // The measuring observer reads the tour edge this render decided on. A card
  // hidden by state alone (a modal, or the row reaching it) resizes no slot,
  // so no observer round follows: place the key again here.
  useLayoutEffect(() => {
    if (mapKeyTourBottomRef.current === keyTourEdge) {
      return;
    }
    mapKeyTourBottomRef.current = keyTourEdge;
    update();
  }, [keyTourEdge, update]);
  // The map key gives way to the tour card, which is there for a first visit
  // and is shown first, and hides when the room under the search pill is too
  // small for its chip.
  // MapChrome's measuring observer writes this placement synchronously, before
  // paint. Do not repeat it from render, which would put an older placement
  // back for one frame when another slot changes size.
  const mapKeyLivePlacement = mapKeyPlacementAt(
    measurements,
    keyLift,
    keyTourEdge,
  );
  const mapKeyCrowded = isMapKeyCrowded(mapKeyLivePlacement);
  const mapKeyClearance = clearanceAboveMapKey(
    measurements,
    mapKeyCrowded,
    mapKeyLivePlacement,
  );
  const endStackMaxHeight = room?.endStackMaxHeight ?? null;
  const bottomEndRise = room?.bottomEndRise ?? null;
  const bottomEndRoom = room?.bottomEndRoom ?? null;
  const bottomEndBesideRoom = room?.bottomEndBesideRoom ?? null;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (
      !root ||
      !measurements ||
      endStackMaxHeight === null ||
      bottomEndRise === null ||
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
    set(chromeVars.bottomEndRise, bottomEndRise);
    set(chromeVars.bottomEndRoom, bottomEndRoom);
    set(chromeVars.bottomEndBesideRoom, bottomEndBesideRoom);
    set(chromeVars.bottomLift, sheetOnly.bottomStartTranslateY);
    set(chromeVars.bottomStartX, startLayout.bottomStartTranslateX);
    // A new shift moves the slots without resizing them, so measure again
    // against it; the raise it changes is written by that measurement.
    if (startShiftXRef.current !== startLayout.bottomStartTranslateX) {
      startShiftXRef.current = startLayout.bottomStartTranslateX;
      update();
    }
  }, [
    measurements,
    endStackMaxHeight,
    bottomEndRise,
    bottomEndRoom,
    bottomEndBesideRoom,
    startLayout.bottomStartTranslateX,
    sheetOnly.bottomStartTranslateY,
    update,
  ]);

  const layoutValue = useMemo<ChromeLayoutValue>(
    () => ({
      layout,
      viewport,
      finePointer,
      panelEdge,
      mapKeyClearance,
      publishSheetTop,
    }),
    [layout, viewport, finePointer, panelEdge, mapKeyClearance],
  );
  const surfaceValue = useMemo<ChromeSurfaceValue>(
    () => ({
      publishSheetDetent,
      publishPanelEdge,
      endStackMaxHeight,
      tourHidden,
    }),
    [endStackMaxHeight, tourHidden],
  );

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
        inert={modal}
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
          data-hide-bottom={startLayout.hideBottomSlots ? "true" : "false"}
          className={styles.root}
        >
          {slot("top-start", styles.topStart, topStart)}
          {tour == null ? null : (
            <div
              ref={slotRefs.tour}
              data-chrome="tour"
              data-side={tourSide}
              data-crowded={tourCrowded ? "true" : "false"}
              className={styles.tour}
              inert={tourHidden}
            >
              {tour}
            </div>
          )}
          {slot("end-stack", styles.endStack, endStack)}
          {sheet}
          <main className={styles.background} inert={modal}>
            {background}
          </main>
          {mapKey == null ? null : (
            <div
              ref={slotRefs["map-key"]}
              data-chrome="map-key"
              data-crowded={mapKeyCrowded ? "true" : "false"}
              className={styles.mapKey}
              inert={modal || mapKeyCrowded}
            >
              {mapKey}
            </div>
          )}
          {slot("bottom-start", styles.bottomStart, bottomStart)}
          {slot("bottom-centre", styles.bottomCentre, bottomCentre)}
          {slot("bottom-end", styles.bottomEnd, bottomEnd)}
        </div>
      </ChromeSurfaceContext.Provider>
    </ChromeLayoutProvider>
  );
}
