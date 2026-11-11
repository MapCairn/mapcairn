import { describe, expect, it } from "vitest";
import { snapToGrid } from "./geoArbitraries";

describe("snapToGrid", () => {
  it("snaps a position to the nearest point of the grid", () => {
    expect(snapToGrid({ lat: 12.3456749, lng: -45.6789051 })).toEqual({
      lat: 12.34567,
      lng: -45.67891,
    });
  });

  it("never gives negative zero, which text cannot tell apart from zero", () => {
    const snapped = snapToGrid({ lat: -0.000001, lng: -0.000001 });

    expect(Object.is(snapped.lat, 0)).toBe(true);
    expect(Object.is(snapped.lng, 0)).toBe(true);
  });
});
