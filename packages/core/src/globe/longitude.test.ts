import { describe, expect, it } from "vitest";
import { nearestLongitude, unwrapLongitudes, wrapLongitude } from "./longitude";

describe("wrapLongitude", () => {
  it("leaves a longitude inside [-180, 180) alone", () => {
    expect(wrapLongitude(18.4)).toBe(18.4);
    expect(wrapLongitude(-180)).toBe(-180);
  });

  it("brings a longitude from another copy of the world back", () => {
    expect(wrapLongitude(190)).toBeCloseTo(-170, 9);
    expect(wrapLongitude(-190)).toBeCloseTo(170, 9);
    expect(wrapLongitude(540)).toBeCloseTo(-180, 9);
    expect(wrapLongitude(180)).toBe(-180);
  });
});

describe("nearestLongitude", () => {
  it("picks the copy of a longitude nearest a reference", () => {
    expect(nearestLongitude(-170, 178)).toBe(190);
    expect(nearestLongitude(170, -178)).toBe(-190);
    expect(nearestLongitude(170, 178)).toBe(170);
    expect(nearestLongitude(10, 370)).toBe(370);
  });
});

describe("unwrapLongitudes", () => {
  it("crosses the antimeridian the short way", () => {
    const path = unwrapLongitudes(
      [
        { lat: 10, lng: 170 },
        { lat: 10, lng: -170 },
      ],
      178,
    );
    expect(path.map((p) => p.lng)).toEqual([170, 190]);
  });

  it("starts on the copy nearest the reference, so the line is in view", () => {
    const path = unwrapLongitudes(
      [
        { lat: 10, lng: 170 },
        { lat: 10, lng: -170 },
      ],
      -178,
    );
    expect(path.map((p) => p.lng)).toEqual([-190, -170]);
  });

  it("follows each step the short way, however far the path runs", () => {
    const path = unwrapLongitudes(
      [
        { lat: 0, lng: 100 },
        { lat: 0, lng: -160 },
        { lat: 0, lng: -60 },
        { lat: 0, lng: 40 },
      ],
      100,
    );
    expect(path.map((p) => p.lng)).toEqual([100, 200, 300, 400]);
  });

  it("keeps latitudes and returns nothing for nothing", () => {
    expect(unwrapLongitudes([{ lat: -33.9, lng: 18.4 }], 0)).toEqual([
      { lat: -33.9, lng: 18.4 },
    ]);
    expect(unwrapLongitudes([], 0)).toEqual([]);
  });
});
