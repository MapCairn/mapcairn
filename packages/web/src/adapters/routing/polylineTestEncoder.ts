/** Encodes one signed integer the way the polyline algorithm does. */
function encodeValue(value: number): string {
  let rest = value < 0 ? ~(value << 1) : value << 1;
  let out = "";
  while (rest >= 0x20) {
    out += String.fromCharCode((0x20 | (rest & 0x1f)) + 63);
    rest >>= 5;
  }
  return out + String.fromCharCode(rest + 63);
}

/**
 * Encodes `[longitude, latitude]` positions as a polyline, the reverse of
 * `decodePolyline`. For tests only: it lets a test build a response without a
 * recorded string.
 */
export function encodePolyline(
  positions: readonly (readonly number[])[],
  precision: number,
): string {
  const factor = 10 ** precision;
  let lastLat = 0;
  let lastLng = 0;
  let out = "";
  for (const [lng, lat] of positions) {
    const latInt = Math.round((lat as number) * factor);
    const lngInt = Math.round((lng as number) * factor);
    out += encodeValue(latInt - lastLat) + encodeValue(lngInt - lastLng);
    lastLat = latInt;
    lastLng = lngInt;
  }
  return out;
}
