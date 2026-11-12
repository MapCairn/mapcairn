// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { createFormatterRegistry } from "./formatters";
import { readPath } from "./paths";
import {
  ENGINE_PLACEHOLDERS,
  fillUrlTemplate,
  formatTemplate,
  parseTemplate,
} from "./template";

describe("readPath", () => {
  const value = {
    properties: { mag: 4.2, url: { geometry: "https://a.test/g" } },
    geometry: { coordinates: [18.4, -33.9, 10.5] },
  };

  it("reads nested keys and array indexes by dotted path", () => {
    expect(readPath(value, "properties.mag")).toBe(4.2);
    expect(readPath(value, "properties.url.geometry")).toBe("https://a.test/g");
    expect(readPath(value, "geometry.coordinates.2")).toBe(10.5);
  });

  it("returns undefined for a missing step or a step through a primitive", () => {
    expect(readPath(value, "properties.missing.deeper")).toBeUndefined();
    expect(readPath(value, "properties.mag.deeper")).toBeUndefined();
    expect(readPath(null, "a")).toBeUndefined();
  });

  it("never reads inherited properties", () => {
    expect(readPath({}, "constructor")).toBeUndefined();
    expect(readPath({ a: {} }, "a.__proto__")).toBeUndefined();
  });
});

describe("parseTemplate", () => {
  it("lists each placeholder with its optional formatter, in order", () => {
    expect(
      parseTemplate("M {value|number} at {time|relative}, {place}"),
    ).toEqual([
      { name: "value", formatter: "number" },
      { name: "time", formatter: "relative" },
      { name: "place" },
    ]);
  });

  it("finds nothing in plain text", () => {
    expect(parseTemplate("no placeholders")).toEqual([]);
  });
});

describe("fillUrlTemplate", () => {
  it("fills variables, encoding each value", () => {
    expect(
      fillUrlTemplate("https://a.test/{feed}.geojson?q={q}", {
        feed: "2.5_day",
        q: "a b&c",
      }),
    ).toBe("https://a.test/2.5_day.geojson?q=a%20b%26c");
  });

  it("leaves the map engine's own placeholders for the engine", () => {
    expect(ENGINE_PLACEHOLDERS).toEqual(["z", "x", "y", "bbox-epsg-3857"]);
    expect(
      fillUrlTemplate(
        "https://t.test/{date}/{z}/{y}/{x}.jpg?b={bbox-epsg-3857}",
        {
          date: "2026-11-08",
        },
      ),
    ).toBe("https://t.test/2026-11-08/{z}/{y}/{x}.jpg?b={bbox-epsg-3857}");
  });

  it("fills {x} and {y} when told the engine leaves nothing alone, as an identify URL needs", () => {
    expect(
      fillUrlTemplate("https://a.test/?i={x}&j={y}", { x: "12", y: "13" }, []),
    ).toBe("https://a.test/?i=12&j=13");
  });

  it("leaves only the placeholders it is told to leave", () => {
    expect(fillUrlTemplate("https://a.test/{z}/{x}", { x: "5" }, ["z"])).toBe(
      "https://a.test/{z}/5",
    );
    expect(() => fillUrlTemplate("https://a.test/{y}", {}, ["z"])).toThrow(
      /\{y\}/,
    );
  });

  it("throws on a variable with no value, so a broken definition fails loudly", () => {
    expect(() => fillUrlTemplate("https://a.test/{missing}", {})).toThrow(
      /missing/,
    );
  });

  it("does not take a value from what every object inherits", () => {
    expect(() => fillUrlTemplate("https://a.test/{constructor}", {})).toThrow(
      /constructor/,
    );
  });
});

describe("formatTemplate", () => {
  const formatters = createFormatterRegistry();
  const context = { now: Date.UTC(2026, 10, 9, 12, 0, 0) };

  it("fills fields through named formatters", () => {
    expect(
      formatTemplate(
        "Magnitude {value|number}, {depth|km} deep",
        { value: 4.25, depth: 10 },
        formatters,
        context,
      ),
    ).toBe("Magnitude 4.3, 10 km deep");
  });

  it("writes a field with no formatter as text", () => {
    expect(
      formatTemplate(
        "{place} ({tsunami})",
        { place: "Off Chile", tsunami: true },
        formatters,
        context,
      ),
    ).toBe("Off Chile (true)");
  });

  it("returns null when every field it names is missing, so the line is left out", () => {
    expect(
      formatTemplate("{depth|km} deep", { depth: null }, formatters, context),
    ).toBeNull();
    expect(formatTemplate("{nothing}", {}, formatters, context)).toBeNull();
  });

  it("writes an empty string for one missing field among others", () => {
    expect(formatTemplate("{a} and {b}", { a: "x" }, formatters, context)).toBe(
      "x and ",
    );
  });

  it("returns plain text unchanged", () => {
    expect(formatTemplate("Fixed", {}, formatters, context)).toBe("Fixed");
  });

  it("does not take a field from what every object inherits", () => {
    expect(formatTemplate("{constructor}", {}, formatters, context)).toBeNull();
  });

  it("falls back to text when a formatter is not registered", () => {
    expect(formatTemplate("{a|unknown}", { a: 3 }, formatters, context)).toBe(
      "3",
    );
  });
});
