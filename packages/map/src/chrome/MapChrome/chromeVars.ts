// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The CSS custom properties `MapChrome` sets on its root with
 * `style.setProperty` after measuring, and that slots and surfaces read in
 * their stylesheets. They are plain names rather than vanilla-extract
 * `createVar`s because they are written through CSSOM, never through a
 * `style` attribute (production CSP is `style-src 'self'`).
 *
 * Every value is in CSS pixels, measured from the chrome container. Readers
 * must give each one a fallback, because the properties are absent during
 * server rendering and before the first measurement.
 */
export const chromeVars = {
  /** Width of the chrome container. */
  width: "--chrome-width",
  /** Distance from the container top to the bottom edge of the top-start slot. */
  topStartBottom: "--chrome-top-start-bottom",
  /** The tallest the end stack may be before it scrolls. */
  endStackMaxHeight: "--chrome-end-stack-max-height",
  /** Width of the end stack, zero when it is absent. */
  endStackWidth: "--chrome-end-stack-width",
  /**
   * How far the top of the bottom row is above the top of the bottom-end slot
   * (zero or positive): the extra height of the bottom-start readout. The
   * credits popover rises this far more, so it clears the whole row, unless it
   * shares no width with the readout (`data-readout-clear`).
   */
  bottomEndRise: "--chrome-bottom-end-rise",
  /**
   * How much further the credits popover rises, over what its `transform` rise
   * already gives, to clear the bottom-centre slot it shares width with (zero or
   * positive). It is the `translate` property, written in the observer callback.
   */
  popoverCentreRise: "--chrome-popover-centre-rise",
  /** Vertical room above the bottom row that stays clear of the end stack. */
  bottomEndRoom: "--chrome-bottom-end-room",
  /**
   * Vertical room above the bottom row for something placed beside the end
   * stack rather than under it: from the gap below the top-start slot.
   */
  bottomEndBesideRoom: "--chrome-bottom-end-beside-room",
  /**
   * Vertical shift of the bottom slots from the sheet alone (zero or
   * negative). It is a `transform`, so it slides with the sheet.
   */
  bottomLift: "--chrome-bottom-lift",
  /**
   * How much further the bottom-start slot rises to clear the bottom-centre slot (zero or negative): zero
   * while the two share no width. It is the `translate` property, which no
   * transition covers, and `MapChrome` sets it in the observer callback that
   * sees the slot change size, so it lands in the same frame.
   */
  bottomStartRaise: "--chrome-bottom-start-raise",
  /**
   * How much further the map key rises: to clear the bottom-centre slot where
   * the key shares width with it (it can be wider than the readout it rests
   * above), and never less than the readout's own rise. Zero or negative.
   */
  mapKeyRaise: "--chrome-map-key-raise",
  /** The same for the bottom-end slot, which has its own: zero while it shares no width with the bottom-centre slot. */
  bottomEndRaise: "--chrome-bottom-end-raise",
  /** Horizontal shift of the bottom-start slot (zero or positive). */
  bottomStartX: "--chrome-bottom-start-x",
  /** Base room for the map key; the immediate toolbar raise is added in CSS. */
  mapKeyRoom: "--chrome-map-key-room",
  /** Base shift of the map key; sheet and toolbar lifts are separate. */
  mapKeyLift: "--chrome-map-key-lift",
} as const;

/** Reads a chrome variable in a stylesheet, with a fallback. */
export function chromeVar(
  name: (typeof chromeVars)[keyof typeof chromeVars],
  fallback: string,
): string {
  return `var(${name}, ${fallback})`;
}
