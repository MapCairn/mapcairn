// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * One stone of the cairn: the outline polygon, with an optional offset. The
 * geometry is the master in `docs/brand/logo-mark.svg`, bottom stone first.
 */
export interface Stone {
  readonly points: string;
  readonly offset?: string;
}

/**
 * The cairn's stones, bottom first, in the master's coordinates. The brand
 * mark, the product page's art and its link preview image all draw them.
 */
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
