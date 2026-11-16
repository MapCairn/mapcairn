// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { Position } from "./predicates.js";
import { orientation } from "./predicates.js";
import {
  findRingIntersections,
  findSegmentIntersections,
  type Intersection,
  type IntersectionKind,
  type Segment,
} from "./sweep.js";

type Point = readonly [number, number];

interface Contact {
  readonly kind: IntersectionKind;
  readonly point: Point;
}

const NUMBER_OF_RUNS = 400;
/** A quadratic sweep of 200,000 edges would take minutes; this leaves room for coverage and a busy machine. */
const SCALE_BUDGET_MS = 30_000;
const SCALE_VERTICES = 200_000;
const CROSS_DIGITS = 6;
const MIN_MAGNITUDE = 1e-100;
const TEST_TIMEOUT_MS = 60_000;

const COMB_LENGTH = 50;

vi.setConfig({ testTimeout: TEST_TIMEOUT_MS });

/** CPU time used by this process, so a busy machine does not fail a timing check. */
function cpuMilliseconds(): number {
  const usage = process.cpuUsage();
  return (usage.user + usage.system) / 1000;
}

function seg(ax: number, ay: number, bx: number, by: number): Segment {
  return { start: [ax, ay], end: [bx, by] };
}

function same(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function lexLess(a: Position, b: Position): boolean {
  return (
    (a[0] as number) < (b[0] as number) ||
    (a[0] === b[0] && (a[1] as number) < (b[1] as number))
  );
}

function within(a: Position, b: Position, p: Position): boolean {
  return (
    Math.min(a[0] as number, b[0] as number) <= (p[0] as number) &&
    (p[0] as number) <= Math.max(a[0] as number, b[0] as number) &&
    Math.min(a[1] as number, b[1] as number) <= (p[1] as number) &&
    (p[1] as number) <= Math.max(a[1] as number, b[1] as number)
  );
}

/** Whether `p` is on the segment `a` to `b`, by the oracle's orientation function. */
function onLine(
  orient: Orient,
  a: Position,
  b: Position,
  p: Position,
): boolean {
  return orient(a, b, p) === 0 && within(a, b, p);
}

function ordered(s: Segment): [Position, Position] {
  return lexLess(s.end, s.start) ? [s.end, s.start] : [s.start, s.end];
}

/** The crossing of two lines in ordinary floating point; only used to check rounding of small integer inputs. */
function lineCrossing(s: Segment, t: Segment): Point {
  const [sx, sy] = s.start as [number, number];
  const [ex, ey] = s.end as [number, number];
  const [tx, ty] = t.start as [number, number];
  const [fx, fy] = t.end as [number, number];
  const denominator = (ex - sx) * (fy - ty) - (ey - sy) * (fx - tx);
  const along = ((tx - sx) * (fy - ty) - (ty - sy) * (fx - tx)) / denominator;
  return [sx + along * (ex - sx), sy + along * (ey - sy)];
}

type Orient = (a: Position, b: Position, c: Position) => number;

function touchAt(p: Position): Contact {
  return { kind: "touch", point: [p[0] as number, p[1] as number] };
}

/** How two collinear segments meet, by their ends in sweep order. */
function collinearContact(
  [sa, sb]: [Position, Position],
  [ta, tb]: [Position, Position],
): Contact | undefined {
  const start = lexLess(sa, ta) ? ta : sa;
  const end = lexLess(sb, tb) ? sb : tb;
  if (lexLess(end, start)) {
    return undefined;
  }
  if (same(start, end)) {
    return touchAt(start);
  }
  return { kind: "overlap", point: [start[0] as number, start[1] as number] };
}

/** The end of either segment that lies on the other, if any. */
function endOnOther(
  [sa, sb]: [Position, Position],
  [ta, tb]: [Position, Position],
  orient: Orient,
): Contact | undefined {
  const candidates: [Position, Position, Position][] = [
    [sa, sb, ta],
    [sa, sb, tb],
    [ta, tb, sa],
    [ta, tb, sb],
  ];
  const hit = candidates.find(([a, b, p]) => onLine(orient, a, b, p));
  return hit === undefined ? undefined : touchAt(hit[2]);
}

/**
 * The oracle: whether two segments meet and how, from the textbook case
 * analysis. It is written apart from the code under test and checked against
 * it pair by pair.
 */
function oracleContact(
  s: Segment,
  t: Segment,
  orient: Orient,
): Contact | undefined {
  const [sa, sb] = ordered(s);
  const [ta, tb] = ordered(t);
  if (same(sa, sb) && same(ta, tb)) {
    return same(sa, ta) ? touchAt(sa) : undefined;
  }
  if (same(sa, sb)) {
    return onLine(orient, ta, tb, sa) ? touchAt(sa) : undefined;
  }
  if (same(ta, tb)) {
    return onLine(orient, sa, sb, ta) ? touchAt(ta) : undefined;
  }
  const o1 = orient(sa, sb, ta);
  const o2 = orient(sa, sb, tb);
  if (o1 === 0 && o2 === 0) {
    return collinearContact([sa, sb], [ta, tb]);
  }
  const o3 = orient(ta, tb, sa);
  const o4 = orient(ta, tb, sb);
  if (o1 * o2 < 0 && o3 * o4 < 0) {
    return { kind: "cross", point: lineCrossing(s, t) };
  }
  return endOnOther([sa, sb], [ta, tb], orient);
}

function pairKey(first: number, second: number): string {
  return `${first}-${second}`;
}

function bruteForce(
  segments: readonly Segment[],
  orient: Orient,
): Map<string, Contact> {
  const found = new Map<string, Contact>();
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const contact = oracleContact(
        segments[i] as Segment,
        segments[j] as Segment,
        orient,
      );
      if (contact !== undefined) {
        found.set(pairKey(i, j), contact);
      }
    }
  }
  return found;
}

