// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  describeArea,
  describeDistance,
  formatArea,
  formatDistance,
  readArea,
  readDistance,
} from "./index";

describe("formatDistance (metric)", () => {
  it("shows whole metres under a kilometre", () => {
    expect(formatDistance(850, "metric")).toBe("850 m");
    expect(formatDistance(0, "metric")).toBe("0 m");
    expect(formatDistance(849.6, "metric")).toBe("850 m");
  });

  it("switches to kilometres when the rounded metres reach 1,000", () => {
    expect(formatDistance(999.4, "metric")).toBe("999 m");
    expect(formatDistance(999.6, "metric")).toBe("1 km");
    expect(formatDistance(1000, "metric")).toBe("1 km");
  });

  it("keeps fewer decimals as the distance grows", () => {
    expect(formatDistance(1250, "metric")).toBe("1.25 km");
    expect(formatDistance(12_340, "metric")).toBe("12.3 km");
    expect(formatDistance(123_456, "metric")).toBe("123 km");
    expect(formatDistance(1_234_567, "metric")).toBe("1,235 km");
  });
});

describe("formatDistance (imperial)", () => {
  it("shows whole feet under 0.1 miles", () => {
    expect(formatDistance(100, "imperial")).toBe("328 ft");
    expect(formatDistance(0, "imperial")).toBe("0 ft");
  });

  it("switches to miles at 0.1 miles", () => {
    expect(formatDistance(160.9344, "imperial")).toBe("0.1 mi");
    expect(formatDistance(1609.344, "imperial")).toBe("1 mi");
    expect(formatDistance(2012, "imperial")).toBe("1.25 mi");
    expect(formatDistance(32_187, "imperial")).toBe("20 mi");
  });
});

describe("formatArea (metric)", () => {
  it("shows whole square metres under a hectare", () => {
    expect(formatArea(850, "metric")).toBe("850 m²");
    expect(formatArea(0, "metric")).toBe("0 m²");
  });

  it("switches to hectares when the rounded area reaches 10,000 m²", () => {
    expect(formatArea(9999.4, "metric")).toBe("9,999 m²");
    expect(formatArea(9999.6, "metric")).toBe("1 ha");
    expect(formatArea(12_500, "metric")).toBe("1.25 ha");
    expect(formatArea(500_000, "metric")).toBe("50 ha");
  });

  it("switches to square kilometres at one square kilometre", () => {
    expect(formatArea(2_500_000, "metric")).toBe("2.5 km²");
    expect(formatArea(250_000_000, "metric")).toBe("250 km²");
  });
});

describe("formatArea (imperial)", () => {
  it("shows square feet under 0.1 acres", () => {
    expect(formatArea(100, "imperial")).toBe("1,076 ft²");
    expect(formatArea(0, "imperial")).toBe("0 ft²");
  });

  it("switches to acres, then square miles", () => {
    expect(formatArea(404.68564224, "imperial")).toBe("0.1 ac");
    expect(formatArea(4046.8564224, "imperial")).toBe("1 ac");
    expect(formatArea(40_468.564224, "imperial")).toBe("10 ac");
    expect(formatArea(2_589_988.110336, "imperial")).toBe("1 mi²");
    expect(formatArea(5_000_000, "imperial")).toBe("1.93 mi²");
  });
});

describe("readDistance and readArea", () => {
  it("return the rounded value and its unit", () => {
    expect(readDistance(1250, "metric")).toEqual({ value: 1.25, unit: "km" });
    expect(readDistance(100, "imperial")).toEqual({ value: 328, unit: "ft" });
    expect(readArea(12_500, "metric")).toEqual({ value: 1.25, unit: "ha" });
    expect(readArea(5_000_000, "imperial")).toEqual({
      value: 1.93,
      unit: "mi2",
    });
  });
});

describe("describeDistance", () => {
  it("spells the unit out, with correct singular and plural", () => {
    expect(describeDistance(20, "metric")).toBe("20 metres");
    expect(describeDistance(1, "metric")).toBe("1 metre");
    expect(describeDistance(1250, "metric")).toBe("1.25 kilometres");
    expect(describeDistance(1000, "metric")).toBe("1 kilometre");
    expect(describeDistance(100, "imperial")).toBe("328 feet");
    expect(describeDistance(0.3048, "imperial")).toBe("1 foot");
    expect(describeDistance(1609.344, "imperial")).toBe("1 mile");
    expect(describeDistance(2012, "imperial")).toBe("1.25 miles");
  });
});

describe("describeArea", () => {
  it("spells the unit out, with correct singular and plural", () => {
    expect(describeArea(850, "metric")).toBe("850 square metres");
    expect(describeArea(1, "metric")).toBe("1 square metre");
    expect(describeArea(12_500, "metric")).toBe("1.25 hectares");
    expect(describeArea(10_000, "metric")).toBe("1 hectare");
    expect(describeArea(2_500_000, "metric")).toBe("2.5 square kilometres");
    expect(describeArea(1_000_000, "metric")).toBe("1 square kilometre");
    expect(describeArea(100, "imperial")).toBe("1,076 square feet");
    expect(describeArea(0.09290304, "imperial")).toBe("1 square foot");
    expect(describeArea(4046.8564224, "imperial")).toBe("1 acre");
    expect(describeArea(40_468.564224, "imperial")).toBe("10 acres");
    expect(describeArea(5_000_000, "imperial")).toBe("1.93 square miles");
    expect(describeArea(2_589_988.110336, "imperial")).toBe("1 square mile");
  });
});
