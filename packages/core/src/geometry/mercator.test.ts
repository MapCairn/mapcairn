import { describe, expect, it } from "vitest";
import { MAX_MERCATOR_LATITUDE } from "../zoom/zoom";
import { GeometryError } from "./errors";
import {
  WEB_MERCATOR_HALF_WORLD,
  type WebMercatorPoint,
  webMercatorToWgs84,
  wgs84ToWebMercator,
} from "./mercator";

/** A small deterministic generator, so a failure is reproducible. */
function sequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("wgs84ToWebMercator", () => {
  it("maps the origin to the origin", () => {
    const point = wgs84ToWebMercator({ lat: 0, lng: 0 });
    expect(point.x).toBeCloseTo(0, 6);
    expect(point.y).toBeCloseTo(0, 6);
  });

  it("matches known values for Paris", () => {
    const point = wgs84ToWebMercator({ lat: 48.8566, lng: 2.3522 });
    expect(point.x).toBeCloseTo(261845.8, 0);
    expect(point.y).toBeCloseTo(6250564.35, 0);
  });

  it("maps the antimeridian to the edge of the world square", () => {
    expect(wgs84ToWebMercator({ lat: 0, lng: 180 }).x).toBeCloseTo(
      WEB_MERCATOR_HALF_WORLD,
      6,
    );
    expect(wgs84ToWebMercator({ lat: 0, lng: -180 }).x).toBeCloseTo(
      -WEB_MERCATOR_HALF_WORLD,
      6,
    );
  });

  it("clamps latitude to the limit of the projection", () => {
    const pole = wgs84ToWebMercator({ lat: 90, lng: 0 });
    const limit = wgs84ToWebMercator({ lat: MAX_MERCATOR_LATITUDE, lng: 0 });
    expect(Number.isFinite(pole.y)).toBe(true);
    expect(pole.y).toBeCloseTo(limit.y, 6);
    expect(limit.y).toBeCloseTo(WEB_MERCATOR_HALF_WORLD, 3);
    expect(wgs84ToWebMercator({ lat: -90, lng: 0 }).y).toBeCloseTo(-limit.y, 6);
  });

  it("rejects a position that is not finite", () => {
    for (const bad of [
      { lat: Number.NaN, lng: 0 },
      { lat: 0, lng: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => wgs84ToWebMercator(bad)).toThrow(GeometryError);
    }
  });
});

describe("webMercatorToWgs84", () => {
  it("maps the origin to the origin", () => {
    const position = webMercatorToWgs84({ x: 0, y: 0 });
    expect(position.lat).toBeCloseTo(0, 9);
    expect(position.lng).toBeCloseTo(0, 9);
  });

  it("clamps a latitude beyond the world square", () => {
    const position = webMercatorToWgs84({ x: 0, y: 1e9 });
    expect(position.lat).toBeLessThanOrEqual(MAX_MERCATOR_LATITUDE);
    expect(position.lat).toBeGreaterThan(85);
  });

  it("rejects a point that is not finite", () => {
    expect(() => webMercatorToWgs84({ x: Number.NaN, y: 0 })).toThrow(
      GeometryError,
    );
    expect(() =>
      webMercatorToWgs84({ x: 0, y: Number.NEGATIVE_INFINITY }),
    ).toThrow(GeometryError);
  });
});

describe("Web Mercator round trip", () => {
  it("recovers a position from anywhere on the globe", () => {
    const next = sequence(2026);
    for (let i = 0; i < 2000; i += 1) {
      const lat = (next() * 2 - 1) * MAX_MERCATOR_LATITUDE;
      const lng = (next() * 2 - 1) * 180;
      const back = webMercatorToWgs84(wgs84ToWebMercator({ lat, lng }));
      expect(back.lat).toBeCloseTo(lat, 9);
      expect(back.lng).toBeCloseTo(lng, 9);
    }
  });

  it("recovers a point inside the world square", () => {
    const next = sequence(7);
    for (let i = 0; i < 2000; i += 1) {
      const point: WebMercatorPoint = {
        x: (next() * 2 - 1) * WEB_MERCATOR_HALF_WORLD,
        y: (next() * 2 - 1) * WEB_MERCATOR_HALF_WORLD,
      };
      const back = wgs84ToWebMercator(webMercatorToWgs84(point));
      expect(back.x).toBeCloseTo(point.x, 5);
      expect(back.y).toBeCloseTo(point.y, 5);
    }
  });

  it("is exact enough at the corners and the equator", () => {
    for (const position of [
      { lat: MAX_MERCATOR_LATITUDE, lng: 180 },
      { lat: -MAX_MERCATOR_LATITUDE, lng: -180 },
      { lat: 0, lng: 179.999999 },
      { lat: -1.2921, lng: 36.8219 },
    ]) {
      const back = webMercatorToWgs84(wgs84ToWebMercator(position));
      expect(back.lat).toBeCloseTo(position.lat, 9);
      expect(back.lng).toBeCloseTo(position.lng, 9);
    }
  });
});
