import { describe, expect, it } from "vitest";
import {
  clampZoom,
  ENGINE_ZOOM_OFFSET,
  MAX_MERCATOR_LATITUDE,
  mercatorProject,
  mercatorUnproject,
  metresPerPixel,
  toEngineZoom,
  toNormalisedZoom,
} from "./zoom";

describe("zoom normalisation", () => {
  it("subtracts one for MapLibre because its zoom counts 512 px tiles", () => {
    expect(ENGINE_ZOOM_OFFSET).toBe(-1);
    expect(toEngineZoom(10)).toBe(9);
    expect(toNormalisedZoom(9)).toBe(10);
  });

  it("round-trips", () => {
    for (const zoom of [0, 3.25, 11, 18.5]) {
      expect(toNormalisedZoom(toEngineZoom(zoom))).toBe(zoom);
    }
  });

  it("clamps to the given range", () => {
    expect(clampZoom(-3, 0, 18)).toBe(0);
    expect(clampZoom(25, 0, 18)).toBe(18);
    expect(clampZoom(7.5, 0, 18)).toBe(7.5);
  });
});

describe("metresPerPixel", () => {
  it("is about 156.5 km per pixel at zoom 0 on the equator", () => {
    expect(metresPerPixel(0, 0)).toBeCloseTo(156_543.03, 1);
  });

  it("halves with each zoom level", () => {
    expect(metresPerPixel(0, 5)).toBeCloseTo(metresPerPixel(0, 4) / 2, 6);
  });

  it("shrinks with the cosine of latitude", () => {
    expect(metresPerPixel(60, 10)).toBeCloseTo(metresPerPixel(0, 10) / 2, 6);
  });

  it("matches known values at Johannesburg's latitude", () => {
    expect(metresPerPixel(-26.2, 12)).toBeCloseTo(34.29, 1);
  });

  it("clamps latitude beyond the Mercator limit", () => {
    expect(metresPerPixel(90, 3)).toBe(
      metresPerPixel(MAX_MERCATOR_LATITUDE, 3),
    );
  });
});

describe("Web Mercator projection", () => {
  it("puts the origin at the top-left of the world", () => {
    const point = mercatorProject({ lat: MAX_MERCATOR_LATITUDE, lng: -180 }, 0);
    expect(point.x).toBeCloseTo(0, 6);
    expect(point.y).toBeCloseTo(0, 4);
  });

  it("puts the equator and prime meridian at the world centre", () => {
    const point = mercatorProject({ lat: 0, lng: 0 }, 1);
    expect(point.x).toBeCloseTo(256, 6);
    expect(point.y).toBeCloseTo(256, 6);
  });

  it("round-trips positions", () => {
    for (const position of [
      { lat: -26.2041, lng: 28.0473 },
      { lat: 51.5, lng: -0.12 },
      { lat: 0, lng: 179.9 },
    ]) {
      const back = mercatorUnproject(mercatorProject(position, 9), 9);
      expect(back.lat).toBeCloseTo(position.lat, 8);
      expect(back.lng).toBeCloseTo(position.lng, 8);
    }
  });

  it("clamps latitudes beyond the Mercator limit", () => {
    const polar = mercatorProject({ lat: 89, lng: 0 }, 2);
    const limit = mercatorProject({ lat: MAX_MERCATOR_LATITUDE, lng: 0 }, 2);
    expect(polar.y).toBeCloseTo(limit.y, 6);
  });
});
