// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatFixed,
  formatLatitude,
  formatLatLng,
  formatLongitude,
  formatNumber,
  formatZoom,
} from "./index";

describe("formatFixed", () => {
  it("uses a dot and the requested number of decimals", () => {
    expect(formatFixed(1.5, 3)).toBe("1.500");
    expect(formatFixed(-26.2041, 5)).toBe("-26.20410");
  });

  it("never prints a negative zero", () => {
    expect(formatFixed(-0.000001, 5)).toBe("0.00000");
    expect(formatFixed(-0, 2)).toBe("0.00");
  });
});

describe("formatLatLng", () => {
  it("prints five decimals with a dot separator", () => {
    expect(formatLatLng({ lat: -26.2041, lng: 28.0473 })).toBe(
      "-26.20410, 28.04730",
    );
  });

  it("rounds to five decimals", () => {
    expect(formatLatLng({ lat: 1.123456789, lng: -0.000004 })).toBe(
      "1.12346, 0.00000",
    );
  });

  it("is identical when the process locale would use commas", () => {
    const localeSpy = vi
      .spyOn(Number.prototype, "toLocaleString")
      .mockImplementation(function (this: number) {
        return String(this).replace(".", ",");
      });
    try {
      expect(formatLatLng({ lat: -26.2041, lng: 28.0473 })).toBe(
        "-26.20410, 28.04730",
      );
    } finally {
      localeSpy.mockRestore();
    }
  });
});

describe("formatLatitude and formatLongitude", () => {
  it("names the hemisphere instead of using a sign", () => {
    expect(formatLatitude(-26.2041)).toBe("26.20410° S");
    expect(formatLatitude(51.5)).toBe("51.50000° N");
    expect(formatLongitude(28.0473)).toBe("28.04730° E");
    expect(formatLongitude(-0.1278)).toBe("0.12780° W");
  });

  it("treats zero, and values that round to zero, as north and east", () => {
    expect(formatLatitude(0)).toBe("0.00000° N");
    expect(formatLatitude(-0.000001)).toBe("0.00000° N");
    expect(formatLongitude(-0.000001)).toBe("0.00000° E");
  });
});

describe("formatNumber", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("groups thousands the British way", () => {
    expect(formatNumber(1234567.891)).toBe("1,234,567.891");
  });

  it("passes options through", () => {
    expect(formatNumber(1.23456, { maximumFractionDigits: 2 })).toBe("1.23");
    expect(formatNumber(2, { minimumFractionDigits: 2 })).toBe("2.00");
  });

  it("names the en-GB locale explicitly", () => {
    const spy = vi.spyOn(Intl, "NumberFormat");
    formatNumber(5);
    expect(spy).toHaveBeenCalledWith("en-GB", undefined);
  });
});

describe("formatZoom", () => {
  it("drops a trailing zero and keeps one decimal at most", () => {
    expect(formatZoom(12)).toBe("12");
    expect(formatZoom(12.04)).toBe("12");
    expect(formatZoom(12.46)).toBe("12.5");
    expect(formatZoom(0)).toBe("0");
  });
});
