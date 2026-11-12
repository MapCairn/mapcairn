// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { UrlStateValue } from "../ports/url";
import { parseUrlHash, serialiseUrlHash } from "./index";

describe("serialiseUrlHash", () => {
  it("writes zoom with 2 decimals and lat/lng with 5", () => {
    expect(
      serialiseUrlHash({
        view: {
          center: { lat: -26.2041, lng: 28.0473 },
          zoom: 12.3456,
          bearing: 0,
        },
        basemapId: "osm-liberty",
      }),
    ).toBe("#map=12.35/-26.20410/28.04730&basemap=osm-liberty");
  });

  it("omits a zero bearing and rounds a non-zero one to a whole number", () => {
    const view = (bearing: number) => ({
      view: { center: { lat: 1, lng: 2 }, zoom: 3, bearing },
    });
    expect(serialiseUrlHash(view(0))).toBe("#map=3.00/1.00000/2.00000");
    expect(serialiseUrlHash(view(90.4))).toBe("#map=3.00/1.00000/2.00000/90");
    expect(serialiseUrlHash(view(359.6))).toBe("#map=3.00/1.00000/2.00000");
    expect(serialiseUrlHash(view(-90))).toBe("#map=3.00/1.00000/2.00000/270");
    expect(serialiseUrlHash(view(720.2))).toBe("#map=3.00/1.00000/2.00000");
  });

  it("writes only the parts that are present", () => {
    expect(serialiseUrlHash({ basemapId: "some-basemap" })).toBe(
      "#basemap=some-basemap",
    );
    expect(
      serialiseUrlHash({
        view: { center: { lat: 0, lng: 0 }, zoom: 1, bearing: 0 },
      }),
    ).toBe("#map=1.00/0.00000/0.00000");
  });

  it("returns an empty string for an empty value", () => {
    expect(serialiseUrlHash({})).toBe("");
  });

  it("drops a view with a non-finite number and a basemap id with bad characters", () => {
    expect(
      serialiseUrlHash({
        view: { center: { lat: Number.NaN, lng: 0 }, zoom: 1, bearing: 0 },
        basemapId: "Bad Id!",
      }),
    ).toBe("");
    expect(
      serialiseUrlHash({
        view: {
          center: { lat: 0, lng: 0 },
          zoom: 1,
          bearing: Number.POSITIVE_INFINITY,
        },
      }),
    ).toBe("");
  });

  it("never prints a negative zero", () => {
    expect(
      serialiseUrlHash({
        view: { center: { lat: -0.000001, lng: 0 }, zoom: 1, bearing: 0 },
      }),
    ).toBe("#map=1.00/0.00000/0.00000");
  });
});

describe("parseUrlHash", () => {
  it("reads a full hash with or without the leading #", () => {
    const expected: UrlStateValue = {
      view: {
        center: { lat: -26.2041, lng: 28.0473 },
        zoom: 12.35,
        bearing: 90,
      },
      basemapId: "osm-liberty",
    };
    expect(
      parseUrlHash("#map=12.35/-26.2041/28.0473/90&basemap=osm-liberty"),
    ).toEqual(expected);
    expect(
      parseUrlHash("map=12.35/-26.2041/28.0473/90&basemap=osm-liberty"),
    ).toEqual(expected);
  });

  it("defaults a missing bearing to 0", () => {
    expect(parseUrlHash("#map=5/10/20")).toEqual({
      view: { center: { lat: 10, lng: 20 }, zoom: 5, bearing: 0 },
    });
  });

  it("wraps the bearing into [0, 360)", () => {
    const bearing = (raw: string) =>
      parseUrlHash(`#map=5/10/20/${raw}`).view?.bearing;
    expect(bearing("360")).toBe(0);
    expect(bearing("-90")).toBe(270);
    expect(bearing("450")).toBe(90);
    expect(bearing("-360")).toBe(0);
  });

  it("treats an unreadable bearing as 0 and keeps the rest of the view", () => {
    expect(parseUrlHash("#map=5/10/20/north").view).toEqual({
      center: { lat: 10, lng: 20 },
      zoom: 5,
      bearing: 0,
    });
  });

  it("drops the view when zoom, latitude or longitude is missing or out of range", () => {
    for (const raw of [
      "5/10",
      "/10/20",
      "5//20",
      "5/10/",
      "-1/10/20",
      "25/10/20",
      "5/91/20",
      "5/-91/20",
      "5/10/181",
      "5/10/-181",
      "x/10/20",
      "5/y/20",
      "5/10/z",
      "5/10/20/30/40",
      "0x5/10/20",
      "5/1e1/20",
      "5/ 10/20",
      "",
    ]) {
      expect(parseUrlHash(`#map=${raw}`).view).toBeUndefined();
    }
  });

  it("accepts the range limits", () => {
    expect(parseUrlHash("#map=0/-90/-180").view).toEqual({
      center: { lat: -90, lng: -180 },
      zoom: 0,
      bearing: 0,
    });
    expect(parseUrlHash("#map=24/90/180").view?.zoom).toBe(24);
  });

  it("keeps a valid basemap when the view is invalid, and the other way round", () => {
    expect(parseUrlHash("#map=bad&basemap=some-basemap")).toEqual({
      basemapId: "some-basemap",
    });
    expect(parseUrlHash("#map=5/10/20&basemap=Bad Id")).toEqual({
      view: { center: { lat: 10, lng: 20 }, zoom: 5, bearing: 0 },
    });
  });

  it("restricts basemap ids to lowercase letters, digits and hyphens", () => {
    expect(parseUrlHash("#basemap=a1-b2").basemapId).toBe("a1-b2");
    for (const id of [
      "",
      "UPPER",
      "with_underscore",
      "a/b",
      "a.b",
      "a%20b",
      "x".repeat(65),
    ]) {
      expect(parseUrlHash(`#basemap=${id}`).basemapId).toBeUndefined();
    }
  });

  it("ignores unknown, empty and malformed parameters", () => {
    expect(parseUrlHash("#foo=bar&&novalue&=x&basemap=osm&utm=1")).toEqual({
      basemapId: "osm",
    });
  });

  it("uses the first occurrence of a repeated parameter", () => {
    expect(parseUrlHash("#basemap=one&basemap=two").basemapId).toBe("one");
  });

  it("returns an empty value for empty input", () => {
    expect(parseUrlHash("")).toEqual({});
    expect(parseUrlHash("#")).toEqual({});
  });
});

