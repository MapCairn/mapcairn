// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

const top = "env(safe-area-inset-top, 0px)";
const bottom = "env(safe-area-inset-bottom, 0px)";
const left = "env(safe-area-inset-left, 0px)";
const right = "env(safe-area-inset-right, 0px)";

/**
 * The device safe-area insets (a notch, a rounded corner, the home indicator).
 * `env()` names physical sides, so the inline-start and inline-end insets
 * depend on the reading direction: a stylesheet sets the `ltr` pair, then the
 * `rtl` pair under `[dir="rtl"]`.
 */
export const safeArea = {
  top,
  bottom,
  ltr: { start: left, end: right },
  rtl: { start: right, end: left },
} as const;