/** The edges a ring should report, by brute force over the non-degenerate edges. */
function ringOracle(ring: readonly Position[]): Map<string, Contact> {
  const closed =
    ring.length > 1 &&
    same(ring[0] as Position, ring[ring.length - 1] as Position);
  const kept: { segment: Segment; index: number }[] = [];
  for (let index = 0; index + 1 < ring.length; index++) {
    const start = ring[index] as Position;
    const end = ring[index + 1] as Position;
    if (!same(start, end)) {
      kept.push({ segment: { start, end }, index });
    }
  }
  const expected = new Map<string, Contact>();
  for (let i = 0; i < kept.length; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      const a = kept[i] as { segment: Segment; index: number };
      const b = kept[j] as { segment: Segment; index: number };
      const contact = oracleContact(a.segment, b.segment, integerOrient);
      const consecutive =
        j === i + 1 || (closed && i === 0 && j === kept.length - 1);
      if (contact !== undefined && !(contact.kind === "touch" && consecutive)) {
        expected.set(pairKey(a.index, b.index), contact);
      }
    }
  }
  return expected;
}

function integerOrient(a: Position, b: Position, c: Position): number {
  return Math.sign(
    ((b[0] as number) - (a[0] as number)) *
      ((c[1] as number) - (a[1] as number)) -
      ((b[1] as number) - (a[1] as number)) *
        ((c[0] as number) - (a[0] as number)),
  );
}

function toMap(found: readonly Intersection[]): Map<string, Contact> {
  return new Map(
    found.map((entry) => [
      pairKey(entry.first, entry.second),
      { kind: entry.kind, point: entry.point },
    ]),
  );
}

function expectSameContacts(
  actual: Map<string, Contact>,
  expected: Map<string, Contact>,
  exactCrossings: boolean,
): void {
  expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
  for (const [key, want] of expected) {
    const got = actual.get(key) as Contact;
    expect(got.kind, key).toBe(want.kind);
    if (want.kind === "cross" && !exactCrossings) {
      expect(got.point[0], key).toBeCloseTo(want.point[0], 9);
      expect(got.point[1], key).toBeCloseTo(want.point[1], 9);
    } else if (want.kind !== "cross") {
      expect(got.point, key).toEqual(want.point);
    }
  }
}

const integerCoordinate = fc.integer({ min: -3, max: 3 });
const integerSegments = fc.array(
  fc
    .tuple(
      integerCoordinate,
      integerCoordinate,
      integerCoordinate,
      integerCoordinate,
    )
    .map(([ax, ay, bx, by]) => seg(ax, ay, bx, by)),
  { maxLength: 14 },
);

const awkwardCoordinate = fc.constantFrom(
  0,
  0.1,
  0.2,
  0.3,
  0.30000000000000004,
  1 / 3,
  2 / 3,
  0.5,
  0.7,
  1,
);
const awkwardSegments = fc.array(
  fc
    .tuple(
      awkwardCoordinate,
      awkwardCoordinate,
      awkwardCoordinate,
      awkwardCoordinate,
    )
    .map(([ax, ay, bx, by]) => seg(ax, ay, bx, by)),
  { maxLength: 12 },
);

