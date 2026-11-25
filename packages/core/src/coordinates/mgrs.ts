// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LatLng } from "../ports/geometry";
import {
  bandIndexOf,
  bandLetterFor,
  bandRange,
  forward,
  inverse,
  latInBand,
  placeOnGrid,
  roundToCentimetre,
  truncatedNorthing,
  wrapLng,
} from "./utm";

/**
 * The 100 km column letters of a zone, in the order zone 1, 2 and 3, then
 * repeating: the letter for the easting's 100 km column, so that columns
 * of neighbouring zones never share a letter.
 */
const COLUMN_SETS = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"] as const;

/**
 * The 100 km row letters from 0 to 2 000 000 metres north, then repeating
 * every 2 000 000 metres. I and O are not used.
 */
const ROW_LETTERS = "ABCDEFGHJKLMNPQRSTUV";

/** The side of a 100 km square, in metres: the row and column stride. */
const SQUARE_SIDE = 100_000;

/**
 * The digits of a one-metre reference, the finest MGRS writes.
 */
const FINEST_DIGITS = 5;

/**
 * The fewest digits of a reference the reader accepts: two for the easting
 * and two for the northing, a 1 km square. Fewer would let a date or an
 * address ("1 Dec 15", "12 Rue 10") read as a position.
 */
const MIN_DIGITS = 4;

/**
 * The northing cycle of the row letters, in metres: the letters repeat
 * every 2 000 km of northing.
 */
const ROW_CYCLE = 2_000_000;

/**
 * How far above the top of a band's northing range the grid distortion
 * carries a northing: about 12 000 m in the twelve-degree band X.
 */
const BAND_SLAB_METRES = 12_000;

/**
 * The 100 km column letters of a zone: set 1, 2 or 0 in order, repeating.
 */
function columnSet(zone: number): string {
  switch (zone % 3) {
    case 1:
      return COLUMN_SETS[0];
    case 2:
      return COLUMN_SETS[1];
    default:
      return COLUMN_SETS[2];
  }
}

/**
 * Writes a position as an MGRS reference to the metre, with the zone, band
 * letter, 100 km square and the digits of the easting and northing, for
 * example "31U CT 12345 67890". The zone carries the documented
 * exceptions: in band V (56 to 64 degrees north) the zone line moves to
 * 3 degrees east, and in band X (72 to 84 degrees north) zones 31, 33, 35
 * and 37 are widened to twelve degrees each while zones 32, 34 and 36
 * cover nothing.
 *
 * @returns The reference, or `null` when the position is not finite or is
 *   outside the MGRS grid, which is the UTM grid: 80° S to 84° N. A longitude
 *   outside −180 to 180 is wrapped first.
 */
export function formatMgrs(position: LatLng): string | null {
  const place = placeOnGrid(position);
  if (place === null) {
    return null;
  }
  const band = bandLetterFor(place.lat) as string;
  const point = forward(place);
  // The digits are truncated, not rounded: the reference names the one-metre
  // square that holds the point, as the MGRS convention has it.
  const easting = Math.floor(point.easting);
  const northing = truncatedNorthing(point.northing);
  // Within the grid the easting stays between about 127 000 and 834 000 m,
  // so the column index is always 0 to 7 and the row 0 to 19, and the
  // letters are always there.
  const column = columnSet(point.zone).charAt(
    Math.floor(easting / SQUARE_SIDE) - 1,
  );
  const row = Math.floor(northing / SQUARE_SIDE) % 20;
  const rowLetter = ROW_LETTERS.charAt(
    (row + (point.zone % 2 === 0 ? 5 : 0)) % ROW_LETTERS.length,
  );
  return `${point.zone}${band} ${column}${rowLetter} ${String(easting % SQUARE_SIDE).padStart(FINEST_DIGITS, "0")} ${String(northing % SQUARE_SIDE).padStart(FINEST_DIGITS, "0")}`;
}

/**
 * An MGRS reference: the grid zone designator (zone and band letter, written
 * together, as "31U"), two square letters, then the digits of the easting and
 * the northing, written together or apart. The designator is one token, so
 * "1 Dec 2015" and "12 Rue 1012", which a date or an address might be, never
 * read as a reference.
 */
