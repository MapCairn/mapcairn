// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
/**
 * Builds `src/engine/regions/countries.json`, the country outlines the region
 * rules use, from two Natural Earth admin-0 country files (public domain).
 *
 *   node scripts/build-countries.mjs <ne_110m_admin_0_countries.geojson> <ne_50m_admin_0_countries.geojson>
 *
 * The 1:110m set is the base. It leaves out many small countries (Monaco, the
 * Vatican, Singapore and others), so the 1:50m outlines are added for only the
 * countries the 1:110m set does not have. Rings are quantised to 1e-4 degrees
 * and delta encoded, which keeps the artefact small.
 *
 * The committed artefact is formatted by Biome, so after writing the raw output
 * this script runs Biome's formatter on the file (from the repository's
 * dependencies), which gives the committed form back.
 *
 * The inputs are untrusted data: each file is checked against a pinned SHA-256
 * before it is read, and nothing in it is executed or used as a path.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The Natural Earth Vector repository commit the files were taken from. */
const SOURCE_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19";

const SOURCES = {
  coarse: {
    scale: "1:110m",
    path: "geojson/ne_110m_admin_0_countries.geojson",
    sha256: "6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f",
    /** A position within this many degrees of an outline counts as inside it (the coast is coarse). */
    toleranceDegrees: 0.25,
  },
  fine: {
    scale: "1:50m",
    path: "geojson/ne_50m_admin_0_countries.geojson",
    sha256: "3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb",
    toleranceDegrees: 0.05,
  },
};

/** Coordinates are stored as whole multiples of 1/QUANTUM degrees. */
const QUANTUM = 10_000;
const OUTPUT = new URL("../src/engine/regions/countries.json", import.meta.url);
const MIN_RING_POINTS = 4;

function readChecked(path, source) {
  const bytes = readFileSync(path);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== source.sha256) {
    throw new Error(
      `${path} is not the expected ${source.scale} file (sha256 ${actual}).`,
    );
  }
  return JSON.parse(bytes.toString("utf8"));
}

/** The ISO 3166-1 alpha-2 code of a feature: `ISO_A2`, else `ISO_A2_EH`, else none. */
function codeOf(properties) {
  for (const key of ["ISO_A2", "ISO_A2_EH"]) {
    const value = properties[key];
    if (typeof value === "string" && /^[A-Z]{2}$/.test(value)) {
      return value;
    }
  }
  return undefined;
}

/** A ring as flat integers: the first point, then each step from the one before. */
function encodeRing(ring) {
  const points = [];
  for (const [longitude, latitude] of ring) {
    const x = Math.round(longitude * QUANTUM);
    const y = Math.round(latitude * QUANTUM);
    const last = points.at(-1);
    if (!last || last[0] !== x || last[1] !== y) {
      points.push([x, y]);
    }
  }
  if (points.length < MIN_RING_POINTS) {
    return undefined;
  }
  const flat = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of points) {
    flat.push(x - px, y - py);
    px = x;
    py = y;
  }
  return flat;
}

function encodeGeometry(geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons
    .map((rings) => rings.map(encodeRing).filter((ring) => ring !== undefined))
    .filter((rings) => rings.length > 0);
}

function entriesFrom(collection, source, skip) {
  const entries = [];
  for (const feature of collection.features) {
    const code = codeOf(feature.properties);
    if (code === undefined || skip.has(code)) {
      continue;
    }
    entries.push({
      code,
      tolerance: Math.round(source.toleranceDegrees * QUANTUM),
      polygons: encodeGeometry(feature.geometry),
    });
  }
  return entries;
}

const [coarsePath, finePath] = process.argv.slice(2);
if (!coarsePath || !finePath) {
  throw new Error(
    "Usage: node scripts/build-countries.mjs <110m file> <50m file>",
  );
}
const coarse = entriesFrom(
  readChecked(coarsePath, SOURCES.coarse),
  SOURCES.coarse,
  new Set(),
);
const have = new Set(coarse.map((entry) => entry.code));
const fine = entriesFrom(
  readChecked(finePath, SOURCES.fine),
  SOURCES.fine,
  have,
);
const countries = [...coarse, ...fine].sort((a, b) =>
  a.code < b.code ? -1 : 1,
);

const artefact = {
  format: 1,
  source: {
    name: "Natural Earth admin-0 countries (public domain)",
    repository: "https://github.com/nvkelso/natural-earth-vector",
    commit: SOURCE_COMMIT,
    files: Object.values(SOURCES).map(({ scale, path, sha256 }) => ({
      scale,
      path,
      sha256,
    })),
    note: "The 1:110m outlines are the base. The 1:50m outlines are used only for countries the 1:110m set leaves out.",
  },
  quantum: QUANTUM,
  countries,
};
writeFileSync(OUTPUT, `${JSON.stringify(artefact)}\n`);
const biome = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL(
        "../../../node_modules/@biomejs/biome/bin/biome",
        import.meta.url,
      ),
    ),
    "format",
    "--write",
    fileURLToPath(OUTPUT),
  ],
  { encoding: "utf8" },
);
if (biome.status !== 0) {
  throw new Error(`Biome could not format the artefact:
${biome.stdout}${biome.stderr}`);
}
process.stdout.write(
  `${countries.length} countries (${coarse.length} at 1:110m, ${fine.length} at 1:50m) written.\n`,
);