/**
 * Doubles across a wide range, with magnitudes below 1e-100 set to zero:
 * `robust-predicates` is exact only while no product underflows, which no
 * longitude or latitude comes near.
 */
const looseCoordinate = fc
  .double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true })
  .map((value) => (Math.abs(value) < MIN_MAGNITUDE ? 0 : value));
const looseSegments = fc.array(
  fc
    .tuple(looseCoordinate, looseCoordinate, looseCoordinate, looseCoordinate)
    .map(([ax, ay, bx, by]) => seg(ax, ay, bx, by)),
  { maxLength: 10 },
);

describe("findSegmentIntersections against a brute-force oracle", () => {
  it("finds the same pairs, kinds and points on small integer segments", () => {
    fc.assert(
      fc.property(integerSegments, (segments) => {
        const result = findSegmentIntersections(segments);
        expect(result.stopped).toBe(false);
        expectSameContacts(
          toMap(result.intersections),
          bruteForce(segments, integerOrient),
          false,
        );
      }),
      { numRuns: NUMBER_OF_RUNS * 5 },
    );
  });

  it("finds the same pairs on awkward decimal coordinates, where crossings are not representable", () => {
    fc.assert(
      fc.property(awkwardSegments, (segments) => {
        const result = findSegmentIntersections(segments);
        expectSameContacts(
          toMap(result.intersections),
          bruteForce(segments, orientation),
          true,
        );
      }),
      { numRuns: NUMBER_OF_RUNS * 5 },
    );
  });

  it("finds the same pairs on arbitrary doubles", () => {
    fc.assert(
      fc.property(looseSegments, (segments) => {
        const result = findSegmentIntersections(segments);
        expectSameContacts(
          toMap(result.intersections),
          bruteForce(segments, orientation),
          true,
        );
      }),
      { numRuns: NUMBER_OF_RUNS },
    );
  });

  it("reports each pair once, smaller index first", () => {
    fc.assert(
      fc.property(integerSegments, (segments) => {
        const { intersections } = findSegmentIntersections(segments);
        const keys = intersections.map((found) =>
          pairKey(found.first, found.second),
        );
        expect(new Set(keys).size).toBe(keys.length);
        for (const found of intersections) {
          expect(found.first).toBeLessThan(found.second);
        }
      }),
      { numRuns: NUMBER_OF_RUNS },
    );
  });

  it("stops at the limit with pairs the oracle also finds, and says so", () => {
    fc.assert(
      fc.property(
        integerSegments,
        fc.integer({ min: 1, max: 6 }),
        (segments, limit) => {
          const expected = bruteForce(segments, integerOrient);
          const result = findSegmentIntersections(segments, { limit });
          expect(result.intersections).toHaveLength(
            Math.min(limit, expected.size),
          );
          expect(result.stopped).toBe(expected.size >= limit);
          for (const found of result.intersections) {
            const want = expected.get(pairKey(found.first, found.second));
            expect(want?.kind).toBe(found.kind);
          }
        },
      ),
      { numRuns: NUMBER_OF_RUNS * 2 },
    );
  });

  it("still orders every crossing when the caller ignores some pairs", () => {
    fc.assert(
      fc.property(integerSegments, (segments) => {
        const expected = bruteForce(segments, integerOrient);
        const result = findSegmentIntersections(segments, {
          ignore: (first, second) => (first + second) % 2 === 0,
        });
        const wanted = new Map(
          [...expected].filter(([key]) => {
            const [first, second] = key.split("-").map(Number) as [
              number,
              number,
            ];
            return (first + second) % 2 !== 0;
          }),
        );
        expectSameContacts(toMap(result.intersections), wanted, false);
      }),
      { numRuns: NUMBER_OF_RUNS },
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(integerSegments, (segments) => {
        expect(findSegmentIntersections(segments)).toEqual(
          findSegmentIntersections(segments),
        );
      }),
      { numRuns: NUMBER_OF_RUNS },
    );
  });

  it("finds every crossing of a grid", () => {
    const lines = 18;
    const segments: Segment[] = [];
    for (let i = 0; i < lines; i++) {
      segments.push(seg(-1, i * 2, lines * 2, i * 2 + 1));
      segments.push(seg(i * 2 + 1, -1, i * 2, lines * 2));
    }
    const result = findSegmentIntersections(segments);
    expectSameContacts(
      toMap(result.intersections),
      bruteForce(segments, orientation),
      true,
    );
  });
});

