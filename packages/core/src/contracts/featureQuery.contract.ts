// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { FeatureQueryError, type FeatureQueryErrorKind } from "../ports/errors";
import type {
  FeatureQuery,
  FeatureQueryRequest,
  QueryArea,
  SelectionHit,
} from "../ports/featureQuery";

/** The failures a query can be scripted to report. The others need no script. */
export type ScriptedFeatureQueryFailure = Exclude<
  FeatureQueryErrorKind,
  "aborted"
>;

/**
 * How the feature query contract scripts a query. A real adapter implements
 * these by mocking its network layer, typically `fetch`.
 */
export interface FeatureQueryControls {
  /**
   * Makes every later query find exactly these features inside
   * {@link CONTRACT_AREA}, whichever layers they are in. The query itself
   * keeps only the layers it was asked about and the number it was asked for.
   */
  respondWith(hits: readonly SelectionHit[]): void;
  /** Makes every later query fail the way `kind` describes. */
  failWith(kind: ScriptedFeatureQueryFailure): void;
  /** Keeps later queries pending until the returned function is called. */
  hold(): () => void;
}

/** One feature query under test, with its controls. */
export interface FeatureQuerySubject {
  readonly query: FeatureQuery;
  readonly controls: FeatureQueryControls;
}

/** The area every query in the contract asks about: a box around Cape Town. */
export const CONTRACT_AREA: QueryArea = {
  type: "Polygon",
  coordinates: [
    [
      [18.3, -34.0],
      [18.5, -34.0],
      [18.5, -33.8],
      [18.3, -33.8],
      [18.3, -34.0],
    ],
  ],
};

const GAUGES = "gauges";
const BRIDGES = "bridges";

function hit(layerId: string, id: string): SelectionHit {
  return {
    layerId,
    feature: {
      id,
      geometry: { type: "Point", coordinates: [18.4, -33.9] },
      fields: { id, title: `Feature ${id}` },
    },
  };
}

const GAUGE_HITS: readonly SelectionHit[] = ["a", "b", "c"].map((id) =>
  hit(GAUGES, id),
);
const BRIDGE_HITS: readonly SelectionHit[] = ["x", "y"].map((id) =>
  hit(BRIDGES, id),
);
const ALL_HITS: readonly SelectionHit[] = [...GAUGE_HITS, ...BRIDGE_HITS];

const SCRIPTED_FAILURES: readonly ScriptedFeatureQueryFailure[] = [
  "network",
  "invalid",
  "unsupported",
];

const NOT_A_POLYGON = { type: "Point", coordinates: [18.4, -33.9] };
const OPEN_RING = {
  type: "Polygon",
  coordinates: [
    [
      [18.3, -34.0],
      [18.5, -34.0],
      [18.5, -33.8],
      [18.3, -33.8],
    ],
  ],
};
const SHORT_RING = {
  type: "Polygon",
  coordinates: [
    [
      [18.3, -34.0],
      [18.5, -34.0],
      [18.3, -34.0],
    ],
  ],
};
const OFF_THE_GLOBE = {
  type: "Polygon",
  coordinates: [
    [
      [18.3, -34.0],
      [18.5, -34.0],
      [18.5, 91],
      [18.3, 91],
      [18.3, -34.0],
    ],
  ],
};
const INVALID_AREAS: readonly (readonly [string, unknown])[] = [
  ["a point", NOT_A_POLYGON],
  ["a ring that is not closed", OPEN_RING],
  ["a ring of three positions", SHORT_RING],
  ["a position off the globe", OFF_THE_GLOBE],
];

const INVALID_LIMITS: readonly number[] = [
  0,
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
];

async function failure(
  promise: Promise<unknown>,
): Promise<FeatureQueryErrorKind> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(FeatureQueryError);
  return (error as FeatureQueryError).kind;
}

function ask(
  query: FeatureQuery,
  overrides: Partial<FeatureQueryRequest> = {},
): Promise<readonly SelectionHit[]> {
  return query.within({
    area: CONTRACT_AREA,
    layerIds: [GAUGES, BRIDGES],
    limit: 100,
    ...overrides,
  });
}

function keys(hits: readonly SelectionHit[]): string[] {
  return hits.map(({ layerId, feature }) => `${layerId}/${feature.id}`).sort();
}

/**
 * Runs the shared behavioural suite for a {@link FeatureQuery}. Every test
 * calls `create` for a fresh subject.
 */
