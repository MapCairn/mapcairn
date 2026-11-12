// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type LatLng,
  type ReachableAreaResult,
  type RouteResult,
  RoutingError,
  type RoutingErrorKind,
  type TravelMode,
} from "@mapcairn/core";
import { runRoutingProviderContract } from "@mapcairn/core/contracts";
import { describe, expect, it, vi } from "vitest";
import errorNoPath from "./fixtures/error-no-path.json";
import errorTooFar from "./fixtures/error-too-far.json";
import errorUnsupportedCosting from "./fixtures/error-unsupported-costing.json";
import isochroneEmpty from "./fixtures/isochrone-empty.json";
import isochroneMultiPolygon from "./fixtures/isochrone-multipolygon.json";
import isochronePolygon from "./fixtures/isochrone-polygon.json";
import routeParisLyon from "./fixtures/route-paris-lyon.json";
import routeThreeStops from "./fixtures/route-three-stops.json";
import { encodePolyline } from "./polylineTestEncoder";
import { ValhallaRoutingProvider } from "./ValhallaRoutingProvider";

const PARIS: LatLng = { lat: 48.8566, lng: 2.3522 };
const LYON: LatLng = { lat: 45.764, lng: 4.8357 };
const MARSEILLE: LatLng = { lat: 43.2965, lng: 5.3698 };
const NAIROBI: LatLng = { lat: -1.2921, lng: 36.8219 };

const SHAPE: string = routeParisLyon.trip.legs[0]?.shape ?? "";

type Script =
  | { kind: "answer" }
  | { kind: "fail"; failure: RoutingErrorKind }
  | { kind: "hold" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The Valhalla trip a route result would have come from. */
function toTrip(result: RouteResult) {
  return {
    trip: {
      legs: result.features.map((leg) => ({
        shape: encodePolyline(leg.geometry.coordinates, 6),
        summary: {
          length: leg.properties.distance / 1000,
          time: leg.properties.duration,
        },
      })),
      summary: { length: result.distance / 1000, time: result.duration },
      status: 0,
    },
  };
}

/** The isochrone collection an area result would have come from. */
function toIsochrone(result: ReachableAreaResult) {
  return {
    type: "FeatureCollection",
    features: result.features.map((area) => ({
      type: "Feature",
      properties: { contour: area.properties.minutes },
      geometry: area.geometry,
    })),
  };
}

interface Call {
  readonly url: URL;
  readonly init: RequestInit | undefined;
}

/** A scripted `fetch` that behaves like the real one when its signal aborts. */
function scriptedFetch() {
  let script: Script = { kind: "answer" };
  let route: unknown = routeParisLyon;
  let area: unknown = isochronePolygon;
  const calls: Call[] = [];
  const fetchMock = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      calls.push({ url, init });
      const current = script;
      if (current.kind === "hold") {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        });
      }
      if (current.kind === "fail") {
        switch (current.failure) {
          case "network":
            return Promise.reject(new TypeError("Failed to fetch"));
          case "rate-limited":
            return Promise.resolve(jsonResponse({}, 429));
          case "unsupported":
            return Promise.resolve(jsonResponse(errorUnsupportedCosting, 400));
          default:
            return Promise.resolve(jsonResponse(errorNoPath, 400));
        }
      }
      return Promise.resolve(
        jsonResponse(url.pathname.endsWith("/isochrone") ? area : route),
      );
    },
  );
  return {
    fetchMock,
    calls,
    setScript(next: Script) {
      script = next;
    },
    setRoute(next: unknown) {
      route = next;
    },
    setArea(next: unknown) {
      area = next;
    },
  };
}

function setup(
  options: Partial<
    ConstructorParameters<typeof ValhallaRoutingProvider>[0]
  > = {},
) {
  const scripted = scriptedFetch();
  const provider = new ValhallaRoutingProvider({
    fetch: scripted.fetchMock as unknown as typeof fetch,
    minIntervalMs: 0,
    ...options,
  });
  return { scripted, provider };
}

