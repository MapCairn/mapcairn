// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * What the quickstart leg (`quickstartRun.mjs`) answers for the default
 * basemap's own origin, so the page runs the real style with no network.
 *
 * The style document is the one OpenFreeMap served for Bright on 2026-11-23,
 * unchanged (`fixtures/openfreemap-bright-style.json`): its sprite, glyph and
 * tile set addresses are the real ones, which is what the policy has to allow.
 * The tile set, the tile, the sprite and the glyphs are stand-ins with the
 * real shapes: a TileJSON, one vector tile with a single city, a sprite index
 * with no icons and a 1 by 1 image, and an empty glyph range. They carry no
 * provider data. Nothing here is a copy of a provider's tiles.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The origin of the default basemap's style, sprites, glyphs and tiles. */
export const OPEN_FREE_MAP_ORIGIN = "https://tiles.openfreemap.org";

const STYLE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "openfreemap-bright-style.json",
);

/** The style document, as served. */
const STYLE = readFileSync(STYLE_FILE, "utf8");

/** A 1 by 1 transparent PNG, for the sprite sheet. */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/** The path the tile set's tiles are served under, as a real tile set names a dated build. */
const TILE_ROOT = "/planet/fixture";

/** A vector tile's extent, and the middle of it where the city sits. */
const EXTENT = 4096;
const MIDDLE = EXTENT / 2;

/** Protocol Buffers wire types and the vector tile format's field numbers and codes. */
const VARINT = 0;
const LENGTH_DELIMITED = 2;
const TILE_LAYERS = 3;
const LAYER = {
  name: 1,
  features: 2,
  keys: 3,
  values: 4,
  extent: 5,
  version: 15,
};
const FEATURE = { tags: 2, type: 3, geometry: 4 };
const VALUE_STRING = 1;
const POINT = 1;
const MOVE_TO_ONE = 9;
const TILE_VERSION = 2;

/** @param {number} value A non-negative integer. */
function varint(value) {
  const bytes = [];
  let rest = value;
  while (rest > 0x7f) {
    bytes.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return Buffer.from(bytes);
}

/** @param {number} value An integer, as the geometry commands write it. */
function zigzag(value) {
  return value >= 0 ? value * 2 : -value * 2 - 1;
}

/** @param {number} field @param {number} wire */
function tag(field, wire) {
  return varint(field * 8 + wire);
}

/** @param {number} field @param {Buffer | string} body */
function lengthDelimited(field, body) {
  const bytes = Buffer.from(body);
  return Buffer.concat([
    tag(field, LENGTH_DELIMITED),
    varint(bytes.length),
    bytes,
  ]);
}

/** @param {number} field @param {number} value */
function varintField(field, value) {
  return Buffer.concat([tag(field, VARINT), varint(value)]);
}

/** @param {number[]} values */
function packed(values) {
  return Buffer.concat(values.map(varint));
}

/**
 * One vector tile with a `place` layer holding one city, named for the
 * style's `label_city` layer. The label asks for a glyph range, so the leg
 * sees the glyph request the policy has to allow.
 *
 * @returns {Buffer}
 */
export function cityTile() {
  const feature = Buffer.concat([
    lengthDelimited(FEATURE.tags, packed([0, 0, 1, 1])),
    varintField(FEATURE.type, POINT),
    lengthDelimited(
      FEATURE.geometry,
      packed([MOVE_TO_ONE, zigzag(MIDDLE), zigzag(MIDDLE)]),
    ),
  ]);
  const layer = Buffer.concat([
    lengthDelimited(LAYER.name, "place"),
    lengthDelimited(LAYER.features, feature),
    lengthDelimited(LAYER.keys, "class"),
    lengthDelimited(LAYER.keys, "name_en"),
    lengthDelimited(LAYER.values, lengthDelimited(VALUE_STRING, "city")),
    lengthDelimited(LAYER.values, lengthDelimited(VALUE_STRING, "Test city")),
    varintField(LAYER.extent, EXTENT),
    varintField(LAYER.version, TILE_VERSION),
  ]);
  return lengthDelimited(TILE_LAYERS, layer);
}

/**
 * The answer for a request to the default basemap's origin, or undefined for
 * one the style does not name (so the leg refuses it).
 *
 * @param {string} url
 * @returns {{ contentType: string, body: Buffer | string } | undefined}
 */
export function openFreeMapResponse(url) {
  if (!URL.canParse(url)) {
    return undefined;
  }
  const { origin, pathname } = new URL(url);
  if (origin !== OPEN_FREE_MAP_ORIGIN) {
    return undefined;
  }
  const style = JSON.parse(STYLE);
  const sprite = new URL(style.sprite).pathname;
  if (pathname === "/styles/bright") {
    return { contentType: "application/json", body: STYLE };
  }
  if (pathname === "/planet") {
    return {
      contentType: "application/json",
      body: JSON.stringify({
        tilejson: "3.0.0",
        tiles: [`${OPEN_FREE_MAP_ORIGIN}${TILE_ROOT}/{z}/{x}/{y}.pbf`],
        minzoom: 0,
        maxzoom: 14,
      }),
    };
  }
  if (pathname.startsWith(`${TILE_ROOT}/`) && pathname.endsWith(".pbf")) {
    return { contentType: "application/x-protobuf", body: cityTile() };
  }
  if (/^\/fonts\/[^/]+\/\d+-\d+\.pbf$/.test(pathname)) {
    return { contentType: "application/x-protobuf", body: Buffer.alloc(0) };
  }
  if (pathname.startsWith(sprite) && /\.json$/.test(pathname)) {
    return { contentType: "application/json", body: "{}" };
  }
  if (pathname.startsWith(sprite) && /\.png$/.test(pathname)) {
    return { contentType: "image/png", body: TRANSPARENT_PNG };
  }
  return undefined;
}