export function runFeatureQueryContract(
  name: string,
  create: () => FeatureQuerySubject,
): void {
  describe(`FeatureQuery contract: ${name}`, () => {
    it("resolves the features inside, each with its layer id and its feature", async () => {
      const { query, controls } = create();
      controls.respondWith(GAUGE_HITS);
      const hits = await ask(query, { layerIds: [GAUGES] });
      expect(keys(hits)).toEqual(["gauges/a", "gauges/b", "gauges/c"]);
      const first = hits.find(({ feature }) => feature.id === "a");
      expect(first).toEqual(GAUGE_HITS[0]);
    });

    it("resolves no hits, and does not fail, when nothing is inside", async () => {
      const { query, controls } = create();
      controls.respondWith([]);
      expect(await ask(query)).toEqual([]);
    });

    it("returns hits only from the layers it was asked about", async () => {
      const { query, controls } = create();
      controls.respondWith(ALL_HITS);
      expect(keys(await ask(query, { layerIds: [BRIDGES] }))).toEqual([
        "bridges/x",
        "bridges/y",
      ]);
      expect(keys(await ask(query, { layerIds: [GAUGES, BRIDGES] }))).toEqual(
        keys(ALL_HITS),
      );
      expect(await ask(query, { layerIds: ["roads"] })).toEqual([]);
    });

    it("resolves no hits when it is asked about no layers", async () => {
      const { query, controls } = create();
      controls.respondWith(ALL_HITS);
      expect(await ask(query, { layerIds: [] })).toEqual([]);
    });

    it("lists a feature once", async () => {
      const { query, controls } = create();
      controls.respondWith([...GAUGE_HITS, ...GAUGE_HITS]);
      expect(keys(await ask(query))).toEqual([
        "gauges/a",
        "gauges/b",
        "gauges/c",
      ]);
    });

    it("returns exactly limit hits when more lie inside, so one more than the room tells a caller that more exist", async () => {
      const { query, controls } = create();
      controls.respondWith(ALL_HITS);
      for (const limit of [1, 3, 4]) {
        const hits = await ask(query, { limit });
        expect(hits).toHaveLength(limit);
        expect(new Set(keys(hits)).size).toBe(limit);
      }
    });

    it("returns every hit when no more than limit lie inside", async () => {
      const { query, controls } = create();
      controls.respondWith(ALL_HITS);
      expect(keys(await ask(query, { limit: ALL_HITS.length }))).toEqual(
        keys(ALL_HITS),
      );
      expect(keys(await ask(query, { limit: ALL_HITS.length + 1 }))).toEqual(
        keys(ALL_HITS),
      );
    });

    it("counts the limit over the layers it was asked about, not the others", async () => {
      const { query, controls } = create();
      controls.respondWith(ALL_HITS);
      const hits = await ask(query, { layerIds: [BRIDGES], limit: 2 });
      expect(keys(hits)).toEqual(["bridges/x", "bridges/y"]);
    });

    for (const [label, area] of INVALID_AREAS) {
      it(`rejects ${label} as an area as invalid`, async () => {
        const { query, controls } = create();
        controls.respondWith(ALL_HITS);
        expect(await failure(ask(query, { area: area as QueryArea }))).toBe(
          "invalid",
        );
      });
    }

    for (const limit of INVALID_LIMITS) {
      it(`rejects a limit of ${limit} as invalid`, async () => {
        const { query, controls } = create();
        controls.respondWith(ALL_HITS);
        expect(await failure(ask(query, { limit }))).toBe("invalid");
      });
    }

    for (const kind of SCRIPTED_FAILURES) {
      it(`rejects a ${kind} failure with a FeatureQueryError of that kind`, async () => {
        const { query, controls } = create();
        controls.failWith(kind);
        expect(await failure(ask(query))).toBe(kind);
      });
    }

    it("rejects as aborted when the signal has already fired", async () => {
      const { query, controls } = create();
      controls.respondWith(ALL_HITS);
      expect(await failure(ask(query, { signal: AbortSignal.abort() }))).toBe(
        "aborted",
      );
    });

    it("rejects as aborted when the signal fires while the query is pending", async () => {
      const { query, controls } = create();
      controls.respondWith(ALL_HITS);
      const release = controls.hold();
      const controller = new AbortController();
      const pending = ask(query, { signal: controller.signal });
      controller.abort();
      release();
      expect(await failure(pending)).toBe("aborted");
    });

    it("answers a later query after an aborted one", async () => {
      const { query, controls } = create();
      controls.respondWith(GAUGE_HITS);
      const release = controls.hold();
      const controller = new AbortController();
      const aborted = ask(query, { signal: controller.signal });
      controller.abort();
      await failure(aborted);
      release();
      expect(keys(await ask(query, { layerIds: [GAUGES] }))).toEqual([
        "gauges/a",
        "gauges/b",
        "gauges/c",
      ]);
    });
  });
}
