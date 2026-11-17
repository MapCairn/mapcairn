// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import * as styles from "./Brand.css";
import { STONES } from "./cairnStones";

/** The brand's name, set beside the mark on wide screens. */
export const BRAND_NAME = "MapCairn";

/**
 * The MapCairn cairn: four uneven stones, each resting on the one below. It is
 * decorative (`aria-hidden`) and takes its colours from tokens (the stones
 * the accent, the halo the map halo role). The view box is the master's,
 * cropped to the stones and their halo, so the mark lines up with the row's
 * edge.
 */
function BrandMark() {
  return (
    <svg
      className={styles.mark}
      viewBox="65 76 386 360"
      aria-hidden="true"
      focusable="false"
      data-testid="brand-mark"
    >
      <g transform="translate(0 -35)" strokeLinejoin="round">
        {STONES.map(({ points, offset }) => (
          <g key={points} transform={offset}>
            <polygon className={styles.halo} strokeWidth="30" points={points} />
            <polygon
              className={styles.stone}
              strokeWidth="16"
              points={points}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * The brand lockup for the top of the side menus: the cairn and the name
 * beside it, passed to `Sheet` as its `brand`. The sheet hides the row from
 * assistive technology, because its own title names the panel.
 */
export function Brand() {
  return (
    <>
      <BrandMark />
      <span className={styles.name} data-testid="brand-name">
        {BRAND_NAME}
      </span>
    </>
  );
}
