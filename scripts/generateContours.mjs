// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Writes the contour lines the product page draws in its hero
 * (`packages/web/src/product/contours.ts`), from a fixed, made-up terrain.
 *
 * The terrain is a sum of smooth hills and a gentle swell, sampled on a grid
 * and traced with marching squares; the segments are joined into lines and
 * thinned. Nothing is random, so the output is the same on every run and the
 * committed file only changes when this script does. It depicts no real place.
 *
 * Run with `node scripts/generateContours.mjs`, then `npm run format`.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The drawing's size, in the units of the SVG view box. */
const WIDTH = 640;
const HEIGHT = 480;
/** The grid step the terrain is sampled at. */
const STEP = 6;
/** Contour levels, as a share of the terrain's height. */
const FIRST_LEVEL = 0.08;
const LEVEL_STEP = 0.06;
/** How far a thinned line may stray from the traced one, in view box units. */
const TOLERANCE = 0.5;
/**
 * The made-up heights: the first level is at `BASE_METRES`, each level is
 * `INTERVAL_METRES` above the one below, and a level whose height is a
 * multiple of `INDEX_METRES` is an index contour.
 */
const BASE_METRES = 200;
const INTERVAL_METRES = 50;
const INDEX_METRES = 250;

/** The hills: centre, spread on each axis and height. */
const HILLS = [
  { x: 420, y: 190, sx: 120, sy: 95, h: 1 },
  { x: 250, y: 300, sx: 105, sy: 80, h: 0.62 },
  { x: 540, y: 380, sx: 80, sy: 70, h: 0.42 },
  { x: 110, y: 110, sx: 90, sy: 120, h: 0.3 },
];

/** The terrain height at a point, roughly 0 to 1.05. */
function terrain(x, y) {
  let z = 0;
  for (const hill of HILLS) {
    const dx = (x - hill.x) / hill.sx;
    const dy = (y - hill.y) / hill.sy;
    z += hill.h * Math.exp(-(dx * dx + dy * dy) / 2);
  }
  const swell =
    0.035 * Math.sin(x / 47 + y / 83) + 0.025 * Math.cos(x / 29 - y / 61);
  return z + swell;
}

const columns = Math.floor(WIDTH / STEP) + 1;
const rows = Math.floor(HEIGHT / STEP) + 1;
const grid = Array.from({ length: rows }, (_row, rowIndex) =>
  Array.from({ length: columns }, (_column, columnIndex) =>
    terrain(columnIndex * STEP, rowIndex * STEP),
  ),
);

/** Where `level` crosses the edge between two grid points, the same from either side. */
function crossing(level, a, b) {
  const [first, second] =
    a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
  const za = grid[first[1]][first[0]];
  const zb = grid[second[1]][second[0]];
  const t = (level - za) / (zb - za);
  return [
    (first[0] + t * (second[0] - first[0])) * STEP,
    (first[1] + t * (second[1] - first[1])) * STEP,
  ];
}

/** The segments of one level, by marching squares. */
function segmentsAt(level) {
  const segments = [];
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const corners = [
        [column, row],
        [column + 1, row],
        [column + 1, row + 1],
        [column, row + 1],
      ];
      const above = corners.map(([c, r]) => grid[r][c] >= level);
      const edges = [];
      for (let side = 0; side < 4; side += 1) {
        const a = corners[side];
        const b = corners[(side + 1) % 4];
        if (above[side] !== above[(side + 1) % 4]) {
          edges.push(crossing(level, a, b));
        }
      }
      if (edges.length === 2) {
        segments.push([edges[0], edges[1]]);
      } else if (edges.length === 4) {
        const centre =
          (grid[row][column] +
            grid[row][column + 1] +
            grid[row + 1][column] +
            grid[row + 1][column + 1]) /
          4;
        const joinFirst = centre >= level === above[0];
        segments.push(
          joinFirst ? [edges[0], edges[3]] : [edges[0], edges[1]],
          joinFirst ? [edges[1], edges[2]] : [edges[2], edges[3]],
        );
      }
    }
  }
  return segments;
}

