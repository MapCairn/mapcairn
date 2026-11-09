/** The heights the bottom sheet rests at. */
export type SheetDetent = "peek" | "half" | "full";

/** Every detent, from the smallest to the largest. */
export const SHEET_DETENTS: readonly SheetDetent[] = ["peek", "half", "full"];

/** Visible height in pixels of each detent. */
export type DetentHeights = Readonly<Record<SheetDetent, number>>;

/** Gap kept between the full-height sheet and the top of the viewport. */
export const SHEET_TOP_INSET = 12;

const PEEK_FRACTION = 0.25;
const PEEK_MIN = 160;
const PEEK_MAX = 220;
const HALF_FRACTION = 0.5;

/** Speed in px/s above which a release counts as a fling. */
export const SHEET_FLING_VELOCITY = 600;

/** How far ahead, in seconds, a release's momentum is projected. */
export const SHEET_MOMENTUM_SECONDS = 0.15;

/** The furthest, in pixels, the sheet may be dragged past its extremes. */
export const RUBBER_BAND_LIMIT = 48;

const RUBBER_BAND_STIFFNESS = 0.55;

/**
 * The visible height of each detent for a viewport, in whole pixels.
 * @param input.viewportHeight - Height of the visual viewport.
 * @param input.insetBottom - Bottom safe-area inset. It is added to the peek
 *   so the peek's content is not hidden behind a home indicator.
 * @remarks The result is always ordered `peek <= half <= full`, even on a
 *   very short viewport, so snapping never has to deal with crossed detents.
 */
export function computeDetentHeights(input: {
  viewportHeight: number;
  insetBottom: number;
}): DetentHeights {
  const { viewportHeight, insetBottom } = input;
  const full = Math.max(0, Math.round(viewportHeight - SHEET_TOP_INSET));
  const half = Math.min(full, Math.round(viewportHeight * HALF_FRACTION));
  const peekBase = Math.min(
    PEEK_MAX,
    Math.max(PEEK_MIN, viewportHeight * PEEK_FRACTION),
  );
  const peek = Math.min(half, Math.round(peekBase + insetBottom));
  return { peek, half, full };
}

function nearestDetent(heights: DetentHeights, height: number): SheetDetent {
  let nearest: SheetDetent = "peek";
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const detent of SHEET_DETENTS) {
    const distance = Math.abs(heights[detent] - height);
    if (distance < nearestDistance) {
      nearest = detent;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/**
 * Picks the detent to settle on when a drag ends.
 * @param input.currentHeight - The sheet's visible height at release.
 * @param input.velocityPxPerSecond - Positive when the sheet is expanding.
 * @remarks A fast fling (faster than {@link SHEET_FLING_VELOCITY}) moves one
 *   detent from the nearest one, in the fling's direction. Anything slower
 *   projects {@link SHEET_MOMENTUM_SECONDS} of momentum and snaps to the
 *   nearest detent to that point. Exact ties go to the smaller detent.
 */
export function resolveSnap(input: {
  heights: DetentHeights;
  currentHeight: number;
  velocityPxPerSecond: number;
}): SheetDetent {
  const { heights, currentHeight, velocityPxPerSecond } = input;
  if (Math.abs(velocityPxPerSecond) > SHEET_FLING_VELOCITY) {
    return nextDetent(
      nearestDetent(heights, currentHeight),
      velocityPxPerSecond > 0 ? "up" : "down",
    );
  }
  const projected =
    currentHeight + velocityPxPerSecond * SHEET_MOMENTUM_SECONDS;
  return nearestDetent(heights, projected);
}

const STEP_UP: Readonly<Record<SheetDetent, SheetDetent>> = {
  peek: "half",
  half: "full",
  full: "full",
};

const STEP_DOWN: Readonly<Record<SheetDetent, SheetDetent>> = {
  peek: "peek",
  half: "peek",
  full: "half",
};

const CYCLE: Readonly<Record<SheetDetent, SheetDetent>> = {
  peek: "half",
  half: "full",
  full: "peek",
};

/** The detent one step up or down from `current`, clamped at the ends. */
export function nextDetent(
  current: SheetDetent,
  direction: "up" | "down",
): SheetDetent {
  return direction === "up" ? STEP_UP[current] : STEP_DOWN[current];
}

/**
 * The next detent for Enter or Space on the handle: peek, half, full, then
 * back to peek.
 */
export function cycleDetent(current: SheetDetent): SheetDetent {
  return CYCLE[current];
}

/**
 * Resistance for dragging past an extreme. Rises smoothly from 0, always
 * moves less than the finger and never reaches {@link RUBBER_BAND_LIMIT}.
 * @param overshoot - Pixels past the extreme. Zero or less gives zero.
 */
export function rubberBand(overshoot: number): number {
  if (overshoot <= 0) {
    return 0;
  }
  const scaled = (RUBBER_BAND_STIFFNESS * overshoot) / RUBBER_BAND_LIMIT;
  return RUBBER_BAND_LIMIT * (1 - 1 / (scaled + 1));
}

/**
 * Keeps a dragged height inside the peek and full extremes, with rubber-band
 * resistance beyond them. Never returns a negative height.
 */
export function clampHeight(height: number, heights: DetentHeights): number {
  if (height > heights.full) {
    return heights.full + rubberBand(height - heights.full);
  }
  if (height < heights.peek) {
    return Math.max(0, heights.peek - rubberBand(heights.peek - height));
  }
  return height;
}
