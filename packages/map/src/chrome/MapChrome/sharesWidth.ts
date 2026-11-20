// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** A horizontal extent, in CSS pixels from the chrome container's left edge. */
export interface Span {
  readonly left: number;
  readonly width: number;
}

/**
 * Whether two slots share any width, so that one of them stacked above the
 * other would cover it. A slot that comes within `gap` of the other counts as
 * sharing, so a control never ends up closer than a gap beside a surface it
 * only just clears.
 */
export function sharesWidth(a: Span, b: Span, gap: number): boolean {
  return a.left < b.left + b.width + gap && b.left < a.left + a.width + gap;
}