const key = ([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`;

/** The segments that touch each point, by the point's key. */
function segmentsByEnd(segments) {
  const byEnd = new Map();
  for (const [index, [a, b]] of segments.entries()) {
    for (const point of [a, b]) {
      const list = byEnd.get(key(point)) ?? [];
      list.push(index);
      byEnd.set(key(point), list);
    }
  }
  return byEnd;
}

/**
 * Grows `line` from one end through unused segments that share its tip,
 * marking each one used.
 */
function extend(line, atEnd, segments, byEnd, used) {
  for (;;) {
    const tip = atEnd ? line[line.length - 1] : line[0];
    const next = (byEnd.get(key(tip)) ?? []).find((i) => !used.has(i));
    if (next === undefined) {
      return;
    }
    used.add(next);
    const [a, b] = segments[next];
    const other = key(a) === key(tip) ? b : a;
    if (atEnd) {
      line.push(other);
    } else {
      line.unshift(other);
    }
  }
}

/** Joins segments that share an end into lines. */
function chain(segments) {
  const byEnd = segmentsByEnd(segments);
  const used = new Set();
  const lines = [];
  for (const [start] of segments.entries()) {
    if (used.has(start)) {
      continue;
    }
    used.add(start);
    const line = [...segments[start]];
    extend(line, true, segments, byEnd, used);
    extend(line, false, segments, byEnd, used);
    lines.push(line);
  }
  return lines;
}

/** Douglas-Peucker thinning. */
function thin(points) {
  if (points.length < 3) {
    return points;
  }
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const length = Math.hypot(bx - ax, by - ay) || 1;
  let worst = 0;
  let worstIndex = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i];
    const distance =
      Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
    if (distance > worst) {
      worst = distance;
      worstIndex = i;
    }
  }
  if (worst <= TOLERANCE) {
    return [points[0], points[points.length - 1]];
  }
  const left = thin(points.slice(0, worstIndex + 1));
  const right = thin(points.slice(worstIndex));
  return [...left.slice(0, -1), ...right];
}

/**
 * Thins a closed ring: Douglas-Peucker needs two different ends, so the ring
 * is split at the point farthest from its start and each half thinned.
 */
function thinRing(ring) {
  const [sx, sy] = ring[0];
  let far = 0;
  let farthest = -1;
  for (const [i, [x, y]] of ring.entries()) {
    const distance = Math.hypot(x - sx, y - sy);
    if (distance > farthest) {
      farthest = distance;
      far = i;
    }
  }
  const first = thin(ring.slice(0, far + 1));
  const second = thin(ring.slice(far));
  return [...first.slice(0, -1), ...second];
}

/** One line as SVG path data, with whole-number-and-a-tenth coordinates. */
function pathData(line) {
  const closed = key(line[0]) === key(line[line.length - 1]);
  const points = closed ? thinRing(line) : thin(line);
  const text = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join("");
  return closed ? `${text}Z` : text;
}

let summit = { x: 0, y: 0, z: -1 };
for (let row = 0; row < rows; row += 1) {
  for (let column = 0; column < columns; column += 1) {
    if (grid[row][column] > summit.z) {
      summit = { x: column * STEP, y: row * STEP, z: grid[row][column] };
    }
  }
}

// Every level up to the summit, so the highest contour is the last one below it.
const contours = [];
for (let n = 0; FIRST_LEVEL + n * LEVEL_STEP < summit.z; n += 1) {
  const level = FIRST_LEVEL + n * LEVEL_STEP;
  const lines = chain(segmentsAt(level)).filter((line) => line.length > 2);
  if (lines.length === 0) {
    continue;
  }
  const levelMetres = BASE_METRES + n * INTERVAL_METRES;
  contours.push({
    metres: levelMetres,
    index: levelMetres % INDEX_METRES === 0,
    d: lines.map(pathData).join(""),
  });
}
// The summit's height on the same scale as the contours: a level's share of
// the terrain maps linearly to metres, so the spot height sits between the
// highest contour and the next level up.
const metres =
  BASE_METRES +
  Math.round(((summit.z - FIRST_LEVEL) / LEVEL_STEP) * INTERVAL_METRES);

const output = `// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
// Generated by scripts/generateContours.mjs. Do not edit by hand.

/** One contour level: its made-up height, whether it is an index contour, and its path data. */
export interface ContourLevel {
  readonly metres: number;
  readonly index: boolean;
  readonly d: string;
}

/** The view box the contours are drawn in. */
export const CONTOUR_VIEW_BOX = { width: ${WIDTH}, height: ${HEIGHT} } as const;

/** The height between two neighbouring contours, and the step of the index contours, in metres. */
export const CONTOUR_INTERVAL_METRES = ${INTERVAL_METRES};
export const INDEX_CONTOUR_METRES = ${INDEX_METRES};

/** The contour lines of a made-up terrain, lowest level first. */
export const CONTOURS: readonly ContourLevel[] = ${JSON.stringify(contours, null, 2)};

/** The terrain's highest point, where the cairn stands, and its made-up height in metres. */
export const SUMMIT = { x: ${summit.x}, y: ${summit.y}, metres: ${metres} } as const;
`;

// `--json` prints the data instead of writing the file, so a test can keep the
// committed file equal to what this script makes.
if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify({
      contours,
      summit: { x: summit.x, y: summit.y, metres },
      interval: INTERVAL_METRES,
      index: INDEX_METRES,
    }),
  );
} else {
  const target = fileURLToPath(
    new URL("../packages/web/src/product/contours.ts", import.meta.url),
  );
  writeFileSync(target, output);
  console.log(
    `Wrote ${target}: ${contours.length} levels, ${output.length} bytes`,
  );
}
