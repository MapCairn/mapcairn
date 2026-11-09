import { describe, expect, it } from "vitest";
import { RoutingError, type RoutingErrorKind } from "../ports/errors";
import type { LatLng } from "../ports/geometry";
import type {
  ReachableAreaResult,
  RouteResult,
  RoutingProvider,
  TravelMode,
} from "../ports/routing";

/** The failures a provider can be scripted to report. The others need no script. */
export type ScriptedRoutingFailure = Exclude<
  RoutingErrorKind,
  "aborted" | "invalid"
>;

/**
 * How the routing contract scripts a provider. A real adapter implements
 * these by mocking its network layer, typically `fetch`.
 */
export interface RoutingProviderControls {
  /** Makes every later `route` answer with this route. */
  willReturnRoute(result: RouteResult): void;
  /** Makes every later `reachableArea` answer with these areas. */
  willReturnArea(result: ReachableAreaResult): void;
  /** Makes every later request fail the way `kind` describes. */
  willFail(kind: ScriptedRoutingFailure): void;
  /** Keeps the next request pending until its signal aborts. */
  hold(): void;
}

/** One routing provider under test, with its controls. */
export interface RoutingProviderSubject {
  readonly provider: RoutingProvider;
  readonly controls: RoutingProviderControls;
}

const PARIS: LatLng = { lat: 48.8566, lng: 2.3522 };
const LYON: LatLng = { lat: 45.764, lng: 4.8357 };
const MARSEILLE: LatLng = { lat: 43.2965, lng: 5.3698 };

const ROUTE: RouteResult = {
  features: [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [2.3522, 48.8566],
          [4.8357, 45.764],
        ],
      },
      properties: { distance: 465000, duration: 16200 },
    },
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [4.8357, 45.764],
          [4.85, 44.9],
          [5.3698, 43.2965],
        ],
      },
      properties: { distance: 315000, duration: 12600 },
    },
  ],
  distance: 780000,
  duration: 28800,
};

const AREA: ReachableAreaResult = {
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [2.33, 48.85],
            [2.37, 48.85],
            [2.37, 48.87],
            [2.33, 48.87],
            [2.33, 48.85],
          ],
        ],
      },
      properties: { minutes: 10 },
    },
  ],
};

const MODES: readonly TravelMode[] = ["drive", "walk", "cycle"];

const SCRIPTED_FAILURES: readonly ScriptedRoutingFailure[] = [
  "network",
  "no-route",
  "rate-limited",
  "unsupported",
];

const NOT_ON_THE_GLOBE: readonly LatLng[] = [
  { lat: Number.NaN, lng: 2 },
  { lat: 48, lng: Number.POSITIVE_INFINITY },
  { lat: 91, lng: 2 },
  { lat: -91, lng: 2 },
  { lat: 48, lng: 181 },
  { lat: 48, lng: -181 },
];

/** The kind of error a promise rejects with, failing the test if it resolves. */
async function failureKind(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(RoutingError);
  return (error as RoutingError).kind;
}

/**
 * Runs the shared behavioural suite for a {@link RoutingProvider}. Every test
 * calls `create` for a fresh subject.
 */
