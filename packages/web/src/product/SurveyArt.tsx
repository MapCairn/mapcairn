// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { STONES } from "../app/cairnStones";
import { CONTOURS } from "./contours";
import * as styles from "./SurveyArt.css";
import {
  CAIRN_TRANSFORM,
  CROSSHAIR,
  CROSSHAIR_ARMS,
  EASTINGS,
  MEASURE,
  MEASURE_LABEL,
  NORTH,
  NORTH_HALVES,
  NORTHINGS,
  PIN_HEAD,
  PIN_PATH,
  PIN_TIP,
  SCALE_BAR,
  SHEET,
  SPOT_HEIGHT,
  TICK_LENGTH,
  VIEW_BOX,
} from "./surveyGeometry";

/*
 * The product page's artwork: a corner of a survey sheet. Contours of a
 * made-up terrain, grid ticks with their numbers in the collar, a cairn on the
 * summit with its spot height, a dropped pin, the line measured from the pin
 * to the cairn with its length, the map's centre cross, a north arrow and a
 * scale bar. Every position comes from `surveyGeometry.ts`, so the marks agree
 * by construction. It depicts no real place and carries no information: it is
 * `aria-hidden`, and every colour is a token through a class. The anchors a
 * browser test measures carry `data-anchor`.
 */

/** The grid ticks on the sheet's edges, and their numbers in the collar. */
function Grid() {
  return (
    <g>
      <g className={styles.tick}>
        {EASTINGS.map(({ at }) => (
          <line key={`e${at}`} x1={at} y1={0} x2={at} y2={TICK_LENGTH} />
        ))}
        {NORTHINGS.map(({ at }) => (
          <line key={`n${at}`} x1={0} y1={at} x2={TICK_LENGTH} y2={at} />
        ))}
      </g>
      <g className={styles.collarText}>
        {EASTINGS.map(({ at, label }) => (
          <text
            key={`e${at}`}
            x={at}
            y={-8}
            textAnchor="middle"
            data-anchor="easting"
            data-at={at}
          >
            {label}
          </text>
        ))}
        {NORTHINGS.map(({ at, label }) => (
          <text
            key={`n${at}`}
            x={-6}
            y={at}
            textAnchor="end"
            dominantBaseline="central"
            data-anchor="northing"
            data-at={at}
          >
            {label}
          </text>
        ))}
      </g>
    </g>
  );
}

/** The cairn on the summit, with its spot height. */
function Cairn() {
  return (
    <g>
      <g transform={CAIRN_TRANSFORM} strokeLinejoin="round">
        {STONES.map(({ points, offset }) => (
          <g key={points} transform={offset}>
            <polygon className={styles.halo} strokeWidth="40" points={points} />
            <polygon
              className={styles.stone}
              strokeWidth="16"
              points={points}
            />
          </g>
        ))}
      </g>
      <text className={styles.label} x={SPOT_HEIGHT.at.x} y={SPOT_HEIGHT.at.y}>
        {SPOT_HEIGHT.text}
      </text>
    </g>
  );
}

/** The dropped pin, drawn as the playground draws it, with its tip on {@link PIN_TIP}. */
function Pin() {
  return (
    <g transform={`translate(${PIN_TIP.x} ${PIN_TIP.y})`}>
      <g className={styles.pin}>
        <path className={styles.pinBody} d={PIN_PATH} />
        <circle
          className={styles.pinDot}
          cx={PIN_HEAD.cx}
          cy={PIN_HEAD.cy}
          r={PIN_HEAD.r}
        />
        <circle cx={0} cy={0} r={0} data-anchor="pin-tip" />
      </g>
    </g>
  );
}

/** The measured line from the pin's tip to the cairn's foot, with its length. */
function Measure() {
  return (
    <g className={styles.measure}>
      <line
        className={styles.measureLine}
        x1={MEASURE.from.x}
        y1={MEASURE.from.y}
        x2={MEASURE.to.x}
        y2={MEASURE.to.y}
        data-anchor="measure-line"
      />
      <text
        className={styles.measureLabel}
        x={MEASURE_LABEL.at.x}
        y={MEASURE_LABEL.at.y}
        textAnchor="middle"
      >
        {MEASURE_LABEL.text}
      </text>
    </g>
  );
}

/** The cross at the map's centre. */
function Crosshair() {
  const { centre, radius } = CROSSHAIR;
  return (
    <g className={styles.crosshair}>
      <circle cx={centre.x} cy={centre.y} r={radius} data-anchor="crosshair" />
      {CROSSHAIR_ARMS.map(([from, to]) => (
        <line
          key={`${from.x},${from.y}`}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
        />
      ))}
    </g>
  );
}

/** The north arrow, pointing up the grid. */
function NorthArrow() {
  return (
    <g>
      <path
        className={styles.arrowDark}
        d={NORTH_HALVES.dark}
        data-anchor="north"
      />
      <path className={styles.arrowLight} d={NORTH_HALVES.light} />
      <text
        className={styles.label}
        x={NORTH.tip.x}
        y={NORTH.labelY}
        textAnchor="middle"
      >
        N
      </text>
    </g>
  );
}

/** The scale bar: one kilometre in alternate quarters. */
function ScaleBar() {
  const { origin, height, quarters, labels, labelY } = SCALE_BAR;
  return (
    <g>
      {quarters.map((quarter) => (
        <rect
          key={quarter.x}
          className={quarter.dark ? styles.barDark : styles.barLight}
          x={quarter.x}
          y={origin.y}
          width={quarter.width}
          height={height}
          data-anchor="scale-quarter"
        />
      ))}
      {labels.map((label) => (
        <text
          key={label.text}
          className={styles.label}
          x={label.x}
          y={labelY}
          textAnchor="middle"
        >
          {label.text}
        </text>
      ))}
    </g>
  );
}

/** The survey sheet: decorative, hidden from assistive technology. */
export function SurveyArt() {
  return (
    <div className={styles.frame} data-testid="survey-art-frame">
      <svg
        className={styles.art}
        viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
        data-testid="survey-art"
      >
        <defs>
          <clipPath id="survey-art-sheet">
            <rect x={0} y={0} width={SHEET.width} height={SHEET.height} />
          </clipPath>
        </defs>
        <g clipPath="url(#survey-art-sheet)">
          {CONTOURS.map(({ index, d }) => (
            <path
              key={d}
              className={index ? styles.indexContour : styles.contour}
              d={d}
            />
          ))}
        </g>
        <Grid />
        <rect
          className={styles.neatline}
          x={0}
          y={0}
          width={SHEET.width}
          height={SHEET.height}
        />
        <Measure />
        <Crosshair />
        <Cairn />
        <Pin />
        <NorthArrow />
        <ScaleBar />
      </svg>
    </div>
  );
}
