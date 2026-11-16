// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
/**
 * Generates the benchmark inputs: GeoJSON FeatureCollections of a given size
 * and a single polygon of a given number of vertices. The data is made from a
 * seeded generator, so a run is repeatable, and it is written to disk in pieces
 * so a 500 MB file never sits in memory.
 */

import { once } from "node:events";
import { createWriteStream } from "node:fs";

/** A small seeded random number generator (mulberry32), so the same seed gives the same file. */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERTICES_PER_FEATURE = 24;

/** One feature: a small polygon of 24 vertices with six-decimal coordinates and a few properties. */
function feature(random, index) {
  const centreLongitude = -170 + random() * 340;
  const centreLatitude = -75 + random() * 150;
  const ring = [];
  for (let i = 0; i < VERTICES_PER_FEATURE; i++) {
    const angle = (i / VERTICES_PER_FEATURE) * 2 * Math.PI;
    const radius = 0.01 + random() * 0.01;
    ring.push([
      +(centreLongitude + radius * Math.cos(angle)).toFixed(6),
      +(centreLatitude + radius * Math.sin(angle)).toFixed(6),
    ]);
  }
  ring.push(ring[0]);
  return JSON.stringify({
    type: "Feature",
    properties: {
      id: index,
      name: `Parcel ${index}`,
      category: ["farm", "park", "plot", "wetland"][index % 4],
      area_m2: Math.round(random() * 100000),
    },
    geometry: { type: "Polygon", coordinates: [ring] },
  });
}

async function write(stream, text) {
  if (!stream.write(text)) {
    await once(stream, "drain");
  }
}

/** Writes a FeatureCollection of at least `bytes` bytes to `path`, and returns the feature count. */
export async function writeCollection(path, bytes, seed = 1) {
  const random = seeded(seed);
  const stream = createWriteStream(path);
  await write(stream, '{"type":"FeatureCollection","features":[');
  let written = 40;
  let count = 0;
  while (written < bytes) {
    const text = `${count === 0 ? "" : ","}${feature(random, count)}`;
    await write(stream, text);
    written += text.length;
    count += 1;
  }
  await write(stream, "]}");
  stream.end();
  await once(stream, "finish");
  return count;
}

/**
 * Writes one Polygon feature with `vertices` vertices to `path`. The ring is a
 * wavy circle that never crosses itself, so the rule that has to prove that
 * (self-intersection) does the full amount of work.
 */
export async function writePolygon(path, vertices) {
  const stream = createWriteStream(path);
  await write(
    stream,
    '{"type":"Feature","properties":{"name":"big"},"geometry":{"type":"Polygon","coordinates":[[',
  );
  const radius = 40;
  let first = true;
  let batch = [];
  const flush = async () => {
    await write(stream, (first ? "" : ",") + batch.join(","));
    first = false;
    batch = [];
  };
  for (let i = 0; i < vertices; i++) {
    const angle = (i / vertices) * 2 * Math.PI;
    const wave = 1 + 0.1 * Math.sin(angle * 50);
    const x = (radius * wave * Math.cos(angle)).toFixed(7);
    const y = (radius * wave * Math.sin(angle)).toFixed(7);
    batch.push(`[${x},${y}]`);
    if (batch.length === 10000) {
      await flush();
    }
  }
  batch.push(`[${radius.toFixed(7)},0.0000000]`);
  await flush();
  await write(stream, "]]}}");
  stream.end();
  await once(stream, "finish");
}