describe("findSegmentIntersections on named cases", () => {
  function contactsOf(segments: readonly Segment[]): Contact[] {
    return findSegmentIntersections(segments).intersections.map(
      ({ kind, point }) => ({ kind, point }),
    );
  }

  it("finds nothing among no segments, one segment or separate segments", () => {
    expect(contactsOf([])).toEqual([]);
    expect(contactsOf([seg(0, 0, 1, 1)])).toEqual([]);
    expect(contactsOf([seg(0, 0, 1, 0), seg(0, 1, 1, 1)])).toEqual([]);
  });

  it("finds a proper crossing, whichever way the segments are written", () => {
    const expected = [{ kind: "cross", point: [5, 5] }];
    expect(contactsOf([seg(0, 0, 10, 10), seg(0, 10, 10, 0)])).toEqual(
      expected,
    );
    expect(contactsOf([seg(10, 10, 0, 0), seg(10, 0, 0, 10)])).toEqual(
      expected,
    );
  });

  it("rounds a crossing to the nearest double", () => {
    const [found] = findSegmentIntersections([
      seg(0, 0, 3, 1),
      seg(0, 1, 3, 0),
    ]).intersections;
    expect(found?.kind).toBe("cross");
    expect(found?.point[0]).toBe(1.5);
    expect(found?.point[1]).toBe(0.5);
    const [thirds] = findSegmentIntersections([
      seg(0, 0, 1, 1),
      seg(0, 1, 1 / 3, 0),
    ]).intersections;
    expect(thirds?.point[0]).toBeCloseTo(0.25, 12);
  });

  it("finds a vertical segment crossed by a horizontal one", () => {
    expect(contactsOf([seg(0, 0, 0, 10), seg(-5, 3, 5, 3)])).toEqual([
      { kind: "cross", point: [0, 3] },
    ]);
  });

  it("finds two vertical segments on one line overlapping, and touching", () => {
    expect(contactsOf([seg(0, 0, 0, 10), seg(0, 4, 0, 14)])).toEqual([
      { kind: "overlap", point: [0, 4] },
    ]);
    expect(contactsOf([seg(0, 0, 0, 4), seg(0, 4, 0, 14)])).toEqual([
      { kind: "touch", point: [0, 4] },
    ]);
    expect(contactsOf([seg(0, 0, 0, 3), seg(0, 4, 0, 14)])).toEqual([]);
  });

  it("finds segments that share an end", () => {
    expect(contactsOf([seg(0, 0, 4, 4), seg(4, 4, 8, 0)])).toEqual([
      { kind: "touch", point: [4, 4] },
    ]);
    expect(contactsOf([seg(0, 0, 4, 4), seg(0, 0, 4, -4)])).toEqual([
      { kind: "touch", point: [0, 0] },
    ]);
  });

  it("finds an end on the inside of another segment", () => {
    expect(contactsOf([seg(0, 0, 10, 0), seg(5, 0, 5, 5)])).toEqual([
      { kind: "touch", point: [5, 0] },
    ]);
    expect(contactsOf([seg(0, 0, 10, 0), seg(5, 5, 5, 0)])).toEqual([
      { kind: "touch", point: [5, 0] },
    ]);
  });

  it("finds collinear segments that overlap, containing, touching and apart", () => {
    expect(contactsOf([seg(0, 0, 10, 0), seg(4, 0, 6, 0)])).toEqual([
      { kind: "overlap", point: [4, 0] },
    ]);
    expect(contactsOf([seg(0, 0, 10, 0), seg(5, 0, 15, 0)])).toEqual([
      { kind: "overlap", point: [5, 0] },
    ]);
    expect(contactsOf([seg(0, 0, 5, 5), seg(5, 5, 9, 9)])).toEqual([
      { kind: "touch", point: [5, 5] },
    ]);
    expect(contactsOf([seg(0, 0, 4, 4), seg(5, 5, 9, 9)])).toEqual([]);
    expect(contactsOf([seg(0, 0, 4, 4), seg(0, 0, 4, 4)])).toEqual([
      { kind: "overlap", point: [0, 0] },
    ]);
  });

  it("reports every pair of three collinear overlapping segments", () => {
    const found = findSegmentIntersections([
      seg(0, 0, 10, 0),
      seg(2, 0, 8, 0),
      seg(4, 0, 12, 0),
    ]).intersections;
    expect(
      found.map(({ first, second }) => pairKey(first, second)).sort(),
    ).toEqual(["0-1", "0-2", "1-2"]);
    expect(found.every(({ kind }) => kind === "overlap")).toBe(true);
  });

  it("reports every pair among segments through one point", () => {
    const spokes = [
      seg(-5, -5, 5, 5),
      seg(-5, 5, 5, -5),
      seg(-5, 0, 5, 0),
      seg(0, -5, 0, 5),
    ];
    const found = findSegmentIntersections(spokes).intersections;
    expect(found).toHaveLength(6);
    expect(found.every(({ point }) => point[0] === 0 && point[1] === 0)).toBe(
      true,
    );
  });

  it("reports every pair among segments that all end at one point", () => {
    const found = findSegmentIntersections([
      seg(-4, 1, 0, 0),
      seg(-4, -1, 0, 0),
      seg(-4, 3, 0, 0),
      seg(-4, -3, 0, 0),
    ]).intersections;
    expect(found).toHaveLength(6);
    expect(found.every(({ kind }) => kind === "touch")).toBe(true);
  });

  it("orders a crossing that falls exactly on another segment's end", () => {
    const found = findSegmentIntersections([
      seg(0, 0, 6, 6),
      seg(0, 6, 6, 0),
      seg(3, 3, 3, 9),
    ]).intersections;
    expect(
      found.map(({ first, second }) => pairKey(first, second)).sort(),
    ).toEqual(["0-1", "0-2", "1-2"]);
  });

  it("treats a segment of zero length as a point", () => {
    expect(contactsOf([seg(2, 2, 2, 2), seg(0, 0, 4, 4)])).toEqual([
      { kind: "touch", point: [2, 2] },
    ]);
    expect(contactsOf([seg(0, 0, 4, 4), seg(2, 2, 2, 2)])).toEqual([
      { kind: "touch", point: [2, 2] },
    ]);
    expect(contactsOf([seg(2, 3, 2, 3), seg(0, 0, 4, 4)])).toEqual([]);
    expect(contactsOf([seg(2, 2, 2, 2), seg(2, 2, 2, 2)])).toEqual([
      { kind: "touch", point: [2, 2] },
    ]);
    expect(contactsOf([seg(2, 2, 2, 2), seg(3, 3, 3, 3)])).toEqual([]);
  });

  it("is exact where a floating-point test would call near-parallel segments parallel", () => {
    const tiny = 2 ** -52;
    expect(contactsOf([seg(0, 0, 1, 1), seg(0, tiny, 1, 1 + tiny)])).toEqual(
      [],
    );
    const found = contactsOf([seg(0, 0, 1, 1), seg(0, tiny, 1, 1 - tiny)]);
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe("cross");
  });

  it("limits what it reports and says whether it stopped", () => {
    const spokes = [seg(-1, -1, 1, 1), seg(-1, 1, 1, -1), seg(-1, 0, 1, 0)];
    expect(findSegmentIntersections(spokes, { limit: 2 })).toMatchObject({
      stopped: true,
    });
    expect(
      findSegmentIntersections(spokes, { limit: 2 }).intersections,
    ).toHaveLength(2);
    expect(findSegmentIntersections(spokes, { limit: 4 }).stopped).toBe(false);
    expect(findSegmentIntersections(spokes, { limit: 0 })).toEqual({
      intersections: [],
      stopped: true,
    });
  });
});

