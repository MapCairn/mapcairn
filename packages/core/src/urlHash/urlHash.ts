import { formatFixed } from "../format/format";
import type { ViewState } from "../ports/geometry";
import type { LayersUrlState, UrlStateValue } from "../ports/url";

const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;
const BASEMAP_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const MAX_ZOOM = 24;
const LAYER_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const CONTROL_KEY_PATTERN = /^([a-z][a-z0-9-]{0,63})\.([a-z][a-z0-9-]{0,63})$/;
const CONTROL_VALUE_PATTERN = /^[a-z0-9._-]{1,32}$/;
const MAX_LAYERS = 20;

/** Reads `layers=a,b` and the `a.control=value` pairs for layers that are on. */
function parseLayers(params: Map<string, string>): LayersUrlState | undefined {
  const enabled = [
    ...new Set(
      (params.get("layers") ?? "")
        .split(",")
        .filter((id) => LAYER_ID_PATTERN.test(id)),
    ),
  ].slice(0, MAX_LAYERS);
  if (enabled.length === 0) {
    return undefined;
  }
  const controls: Record<string, Record<string, string>> = {};
  for (const [key, value] of params) {
    const match = CONTROL_KEY_PATTERN.exec(key);
    const layer = match?.[1] as string;
    if (match && enabled.includes(layer) && CONTROL_VALUE_PATTERN.test(value)) {
      controls[layer] = { ...controls[layer], [match[2] as string]: value };
    }
  }
  return { enabled, controls };
}

/** Writes the layers that are on, then their control values, leaving out anything unreadable. */
function serialiseLayers(layers: LayersUrlState | undefined): string[] {
  const enabled = (layers?.enabled ?? []).filter((id) =>
    LAYER_ID_PATTERN.test(id),
  );
  if (enabled.length === 0) {
    return [];
  }
  const params = [`layers=${enabled.join(",")}`];
  for (const id of enabled) {
    for (const [control, value] of Object.entries(layers?.controls[id] ?? {})) {
      if (
        CONTROL_KEY_PATTERN.test(`${id}.${control}`) &&
        CONTROL_VALUE_PATTERN.test(value)
      ) {
        params.push(`${id}.${control}=${value}`);
      }
    }
  }
  return params;
}

function wrapBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

function parseNumber(text: string | undefined): number | undefined {
  return text !== undefined && NUMBER_PATTERN.test(text)
    ? Number(text)
    : undefined;
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/** Reads `zoom/lat/lng[/bearing]`, or `undefined` when any required part is unusable. */
function parseView(value: string): ViewState | undefined {
  const parts = value.split("/");
  if (parts.length !== 3 && parts.length !== 4) {
    return undefined;
  }
  const zoom = parseNumber(parts[0]);
  const lat = parseNumber(parts[1]);
  const lng = parseNumber(parts[2]);
  if (
    zoom === undefined ||
    lat === undefined ||
    lng === undefined ||
    !inRange(zoom, 0, MAX_ZOOM) ||
    !inRange(lat, -90, 90) ||
    !inRange(lng, -180, 180)
  ) {
    return undefined;
  }
  const bearing = parseNumber(parts[3]);
  return {
    center: { lat, lng },
    zoom,
    bearing: bearing === undefined ? 0 : wrapBearing(bearing),
  };
}

/**
 * Reads the shareable state from a location hash such as
 * `#map=12.35/-26.20410/28.04730/90&basemap=osm-liberty`.
 *
 * @remarks Tolerant by design, because hashes are typed, pasted and edited.
 *   Each part is checked on its own and dropped when unusable: the view needs
 *   a zoom of 0 to 24, a latitude within 90 and a longitude within 180 (the
 *   bearing is optional and wrapped into [0, 360)); a basemap id may only use
 *   lowercase letters, digits and hyphens. Unknown parameters are ignored and
 *   the first occurrence of a parameter wins. The leading `#` is optional.
 */
export function parseUrlHash(hash: string): UrlStateValue {
  const params = new Map<string, string>();
  for (const pair of hash.replace(/^#/, "").split("&")) {
    const separator = pair.indexOf("=");
    if (separator > 0) {
      const key = pair.slice(0, separator);
      if (!params.has(key)) {
        params.set(key, pair.slice(separator + 1));
      }
    }
  }

  const view = parseView(params.get("map") ?? "");
  const basemap = params.get("basemap") ?? "";
  const basemapId = BASEMAP_ID_PATTERN.test(basemap) ? basemap : undefined;
  const layers = parseLayers(params);
  return {
    ...(view ? { view } : {}),
    ...(basemapId ? { basemapId } : {}),
    ...(layers ? { layers } : {}),
  };
}

function serialiseView(view: ViewState): string | undefined {
  const { center, zoom, bearing } = view;
  if (![center.lat, center.lng, zoom, bearing].every(Number.isFinite)) {
    return undefined;
  }
  const whole = Math.round(wrapBearing(bearing)) % 360;
  const parts = [
    formatFixed(zoom, 2),
    formatFixed(center.lat, 5),
    formatFixed(center.lng, 5),
  ];
  if (whole !== 0) {
    parts.push(String(whole));
  }
  return `map=${parts.join("/")}`;
}

/**
 * Writes the shareable state as a location hash, for example
 * `#map=12.35/-26.20410/28.04730&basemap=osm-liberty`. Zoom has two decimals,
 * latitude and longitude five, and the bearing is a whole number in
 * [0, 360) that is left out when it is 0. Returns an empty string when there
 * is nothing to share. A view with a non-finite number, or a basemap id that
 * {@link parseUrlHash} would reject, is left out.
 */
export function serialiseUrlHash(value: UrlStateValue): string {
  const params: string[] = [];
  const view = value.view ? serialiseView(value.view) : undefined;
  if (view) {
    params.push(view);
  }
  if (
    value.basemapId !== undefined &&
    BASEMAP_ID_PATTERN.test(value.basemapId)
  ) {
    params.push(`basemap=${value.basemapId}`);
  }
  params.push(...serialiseLayers(value.layers));
  return params.length > 0 ? `#${params.join("&")}` : "";
}