describe("round trip", () => {
  it("restores what was serialised", () => {
    const values: UrlStateValue[] = [
      {},
      { basemapId: "osm-positron" },
      {
        view: {
          center: { lat: -26.2041, lng: 28.0473 },
          zoom: 12.35,
          bearing: 0,
        },
      },
      {
        view: {
          center: { lat: 51.50735, lng: -0.12776 },
          zoom: 3,
          bearing: 270,
        },
        basemapId: "other-basemap",
      },
    ];
    for (const value of values) {
      expect(parseUrlHash(serialiseUrlHash(value))).toEqual(value);
    }
  });

  it("is stable when serialised twice", () => {
    const hash = "#map=12.35/-26.20410/28.04730/45&basemap=osm-liberty";
    expect(serialiseUrlHash(parseUrlHash(hash))).toBe(hash);
  });
});

describe("layers in the hash", () => {
  it("writes the layers that are on and their control values", () => {
    expect(
      serialiseUrlHash({
        basemapId: "liberty",
        layers: {
          enabled: ["earthquakes", "imagery"],
          controls: {
            earthquakes: { window: "day", small: "false" },
            imagery: { date: "2026-11-08", opacity: "0.85" },
          },
        },
      }),
    ).toBe(
      "#basemap=liberty&layers=earthquakes,imagery&earthquakes.window=day&earthquakes.small=false&imagery.date=2026-11-08&imagery.opacity=0.85",
    );
  });

  it("writes nothing for no layers, and no values for layers that are off", () => {
    expect(serialiseUrlHash({ layers: { enabled: [], controls: {} } })).toBe(
      "",
    );
    expect(
      serialiseUrlHash({
        layers: { enabled: ["a"], controls: { b: { window: "day" } } },
      }),
    ).toBe("#layers=a");
  });

  it("leaves out ids and values it could not read back", () => {
    expect(
      serialiseUrlHash({
        layers: {
          enabled: ["Bad Id", "ok"],
          controls: {
            ok: { window: "a&b", "Bad Key": "x", date: "2026-11-08" },
          },
        },
      }),
    ).toBe("#layers=ok&ok.date=2026-11-08");
  });

  it("reads layers and their control values", () => {
    expect(
      parseUrlHash(
        "#layers=earthquakes,imagery&earthquakes.window=week&imagery.date=2026-11-08",
      ),
    ).toEqual({
      layers: {
        enabled: ["earthquakes", "imagery"],
        controls: {
          earthquakes: { window: "week" },
          imagery: { date: "2026-11-08" },
        },
      },
    });
  });

  it("keeps a date and time value through a round trip", () => {
    const hash =
      "#layers=rainfall-half-hourly&rainfall-half-hourly.time=2026-11-11t1430";
    const value = parseUrlHash(hash);
    expect(value.layers?.controls["rainfall-half-hourly"]).toEqual({
      time: "2026-11-11t1430",
    });
    expect(serialiseUrlHash(value)).toBe(hash);
  });

  it("drops bad ids, duplicates, values for layers that are off and odd values", () => {
    expect(
      parseUrlHash(
        "#layers=quakes,Bad!,quakes,,fires&quakes.window=%3Cb%3E&quakes.small=true&other.window=day&fires=1",
      ),
    ).toEqual({
      layers: {
        enabled: ["quakes", "fires"],
        controls: { quakes: { small: "true" } },
      },
    });
  });

  it("reads no layers from an empty list", () => {
    expect(parseUrlHash("#layers=")).toEqual({});
  });

  it("keeps at most 20 layers", () => {
    const ids = Array.from({ length: 25 }, (_, index) => `l${index}`);
    expect(
      parseUrlHash(`#layers=${ids.join(",")}`).layers?.enabled,
    ).toHaveLength(20);
  });

  it("round-trips", () => {
    const value: UrlStateValue = {
      layers: {
        enabled: ["imagery"],
        controls: { imagery: { date: "2026-11-08", opacity: "0.5" } },
      },
    };
    expect(parseUrlHash(serialiseUrlHash(value))).toEqual(value);
  });
});
