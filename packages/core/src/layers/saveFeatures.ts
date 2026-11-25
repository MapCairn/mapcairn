// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { fixedDecimal, withFixedDecimals } from "../geometry/fixedDecimal";
import type { FieldValue, LayerFeature } from "../ports/layers";
import {
  type FeedLayerDefinition,
  isFeedLayer,
  type LayerAttribution,
  type LayerDefinition,
} from "./definition";

/**
 * The most features a saved file holds. A layer keeps at most this many for
 * a query (see `maxFeatures`), and a file of more is slow to open in a
 * spreadsheet, so a feed with more is saved from its first features, in the
 * order it was sent, and the person is told how many were left out.
 */
export const MAX_SAVED_FEATURES = 5000;

const JSON_INDENT = 2;

/** The file types a layer's features are saved as. */
export type FeatureFileFormat = "geojson" | "csv";

/** What a saved file says about where it came from. */
export interface FeatureFileInfo {
  /** The layer's name, as the person reads it. */
  readonly layerName: string;
  /** The credit lines, as {@link creditLines} writes them. */
  readonly credits: readonly string[];
  /** The day the file was saved, as `YYYY-MM-DD`. */
  readonly savedOn: string;
}

/** The features a file is built from, and whether the cap cut any. */
export interface SavedFeatureSet {
  /** The features that go in the file: the first {@link MAX_SAVED_FEATURES} at most. */
  readonly kept: readonly LayerFeature[];
  /** How many features the layer held. */
  readonly total: number;
  /** True when `kept` is shorter than `total`. */
  readonly capped: boolean;
}

/**
 * Whether the person may be offered to save a layer's features: a feed or
 * query layer of features whose definition says `saveFeatures: true`. A tile
 * layer, a vector tile layer, a heatmap and any layer that does not say so
 * are never offered it.
 */
export function canSaveFeatures(
  definition: LayerDefinition,
): definition is FeedLayerDefinition {
  return isFeedLayer(definition) && definition.saveFeatures === true;
}

/** The first {@link MAX_SAVED_FEATURES} of `features`, with how many there were. */
export function savedFeatureSet(
  features: readonly LayerFeature[],
): SavedFeatureSet {
  return {
    kept: features.slice(0, MAX_SAVED_FEATURES),
    total: features.length,
    capped: features.length > MAX_SAVED_FEATURES,
  };
}

/**
 * A layer's credits as lines of text, `{year}` filled in and a link added in
 * brackets, so the credit and the terms it points to travel with the file.
 */
export function creditLines(
  attribution: readonly LayerAttribution[],
  year: string,
): string[] {
  return attribution.map((credit) => {
    const text = credit.text.replaceAll("{year}", year);
    return credit.url === undefined ? text : `${text} (${credit.url})`;
  });
}

/** The file's name: the layer's id and the day, such as `sample-points-2026-11-25.csv`. */
export function savedFileName(
  layerId: string,
  savedOn: string,
  format: FeatureFileFormat,
): string {
  return `${layerId}-${savedOn}.${format}`;
}

function geometryText(feature: LayerFeature): string {
  return withFixedDecimals(JSON.stringify(feature.geometry));
}

/**
 * The features as a GeoJSON `FeatureCollection`, written as text. The layer's
 * name, its credits and the day it was saved are members of the collection
 * (GeoJSON allows extra members), and each feature's properties are its
 * decoded fields. Every number is plain decimal text with no exponent.
 */
export function featuresToGeoJsonText(
  features: readonly LayerFeature[],
  info: FeatureFileInfo,
): string {
  const collection = {
    type: "FeatureCollection",
    layer: info.layerName,
    attribution: info.credits,
    saved: info.savedOn,
    features: features.map((feature) => ({
      type: "Feature",
      id: feature.id,
      geometry: feature.geometry,
      properties: feature.fields,
    })),
  };
  return withFixedDecimals(JSON.stringify(collection, null, JSON_INDENT));
}

/** Characters that make a spreadsheet read a text cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * A text cell for CSV: a text that a spreadsheet would run as a formula (it
 * starts with `=`, `+`, `-`, `@`, a tab or a carriage return) gets a leading
 * apostrophe, which spreadsheets read as "this is text"; one with a comma, a
 * quote or a line break is quoted.
 */
function textCell(text: string): string {
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** A field's cell: a number as plain decimal text (not run through {@link textCell}, so a negative stays a number), empty for null. */
function valueCell(value: FieldValue | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? fixedDecimal(value) : "";
  }
  return typeof value === "boolean" ? String(value) : textCell(value);
}

/** The column names: the fixed ones first, then each field in the order it first appears, renamed where it would repeat a name. */
function columnNames(
  fixed: readonly string[],
  fields: readonly string[],
): string[] {
  const taken = new Set(fixed);
  const renamed = fields.map((field) => {
    let name = field;
    for (let n = 2; taken.has(name); n += 1) {
      name = `${field}_${n}`;
    }
    taken.add(name);
    return name;
  });
  return renamed;
}

function fieldNamesOf(features: readonly LayerFeature[]): string[] {
  const names = new Set<string>();
  for (const feature of features) {
    for (const name of Object.keys(feature.fields)) {
      names.add(name);
    }
  }
  return [...names];
}

/**
 * The features as CSV text, rows ending CRLF. The columns are `feature_id`,
 * `longitude` and `latitude` (empty unless the feature is a point),
 * `geometry` (the GeoJSON geometry as text), each decoded field, then
 * `credit` and `saved`, so the credit and the day travel on every row. A
 * number is plain decimal text; a text that starts with `=`, `+`, `-`, `@`,
 * a tab or a carriage return gets a leading apostrophe so a spreadsheet
 * does not run it as a formula. A field that would repeat a column name is
 * renamed with a number (`credit_2`).
 */
export function featuresToCsv(
  features: readonly LayerFeature[],
  info: FeatureFileInfo,
): string {
  const fieldNames = fieldNamesOf(features);
  const lead = ["feature_id", "longitude", "latitude", "geometry"];
  const tail = ["credit", "saved"];
  const header = [
    ...lead,
    ...columnNames([...lead, ...tail], fieldNames),
    ...tail,
  ];
  const credit = textCell(info.credits.join("; "));
  const rows = features.map((feature) => {
    const { geometry } = feature;
    const isPoint = geometry.type === "Point";
    return [
      textCell(feature.id),
      isPoint ? fixedDecimal(geometry.coordinates[0]) : "",
      isPoint ? fixedDecimal(geometry.coordinates[1]) : "",
      textCell(geometryText(feature)),
      ...fieldNames.map((name) => valueCell(feature.fields[name])),
      credit,
      textCell(info.savedOn),
    ].join(",");
  });
  return [header.map(textCell).join(","), ...rows].join("\r\n");
}