/** The kind of `RoutingError` a promise rejects with. */
async function failureKind(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(RoutingError);
  return (error as RoutingError).kind;
}

/** The `json` query parameter of a call, parsed. */
function jsonOf(call: Call | undefined): unknown {
  return JSON.parse(call?.url.searchParams.get("json") ?? "null");
}

runRoutingProviderContract("ValhallaRoutingProvider", () => {
  const { scripted, provider } = setup();
  return {
    provider,
    controls: {
      willReturnRoute: (result) => scripted.setRoute(toTrip(result)),
      willReturnArea: (result) => scripted.setArea(toIsochrone(result)),
      willFail: (failure) => scripted.setScript({ kind: "fail", failure }),
      hold: () => scripted.setScript({ kind: "hold" }),
    },
  };
});

describe("ValhallaRoutingProvider requests", () => {
  const COSTINGS: readonly (readonly [TravelMode, string])[] = [
    ["drive", "auto"],
    ["walk", "pedestrian"],
    ["cycle", "bicycle"],
  ];

  it.each(COSTINGS)(
    "asks for a %s route with the %s costing, as a GET with the JSON in the query",
    async (mode, costing) => {
      const { scripted, provider } = setup();
      await provider.route({ stops: [PARIS, LYON], mode });
      const call = scripted.calls[0];
      expect(call?.url.origin).toBe("https://valhalla1.openstreetmap.de");
      expect(call?.url.pathname).toBe("/route");
      expect([...(call?.url.searchParams.keys() ?? [])]).toEqual(["json"]);
      expect(jsonOf(call)).toEqual({
        locations: [
          { lat: 48.8566, lon: 2.3522 },
          { lat: 45.764, lon: 4.8357 },
        ],
        costing,
      });
      expect(call?.init?.method ?? "GET").toBe("GET");
      expect(call?.init?.body).toBeUndefined();
    },
  );

  it("sends every stop of a multi-stop route, in order", async () => {
    const { scripted, provider } = setup();
    scripted.setRoute(routeThreeStops);
    await provider.route({ stops: [PARIS, LYON, MARSEILLE], mode: "drive" });
    expect(jsonOf(scripted.calls[0])).toEqual({
      locations: [
        { lat: 48.8566, lon: 2.3522 },
        { lat: 45.764, lon: 4.8357 },
        { lat: 43.2965, lon: 5.3698 },
      ],
      costing: "auto",
    });
  });

  it.each(COSTINGS)(
    "asks for a %s travel-time area with the %s costing and polygons",
    async (mode, costing) => {
      const { scripted, provider } = setup();
      await provider.reachableArea({ origin: NAIROBI, minutes: 10, mode });
      const call = scripted.calls[0];
      expect(call?.url.origin).toBe("https://valhalla1.openstreetmap.de");
      expect(call?.url.pathname).toBe("/isochrone");
      expect([...(call?.url.searchParams.keys() ?? [])]).toEqual(["json"]);
      expect(jsonOf(call)).toEqual({
        locations: [{ lat: -1.2921, lon: 36.8219 }],
        costing,
        contours: [{ time: 10 }],
        polygons: true,
      });
    },
  );

  it("url-encodes the JSON", async () => {
    const { scripted, provider } = setup();
    await provider.route({ stops: [PARIS, LYON], mode: "walk" });
    const href = scripted.calls[0]?.url.href ?? "";
    expect(href).not.toContain("{");
    expect(href).not.toContain('"');
    expect(href).toContain("json=%7B");
  });

  it("sends no cookies, no referrer and no cached copy, and no header beyond Accept", async () => {
    const { scripted, provider } = setup();
    const controller = new AbortController();
    await provider.route({
      stops: [PARIS, LYON],
      mode: "drive",
      signal: controller.signal,
    });
    await provider.reachableArea({
      origin: NAIROBI,
      minutes: 5,
      mode: "walk",
    });
    for (const call of scripted.calls) {
      expect(call.init).toMatchObject({
        headers: { Accept: "application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
      expect(Object.keys(call.init?.headers ?? {})).toEqual(["Accept"]);
    }
    expect(scripted.calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("honours a custom endpoint, with or without a trailing slash", async () => {
    const { scripted, provider } = setup({
      endpoint: "https://routing.example.org/",
    });
    await provider.route({ stops: [PARIS, LYON], mode: "walk" });
    expect(scripted.calls[0]?.url.origin).toBe("https://routing.example.org");
    expect(scripted.calls[0]?.url.pathname).toBe("/route");
  });

  it("reads globalThis.fetch lazily when none is injected", async () => {
    const provider = new ValhallaRoutingProvider({ minIntervalMs: 0 });
    const original = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(routeParisLyon));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await provider.route({ stops: [PARIS, LYON], mode: "walk" });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("ValhallaRoutingProvider route results", () => {
  it("decodes each leg's polyline into [lng, lat] positions with its length in metres and time in seconds", async () => {
    const { provider } = setup();
    const result = await provider.route({
      stops: [PARIS, LYON],
      mode: "drive",
    });
    expect(result.features).toHaveLength(1);
    const leg = result.features[0];
    expect(leg?.type).toBe("Feature");
    expect(leg?.geometry.type).toBe("LineString");
    expect(leg?.geometry.coordinates).toHaveLength(5);
    expect(leg?.geometry.coordinates[0]?.[0]).toBeCloseTo(2.3522, 6);
    expect(leg?.geometry.coordinates[0]?.[1]).toBeCloseTo(48.8566, 6);
    expect(leg?.geometry.coordinates[4]?.[0]).toBeCloseTo(4.8357, 6);
    expect(leg?.geometry.coordinates[4]?.[1]).toBeCloseTo(45.764, 6);
    expect(leg?.properties.distance).toBeCloseTo(465900, 6);
    expect(leg?.properties.duration).toBeCloseTo(17020.5, 6);
    expect(result.distance).toBeCloseTo(465900, 6);
    expect(result.duration).toBeCloseTo(17020.5, 6);
  });

  it("returns one leg for each pair of consecutive stops, and totals the legs", async () => {
    const { scripted, provider } = setup();
    scripted.setRoute(routeThreeStops);
    const result = await provider.route({
      stops: [PARIS, LYON, MARSEILLE],
      mode: "drive",
    });
    expect(result.features.map((leg) => leg.properties.distance)).toEqual([
      expect.closeTo(465900, 6),
      expect.closeTo(315200, 6),
    ]);
    expect(result.features[1]?.geometry.coordinates[0]?.[0]).toBeCloseTo(
      4.8357,
      6,
    );
    expect(result.distance).toBeCloseTo(781100, 6);
    expect(result.duration).toBeCloseTo(29630.75, 6);
  });

  it("totals the legs, not the trip summary, so the two always agree", async () => {
    const { scripted, provider } = setup();
    scripted.setRoute({
      trip: {
        ...routeParisLyon.trip,
        summary: { length: 1, time: 1 },
      },
    });
    const result = await provider.route({
      stops: [PARIS, LYON],
      mode: "drive",
    });
    expect(result.distance).toBeCloseTo(465900, 6);
    expect(result.duration).toBeCloseTo(17020.5, 6);
  });

  it("tolerates fields it does not know, at every level", async () => {
    const { scripted, provider } = setup();
    scripted.setRoute({
      extra: true,
      trip: {
        ...routeParisLyon.trip,
        warnings: [{ code: 1 }],
        legs: routeParisLyon.trip.legs.map((leg) => ({
          ...leg,
          surprise: "yes",
          summary: { ...leg.summary, has_ferry: false },
        })),
      },
    });
    const result = await provider.route({
      stops: [PARIS, LYON],
      mode: "drive",
    });
    expect(result.features).toHaveLength(1);
  });

  const LEG = { shape: SHAPE, summary: { length: 10, time: 100 } };

  const MALFORMED: readonly (readonly [string, unknown])[] = [
    ["null", null],
    ["an array", []],
    ["a string", "route"],
    ["no trip", {}],
    ["a trip that is not an object", { trip: "x" }],
    ["no legs", { trip: {} }],
    ["legs that are not a list", { trip: { legs: {} } }],
    ["an empty list of legs", { trip: { legs: [] } }],
    ["a leg that is not an object", { trip: { legs: [3] } }],
    ["a leg with no shape", { trip: { legs: [{ summary: LEG.summary }] } }],
    [
      "a shape that is not a string",
      { trip: { legs: [{ ...LEG, shape: 12 }] } },
    ],
    [
      "a shape that is cut off",
      { trip: { legs: [{ ...LEG, shape: SHAPE.slice(0, -1) }] } },
    ],
    [
      "a shape with one position",
      { trip: { legs: [{ ...LEG, shape: "??" }] } },
    ],
    ["an empty shape", { trip: { legs: [{ ...LEG, shape: "" }] } }],
    ["a leg with no summary", { trip: { legs: [{ shape: SHAPE }] } }],
    [
      "a summary that is not an object",
      { trip: { legs: [{ shape: SHAPE, summary: 4 }] } },
    ],
    [
      "a length that is a string",
      { trip: { legs: [{ ...LEG, summary: { length: "10", time: 1 } }] } },
    ],
    [
      "a negative length",
      { trip: { legs: [{ ...LEG, summary: { length: -1, time: 1 } }] } },
    ],
    [
      "a missing time",
      { trip: { legs: [{ ...LEG, summary: { length: 1 } }] } },
    ],
    [
      "a time that is null",
      { trip: { legs: [{ ...LEG, summary: { length: 1, time: null } }] } },
    ],
  ];

  it.each(MALFORMED)(
    "rejects a body with %s as invalid",
    async (_name, body) => {
      const { scripted, provider } = setup();
      scripted.setRoute(body);
      expect(
        await failureKind(
          provider.route({ stops: [PARIS, LYON], mode: "walk" }),
        ),
      ).toBe("invalid");
    },
  );

  it("rejects a 200 whose body is not JSON as invalid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("<html>", { status: 200 }));
    const provider = new ValhallaRoutingProvider({
      fetch: fetchMock,
      minIntervalMs: 0,
    });
    expect(
      await failureKind(provider.route({ stops: [PARIS, LYON], mode: "walk" })),
    ).toBe("invalid");
  });
});

describe("ValhallaRoutingProvider area results", () => {
  it("returns a Polygon feature with the minutes asked for, dropping the service's other properties", async () => {
    const { provider } = setup();
    const result = await provider.reachableArea({
      origin: NAIROBI,
      minutes: 7.5,
      mode: "walk",
    });
    expect(result.features).toHaveLength(1);
    const area = result.features[0];
    expect(area?.type).toBe("Feature");
    expect(area?.geometry.type).toBe("Polygon");
    expect(area?.geometry.coordinates).toEqual(
      isochronePolygon.features[0]?.geometry.coordinates,
    );
    expect(area?.properties).toEqual({ minutes: 7.5 });
  });

  it("returns a MultiPolygon feature when the network is split", async () => {
    const { scripted, provider } = setup();
    scripted.setArea(isochroneMultiPolygon);
    const result = await provider.reachableArea({
      origin: { lat: 35.6895, lng: 139.6917 },
      minutes: 15,
      mode: "cycle",
    });
    expect(result.features).toHaveLength(1);
    const geometry = result.features[0]?.geometry;
    expect(geometry?.type).toBe("MultiPolygon");
    expect(geometry?.coordinates).toHaveLength(2);
    expect(result.features[0]?.properties.minutes).toBe(15);
  });

  it("ignores features that are not polygons and drops altitude from positions", async () => {
    const { scripted, provider } = setup();
    scripted.setArea({
      type: "FeatureCollection",
      note: "extra",
      features: [
        {
          type: "Feature",
          properties: { type: "snapped" },
          geometry: { type: "Point", coordinates: [36.8, -1.3] },
        },
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [1, 1, 100],
                [2, 1, 100],
                [2, 2, 100],
                [1, 1, 100],
              ],
            ],
          },
        },
      ],
    });
    const result = await provider.reachableArea({
      origin: NAIROBI,
      minutes: 3,
      mode: "drive",
    });
    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.geometry.coordinates).toEqual([
      [
        [1, 1],
        [2, 1],
        [2, 2],
        [1, 1],
      ],
    ]);
  });

  it("rejects a collection with no features, or none that are polygons, as no-route", async () => {
    const { scripted, provider } = setup();
    for (const body of [
      isochroneEmpty,
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [1, 2] },
          },
        ],
      },
    ]) {
      scripted.setArea(body);
      expect(
        await failureKind(
          provider.reachableArea({ origin: NAIROBI, minutes: 5, mode: "walk" }),
        ),
      ).toBe("no-route");
    }
  });

  const MALFORMED: readonly (readonly [string, unknown])[] = [
    ["null", null],
    ["an array", []],
    ["no type", { features: [] }],
    ["another type", { type: "Feature", features: [] }],
    ["no features", { type: "FeatureCollection" }],
    [
      "features that are not a list",
      { type: "FeatureCollection", features: 1 },
    ],
    [
      "a feature that is not an object",
      { type: "FeatureCollection", features: [7] },
    ],
    [
      "a polygon with no coordinates",
      {
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: { type: "Polygon" } }],
      },
    ],
    [
      "a polygon whose ring holds text",
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [[["a", "b"]]] },
          },
        ],
      },
    ],
    [
      "a polygon whose position has one number",
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [[[1]]] },
          },
        ],
      },
    ],
    [
      "a polygon with a position that holds null",
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [[[null, 2]]] },
          },
        ],
      },
    ],
    [
      "an empty polygon",
      {
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "Polygon", coordinates: [] } },
        ],
      },
    ],
    [
      "a multipolygon that is not nested deeply enough",
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "MultiPolygon", coordinates: [[[1, 2]]] },
          },
        ],
      },
    ],
  ];

  it.each(MALFORMED)(
    "rejects a body with %s as invalid",
    async (_name, body) => {
      const { scripted, provider } = setup();
      scripted.setArea(body);
      expect(
        await failureKind(
          provider.reachableArea({ origin: NAIROBI, minutes: 5, mode: "walk" }),
        ),
      ).toBe("invalid");
    },
  );
});

