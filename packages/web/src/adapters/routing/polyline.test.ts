import { describe, expect, it } from "vitest";
import { decodePolyline, PolylineDecodeError } from "./polyline";
import { encodePolyline } from "./polylineTestEncoder";

describe("decodePolyline", () => {
  it("decodes the reference vector at precision 5, as [lng, lat]", () => {
    const decoded = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5);
    const expected = [
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ];
    expect(decoded).toHaveLength(3);
    decoded.forEach((position, index) => {
      expect(position[0]).toBeCloseTo(expected[index]?.[0] as number, 9);
      expect(position[1]).toBeCloseTo(expected[index]?.[1] as number, 9);
    });
  });

  it("defaults to precision 6", () => {
    const positions = [
      [2.352222, 48.856614],
      [4.835659, 45.764043],
    ];
    const encoded = encodePolyline(positions, 6);
    expect(decodePolyline(encoded)).toEqual(decodePolyline(encoded, 6));
  });

  it("round trips positions at precision 6, including negative coordinates", () => {
    const positions = [
      [2.352222, 48.856614],
      [36.821946, -1.292066],
      [-74.00597, 40.71278],
      [-58.381592, -34.603722],
      [139.691711, 35.689487],
      [0, 0],
      [-180, -90],
      [180, 90],
    ];
    const decoded = decodePolyline(encodePolyline(positions, 6), 6);
    expect(decoded).toHaveLength(positions.length);
    decoded.forEach((position, index) => {
      expect(position[0]).toBeCloseTo(positions[index]?.[0] as number, 6);
      expect(position[1]).toBeCloseTo(positions[index]?.[1] as number, 6);
    });
  });

  it("decodes a single negative position", () => {
    const decoded = decodePolyline(encodePolyline([[-0.5, -1.25]], 6), 6);
    expect(decoded[0]?.[0]).toBeCloseTo(-0.5, 6);
    expect(decoded[0]?.[1]).toBeCloseTo(-1.25, 6);
  });

  it("returns no positions for an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
    expect(decodePolyline("", 5)).toEqual([]);
  });

  it("throws a clear error for input that ends in the middle of a number", () => {
    expect(() => decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`", 5)).toThrow(
      PolylineDecodeError,
    );
    expect(() => decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`", 5)).toThrow(
      /ends/,
    );
  });

  it("throws for a latitude with no longitude after it", () => {
    expect(() => decodePolyline("_p~iF")).toThrow(PolylineDecodeError);
  });

  it("throws for a character outside the encoding's range", () => {
    expect(() => decodePolyline("_p~iF ~ps|U")).toThrow(PolylineDecodeError);
    expect(() => decodePolyline("_p~iFé~ps|U")).toThrow(PolylineDecodeError);
  });

  it("throws, without looping, for a number that never ends", () => {
    expect(() => decodePolyline("~".repeat(10_000))).toThrow(
      PolylineDecodeError,
    );
  });

  it("throws for a precision that is not a whole number from 0 to 9", () => {
    for (const precision of [
      -1,
      10,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() => decodePolyline("??", precision)).toThrow(
        PolylineDecodeError,
      );
    }
  });
});
