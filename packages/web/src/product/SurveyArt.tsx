// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { STONES } from "../app/cairnStones";
import { CONTOUR_VIEW_BOX, CONTOURS, SUMMIT } from "./contours";
import * as styles from "./SurveyArt.css";

/*
 * The product page's artwork: a corner of a survey sheet. Contour lines of a
 * made-up terrain (`contours.ts`, from `scripts/generateContours.mjs`), a grid
 * with its numbers in the collar, a cairn on the summit with its spot height,
 * a dropped pin, a measured line between the two, the map's centre cross, a
 * north arrow and a scale bar. It depicts no real place and carries no
 * information: it is `aria-hidden`, and every colour is a token through a
 * class, so it follows the theme.
 */

const { width: WIDTH, height: HEIGHT } = CONTOUR_VIEW_BOX;

/** The room around the frame for the grid numbers. */
const COLLAR = 30;

/** The grid's spacing, in view box units, and what one square is on the ground. */
const GRID_STEP = 80;
/** The scale: view box units in one kilometre. */
const UNITS_PER_KM = 160;

/** The first grid numbers, along the top and down the side, like a sheet's references. */
const FIRST_EASTING = 41;
const FIRST_NORTHING = 12;

/** Where the pin was dropped, on the lower hill. */
const PIN = { x: 232, y: 318 };

/** The map's centre, marked with a cross as the playground marks it. */
const CENTRE = { x: WIDTH / 2 + 180, y: HEIGHT / 2 + 110 };

/** The cairn's stones at the summit: the brand's polygons, scaled down and stood on the point. */
const CAIRN_SCALE = 0.075;
/** The middle of the bottom stone's base, in the master's coordinates. */
const CAIRN_BASE = { x: 258, y: 420 };

/** Two figures, padded, as grid numbers are written. */
function gridNumber(value: number): string {
  return String(value).padStart(2, "0");
}

/** The length of the measured line in kilometres, one decimal, as the map's readout would show it. */
function measuredKm(): string {
  const units = Math.hypot(SUMMIT.x - PIN.x, SUMMIT.y - PIN.y);
  return `${(units / UNITS_PER_KM).toFixed(1)} km`;
}

/** The grid lines inside the frame. */
function Grid() {
  const verticals = [];
  for (let x = GRID_STEP; x < WIDTH; x += GRID_STEP) {
    verticals.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={HEIGHT} />);
  }
  const horizontals = [];
  for (let y = GRID_STEP; y < HEIGHT; y += GRID_STEP) {
    horizontals.push(<line key={`y${y}`} x1={0} y1={y} x2={WIDTH} y2={y} />);
  }
  return (
    <g className={styles.grid}>
      {verticals}
      {horizontals}
    </g>
  );
}

/** The grid numbers in the collar: eastings along the top, northings down the side. */
function GridNumbers() {
  const eastings = [];
  for (let x = 0, n = FIRST_EASTING; x <= WIDTH; x += GRID_STEP, n += 1) {
    eastings.push(
      <text key={`e${x}`} x={x} y={-10} textAnchor="middle">
        {gridNumber(n)}
      </text>,
    );
  }
  const northings = [];
  for (let y = 0, n = FIRST_NORTHING; y <= HEIGHT; y += GRID_STEP, n -= 1) {
    northings.push(
      <text
        key={`n${y}`}
        x={-8}
        y={y}
        textAnchor="end"
        dominantBaseline="middle"
      >
        {gridNumber(n)}
      </text>,
    );
  }
  return (
    <g className={styles.collarText}>
      {eastings}
      {northings}
    </g>
  );
}

/** The cairn on the summit, with its spot height. */
function Cairn() {
  const transform = `translate(${SUMMIT.x} ${SUMMIT.y}) scale(${CAIRN_SCALE}) translate(${-CAIRN_BASE.x} ${-CAIRN_BASE.y})`;
  return (
    <g>
      <g transform={transform} strokeLinejoin="round">
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
      <text className={styles.label} x={SUMMIT.x + 22} y={SUMMIT.y - 6}>
        {SUMMIT.metres.toLocaleString("en-GB")}
      </text>
    </g>
  );
}

