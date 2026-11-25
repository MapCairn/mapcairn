// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LatLng } from "../ports/geometry";

/** The WGS 84 semi-major axis, in metres. */
const SEMI_MAJOR = 6_378_137;

/** The WGS 84 flattening. */
const FLATTENING = 1 / 298.257223563;

const ECCENTRICITY_SQUARED = FLATTENING * (2 - FLATTENING);
const SECOND_ECCENTRICITY_SQUARED =
  ECCENTRICITY_SQUARED / (1 - ECCENTRICITY_SQUARED);

/** The scale factor of the central meridian of every UTM zone. */
const CENTRAL_SCALE = 0.9996;

const FALSE_EASTING = 500_000;

/** The false northing added south of the equator. */
const FALSE_NORTHING = 10_000_000;

/**
 * The latitudes between which the UTM grid is defined: 80° S to 84° N. A
 * position outside it belongs to the polar stereographic zones, which are
 * not part of the UTM grid.
 */
const SOUTH_LIMIT = -80;
const NORTH_LIMIT = 84;

/**
 * The latitude band letters from 80° S to 84° N, eight degrees each. I and
 * O are not used.
 */
const BAND_LETTERS = "CDEFGHJKLMNPQRSTUVWX";

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

/**
 * The width of one degree of latitude, in metres, near enough for turning
 * a small distance into a latitude tolerance. The true width runs from
 * 110 574 m at the equator to 111 695 m at the poles.
 */
const METRES_PER_DEGREE = 111_320;

/**
 * How far a latitude may fall outside the band or grid limits of a
 * reference and still be read: the rounding of a one-metre reference, with
 * a margin for the series arithmetic.
 */
const BAND_TOLERANCE_DEGREES = 3 / METRES_PER_DEGREE;

/**
 * The UTM zone for a position, with the documented exceptions: in band V
 * (56 to 64 degrees north) the zone line moves to 3 degrees east, so zone
 * 31 is three degrees wide and zone 32 nine; in band X (72 to 84 degrees
 * north) zones 31, 33, 35 and 37 are widened to twelve degrees each and
 * zones 32, 34 and 36 cover nothing; and the antimeridian is in zone 60.
 */
function zoneFor(lng: number, lat: number): number {
  if (lng === 180) {
    return 60;
  }
  if (lat >= 56 && lat < 64 && lng >= 3 && lng < 12) {
    return 32;
  }
  if (lat >= 72 && lat < 84) {
    if (lng >= 0 && lng < 9) {
      return 31;
    }
    if (lng >= 9 && lng < 21) {
      return 33;
    }
    if (lng >= 21 && lng < 33) {
      return 35;
    }
    if (lng >= 33 && lng < 42) {
      return 37;
    }
  }
  return Math.floor((lng + 180) / 6) + 1;
}

/**
 * The latitude band letter of a latitude, or `null` when the latitude is
 * outside the UTM grid. Band X runs to 84 degrees north inclusive and band
 * C starts at 80 south inclusive.
 */
export function bandLetterFor(lat: number): string | null {
  if (lat > NORTH_LIMIT || lat < SOUTH_LIMIT) {
    return null;
  }
  const index = Math.min(BAND_LETTERS.length - 1, Math.floor((lat + 80) / 8));
  return BAND_LETTERS.charAt(index);
}

/**
 * The band index of a band letter, or −1 when it is not one. N and S are
 * band letters too; a caller that treats them as hemisphere letters checks
 * for them before this.
 */
export function bandIndexOf(letter: string): number {
  return BAND_LETTERS.indexOf(letter);
}

/** The meridian distance from the equator to a latitude, in metres. */
function meridianArc(lat: number): number {
  const latRad = lat * DEGREES_TO_RADIANS;
  const e2 = ECCENTRICITY_SQUARED;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  return (
    SEMI_MAJOR *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * latRad -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * latRad) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * latRad) -
      ((35 * e6) / 3072) * Math.sin(6 * latRad))
  );
}

/**
 * The range of northings a band letter can name, on the central meridian.
 * Within a zone the northing runs higher than this towards the zone edges,
 * by up to about 4 500 m in the ordinary bands and 12 000 m in band X, so
 * callers that look for the band by northing allow that much above `max`.
 */
interface BandRange {
  readonly min: number;
  readonly max: number;
}

export function bandRange(letter: string): BandRange {
  const index = bandIndexOf(letter);
  const south = SOUTH_LIMIT + 8 * index;
  const north = letter === "X" ? NORTH_LIMIT : south + 8;
  const southern = index < 10;
  return {
    min: CENTRAL_SCALE * meridianArc(south) + (southern ? FALSE_NORTHING : 0),
    max: CENTRAL_SCALE * meridianArc(north) + (southern ? FALSE_NORTHING : 0),
  };
}

/** A position in one zone's grid: the metres from its false origins. */
interface GridPoint {
  readonly zone: number;
  readonly easting: number;
  readonly northing: number;
  readonly southern: boolean;
}

