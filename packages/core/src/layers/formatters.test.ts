// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_FORMATTERS,
  createFormatterRegistry,
  type Formatter,
  parseTime,
} from "./formatters";

const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);
const context = { now: NOW };

function format(name: string, value: Parameters<Formatter>[0]) {
  const formatter = createFormatterRegistry().get(name);
  if (!formatter) {
    throw new Error(`No formatter ${name}`);
  }
  return formatter(value, context);
}

describe("parseTime", () => {
  it("reads epoch milliseconds", () => {
    expect(parseTime(NOW)).toBe(NOW);
  });

  it("reads an ISO date with a zone", () => {
    expect(parseTime("2026-11-09T10:00:00Z")).toBe(Date.UTC(2026, 10, 9, 10));
    expect(parseTime("2026-11-09T12:00:00+02:00")).toBe(
      Date.UTC(2026, 10, 9, 10),
    );
  });

  it("reads an ISO date and time with no zone as UTC, as GDACS writes them", () => {
    expect(parseTime("2026-11-06T21:00:00")).toBe(Date.UTC(2026, 10, 6, 21));
  });

  it("returns null for a number past the range a date can hold", () => {
    expect(parseTime(8_640_000_000_000_001)).toBeNull();
    expect(parseTime(-8_640_000_000_000_001)).toBeNull();
    expect(format("date", 1e300)).toBeNull();
  });

  it("returns null for anything else", () => {
    expect(parseTime("not a date")).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(parseTime(true)).toBeNull();
    expect(parseTime(Number.NaN)).toBeNull();
  });
});

describe("built-in formatters", () => {
  it("are relative, number, km and date", () => {
    expect(Object.keys(BUILT_IN_FORMATTERS).sort()).toEqual([
      "date",
      "km",
      "number",
      "relative",
    ]);
  });

  it("relative: says how long ago, in British English", () => {
    expect(format("relative", NOW - 20_000)).toBe("just now");
    expect(format("relative", NOW - 60_000)).toBe("1 minute ago");
    expect(format("relative", NOW - 5 * 60_000)).toBe("5 minutes ago");
    expect(format("relative", NOW - 3600_000)).toBe("1 hour ago");
    expect(format("relative", NOW - 3 * 3600_000)).toBe("3 hours ago");
    expect(format("relative", NOW - 86_400_000)).toBe("1 day ago");
    expect(format("relative", NOW - 4 * 86_400_000)).toBe("4 days ago");
  });

  it("relative: a future time reads as 'in' a span", () => {
    expect(format("relative", NOW + 2 * 3600_000)).toBe("in 2 hours");
  });

  it("number: at most one decimal, grouped", () => {
    expect(format("number", 4.25)).toBe("4.3");
    expect(format("number", 12_345)).toBe("12,345");
    expect(format("number", "6.04")).toBe("6");
  });

  it("km: a distance with its unit", () => {
    expect(format("km", 10)).toBe("10 km");
    expect(format("km", 5.587)).toBe("5.6 km");
  });

  it("date: day, month, year and time in UTC", () => {
    expect(format("date", Date.UTC(2026, 10, 8, 14, 5))).toBe(
      "8 Nov 2026, 14:05 UTC",
    );
  });

  it("each returns null for a value it cannot read", () => {
    for (const name of ["relative", "number", "km", "date"]) {
      expect(format(name, "nonsense")).toBeNull();
      expect(format(name, null)).toBeNull();
    }
  });
});

describe("createFormatterRegistry", () => {
  it("adds formatters by name beside the built-ins", () => {
    const shout: Formatter = (value) => String(value).toUpperCase();
    const registry = createFormatterRegistry({ shout });
    expect(registry.get("shout")?.("hi", context)).toBe("HI");
    expect(registry.has("relative")).toBe(true);
    expect(registry.names()).toContain("shout");
  });

  it("knows nothing about an unregistered name", () => {
    expect(createFormatterRegistry().has("missing")).toBe(false);
    expect(createFormatterRegistry().get("missing")).toBeUndefined();
  });
});