describe("ValhallaRoutingProvider input checks", () => {
  it("makes no request for a request that is not valid", async () => {
    const { scripted, provider } = setup();
    const badRoutes = [
      { stops: [], mode: "walk" as const },
      { stops: [PARIS], mode: "walk" as const },
      { stops: [PARIS, { lat: 91, lng: 0 }], mode: "walk" as const },
      { stops: [PARIS, { lat: 0, lng: -181 }], mode: "walk" as const },
      { stops: [PARIS, { lat: Number.NaN, lng: 0 }], mode: "walk" as const },
    ];
    for (const request of badRoutes) {
      expect(await failureKind(provider.route(request))).toBe("invalid");
    }
    for (const minutes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        await failureKind(
          provider.reachableArea({ origin: NAIROBI, minutes, mode: "walk" }),
        ),
      ).toBe("invalid");
    }
    expect(
      await failureKind(
        provider.reachableArea({
          origin: { lat: 0, lng: 200 },
          minutes: 5,
          mode: "walk",
        }),
      ),
    ).toBe("invalid");
    expect(scripted.fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a mode it does not offer as unsupported, without a request", async () => {
    const { scripted, provider } = setup();
    for (const mode of ["teleport", "toString", "constructor"]) {
      expect(
        await failureKind(
          provider.route({ stops: [PARIS, LYON], mode: mode as TravelMode }),
        ),
      ).toBe("unsupported");
      expect(
        await failureKind(
          provider.reachableArea({
            origin: NAIROBI,
            minutes: 5,
            mode: mode as TravelMode,
          }),
        ),
      ).toBe("unsupported");
    }
    expect(scripted.fetchMock).not.toHaveBeenCalled();
  });
});

