/** Thrown by {@link decodePolyline} for input that is not a valid encoded polyline. */
export class PolylineDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolylineDecodeError";
  }
}

/** The first character code of the encoding: each 5-bit chunk is offset by 63. */
const OFFSET = 63;
/** The highest character code the encoding produces (offset plus 63). */
const MAX_CHAR = OFFSET + 0x3f;
const CONTINUATION_BIT = 0x20;
const CHUNK_MASK = 0x1f;
/**
 * The most 5-bit chunks one number may use. Seven chunks hold 35 bits, far
 * more than a coordinate at precision 9 needs, and bound the work done on
 * input that never ends a number.
 */
const MAX_CHUNKS = 7;
const MAX_PRECISION = 9;

/**
 * Decodes an encoded polyline into `[longitude, latitude]` positions, the order
 * GeoJSON uses. The encoding writes latitude first, as differences from the
 * previous position, in 5-bit chunks.
 *
 * @param encoded The encoded polyline. An empty string gives no positions.
 * @param precision The number of decimal places the encoder kept: 5 for the
 *   original format and 6 for the finer one. A whole number from 0 to 9.
 * @throws {PolylineDecodeError} For a precision that is not a whole number
 *   from 0 to 9, a character outside the encoding, a number cut off at the
 *   end of the string, a number longer than the format allows, or a latitude
 *   with no longitude after it. It never reads past the end of the string.
 */
export function decodePolyline(encoded: string, precision = 6): number[][] {
  if (
    !Number.isInteger(precision) ||
    precision < 0 ||
    precision > MAX_PRECISION
  ) {
    throw new PolylineDecodeError(
      `The precision must be a whole number from 0 to ${MAX_PRECISION}.`,
    );
  }
  const factor = 10 ** precision;
  const positions: number[][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const readValue = (): number => {
    let result = 0;
    let scale = 1;
    for (let chunks = 0; chunks < MAX_CHUNKS; chunks += 1) {
      if (index >= encoded.length) {
        throw new PolylineDecodeError(
          "The encoded polyline ends in the middle of a number.",
        );
      }
      const code = encoded.charCodeAt(index);
      index += 1;
      if (code < OFFSET || code > MAX_CHAR) {
        throw new PolylineDecodeError(
          `The encoded polyline holds an invalid character at position ${index - 1}.`,
        );
      }
      const chunk = code - OFFSET;
      result += (chunk & CHUNK_MASK) * scale;
      scale *= 32;
      if ((chunk & CONTINUATION_BIT) === 0) {
        return result % 2 === 1 ? -(result + 1) / 2 : result / 2;
      }
    }
    throw new PolylineDecodeError(
      "The encoded polyline holds a number that is too long.",
    );
  };

  while (index < encoded.length) {
    lat += readValue();
    if (index >= encoded.length) {
      throw new PolylineDecodeError(
        "The encoded polyline ends after a latitude, with no longitude.",
      );
    }
    lng += readValue();
    positions.push([lng / factor, lat / factor]);
  }
  return positions;
}