describe("findRingIntersections", () => {
  const square: Position[] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
    [0, 0],
  ];

  it("finds nothing in a simple ring, with or without altitude", () => {
    expect(findRingIntersections(square).intersections).toEqual([]);
    expect(
      findRingIntersections(square.map((position) => [...position, 100]))
        .intersections,
    ).toEqual([]);
  });

  it("finds nothing in a ring of fewer than two positions", () => {
    expect(findRingIntersections([])).toEqual({
      intersections: [],
      stopped: false,
    });
    expect(findRingIntersections([[1, 1]]).intersections).toEqual([]);
  });

  it("finds a bow-tie's crossing and names its edges", () => {
    const bowTie: Position[] = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
      [0, 0],
    ];
    expect(findRingIntersections(bowTie).intersections).toEqual([
      { first: 0, second: 2, kind: "cross", point: [5, 5] },
    ]);
  });

  it("does not report a repeated position, however often it repeats", () => {
    const repeated: Position[] = [
      [0, 0],
      [0, 0],
      [4, 0],
      [4, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 4],
      [0, 0],
    ];
    expect(findRingIntersections(repeated).intersections).toEqual([]);
  });

  it("reports a ring that touches itself at a vertex", () => {
    const pinched: Position[] = [
      [0, 0],
      [4, 0],
      [2, 2],
      [4, 4],
      [0, 4],
      [2, 2],
      [0, 0],
    ];
    const found = findRingIntersections(pinched).intersections;
    expect(
      found.map(({ first, second }) => pairKey(first, second)).sort(),
    ).toEqual(["1-4", "1-5", "2-4", "2-5"]);
    expect(found.every(({ kind }) => kind === "touch")).toBe(true);
  });

  it("reports a vertex that lies on another edge", () => {
    const ring: Position[] = [
      [0, 0],
      [8, 0],
      [8, 8],
      [4, 0],
      [4, -4],
      [0, -4],
      [0, 0],
    ];
    const found = findRingIntersections(ring).intersections;
    expect(found).toEqual([
      { first: 0, second: 3, kind: "touch", point: [4, 0] },
      { first: 0, second: 2, kind: "touch", point: [4, 0] },
    ]);
  });

  it("reports a spike, where two consecutive edges double back", () => {
    const spike: Position[] = [
      [0, 0],
      [8, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ];
    const found = findRingIntersections(spike).intersections;
    expect(found).toContainEqual({
      first: 0,
      second: 1,
      kind: "overlap",
      point: [4, 0],
    });
    expect(found.filter(({ kind }) => kind === "overlap")).toHaveLength(1);
  });

  it("treats the last and first edges of a closed ring as consecutive, but not those of an open one", () => {
    const open: Position[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ];
    expect(findRingIntersections(open.slice(0, 4)).intersections).toEqual([]);
    const shared: Position[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 0],
    ];
    expect(findRingIntersections(shared).intersections).toEqual([]);
    const touching: Position[] = [
      [0, 0],
      [4, 4],
      [4, 0],
      [2, 2],
    ];
    expect(findRingIntersections(touching).intersections).toEqual([
      { first: 0, second: 2, kind: "touch", point: [2, 2] },
    ]);
  });

  it("agrees with an oracle on random closed and open rings of integers", () => {
    const position = fc.tuple(
      fc.integer({ min: -2, max: 2 }),
      fc.integer({ min: -2, max: 2 }),
    );
    fc.assert(
      fc.property(
        fc.array(position, { minLength: 2, maxLength: 9 }),
        fc.boolean(),
        (positions, close) => {
          const ring: Position[] = close
            ? [...positions, positions[0] as Position]
            : positions;
          const expected = ringOracle(ring);
          const result = findRingIntersections(ring);
          expectSameContacts(toMap(result.intersections), expected, false);
        },
      ),
      { numRuns: NUMBER_OF_RUNS * 3 },
    );
  });

  it("stops at the limit", () => {
    const star: Position[] = [];
    for (let i = 0; i < 9; i++) {
      const angle = (i * 4 * Math.PI) / 9;
      star.push([Math.cos(angle), Math.sin(angle)]);
    }
    star.push(star[0] as Position);
    const all = findRingIntersections(star);
    expect(all.stopped).toBe(false);
    expect(all.intersections.length).toBeGreaterThan(3);
    const limited = findRingIntersections(star, { limit: 3 });
    expect(limited.stopped).toBe(true);
    expect(limited.intersections).toHaveLength(3);
  });

  describe("with a kind asked for", () => {
    // Edge 0 to 1 runs up the line x = 0 three times, then the ring crosses itself at 0.5, 0.5.
    const ring: Position[] = [
      [0, 0],
      [0, 1],
      [0, 0],
      [0, 1],
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [0, 0],
    ];

    it("reports only that kind", () => {
      const all = findRingIntersections(ring);
      expect(new Set(all.intersections.map((found) => found.kind))).toEqual(
        new Set(["cross", "overlap", "touch"]),
      );
      const crossings = findRingIntersections(ring, { only: "cross" });
      expect(crossings.stopped).toBe(false);
      expect(crossings.intersections).toEqual(
        all.intersections.filter((found) => found.kind === "cross"),
      );
      expect(crossings.intersections).toHaveLength(1);
    });

    it("does not count the other kinds towards the limit", () => {
      const crossings = findRingIntersections(ring, {
        only: "cross",
        limit: 1,
      });
      expect(crossings.intersections).toHaveLength(1);
      expect(crossings.intersections[0]?.point).toEqual([0.5, 0.5]);
    });

    it("finds nothing of a kind the ring does not hold", () => {
      expect(
        findRingIntersections(ring, { only: "touch" }).intersections,
      ).not.toEqual([]);
      const box: Position[] = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ];
      expect(findRingIntersections(box, { only: "cross" })).toEqual({
        intersections: [],
        stopped: false,
      });
    });
  });
});

