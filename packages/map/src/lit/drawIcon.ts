// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { html, type TemplateResult } from "lit";

/** An icon's drawing, as `icons.generated.ts` holds it. */
export interface IconDrawing {
  readonly viewBox: string;
  readonly path: string;
}

/**
 * Draws a decorative icon in a Lit template, hidden from assistive technology,
 * at the size its class gives it. The harmony scanner reads a `drawIcon` call
 * as an icon, so a button that holds nothing else needs a name.
 */
export function drawIcon(icon: IconDrawing, className: string): TemplateResult {
  return html`<svg
    class=${className}
    viewBox=${icon.viewBox}
    width="1em"
    height="1em"
    fill="currentColor"
    aria-hidden="true"
  ><path d=${icon.path}></path></svg>`;
}
