// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ReactNode } from "react";

/**
 * One stone of the cairn, as the reference site draws it: the outline and an
 * optional offset. `brandMark.test.ts` keeps these equal to the reference
 * site's, which are the master in `docs/brand/logo-mark.svg`.
 */
export interface Stone {
  readonly points: string;
  readonly offset?: string;
}

/** The cairn's four stones, bottom first. */
export const STONES: readonly Stone[] = [
  { points: "80,430 96,384 150,368 330,376 410,372 436,420 410,452 110,456" },
  { points: "206,350 192,306 230,274 322,258 378,274 396,316 380,352" },
  {
    points: "166,238 152,208 184,182 290,176 318,200 310,238",
    offset: "translate(20 14)",
  },
  {
    points: "240,150 232,122 262,104 312,110 330,136 316,156",
    offset: "translate(-8 22)",
  },
];

/**
 * The MapCairn mark: four stones that take the accent through
 * `currentColor`, with a halo in the page's surface tone. Decorative.
 */
export function BrandMark(): ReactNode {
  return (
    <svg
      className="brand-mark"
      viewBox="65 76 386 360"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(0 -35)" strokeLinejoin="round">
        {STONES.map(({ points, offset }) => (
          <g key={points} transform={offset}>
            <polygon
              className="brand-mark-halo"
              strokeWidth="30"
              points={points}
            />
            <polygon
              className="brand-mark-stone"
              strokeWidth="16"
              points={points}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}
