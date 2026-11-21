// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/*
 * The geometry of a product plate's collar: where the latitude and longitude
 * ticks go on a capture of the playground, worked out from
 * the view the capture shows, so the collar cannot say anything the picture
 * does not. The projection is the one the map uses: Web Mercator with a
 * 256 px tile, the zoom the playground writes in its address.
 */

/** The view a capture shows, and the size it was captured at in CSS pixels. */
export interface PlateView {
  readonly latitude: number;
  readonly longitude: number;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
}

/** One tick on an edge: how far along it lies (0 at the start, 1 at the end) and its label. */
export interface PlateTick {
  readonly fraction: number;
  readonly label: string;
}

/** The collar of a plate. */
export interface PlateGeometry {
  readonly longitudeTicks: readonly PlateTick[];
  readonly latitudeTicks: readonly PlateTick[];
}

/** The pixels in one tile, which sets the size of the world at a zoom. */
const TILE_SIZE = 256;

const ARC_SECONDS_PER_DEGREE = 3600;
const ARC_SECONDS_PER_MINUTE = 60;

/** The steps between ticks, in seconds of arc, from the finest to a coarse step for a view of a whole region. */
const TICK_STEPS_SECONDS = [
  5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600, 7200, 18000, 36000,
];

/** The step a view too wide for any other gets: ten degrees. */
const COARSEST_STEP_SECONDS = 36000;

/** The most ticks an edge carries, so its labels never crowd each other. */
const MOST_TICKS = 4;

/** How far from an edge of the capture a tick lies at least, in pixels: half the length of a label at the small step, so a label stays beside its picture. */
export const EDGE_CLEARANCE = 40;

/** The least ticks an edge carries, so the collar always reads as a graticule. */
const LEAST_TICKS = 2;

/** The size of the world in pixels at a zoom. */
function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

/** The Web Mercator pixel of a place, from the world's top left at a zoom. */
function worldPixel(
  zoom: number,
  latitude: number,
  longitude: number,
): { readonly x: number; readonly y: number } {
  const size = worldSize(zoom);
  const sine = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size,
  };
}

/**
 * Where a place falls in a capture of a view, in CSS pixels from the capture's
 * top left. The view's centre is the capture's middle.
 */
export function projectToPixel(
  view: PlateView,
  latitude: number,
  longitude: number,
): { readonly x: number; readonly y: number } {
  const centre = worldPixel(view.zoom, view.latitude, view.longitude);
  const place = worldPixel(view.zoom, latitude, longitude);
  return {
    x: view.width / 2 + (place.x - centre.x),
    y: view.height / 2 + (place.y - centre.y),
  };
}

/** Degrees, minutes and seconds of an angle's size, the seconds rounded and carried up. */
function degreesMinutesSeconds(angle: number): string {
  const total = Math.round(Math.abs(angle) * ARC_SECONDS_PER_DEGREE);
  const degrees = Math.floor(total / ARC_SECONDS_PER_DEGREE);
  const minutes = Math.floor(
    (total % ARC_SECONDS_PER_DEGREE) / ARC_SECONDS_PER_MINUTE,
  );
  const seconds = total % ARC_SECONDS_PER_MINUTE;
  return `${degrees}°${String(minutes).padStart(2, "0")}′${String(seconds).padStart(2, "0")}″`;
}

/** A latitude as degrees, minutes and seconds with its hemisphere, such as `33°56′00″S`. */
export function formatLatitude(latitude: number): string {
  return `${degreesMinutesSeconds(latitude)}${latitude < 0 ? "S" : "N"}`;
}

/** A longitude as degrees, minutes and seconds with its hemisphere, such as `18°25′00″E`. */
export function formatLongitude(longitude: number): string {
  return `${degreesMinutesSeconds(longitude)}${longitude < 0 ? "W" : "E"}`;
}

/** The values from `first` to `last`, a whole number of `step` apart. */
function multiplesBetween(
  first: number,
  last: number,
  step: number,
): readonly number[] {
  const values: number[] = [];
  for (let n = Math.ceil(first / step); n * step <= last; n += 1) {
    values.push(n * step);
  }
  return values;
}

/**
 * The values, a whole step of seconds apart, for the finest step that leaves
 * between `LEAST_TICKS` and `MOST_TICKS` ticks between two angles given in
 * seconds of arc.
 */
function multiplesForSpan(
  firstSeconds: number,
  lastSeconds: number,
): readonly number[] {
  const low = Math.min(firstSeconds, lastSeconds);
  const high = Math.max(firstSeconds, lastSeconds);
  for (const step of TICK_STEPS_SECONDS) {
    const values = multiplesBetween(low, high, step);
    if (values.length <= MOST_TICKS && values.length >= LEAST_TICKS) {
      return values;
    }
  }
  return multiplesBetween(low, high, COARSEST_STEP_SECONDS);
}

/** The latitude at a pixel row of a capture, the inverse of the projection. */
function latitudeAtRow(view: PlateView, row: number): number {
  const centre = worldPixel(view.zoom, view.latitude, view.longitude);
  const y = centre.y + (row - view.height / 2);
  const n = Math.PI - (2 * Math.PI * y) / worldSize(view.zoom);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** The longitude at a pixel column of a capture. */
function longitudeAtColumn(view: PlateView, column: number): number {
  const centre = worldPixel(view.zoom, view.latitude, view.longitude);
  const x = centre.x + (column - view.width / 2);
  return (x / worldSize(view.zoom)) * 360 - 180;
}

/** The ticks along the top and bottom edges: whole seconds of arc of longitude. */
function longitudeTicks(view: PlateView): readonly PlateTick[] {
  const west = longitudeAtColumn(view, EDGE_CLEARANCE) * ARC_SECONDS_PER_DEGREE;
  const east =
    longitudeAtColumn(view, view.width - EDGE_CLEARANCE) *
    ARC_SECONDS_PER_DEGREE;
  return multiplesForSpan(west, east).map((seconds) => {
    const longitude = seconds / ARC_SECONDS_PER_DEGREE;
    const { x } = projectToPixel(view, view.latitude, longitude);
    return { fraction: x / view.width, label: formatLongitude(longitude) };
  });
}

/** The ticks along the side edges: whole seconds of arc of latitude, from the top down. */
function latitudeTicks(view: PlateView): readonly PlateTick[] {
  const north = latitudeAtRow(view, EDGE_CLEARANCE) * ARC_SECONDS_PER_DEGREE;
  const south =
    latitudeAtRow(view, view.height - EDGE_CLEARANCE) * ARC_SECONDS_PER_DEGREE;
  return multiplesForSpan(south, north)
    .map((seconds) => {
      const latitude = seconds / ARC_SECONDS_PER_DEGREE;
      const { y } = projectToPixel(view, latitude, view.longitude);
      return { fraction: y / view.height, label: formatLatitude(latitude) };
    })
    .sort((a, b) => a.fraction - b.fraction);
}

/**
 * The collar of a plate for the view its capture shows: a few ticks of
 * latitude and longitude on round seconds of arc, each placed by the map's own
 * projection.
 */
export function plateGeometry(view: PlateView): PlateGeometry {
  return {
    longitudeTicks: longitudeTicks(view),
    latitudeTicks: latitudeTicks(view),
  };
}
