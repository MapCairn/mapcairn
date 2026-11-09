import { describe, expect, it } from "vitest";
import { LOOKUP_DECIMAL_PLACES, roundForLookup } from "./lookupPosition";

describe("roundForLookup", () => {
  it("rounds both coordinates to four decimal places", () => {
    expect(roundForLookup({ lat: -26.204137, lng: 28.047349 })).toEqual({
      lat: -26.2041,
      lng: 28.0473,
    });
  });

  it("rounds up as well as down", () => {
    expect(roundForLookup({ lat: 10.12346, lng: -3.98767 })).toEqual({
      lat: 10.1235,
      lng: -3.9877,
    });
  });

  it("leaves a position that already has four decimals unchanged", () => {
    expect(roundForLookup({ lat: -26.2041, lng: 28.0473 })).toEqual({
      lat: -26.2041,
      lng: 28.0473,
    });
  });

  it("never returns a negative zero", () => {
    const rounded = roundForLookup({ lat: -0.00001, lng: -0.00004 });
    expect(Object.is(rounded.lat, 0)).toBe(true);
    expect(Object.is(rounded.lng, 0)).toBe(true);
  });

  it("does not change the position it was given", () => {
    const position = { lat: 1.23456789, lng: 9.87654321 };
    roundForLookup(position);
    expect(position).toEqual({ lat: 1.23456789, lng: 9.87654321 });
  });

  it("keeps four decimals, about 11 m", () => {
    expect(LOOKUP_DECIMAL_PLACES).toBe(4);
  });
});
