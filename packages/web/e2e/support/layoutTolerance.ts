// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** Well above Firefox's rounding error (about 5e-5 px) and far below any visible difference. */
const FIREFOX_LAYOUT_TOLERANCE = 0.01;

/**
 * How far a measured distance may stray from the CSS value that sets it, in CSS
 * pixels. Firefox keeps layout in 1/60 px units and reports a box edge as the
 * nearest unit converted to a float, so an 8 px gap can read 7.99998 or
 * 8.00004. Chromium and WebKit report it exactly, so their assertions keep a
 * tolerance of zero.
 */
export function layoutTolerance(browserName: string): number {
  return browserName === "firefox" ? FIREFOX_LAYOUT_TOLERANCE : 0;
}