const MGRS_PATTERN = /^(\d{1,2})([A-Z])\s*([A-Z]{2})\s*([\d\s]{4,11})$/i;

/**
 * Reads an MGRS reference and returns the position, or `null` when the
 * text is not one. The zone and band letter are written together ("31U");
 * the 100 km square and the digits may be written with or without spaces,
 * in either letter case, at any precision from 1 km (four digits) to 1 m
 * (ten), and runs of white space are read as one space. A bare 100 km square ("31U CT")
 * names an area rather than a point and is refused.
 *
 * A reference is refused when its zone is outside 1 to 60, its band letter
 * or square letters are not MGRS letters, the square letters do not belong
 * to the zone's set, the digits are not of equal count, or the position it
 * names is outside the band the reference names, which bounds it to the
 * MGRS grid, 80° S to 84° N. A reference written on a neighbouring zone's
 * grid still reads, because the reference suite of the proj4js mgrs
 * package publishes one.
 *
 * @internal
 */
export function parseMgrs(text: string): LatLng | null {
  const match = MGRS_PATTERN.exec(text.trim().replace(/\s+/g, " "));
  if (match === null) {
    return null;
  }
  const zone = Number(match[1] as string);
  const band = (match[2] as string).toUpperCase();
  const square = (match[3] as string).toUpperCase();
  // The digits run may carry spaces; they are dropped, and the run is then
  // split in half, so the easting and the northing always carry the same
  // count of digits. (A regex split would be greedy: "041865" would come
  // apart as "04186" and "5".)
  const digits = (match[4] as string).replace(/\s+/g, "");
  if (
    digits.length < MIN_DIGITS ||
    digits.length > 10 ||
    digits.length % 2 !== 0
  ) {
    return null;
  }
  const eastingDigits = digits.slice(0, digits.length / 2);
  const northingDigits = digits.slice(digits.length / 2);
  if (zone < 1 || zone > 60) {
    return null;
  }
  const bandIndex = bandIndexOf(band);
  if (bandIndex < 0) {
    return null;
  }
  const columns = columnSet(zone);
  const columnIndex = columns.indexOf(square.charAt(0));
  const rowIndex = ROW_LETTERS.indexOf(square.charAt(1));
  if (columnIndex < 0 || rowIndex < 0) {
    return null;
  }
  const step = 10 ** (FINEST_DIGITS - eastingDigits.length);
  const easting =
    (columnIndex + 1) * SQUARE_SIDE + Number(eastingDigits) * step;
  const row = zone % 2 === 0 ? (rowIndex - 5 + 20) % 20 : rowIndex;
  const base = cycleNorthing(row * SQUARE_SIDE, band);
  if (base === null) {
    return null;
  }
  // The band window bounds the northing under the quadrant of the
  // meridian and the easting under the side of a square, so the projection
  // back is always a real position.
  const cornerNorthing = base + Number(northingDigits) * step;
  const corner = inverse(zone, easting, cornerNorthing, band < "N");
  if (!latInBand(corner.lat, bandIndex)) {
    return null;
  }
  // A reference coarser than a metre names a square, not a point, so the
  // answer is the centre of the square, as the reference suite's toPoint
  // returns it. The band is checked on the corner, which the reference
  // names whatever the precision.
  const centre = inverse(
    zone,
    easting + step / 2,
    cornerNorthing + step / 2,
    band < "N",
  );
  return roundToCentimetre({
    lat: centre.lat,
    lng: wrapLng(centre.lng),
  });
}

/**
 * The full northing of a 100 km row: the row's northing within its
 * 2 000 000 m cycle, raised by whole cycles until it lands in the band the
 * reference names. Returns `null` when no cycle lands there, so the row
 * letter contradicts the band letter.
 */
function cycleNorthing(rowNorthing: number, band: string): number | null {
  const range = bandRange(band);
  const lowest = range.min - SQUARE_SIDE;
  const highest = range.max + BAND_SLAB_METRES;
  const cycles = Math.ceil((lowest - rowNorthing) / ROW_CYCLE);
  const candidate = rowNorthing + cycles * ROW_CYCLE;
  return candidate >= lowest && candidate <= highest ? candidate : null;
}
