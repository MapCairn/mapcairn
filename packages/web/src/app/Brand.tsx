import * as styles from "./Brand.css";

/** The brand's name, set beside the mark on wide screens. */
export const BRAND_NAME = "MapCairn";

/**
 * One stone of the cairn: the outline polygon, with an optional offset. The
 * geometry is the master in `docs/brand/logo-mark.svg`, bottom stone first.
 */
interface Stone {
  readonly points: string;
  readonly offset?: string;
}

const STONES: readonly Stone[] = [
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
