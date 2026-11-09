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
  /** Vertical room above the bottom-end slot that stays clear of the end stack. */
  bottomEndRoom: "--chrome-bottom-end-room",
  /**
   * Vertical room above the bottom-end slot for something placed beside the
   * end stack rather than under it: from the gap below the top-start slot.
   */
  bottomEndBesideRoom: "--chrome-bottom-end-beside-room",
  /** Vertical shift of the bottom-start and bottom-end slots (zero or negative). */
  bottomLift: "--chrome-bottom-lift",
  /** Horizontal shift of the bottom-start slot (zero or positive). */
  bottomStartX: "--chrome-bottom-start-x",
  /** Vertical shift of the bottom-centre slot, from the sheet alone (zero or negative). */
  bottomCentreLift: "--chrome-bottom-centre-lift",
} as const;

/** Reads a chrome variable in a stylesheet, with a fallback. */
export function chromeVar(
  name: (typeof chromeVars)[keyof typeof chromeVars],
  fallback: string,
): string {
  return `var(${name}, ${fallback})`;
}