describe("scaling", () => {
  function circle(count: number): Position[] {
    const ring: Position[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      ring.push([1000 * Math.cos(angle), 1000 * Math.sin(angle)]);
    }
    ring.push(ring[0] as Position);
    return ring;
  }

  /** A comb of thin tines on a spine: simple, with the sweep line crossing every tine at once. */
  function comb(tines: number): Position[] {
    const ring: Position[] = [
      [0, 0],
      [COMB_LENGTH, 0],
      [COMB_LENGTH, 1],
      [1, 1],
    ];
    for (let i = 1; i < tines - 1; i++) {
      ring.push(
        [1, 2 * i],
        [COMB_LENGTH, 2 * i],
        [COMB_LENGTH, 2 * i + 1],
        [1, 2 * i + 1],
      );
    }
    ring.push(
      [1, 2 * (tines - 1)],
      [COMB_LENGTH, 2 * (tines - 1)],
      [COMB_LENGTH, 2 * (tines - 1) + 1],
      [0, 2 * (tines - 1) + 1],
      [0, 0],
    );
    return ring;
  }

  it("finds nothing in a simple 200,000-vertex circle, quickly", () => {
    const ring = circle(SCALE_VERTICES);
    const started = cpuMilliseconds();
    const result = findRingIntersections(ring);
    const elapsed = cpuMilliseconds() - started;
    expect(result.intersections).toEqual([]);
    expect(elapsed).toBeLessThan(SCALE_BUDGET_MS);
  });

  it("finds the one crossing in a 200,000-vertex circle with two vertices swapped", () => {
    const ring = circle(SCALE_VERTICES);
    const at = 77_777;
    const swapped = ring.slice();
    swapped[at] = ring[at + 1] as Position;
    swapped[at + 1] = ring[at] as Position;
    const started = cpuMilliseconds();
    const result = findRingIntersections(swapped);
    const elapsed = cpuMilliseconds() - started;
    expect(result.stopped).toBe(false);
    expect(result.intersections).toHaveLength(1);
    expect(result.intersections[0]).toMatchObject({
      first: at - 1,
      second: at + 1,
      kind: "cross",
    });
    expect(elapsed).toBeLessThan(SCALE_BUDGET_MS);
  });

  it("finds nothing in a simple 200,000-vertex comb whose sweep line holds 100,000 edges", () => {
    const ring = comb(SCALE_VERTICES / 4);
    expect(ring.length).toBeGreaterThanOrEqual(SCALE_VERTICES);
    const started = cpuMilliseconds();
    const result = findRingIntersections(ring);
    const elapsed = cpuMilliseconds() - started;
    expect(result.intersections).toEqual([]);
    expect(elapsed).toBeLessThan(SCALE_BUDGET_MS);
  });

  it("finds the crossings in the comb when one tine is bent across the next", () => {
    const ring = comb(2000);
    const bent = ring.slice();
    bent[6] = [COMB_LENGTH / 2, 4.5];
    const result = findRingIntersections(bent);
    expect(result.intersections.length).toBeGreaterThan(0);
    expect(result.intersections.every(({ kind }) => kind === "cross")).toBe(
      true,
    );
  });

  it("rounds a crossing far from the origin to the nearest double", () => {
    const found = findSegmentIntersections([
      seg(0, 0, 1e6, 1e6 + 1),
      seg(0, 1e6, 1e6, 0),
    ]).intersections[0] as Intersection;
    expect(found.kind).toBe("cross");
    expect(found.point[0]).toBeCloseTo(1e6 / (2 + 1e-6), CROSS_DIGITS);
  });
});