/**
 * Projects a position onto its UTM zone's grid, on the WGS 84 ellipsoid,
 * with the standard sixth-order series. The easting carries the 500 000 m
 * false easting and the northing the 10 000 000 m false northing south of
 * the equator.
 */
export function forward(position: LatLng): GridPoint {
  const zone = zoneFor(position.lng, position.lat);
  const centralMeridian = zone * 6 - 183;
  const latRad = position.lat * DEGREES_TO_RADIANS;
  const lngRad = (position.lng - centralMeridian) * DEGREES_TO_RADIANS;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const tanLat = Math.tan(latRad);
  const radius =
    SEMI_MAJOR / Math.sqrt(1 - ECCENTRICITY_SQUARED * sinLat * sinLat);
  const tanSquared = tanLat * tanLat;
  const second = SECOND_ECCENTRICITY_SQUARED * cosLat * cosLat;
  const a = cosLat * lngRad;
  const a2 = a * a;
  const a3 = a2 * a;
  const a5 = a3 * a2;
  const easting =
    FALSE_EASTING +
    CENTRAL_SCALE *
      radius *
      (a +
        ((1 - tanSquared + second) * a3) / 6 +
        ((5 -
          18 * tanSquared +
          tanSquared * tanSquared +
          72 * second -
          58 * SECOND_ECCENTRICITY_SQUARED) *
          a5) /
          120);
  const a4 = a2 * a2;
  const a6 = a4 * a2;
  let northing =
    CENTRAL_SCALE *
    (meridianArc(position.lat) +
      radius *
        tanLat *
        (a2 / 2 +
          ((5 - tanSquared + 9 * second + 4 * second * second) * a4) / 24 +
          ((61 -
            58 * tanSquared +
            tanSquared * tanSquared +
            600 * second -
            330 * SECOND_ECCENTRICITY_SQUARED) *
            a6) /
            720));
  const southern = position.lat < 0;
  if (southern) {
    northing += FALSE_NORTHING;
  }
  return { zone, easting, northing, southern };
}

/**
 * Projects a point of one zone's grid back to a position, on the WGS 84
 * ellipsoid, with the standard sixth-order series. `northing` carries the
 * false northing south of the equator when `southern`.
 */
export function inverse(
  zone: number,
  easting: number,
  northing: number,
  southern: boolean,
): LatLng {
  const centralMeridian = zone * 6 - 183;
  const x = easting - FALSE_EASTING;
  const y = northing - (southern ? FALSE_NORTHING : 0);
  const e = ECCENTRICITY_SQUARED;
  const e1 = (1 - Math.sqrt(1 - e)) / (1 + Math.sqrt(1 - e));
  const e2 = e * e;
  const e4 = e2 * e2;
  const meridian = y / CENTRAL_SCALE;
  const mu =
    meridian / (SEMI_MAJOR * (1 - e / 4 - (3 * e2) / 64 - (5 * e4) / 256));
  const footpoint =
    mu +
    ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) * Math.sin(4 * mu) +
    ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu);
  const sinFoot = Math.sin(footpoint);
  const cosFoot = Math.cos(footpoint);
  const tanFoot = Math.tan(footpoint);
  const radius = SEMI_MAJOR / Math.sqrt(1 - e * sinFoot * sinFoot);
  const tanSquared = tanFoot * tanFoot;
  const second = SECOND_ECCENTRICITY_SQUARED * cosFoot * cosFoot;
  const meridianRadius =
    (SEMI_MAJOR * (1 - e)) / (1 - e * sinFoot * sinFoot) ** 1.5;
  const d = x / (radius * CENTRAL_SCALE);
  const d2 = d * d;
  const d4 = d2 * d2;
  const d6 = d4 * d2;
  const lat =
    footpoint -
    ((radius * tanFoot) / meridianRadius) *
      (d2 / 2 -
        ((5 +
          3 * tanSquared +
          10 * second -
          4 * second * second -
          9 * SECOND_ECCENTRICITY_SQUARED) *
          d4) /
          24 +
        ((61 +
          90 * tanSquared +
          298 * second +
          45 * tanSquared * tanSquared -
          252 * SECOND_ECCENTRICITY_SQUARED -
          3 * second * second) *
          d6) /
          720);
  const lng =
    centralMeridian +
    RADIANS_TO_DEGREES *
      ((d -
        ((1 + 2 * tanSquared + second) * d * d2) / 6 +
        ((5 -
          2 * second +
          28 * tanSquared -
          3 * second * second +
          8 * SECOND_ECCENTRICITY_SQUARED +
          24 * tanSquared * tanSquared) *
          d *
          d4) /
          120) /
        cosFoot);
  return { lat: lat * RADIANS_TO_DEGREES, lng };
}