/** The dropped pin, drawn as the playground draws it: a teardrop with a dot. */
function Pin() {
  return (
    <g transform={`translate(${PIN.x} ${PIN.y})`}>
      <g className={styles.pin}>
        <path
          className={styles.pinBody}
          d="M0 0C-3 -8 -12 -14 -12 -24A12 12 0 0 1 12 -24C12 -14 3 -8 0 0Z"
        />
        <circle className={styles.pinDot} cx={0} cy={-24} r={4.5} />
      </g>
    </g>
  );
}

/** The measured line from the pin to the cairn, with its length. */
function Measure() {
  const midX = (PIN.x + SUMMIT.x) / 2;
  const midY = (PIN.y + SUMMIT.y) / 2;
  return (
    <g className={styles.measure}>
      <line
        className={styles.measureLine}
        x1={PIN.x}
        y1={PIN.y}
        x2={SUMMIT.x}
        y2={SUMMIT.y}
      />
      <text className={styles.measureLabel} x={midX + 10} y={midY + 22}>
        {measuredKm()}
      </text>
    </g>
  );
}

/** The cross at the map's centre. */
function Crosshair() {
  const { x, y } = CENTRE;
  return (
    <g className={styles.crosshair}>
      <circle cx={x} cy={y} r={9} />
      <line x1={x - 16} y1={y} x2={x - 5} y2={y} />
      <line x1={x + 5} y1={y} x2={x + 16} y2={y} />
      <line x1={x} y1={y - 16} x2={x} y2={y - 5} />
      <line x1={x} y1={y + 5} x2={x} y2={y + 16} />
    </g>
  );
}

/** The north arrow, in the sheet's top corner. */
function NorthArrow() {
  return (
    <g transform={`translate(${WIDTH - 36} 30)`}>
      <path className={styles.arrowDark} d="M0 0L9 30L0 24Z" />
      <path className={styles.arrowLight} d="M0 0L-9 30L0 24Z" />
      <text className={styles.label} x={0} y={48} textAnchor="middle">
        N
      </text>
    </g>
  );
}

/** The scale bar: one kilometre in alternate quarters, in the sheet's bottom corner. */
function ScaleBar() {
  const quarter = UNITS_PER_KM / 4;
  const y = HEIGHT - 30;
  return (
    <g transform={`translate(24 ${y})`}>
      {[0, 1, 2, 3].map((step) => (
        <rect
          key={step}
          className={step % 2 === 0 ? styles.barDark : styles.barLight}
          x={step * quarter}
          y={0}
          width={quarter}
          height={6}
        />
      ))}
      <text className={styles.label} x={0} y={-8} textAnchor="middle">
        0
      </text>
      <text
        className={styles.label}
        x={UNITS_PER_KM}
        y={-8}
        textAnchor="middle"
      >
        1 km
      </text>
    </g>
  );
}

/** The survey sheet: decorative, hidden from assistive technology. */
export function SurveyArt() {
  return (
    <svg
      className={styles.art}
      viewBox={`${-COLLAR} ${-COLLAR} ${WIDTH + COLLAR * 2} ${HEIGHT + COLLAR * 2}`}
      aria-hidden="true"
      focusable="false"
      data-testid="survey-art"
    >
      <defs>
        <clipPath id="survey-art-sheet">
          <rect x={0} y={0} width={WIDTH} height={HEIGHT} />
        </clipPath>
      </defs>
      <GridNumbers />
      <g clipPath="url(#survey-art-sheet)">
        <Grid />
        {CONTOURS.map(({ index, d }) => (
          <path
            key={d}
            className={index ? styles.indexContour : styles.contour}
            d={d}
          />
        ))}
        <Measure />
        <Crosshair />
        <Cairn />
        <Pin />
        <NorthArrow />
        <ScaleBar />
      </g>
      <rect
        className={styles.neatline}
        x={0}
        y={0}
        width={WIDTH}
        height={HEIGHT}
      />
    </svg>
  );
}
