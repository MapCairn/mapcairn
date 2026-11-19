// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeMessageCatalogue } from "../fakes/FakeMessageCatalogue";
import {
  formatDay,
  formatFixed,
  formatLatitude,
  formatLatLng,
  formatLocale,
  formatLongitude,
  formatNumber,
  formatZoom,
  type Hemispheres,
  hemispheresFor,
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

const ENGLISH_HEMISPHERES: Hemispheres = {
  north: "N",
  south: "S",
  east: "E",
  west: "W",
};

/** Afrikaans says O for east (oos), so the letters are not English's. */
const AFRIKAANS_HEMISPHERES: Hemispheres = {
  north: "N",
  south: "S",
  east: "O",
  west: "W",
};

describe("formatLatitude and formatLongitude", () => {
  it("names the hemisphere instead of using a sign", () => {
    expect(formatLatitude(-26.2041, ENGLISH_HEMISPHERES)).toBe("26.20410° S");
    expect(formatLatitude(51.5, ENGLISH_HEMISPHERES)).toBe("51.50000° N");
    expect(formatLongitude(28.0473, ENGLISH_HEMISPHERES)).toBe("28.04730° E");
    expect(formatLongitude(-0.1278, ENGLISH_HEMISPHERES)).toBe("0.12780° W");
  });

  it("treats zero, and values that round to zero, as north and east", () => {
    expect(formatLatitude(0, ENGLISH_HEMISPHERES)).toBe("0.00000° N");
    expect(formatLatitude(-0.000001, ENGLISH_HEMISPHERES)).toBe("0.00000° N");
    expect(formatLongitude(-0.000001, ENGLISH_HEMISPHERES)).toBe("0.00000° E");
  });

  it("uses the letters it is given, with no language of its own", () => {
    expect(formatLongitude(28.0473, AFRIKAANS_HEMISPHERES)).toBe("28.04730° O");
    expect(formatLatitude(-26.2041, AFRIKAANS_HEMISPHERES)).toBe("26.20410° S");
  });
});

describe("hemispheresFor", () => {
  it("reads the four letters from the catalogue's keys", () => {
    const catalogue = new FakeMessageCatalogue({
      language: "af",
      overrides: { "format.hemisphereEast": "O" },
    });
    expect(hemispheresFor(catalogue)).toEqual(AFRIKAANS_HEMISPHERES);
    expect(catalogue.calls.map((call) => call.key).sort()).toEqual([
      "format.hemisphereEast",
      "format.hemisphereNorth",
      "format.hemisphereSouth",
      "format.hemisphereWest",
    ]);
  });
});

describe("formatNumber", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("groups thousands the way the language does", () => {
    expect(formatNumber(1234567.891, "en-GB")).toBe("1,234,567.891");
    expect(formatNumber(1234567.891, "de")).toBe("1.234.567,891");
  });

  it("passes options through", () => {
    expect(formatNumber(1.23456, "en-GB", { maximumFractionDigits: 2 })).toBe(
      "1.23",
    );
    expect(formatNumber(2, "en-GB", { minimumFractionDigits: 2 })).toBe("2.00");
  });

  it("names the language explicitly, never the visitor's locale", () => {
    const spy = vi.spyOn(Intl, "NumberFormat");
    formatNumber(5, "af");
    expect(spy).toHaveBeenCalledWith("af", undefined);
  });
});

describe("formatZoom", () => {
  it("drops a trailing zero and keeps one decimal at most", () => {
    expect(formatZoom(12, "en-GB")).toBe("12");
    expect(formatZoom(12.04, "en-GB")).toBe("12");
    expect(formatZoom(12.46, "en-GB")).toBe("12.5");
    expect(formatZoom(0, "en-GB")).toBe("0");
  });

  it("uses the language's decimal separator", () => {
    expect(formatZoom(12.46, "de")).toBe("12,5");
  });
});

describe("formatDay", () => {
  it("writes a UTC day in words in the language given", () => {
    const day = new Date("2026-11-11T23:30:00Z");
    expect(formatDay(day, "en-GB")).toBe("11 November 2026");
    expect(formatDay(day, "de")).toBe("11. November 2026");
  });
});

describe("numbering and calendars follow the language's Intl defaults", () => {
  const day = new Date(Date.UTC(2026, 10, 11));

  it("writes Persian numbers in native digits and keeps coordinates ASCII", () => {
    expect(formatNumber(1234.5, "fa")).toBe(
      new Intl.NumberFormat("fa").format(1234.5),
    );
    expect(formatNumber(12, "fa")).toMatch(/^\p{Nd}+$/u);
    expect(formatNumber(12, "fa")).not.toBe("12");
    expect(formatLatLng({ lat: 12.5, lng: 34.5 })).toBe("12.50000, 34.50000");
  });

  it("writes a Thai day in the Buddhist calendar", () => {
    expect(formatDay(day, "th")).toContain("2569");
  });
});

describe("formatLocale", () => {
  it("is the language when no numbering system is set", () => {
    expect(formatLocale({ language: "fa" })).toBe("fa");
  });

  it("adds the numbering system as a Unicode extension", () => {
    expect(formatLocale({ language: "fa", numberingSystem: "latn" })).toBe(
      "fa-u-nu-latn",
    );
  });

  it("forces Latin digits in numbers and days", () => {
    const locale = formatLocale({ language: "fa", numberingSystem: "latn" });
    expect(formatNumber(1234.5, locale)).toBe("1,234.5");
    expect(formatDay(new Date(Date.UTC(2026, 10, 11)), locale)).toMatch(
      /^[^\p{Nd}]*[0-9]/u,
    );
    expect(formatDay(new Date(Date.UTC(2026, 10, 11)), locale)).not.toMatch(
      /[\u06F0-\u06F9]/u,
    );
  });

  it("keeps the language's own calendar", () => {
    const locale = formatLocale({ language: "th", numberingSystem: "latn" });
    expect(formatDay(new Date(Date.UTC(2026, 10, 11)), locale)).toContain(
      "2569",
    );
  });

  it("keeps a language that already has an extension", () => {
    expect(
      formatLocale({ language: "ar-u-ca-gregory", numberingSystem: "latn" }),
    ).toBe("ar-u-ca-gregory-nu-latn");
  });
});