describe("ValhallaRoutingProvider errors", () => {
  /** Status, body and the kind they map to. */
  const CASES: readonly (readonly [
    string,
    number,
    unknown,
    RoutingErrorKind,
  ])[] = [
    ["429", 429, {}, "rate-limited"],
    ["503", 503, "busy", "rate-limited"],
    ["504", 504, "", "rate-limited"],
    ["500", 500, {}, "network"],
    ["502", 502, {}, "network"],
    ["501", 501, {}, "network"],
    ["400 with code 442", 400, errorNoPath, "no-route"],
    [
      "400 with code 443",
      400,
      { error_code: 443, error: "x", status_code: 400 },
      "no-route",
    ],
    [
      "400 with code 171",
      400,
      { error_code: 171, error: "x", status_code: 400 },
      "no-route",
    ],
    [
      "400 with code 170",
      400,
      { error_code: 170, error: "x", status_code: 400 },
      "no-route",
    ],
    [
      "400 saying no suitable edges",
      400,
      { error_code: 999, error: "No suitable edges near location" },
      "no-route",
    ],
    [
      "400 saying unable to find",
      400,
      { error: "Unable to find a path" },
      "no-route",
    ],
    ["400 saying no route", 400, { error: "no route found" }, "no-route"],
    [
      "400 saying no path",
      400,
      { error: "No path could be found" },
      "no-route",
    ],
    ["400 for a distance that is too far", 400, errorTooFar, "invalid"],
    ["400 with no JSON", 400, "<html>", "invalid"],
    ["400 with a body that is not an object", 400, [1, 2], "invalid"],
    ["400 with an error that is not text", 400, { error: 7 }, "invalid"],
    ["404", 404, {}, "invalid"],
    ["422", 422, { error_code: 1 }, "invalid"],
    ["400 for a costing it lacks", 400, errorUnsupportedCosting, "unsupported"],
    [
      "400 saying costing",
      400,
      { error: "Unknown costing model" },
      "unsupported",
    ],
  ];

  it.each(CASES)(
    "maps HTTP %s to %s for a route and for an area",
    async (_name, status, body, kind) => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(typeof body === "string" ? body : JSON.stringify(body), {
            status,
          }),
        ),
      );
      const provider = new ValhallaRoutingProvider({
        fetch: fetchMock,
        minIntervalMs: 0,
      });
      expect(
        await failureKind(
          provider.route({ stops: [PARIS, LYON], mode: "walk" }),
        ),
      ).toBe(kind);
      expect(
        await failureKind(
          provider.reachableArea({ origin: NAIROBI, minutes: 5, mode: "walk" }),
        ),
      ).toBe(kind);
    },
  );

  it("maps a fetch that throws, when it was not an abort, to network", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("boom"));
    const provider = new ValhallaRoutingProvider({
      fetch: fetchMock,
      minIntervalMs: 0,
    });
    expect(
      await failureKind(provider.route({ stops: [PARIS, LYON], mode: "walk" })),
    ).toBe("network");
  });

  it("maps an abort error from fetch to aborted even without a signal", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException("aborted", "AbortError"));
    const provider = new ValhallaRoutingProvider({
      fetch: fetchMock,
      minIntervalMs: 0,
    });
    expect(
      await failureKind(provider.route({ stops: [PARIS, LYON], mode: "walk" })),
    ).toBe("aborted");
  });

  it("maps a body that fails to read, when it was not an abort, to network", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new TypeError("stream failed")),
    });
    const provider = new ValhallaRoutingProvider({
      fetch: fetchMock,
      minIntervalMs: 0,
    });
    expect(
      await failureKind(provider.route({ stops: [PARIS, LYON], mode: "walk" })),
    ).toBe("network");
  });
});