/**
 * Writes a position as a UTM reference: the zone, its band letter, the
 * easting to the metre and the northing to the metre, for example
 * "31U 166021 0000000". The band letter names the eight-degree latitude
 * band (C at 80° S through X at 84° N), which names the hemisphere as
 * well.
 *
 * @remarks The UTM convention reads the letter after the zone as a
 *   hemisphere letter when it is N or S, so a band-S reference (32 to 40
 *   degrees north) written with its band letter would not read back: it
 *   would name the southern hemisphere. For band S alone this writes the
 *   hemisphere letter N instead, which names the same hemisphere and
 *   reads back as the same position.
 *
 * @returns The reference, or `null` when the position is outside the UTM
 *   grid, which stops at 80° S and 84° N; those latitudes belong to the
 *   polar stereographic zones, which this does not write.
 */
export function formatUtm(position: LatLng): string | null {
  const band = bandLetterFor(position.lat);
  if (band === null) {
    return null;
  }
  const letter = band === "S" ? "N" : band;
  const point = forward(position);
  return `${point.zone}${letter} ${String(Math.round(point.easting)).padStart(6, "0")} ${String(roundedNorthing(point.northing)).padStart(7, "0")}`;
}

/**
 * Rounds a northing to the metre, holding it below the false northing: a
 * position a hair south of the equator rounds to 10 000 000 m, which no
 * southern reference can carry, so it is written a metre short, within the
 * metre the reference names.
 */
export function roundedNorthing(northing: number): number {
  return Math.min(Math.round(northing), FALSE_NORTHING - 1);
}

/** A UTM reference: zone, one letter, a six-digit easting and a six- or seven-digit northing. */
const UTM_PATTERN = /^(\d{1,2})\s*([A-Z])\s*(\d{6})\s+(\d{6,7})$/i;

/**
 * Reads a UTM reference and returns the position, or `null` when the text
 * is not one. The letter after the zone names the hemisphere when it is N
 * or S ("31 N 500000 4200000", "31S 500000 4200000", southern northing
 * with the 10 000 000 m offset included), and otherwise it is the band
 * letter, which names the eight-degree latitude band and with it the
 * hemisphere ("31U 500000 4200000", band U is 48 to 56 degrees north). A
 * reference without a letter is ambiguous and refused.
 *
 * A reference is refused when its zone is outside 1 to 60, its letter is
 * not a band or hemisphere letter, its position contradicts its band, or
 * the position it names is outside the UTM grid (80° S to 84° N). A
 * reference whose position lies in the next zone's territory still reads,
 * because surveyors deliberately work across a zone line on one zone's
 * grid.
 *
 * @internal
 */
export function parseUtm(text: string): LatLng | null {
  const match = UTM_PATTERN.exec(text.trim());
  if (match === null) {
    return null;
  }
  const zone = Number(match[1] as string);
  const letter = (match[2] as string).toUpperCase();
  const easting = Number(match[3] as string);
  const northing = Number(match[4] as string);
  if (zone < 1 || zone > 60) {
    return null;
  }
  const isBandLetter = letter !== "N" && letter !== "S";
  const bandIndex = isBandLetter ? bandIndexOf(letter) : -1;
  if (isBandLetter && bandIndex < 0) {
    return null;
  }
  const southern = isBandLetter ? bandIndex < 10 : letter === "S";
  const position = inverse(zone, easting, northing, southern);
  if (
    !Number.isFinite(position.lat) ||
    !Number.isFinite(position.lng) ||
    position.lat < SOUTH_LIMIT - BAND_TOLERANCE_DEGREES ||
    position.lat > NORTH_LIMIT + BAND_TOLERANCE_DEGREES
  ) {
    return null;
  }
  if (isBandLetter) {
    if (!latInBand(position.lat, bandIndex)) {
      return null;
    }
  }
  return roundToCentimetre({
    lat: position.lat,
    lng: wrapLng(position.lng),
  });
}

/** Rounds a position to seven decimals, about a centimetre, as the pairs are. */
export function roundToCentimetre(position: LatLng): LatLng {
  const factor = 10_000_000;
  const round = (value: number): number =>
    Math.round(value * factor) / factor + 0;
  return { lat: round(position.lat), lng: round(position.lng) };
}

/**
 * Wraps a longitude into [−180, 180), so a point a hair past the
 * antimeridian, which a one-metre reference can produce at the east edge
 * of zone 60, names the same place as the one a hair before it.
 */
export function wrapLng(lng: number): number {
  return (((lng % 360) + 540) % 360) - 180;
}

/**
 * Whether a latitude lies in the band a band index names, within the
 * tolerance of a one-metre reference. Band X spans twelve degrees and
 * stops at 84 degrees north, which is the top of the UTM grid.
 */
export function latInBand(lat: number, bandIndex: number): boolean {
  const south = SOUTH_LIMIT + 8 * bandIndex;
  const north = bandIndex === 19 ? NORTH_LIMIT : south + 8;
  return (
    lat >= south - BAND_TOLERANCE_DEGREES &&
    lat <= north + BAND_TOLERANCE_DEGREES
  );
}