export function runRoutingProviderContract(
  name: string,
  create: () => RoutingProviderSubject,
): void {
  describe(`RoutingProvider contract: ${name}`, () => {
    describe("route", () => {
      it("resolves a line feature for each leg, with a distance and a duration", async () => {
        const { provider, controls } = create();
        controls.willReturnRoute(ROUTE);
        const result = await provider.route({
          stops: [PARIS, LYON, MARSEILLE],
          mode: "walk",
        });
        expect(result.features.length).toBeGreaterThan(0);
        for (const leg of result.features) {
          expect(leg.type).toBe("Feature");
          expect(leg.geometry.type).toBe("LineString");
          expect(leg.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
          for (const position of leg.geometry.coordinates) {
            expect(position).toHaveLength(2);
            expect(Number.isFinite(position[0])).toBe(true);
            expect(Number.isFinite(position[1])).toBe(true);
          }
          expect(Number.isFinite(leg.properties.distance)).toBe(true);
          expect(leg.properties.distance).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(leg.properties.duration)).toBe(true);
          expect(leg.properties.duration).toBeGreaterThanOrEqual(0);
        }
      });

      it("totals the distance in metres and the duration in seconds of its legs", async () => {
        const { provider, controls } = create();
        controls.willReturnRoute(ROUTE);
        const result = await provider.route({
          stops: [PARIS, LYON, MARSEILLE],
          mode: "drive",
        });
        const distance = result.features.reduce(
          (sum, leg) => sum + leg.properties.distance,
          0,
        );
        const duration = result.features.reduce(
          (sum, leg) => sum + leg.properties.duration,
          0,
        );
        expect(result.distance).toBeCloseTo(distance, 3);
        expect(result.duration).toBeCloseTo(duration, 3);
      });

      for (const mode of MODES) {
        it(`answers the ${mode} mode, or rejects it as unsupported`, async () => {
          const { provider, controls } = create();
          controls.willReturnRoute(ROUTE);
          const outcome = await provider
            .route({ stops: [PARIS, MARSEILLE], mode })
            .then(
              () => "resolved",
              (reason: unknown) => reason,
            );
          if (outcome !== "resolved") {
            expect(outcome).toBeInstanceOf(RoutingError);
            expect((outcome as RoutingError).kind).toBe("unsupported");
          }
        });
      }

      it("rejects a mode it does not know as unsupported", async () => {
        const { provider, controls } = create();
        controls.willReturnRoute(ROUTE);
        const kind = await failureKind(
          provider.route({
            stops: [PARIS, MARSEILLE],
            mode: "teleport" as TravelMode,
          }),
        );
        expect(kind).toBe("unsupported");
      });

      it("rejects fewer than two stops as invalid", async () => {
        const { provider, controls } = create();
        controls.willReturnRoute(ROUTE);
        expect(
          await failureKind(provider.route({ stops: [], mode: "walk" })),
        ).toBe("invalid");
        expect(
          await failureKind(provider.route({ stops: [PARIS], mode: "walk" })),
        ).toBe("invalid");
      });

      it("rejects a stop that is not on the globe as invalid", async () => {
        const { provider, controls } = create();
        controls.willReturnRoute(ROUTE);
        for (const bad of NOT_ON_THE_GLOBE) {
          expect(
            await failureKind(
              provider.route({ stops: [PARIS, bad], mode: "walk" }),
            ),
          ).toBe("invalid");
        }
      });

      for (const kind of SCRIPTED_FAILURES) {
        it(`rejects a ${kind} failure with a RoutingError of that kind`, async () => {
          const { provider, controls } = create();
          controls.willFail(kind);
          expect(
            await failureKind(
              provider.route({ stops: [PARIS, MARSEILLE], mode: "walk" }),
            ),
          ).toBe(kind);
        });
      }

      it("rejects as aborted when the signal has already fired", async () => {
        const { provider, controls } = create();
        controls.willReturnRoute(ROUTE);
        expect(
          await failureKind(
            provider.route({
              stops: [PARIS, MARSEILLE],
              mode: "walk",
              signal: AbortSignal.abort(),
            }),
          ),
        ).toBe("aborted");
      });

      it("rejects as aborted when the signal fires mid-request", async () => {
        const { provider, controls } = create();
        controls.hold();
        const controller = new AbortController();
        const pending = provider.route({
          stops: [PARIS, MARSEILLE],
          mode: "walk",
          signal: controller.signal,
        });
        controller.abort();
        expect(await failureKind(pending)).toBe("aborted");
      });
    });

    describe("reachableArea", () => {
      it("resolves polygon features, each with the minutes it covers", async () => {
        const { provider, controls } = create();
        controls.willReturnArea(AREA);
        const result = await provider.reachableArea({
          origin: PARIS,
          minutes: 10,
          mode: "walk",
        });
        expect(result.features.length).toBeGreaterThan(0);
        for (const area of result.features) {
          expect(area.type).toBe("Feature");
          expect(["Polygon", "MultiPolygon"]).toContain(area.geometry.type);
          expect(area.geometry.coordinates.length).toBeGreaterThan(0);
          expect(Number.isFinite(area.properties.minutes)).toBe(true);
          expect(area.properties.minutes).toBeGreaterThan(0);
        }
      });

      for (const mode of MODES) {
        it(`answers the ${mode} mode, or rejects it as unsupported`, async () => {
          const { provider, controls } = create();
          controls.willReturnArea(AREA);
          const outcome = await provider
            .reachableArea({ origin: PARIS, minutes: 10, mode })
            .then(
              () => "resolved",
              (reason: unknown) => reason,
            );
          if (outcome !== "resolved") {
            expect(outcome).toBeInstanceOf(RoutingError);
            expect((outcome as RoutingError).kind).toBe("unsupported");
          }
        });
      }

      it("rejects a mode it does not know as unsupported", async () => {
        const { provider, controls } = create();
        controls.willReturnArea(AREA);
        expect(
          await failureKind(
            provider.reachableArea({
              origin: PARIS,
              minutes: 10,
              mode: "teleport" as TravelMode,
            }),
          ),
        ).toBe("unsupported");
      });

      it("rejects minutes that are not greater than zero as invalid", async () => {
        const { provider, controls } = create();
        controls.willReturnArea(AREA);
        for (const minutes of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
          expect(
            await failureKind(
              provider.reachableArea({ origin: PARIS, minutes, mode: "walk" }),
            ),
          ).toBe("invalid");
        }
      });

      it("rejects an origin that is not on the globe as invalid", async () => {
        const { provider, controls } = create();
        controls.willReturnArea(AREA);
        for (const origin of NOT_ON_THE_GLOBE) {
          expect(
            await failureKind(
              provider.reachableArea({ origin, minutes: 10, mode: "walk" }),
            ),
          ).toBe("invalid");
        }
      });

      for (const kind of SCRIPTED_FAILURES) {
        it(`rejects a ${kind} failure with a RoutingError of that kind`, async () => {
          const { provider, controls } = create();
          controls.willFail(kind);
          expect(
            await failureKind(
              provider.reachableArea({
                origin: PARIS,
                minutes: 10,
                mode: "walk",
              }),
            ),
          ).toBe(kind);
        });
      }

      it("rejects as aborted when the signal has already fired", async () => {
        const { provider, controls } = create();
        controls.willReturnArea(AREA);
        expect(
          await failureKind(
            provider.reachableArea({
              origin: PARIS,
              minutes: 10,
              mode: "walk",
              signal: AbortSignal.abort(),
            }),
          ),
        ).toBe("aborted");
      });

      it("rejects as aborted when the signal fires mid-request", async () => {
        const { provider, controls } = create();
        controls.hold();
        const controller = new AbortController();
        const pending = provider.reachableArea({
          origin: PARIS,
          minutes: 10,
          mode: "walk",
          signal: controller.signal,
        });
        controller.abort();
        expect(await failureKind(pending)).toBe("aborted");
      });
    });
  });
}
