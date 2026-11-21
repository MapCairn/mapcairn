// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { STONES } from "../app/cairnStones";
import { CONTOURS } from "./contours";
import * as styles from "./SurveyArt.css";
import {
  CAIRN_TRANSFORM,
  MEASURE,
  MEASURE_LABEL,
  PIN_HEAD,
  PIN_PATH,
  PIN_TIP,
  SHEET,
  SPOT_HEIGHT,
} from "./surveyGeometry";

/*
 * The product page's artwork: a strip of relief from a survey sheet, the last
 * thing before the footer. Contours of a made-up terrain, a cairn on the
 * summit, a dropped pin and the line measured from the pin to the cairn. The
 * drawing itself holds no text, so nothing in it shrinks with it: the two
 * labels, the summit's height and the line's length, are HTML at the small
 * step (13 px) set beside the marks they name, in the ink of the page's text.
 * Every position comes from `surveyGeometry.ts`, so the marks agree by
 * construction. It depicts no real place and carries nothing the page's text
 * does not: all of it is `aria-hidden`, and every colour is a token through a
 * class. The anchors a browser test measures carry `data-anchor`.
 */

/** The cairn on the summit, in the blue of the survey marks. */
function Cairn() {
  return (
    <g transform={CAIRN_TRANSFORM} strokeLinejoin="round">
      {STONES.map(({ points, offset }) => (
        <g key={points} transform={offset}>
          <polygon className={styles.halo} strokeWidth="40" points={points} />
          <polygon className={styles.stone} strokeWidth="16" points={points} />
        </g>
      ))}
    </g>
  );
}

/** The dropped pin, drawn as the playground draws it, with its tip on {@link PIN_TIP}. */
function Pin() {
  return (
    <g transform={`translate(${PIN_TIP.x} ${PIN_TIP.y})`}>
      <path className={styles.pinBody} d={PIN_PATH} />
      <circle
        className={styles.pinDot}
        cx={PIN_HEAD.cx}
        cy={PIN_HEAD.cy}
        r={PIN_HEAD.r}
      />
      <circle cx={0} cy={0} r={0} data-anchor="pin-tip" />
    </g>
  );
}

/** The relief strip: decorative, hidden from assistive technology. */
export function SurveyArt() {
  return (
    <div
      className={styles.frame}
      data-testid="survey-art-frame"
      aria-hidden="true"
    >
      <svg
        className={styles.art}
        viewBox={`0 0 ${SHEET.width} ${SHEET.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
        data-testid="survey-art"
      >
        {CONTOURS.map(({ index, d }) => (
          <path
            key={d}
            className={index ? styles.indexContour : styles.contour}
            d={d}
          />
        ))}
        <line
          className={styles.measureLine}
          x1={MEASURE.from.x}
          y1={MEASURE.from.y}
          x2={MEASURE.to.x}
          y2={MEASURE.to.y}
          data-anchor="measure-line"
        />
        <Cairn />
        <Pin />
      </svg>
      <span className={styles.spotHeight} data-testid="survey-art-spot-height">
        {SPOT_HEIGHT.text}
      </span>
      <span className={styles.length} data-testid="survey-art-length">
        {MEASURE_LABEL.text}
      </span>
    </div>
  );
}
