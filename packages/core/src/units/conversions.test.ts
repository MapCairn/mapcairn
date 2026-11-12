// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  feetToMetres,
  kilometresToMetres,
  metresToFeet,
  metresToKilometres,
  metresToMiles,
  milesToMetres,
  squareMetresToAcres,
  squareMetresToHectares,
  squareMetresToSquareFeet,
  squareMetresToSquareKilometres,
  squareMetresToSquareMiles,
} from "./index";

describe("distance conversions", () => {
  it("converts metres to feet", () => {
    expect(metresToFeet(0.3048)).toBeCloseTo(1, 10);
    expect(metresToFeet(100)).toBeCloseTo(328.084, 3);
  });

  it("converts metres to miles", () => {
    expect(metresToMiles(1609.344)).toBeCloseTo(1, 10);
  });

  it("converts metres to kilometres", () => {
    expect(metresToKilometres(1250)).toBe(1.25);
  });
});

describe("conversions to metres", () => {
  it("converts kilometres, feet and miles to metres", () => {
    expect(kilometresToMetres(1.25)).toBe(1250);
    expect(feetToMetres(1)).toBe(0.3048);
    expect(milesToMetres(1)).toBe(1609.344);
  });
});

describe("area conversions", () => {
  it("converts square metres to square feet", () => {
    expect(squareMetresToSquareFeet(0.09290304)).toBeCloseTo(1, 10);
    expect(squareMetresToSquareFeet(1)).toBeCloseTo(10.7639, 4);
  });

  it("converts square metres to acres", () => {
    expect(squareMetresToAcres(4046.8564224)).toBeCloseTo(1, 10);
  });

  it("converts square metres to square miles", () => {
    expect(squareMetresToSquareMiles(2_589_988.110336)).toBeCloseTo(1, 10);
  });

  it("converts square metres to hectares", () => {
    expect(squareMetresToHectares(25_000)).toBe(2.5);
  });

  it("converts square metres to square kilometres", () => {
    expect(squareMetresToSquareKilometres(2_500_000)).toBe(2.5);
  });
});