describe("ValhallaRoutingProvider cancellation", () => {
  it("makes no request when the signal has already fired", async () => {
    const { scripted, provider } = setup();
    const signal = AbortSignal.abort();
    expect(
      await failureKind(
        provider.route({ stops: [PARIS, LYON], mode: "walk", signal }),
      ),
    ).toBe("aborted");
    expect(
      await failureKind(
        provider.reachableArea({
          origin: NAIROBI,
          minutes: 5,
          mode: "walk",
          signal,
        }),
      ),
    ).toBe("aborted");
    expect(scripted.fetchMock).not.toHaveBeenCalled();
  });

  it("abandons a queued request without sending it when its signal fires", async () => {
    vi.useFakeTimers();
    try {
      const { scripted, provider } = setup({ minIntervalMs: 1000 });
      await provider.route({ stops: [PARIS, LYON], mode: "walk" });
      const controller = new AbortController();
      const queued = provider
        .route({
          stops: [PARIS, LYON],
          mode: "walk",
          signal: controller.signal,
        })
        .catch((error: unknown) => error);
      controller.abort();
      await vi.advanceTimersByTimeAsync(1000);
      const error = await queued;
      expect(error).toBeInstanceOf(RoutingError);
      expect((error as RoutingError).kind).toBe("aborted");
      expect(scripted.fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects as aborted when the signal fires during the request", async () => {
    const { scripted, provider } = setup();
    scripted.setScript({ kind: "hold" });
    const controller = new AbortController();
    const pending = provider.reachableArea({
      origin: NAIROBI,
      minutes: 5,
      mode: "walk",
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(scripted.fetchMock).toHaveBeenCalled());
    controller.abort();
    expect(await failureKind(pending)).toBe("aborted");
  });

  it("rejects as aborted when the signal fires while the body is read", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => {
        controller.abort();
        return Promise.reject(new DOMException("aborted", "AbortError"));
      },
    });
    const provider = new ValhallaRoutingProvider({
      fetch: fetchMock,
      minIntervalMs: 0,
    });
    expect(
      await failureKind(
        provider.route({
          stops: [PARIS, LYON],
          mode: "walk",
          signal: controller.signal,
        }),
      ),
    ).toBe("aborted");
  });

  it("rejects as aborted when the signal fires while an error body is read", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => {
        controller.abort();
        return Promise.reject(new DOMException("aborted", "AbortError"));
      },
    });
    const provider = new ValhallaRoutingProvider({
      fetch: fetchMock,
      minIntervalMs: 0,
    });
    expect(
      await failureKind(
        provider.route({
          stops: [PARIS, LYON],
          mode: "walk",
          signal: controller.signal,
        }),
      ),
    ).toBe("aborted");
  });
});

describe("ValhallaRoutingProvider request spacing", () => {
  it("starts requests at least a second apart by default, routes and areas alike", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockImplementation((input: RequestInfo | URL) =>
          Promise.resolve(
            jsonResponse(
              String(input).includes("/isochrone")
                ? isochronePolygon
                : routeParisLyon,
            ),
          ),
        );
      const provider = new ValhallaRoutingProvider({ fetch: fetchMock });
      const starts: number[] = [];
      fetchMock.mockImplementationOnce(() => {
        starts.push(Date.now());
        return Promise.resolve(jsonResponse(routeParisLyon));
      });
      fetchMock.mockImplementationOnce(() => {
        starts.push(Date.now());
        return Promise.resolve(jsonResponse(isochronePolygon));
      });

      void provider.route({ stops: [PARIS, LYON], mode: "drive" });
      void provider.reachableArea({
        origin: NAIROBI,
        minutes: 5,
        mode: "walk",
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(starts).toHaveLength(2);
      expect(
        (starts[1] as number) - (starts[0] as number),
      ).toBeGreaterThanOrEqual(1000);
    } finally {
      vi.useRealTimers();
    }
  });
});
