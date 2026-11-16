// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors

import type { Position } from "./predicates.js";
import { onSegment, orientation, samePosition } from "./predicates.js";

/**
 * How two segments meet: `cross` at a point inside both, `touch` where an end
 * of one lies on the other (or the two ends meet), `overlap` along a stretch of
 * a shared line.
 */
export type IntersectionKind = "cross" | "touch" | "overlap";

/** A line segment between two positions. Which end is first does not matter. */
export interface Segment {
  readonly start: Position;
  readonly end: Position;
}

/** One pair of segments that meet, and where they first do. */
export interface Intersection {
  /** The smaller of the two segment indices. */
  readonly first: number;
  /** The larger of the two segment indices. */
  readonly second: number;
  readonly kind: IntersectionKind;
  /**
   * Longitude and latitude of the meeting. Exact for `touch` and `overlap` (an
   * input position, or the start of the shared stretch). For `cross` it is the
   * crossing rounded to the nearest double and kept inside both segments'
   * bounding boxes.
   */
  readonly point: readonly [number, number];
}

/** What a sweep reports when asked to stop early, and how to filter pairs. */
export interface SweepOptions {
  /**
   * Stops as soon as this many intersections have been reported. The default
   * is no limit. A caller that wants `n` and to know whether more exist asks
   * for `n + 1`.
   */
  readonly limit?: number;
  /**
   * Whether to leave a pair out of the report. It is called for pairs that
   * meet, possibly more than once for the same pair, so it must depend only on
   * its arguments. An ignored pair still takes part in the sweep, so crossings
   * the caller does not want are still processed in order.
   */
  readonly ignore?: (
    first: number,
    second: number,
    kind: IntersectionKind,
  ) => boolean;
}

/** The outcome of a sweep. */
export interface SweepResult {
  /** The pairs found, in the order the sweep found them. */
  readonly intersections: readonly Intersection[];
  /** Whether the sweep stopped at `limit`, so that more pairs may exist. */
  readonly stopped: boolean;
}

/** A ring's intersections, with edge `i` running from `ring[i]` to `ring[i + 1]`. */
export interface RingIntersection {
  /** The smaller of the two edge indices. */
  readonly first: number;
  /** The larger of the two edge indices. */
  readonly second: number;
  readonly kind: IntersectionKind;
  readonly point: readonly [number, number];
}

/** The outcome of a sweep over a ring's edges. */
export interface RingSweepResult {
  readonly intersections: readonly RingIntersection[];
  readonly stopped: boolean;
}

/** An intersection point that is exact: an integer multiple of 2^-1074 over a positive denominator. */
interface Rational {
  readonly x: bigint;
  readonly y: bigint;
  readonly d: bigint;
}

/**
 * A place in the sweep. An input position (`exact` undefined) is exact. A
 * crossing is a rational point, and its `position` is only the nearest double,
 * good for ordering unless two points are nearly equal.
 */
interface SweepPoint {
  readonly position: Position;
  readonly exact: Rational | undefined;
}

/** The facts the sweep keeps about two segments that meet. */
interface Contact {
  readonly kind: IntersectionKind;
  readonly point: readonly [number, number];
  /** Set for a `cross`, so the sweep can schedule it. */
  readonly crossing: SweepPoint | undefined;
}

interface ScaledEdge {
  readonly lx: bigint;
  readonly ly: bigint;
  readonly rx: bigint;
  readonly ry: bigint;
}

/** A segment with its ends in sweep order: left to right, and bottom to top when vertical. */
interface Edge {
  readonly id: number;
  readonly left: Position;
  readonly right: Position;
  scaled: ScaledEdge | undefined;
}

interface TreapNode {
  readonly id: number;
  readonly priority: number;
  left: TreapNode | undefined;
  right: TreapNode | undefined;
}

interface Group {
  readonly position: Position;
  readonly starts: number[];
}

type Sign = -1 | 0 | 1;

/** Relative gap beyond which two nearly equal doubles are trusted to be in the order they show. */
const FILTER_RELATIVE = 1e-9;
/** Absolute gap beyond which the same holds near zero, where doubles lose relative precision. */
const FILTER_ABSOLUTE = 1e-250;
/** Every finite double is an integer multiple of 2^-1074; this is the exponent of that unit. */
const UNIT_EXPONENT = 1074;
const FRACTION_BITS = 52n;
const EXPONENT_MASK = 0x7ffn;
const SIGN_SHIFT = 63n;
const FRACTION_MASK = (1n << FRACTION_BITS) - 1n;
const HIDDEN_BIT = 1n << FRACTION_BITS;
/** Bits kept of a big integer when it is turned back into a double. */
const SIGNIFICANT_BITS = 64;
/** A left shift large enough that normalising a big integer never shifts by a negative amount. */
const NORMALISE_SHIFT = 4096;
const INITIAL_SEED = 0x9e3779b9;
const XORSHIFT_LEFT_FIRST = 13;
const XORSHIFT_RIGHT = 17;
const XORSHIFT_LEFT_SECOND = 5;
const FLOAT64_BYTES = 8;
const BITS_BASE = 2;

const view = new DataView(new ArrayBuffer(FLOAT64_BYTES));

function xOf(position: Position): number {
  return position[0] as number;
}

function yOf(position: Position): number {
  return position[1] as number;
}

function compareNumbers(a: number, b: number): Sign {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** Sweep order: by longitude, then by latitude. Exact for doubles. */
function compareLexicographic(a: Position, b: Position): Sign {
  const byX = compareNumbers(xOf(a), xOf(b));
  return byX !== 0 ? byX : compareNumbers(yOf(a), yOf(b));
}

function bigSign(value: bigint): Sign {
  if (value === 0n) {
    return 0;
  }
  return value < 0n ? -1 : 1;
}

/** A double as an exact integer count of 2^-1074. */
function scaled(value: number): bigint {
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> FRACTION_BITS) & EXPONENT_MASK);
  const fraction = bits & FRACTION_MASK;
  const mantissa = exponent === 0 ? fraction : fraction | HIDDEN_BIT;
  const magnitude = mantissa << BigInt(Math.max(exponent, 1) - 1);
  return bits >> SIGN_SHIFT === 1n ? -magnitude : magnitude;
}

/** How many bits a positive big integer takes. */
function bitLength(value: bigint): number {
  return value.toString(BITS_BASE).length;
}

/**
 * The double nearest to `(numerator / denominator) * 2^-1074`, for a positive
 * denominator. Both numbers are cut to their top 64 bits first, so the answer
 * is within a few units in the last place and never overflows on the way.
 */
function scaledRatio(numerator: bigint, denominator: bigint): number {
  if (numerator === 0n) {
    return 0;
  }
  const magnitude = numerator < 0n ? -numerator : numerator;
  const numeratorDrop = bitLength(magnitude) - SIGNIFICANT_BITS;
  const denominatorDrop = bitLength(denominator) - SIGNIFICANT_BITS;
  const shiftedNumerator =
    (magnitude << BigInt(NORMALISE_SHIFT)) >>
    BigInt(NORMALISE_SHIFT + numeratorDrop);
  const shiftedDenominator =
    (denominator << BigInt(NORMALISE_SHIFT)) >>
    BigInt(NORMALISE_SHIFT + denominatorDrop);
  const exponent = numeratorDrop - denominatorDrop - UNIT_EXPONENT;
  const half = exponent >> 1;
  const ratio = Number(shiftedNumerator) / Number(shiftedDenominator);
  const result = ratio * 2 ** half * 2 ** (exponent - half);
  return numerator < 0n ? -result : result;
}

function scaledEdge(edge: Edge): ScaledEdge {
  edge.scaled ??= {
    lx: scaled(xOf(edge.left)),
    ly: scaled(yOf(edge.left)),
    rx: scaled(xOf(edge.right)),
    ry: scaled(yOf(edge.right)),
  };
  return edge.scaled;
}

function rationalOf(point: SweepPoint): Rational {
  return (
    point.exact ?? {
      x: scaled(xOf(point.position)),
      y: scaled(yOf(point.position)),
      d: 1n,
    }
  );
}

/**
 * Orders two points on one axis. Doubles that differ clearly decide it, and
 * anything closer is settled by exact integer arithmetic, so the order is
 * always the true one. The sweep compares a crossing with a position or with
 * another crossing, never two positions, so the exact path is the common one
 * only when a crossing falls on a position.
 */
function compareAxis(p: SweepPoint, q: SweepPoint, axis: 0 | 1): Sign {
  const a = p.position[axis] as number;
  const b = q.position[axis] as number;
  const clear = FILTER_RELATIVE * (Math.abs(a) + Math.abs(b)) + FILTER_ABSOLUTE;
  if (Math.abs(a - b) > clear) {
    return compareNumbers(a, b);
  }
  const r = rationalOf(p);
  const s = rationalOf(q);
  const left = (axis === 0 ? r.x : r.y) * s.d;
  const right = (axis === 0 ? s.x : s.y) * r.d;
  return bigSign(left - right);
}

/** Sweep order of two points, exactly. */
function comparePoints(p: SweepPoint, q: SweepPoint): Sign {
  const byX = compareAxis(p, q, 0);
  return byX !== 0 ? byX : compareAxis(p, q, 1);
}

/**
 * Which side of an edge a point is on, exactly: 1 when the point is above the
 * edge (to the left of it, going left to right), -1 below, 0 on its line.
 */
function sideOf(edge: Edge, point: SweepPoint): Sign {
  if (point.exact === undefined) {
    return orientation(edge.left, edge.right, point.position);
  }
  const e = scaledEdge(edge);
  const { x, y, d } = point.exact;
  return bigSign(
    (e.rx - e.lx) * (y - e.ly * d) - (e.ry - e.ly) * (x - e.lx * d),
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** The single point where two edges cross in their interiors, exactly, and as a double. */
function crossingOf(s: Edge, t: Edge): Contact {
  const a = scaledEdge(s);
  const b = scaledEdge(t);
  const sx = a.rx - a.lx;
  const sy = a.ry - a.ly;
  const tx = b.rx - b.lx;
  const ty = b.ry - b.ly;
  let denominator = sx * ty - sy * tx;
  const along = (b.lx - a.lx) * ty - (b.ly - a.ly) * tx;
  let x = a.lx * denominator + sx * along;
  let y = a.ly * denominator + sy * along;
  if (denominator < 0n) {
    denominator = -denominator;
    x = -x;
    y = -y;
  }
  const point: [number, number] = [
    clamp(
      scaledRatio(x, denominator),
      Math.max(xOf(s.left), xOf(t.left)),
      Math.min(xOf(s.right), xOf(t.right)),
    ),
    clamp(
      scaledRatio(y, denominator),
      Math.max(
        Math.min(yOf(s.left), yOf(s.right)),
        Math.min(yOf(t.left), yOf(t.right)),
      ),
      Math.min(
        Math.max(yOf(s.left), yOf(s.right)),
        Math.max(yOf(t.left), yOf(t.right)),
      ),
    ),
  ];
  return {
    kind: "cross",
    point,
    crossing: {
      position: point,
      exact: { x, y, d: denominator },
    },
  };
}

function touchAt(position: Position): Contact {
  return {
    kind: "touch",
    point: [xOf(position), yOf(position)],
    crossing: undefined,
  };
}

/**
 * How two collinear, non-degenerate edges meet, by comparing their ends along
 * the line. The sweep only asks about edges that share a point or lie side by
 * side across the sweep line, so they never lie apart.
 */
function collinearContact(s: Edge, t: Edge): Contact | undefined {
  const start = compareLexicographic(s.left, t.left) >= 0 ? s.left : t.left;
  const end = compareLexicographic(s.right, t.right) <= 0 ? s.right : t.right;
  if (compareLexicographic(start, end) === 0) {
    return touchAt(start);
  }
  return {
    kind: "overlap",
    point: [xOf(start), yOf(start)],
    crossing: undefined,
  };
}

/** The first end of `t` or `s` that lies on the other edge, if there is one. */
function touchContact(s: Edge, t: Edge): Contact | undefined {
  if (onSegment(s.left, s.right, t.left)) {
    return touchAt(t.left);
  }
  if (onSegment(s.left, s.right, t.right)) {
    return touchAt(t.right);
  }
  if (onSegment(t.left, t.right, s.left)) {
    return touchAt(s.left);
  }
  if (onSegment(t.left, t.right, s.right)) {
    return touchAt(s.right);
  }
  return undefined;
}

function isPoint(edge: Edge): boolean {
  return samePosition(edge.left, edge.right);
}

/**
 * Decides, with exact predicates only, whether two edges meet and how. Nothing
 * here compares floating-point intersection coordinates.
 *
 * The sweep only asks about edges that share a point or lie side by side across
 * the sweep line. A zero-length edge is only ever asked about at its own point,
 * where every edge in the group passes through it. Once the edges are known not
 * to lie wholly on one side of each other, and neither has an end on the other,
 * they cross in both interiors.
 */
function classify(s: Edge, t: Edge): Contact | undefined {
  if (isPoint(s)) {
    return touchAt(s.left);
  }
  if (isPoint(t)) {
    return touchAt(t.left);
  }
  const t1 = orientation(s.left, s.right, t.left);
  const t2 = orientation(s.left, s.right, t.right);
  if (t1 !== 0 && t1 === t2) {
    return undefined;
  }
  const s1 = orientation(t.left, t.right, s.left);
  const s2 = orientation(t.left, t.right, s.right);
  if (s1 !== 0 && s1 === s2) {
    return undefined;
  }
  if (t1 === 0 && t2 === 0) {
    return collinearContact(s, t);
  }
  return touchContact(s, t) ?? crossingOf(s, t);
}

/** A binary min-heap. */
class MinHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    const items = this.items;
    let index = items.length;
    items.push(item);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(items[parent] as T, item) <= 0) {
        break;
      }
      items[index] = items[parent] as T;
      index = parent;
    }
    items[index] = item;
  }

  pop(): void {
    const items = this.items;
    const last = items.pop() as T;
    if (items.length === 0) {
      return;
    }
    let index = 0;
    for (;;) {
      let child = 2 * index + 1;
      if (child >= items.length) {
        break;
      }
      if (
        child + 1 < items.length &&
        this.compare(items[child + 1] as T, items[child] as T) < 0
      ) {
        child += 1;
      }
      if (this.compare(last, items[child] as T) <= 0) {
        break;
      }
      items[index] = items[child] as T;
      index = child;
    }
    items[index] = last;
  }
}

function leftmost(node: TreapNode | undefined): number | undefined {
  let current = node;
  while (current?.left !== undefined) {
    current = current.left;
  }
  return current?.id;
}

function rightmost(node: TreapNode | undefined): number | undefined {
  let current = node;
  while (current?.right !== undefined) {
    current = current.right;
  }
  return current?.id;
}

function merge(
  a: TreapNode | undefined,
  b: TreapNode | undefined,
): TreapNode | undefined {
  if (a === undefined) {
    return b;
  }
  if (b === undefined) {
    return a;
  }
  if (a.priority > b.priority) {
    a.right = merge(a.right, b);
    return a;
  }
  b.left = merge(a, b.left);
  return b;
}

function collect(node: TreapNode | undefined, out: number[]): void {
  if (node === undefined) {
    return;
  }
  collect(node.left, out);
  out.push(node.id);
  collect(node.right, out);
}

function inputPoint(position: Position): SweepPoint {
  return { position, exact: undefined };
}

/**
 * The sweep line: the edges it crosses, bottom to top, in a treap that is split
 * by a point. Every decision about where a point or an edge goes uses exact
 * predicates, so the order is the true order for any finite input.
 */
class Sweep {
  private readonly edges: readonly Edge[];
  private readonly limit: number;
  private readonly ignore: NonNullable<SweepOptions["ignore"]>;
  private readonly found = new Map<number, Contact>();
  private readonly results: Intersection[] = [];
  private readonly crossings = new MinHeap<SweepPoint>(comparePoints);
  private root: TreapNode | undefined;
  private splitLeft: TreapNode | undefined;
  private splitRight: TreapNode | undefined;
  private seed = INITIAL_SEED;

  constructor(segments: readonly Segment[], options: SweepOptions) {
    this.edges = segments.map((segment, id) => {
      const swap = compareLexicographic(segment.start, segment.end) > 0;
      return {
        id,
        left: swap ? segment.end : segment.start,
        right: swap ? segment.start : segment.end,
        scaled: undefined,
      };
    });
    this.limit = options.limit ?? Number.POSITIVE_INFINITY;
    this.ignore = options.ignore ?? (() => false);
  }

  run(): SweepResult {
    const groups = this.groups();
    let next = 0;
    while (!this.full()) {
      const group = groups[next];
      const crossing = this.crossings.peek();
      if (
        crossing !== undefined &&
        (group === undefined ||
          comparePoints(crossing, inputPoint(group.position)) < 0)
      ) {
        this.crossings.pop();
        this.processPoint(crossing, []);
        this.dropCrossingsAt(crossing);
      } else if (group !== undefined) {
        next += 1;
        const point = inputPoint(group.position);
        this.processPoint(point, group.starts);
        this.dropCrossingsAt(point);
      } else {
        break;
      }
    }
    return {
      intersections: this.results.slice(0, this.limit),
      stopped: this.full(),
    };
  }

  private full(): boolean {
    return this.results.length >= this.limit;
  }

  private edge(id: number): Edge {
    return this.edges[id] as Edge;
  }

  /**
   * Every distinct end position in sweep order, with the edges that start
   * there. Ends are numbered `2 * id` for the left end and `2 * id + 1` for
   * the right, and sorted by index so no object is made for each.
   */
  private groups(): Group[] {
    const count = this.edges.length * 2;
    const xs = new Float64Array(count);
    const ys = new Float64Array(count);
    const order = new Uint32Array(count);
    for (const edge of this.edges) {
      const left = 2 * edge.id;
      xs[left] = xOf(edge.left);
      ys[left] = yOf(edge.left);
      xs[left + 1] = xOf(edge.right);
      ys[left + 1] = yOf(edge.right);
    }
    for (let end = 0; end < count; end++) {
      order[end] = end;
    }
    order.sort(
      (a, b) =>
        compareNumbers(xs[a] as number, xs[b] as number) ||
        compareNumbers(ys[a] as number, ys[b] as number),
    );
    const groups: Group[] = [];
    for (const end of order) {
      const edge = this.edge(end >> 1);
      const isLeft = (end & 1) === 0;
      const position = isLeft ? edge.left : edge.right;
      const last = groups[groups.length - 1];
      let group: Group;
      if (last !== undefined && samePosition(last.position, position)) {
        group = last;
      } else {
        group = { position, starts: [] };
        groups.push(group);
      }
      if (isLeft) {
        group.starts.push(edge.id);
      }
    }
    return groups;
  }

  /** Drops crossings queued for a point that has just been handled. */
  private dropCrossingsAt(point: SweepPoint): void {
    let top = this.crossings.peek();
    while (top !== undefined && comparePoints(top, point) === 0) {
      this.crossings.pop();
      top = this.crossings.peek();
    }
  }

  private nextPriority(): number {
    let state = this.seed;
    state ^= state << XORSHIFT_LEFT_FIRST;
    state ^= state >>> XORSHIFT_RIGHT;
    state ^= state << XORSHIFT_LEFT_SECOND;
    this.seed = state >>> 0;
    return this.seed;
  }

  /** Splits a treap in two: the edges for which `goesLeft` holds, then the rest. The pieces land in `splitLeft` and `splitRight`. */
  private split(
    node: TreapNode | undefined,
    goesLeft: (id: number) => boolean,
  ): void {
    if (node === undefined) {
      this.splitLeft = undefined;
      this.splitRight = undefined;
      return;
    }
    if (goesLeft(node.id)) {
      this.split(node.right, goesLeft);
      node.right = this.splitLeft;
      this.splitLeft = node;
      return;
    }
    this.split(node.left, goesLeft);
    node.left = this.splitRight;
    this.splitRight = node;
  }

  private endsAt(id: number, point: SweepPoint): boolean {
    return (
      point.exact === undefined &&
      samePosition(this.edge(id).right, point.position)
    );
  }

  /**
   * Orders two edges that both pass through the current point by the way they
   * leave it: the one that ends up lower just after the point comes first. An
   * edge going straight up leaves last. Collinear edges tie, and go by index.
   */
  private compareLeaving(a: number, b: number): number {
    const first = this.edge(a);
    const side = orientation(first.left, first.right, this.edge(b).right);
    return side !== 0 ? -side : a - b;
  }

  /**
   * Looks the pair up, or classifies it and, unless `ignore` says otherwise,
   * reports it. A pair that is reported, or that crosses, is remembered, so it
   * is reported once and its crossing is not worked out again. An ignored
   * touch or overlap is not, which keeps the memory to the size of the output.
   */
  private record(a: number, b: number): Contact | undefined {
    const first = Math.min(a, b);
    const second = Math.max(a, b);
    const key = first * this.edges.length + second;
    const known = this.found.get(key);
    if (known !== undefined) {
      return known;
    }
    const contact = classify(this.edge(first), this.edge(second));
    if (contact === undefined) {
      return undefined;
    }
    if (this.ignore(first, second, contact.kind)) {
      if (contact.crossing !== undefined) {
        this.found.set(key, contact);
      }
      return contact;
    }
    this.found.set(key, contact);
    this.results.push({
      first,
      second,
      kind: contact.kind,
      point: contact.point,
    });
    return contact;
  }

  /** Tests two edges that have just become neighbours, and queues their crossing if it lies ahead. */
  private consider(
    lower: number | undefined,
    upper: number | undefined,
    current: SweepPoint,
  ): void {
    if (lower === undefined || upper === undefined) {
      return;
    }
    const crossing = this.record(lower, upper)?.crossing;
    if (crossing !== undefined && comparePoints(crossing, current) > 0) {
      this.crossings.push(crossing);
    }
  }

  private recordAll(members: readonly number[]): void {
    for (let i = 0; i < members.length && !this.full(); i++) {
      for (let j = i + 1; j < members.length && !this.full(); j++) {
        this.record(members[i] as number, members[j] as number);
      }
    }
  }

  /**
   * Handles one point of the sweep: takes out every edge that passes through
   * it, reports the pairs among them and the edges starting here, puts back
   * those that go on in their new order, and tests the new neighbours.
   */
  private processPoint(point: SweepPoint, starts: readonly number[]): void {
    this.split(this.root, (id) => sideOf(this.edge(id), point) > 0);
    const below = this.splitLeft;
    this.split(this.splitRight, (id) => sideOf(this.edge(id), point) === 0);
    const through = this.splitLeft;
    const above = this.splitRight;
    const lower = rightmost(below);
    const upper = leftmost(above);
    const members: number[] = [];
    collect(through, members);
    for (const id of starts) {
      members.push(id);
    }
    this.recordAll(members);
    const continuing = members.filter((id) => !this.endsAt(id, point));
    continuing.sort((a, b) => this.compareLeaving(a, b));
    let middle: TreapNode | undefined;
    for (const id of continuing) {
      middle = merge(middle, {
        id,
        priority: this.nextPriority(),
        left: undefined,
        right: undefined,
      });
    }
    this.root = merge(merge(below, middle), above);
    const first = continuing[0];
    if (first === undefined) {
      this.consider(lower, upper, point);
      return;
    }
    this.consider(lower, first, point);
    this.consider(continuing[continuing.length - 1], upper, point);
  }
}

/**
 * Finds every pair of segments that meet, in `O((n + k) log n)` for `n`
 * segments and `k` pairs, with a Bentley-Ottmann sweep.
 *
 * Every decision uses exact arithmetic: Shewchuk's robust orientation
 * predicate, and exact integer arithmetic where a crossing has to be ordered
 * against another point. So the set of pairs is right for any finite input,
 * with no tolerance, however many segments share a point, run along a vertical
 * or lie on one another. Segments of zero length are points. Only the
 * coordinates of a `cross` are rounded.
 *
 * Positions must hold finite numbers; the sweep reads only longitude and
 * latitude. The pair order in the result is the order the sweep found them
 * (deterministic). With `limit` it stops early and says so.
 */
export function findSegmentIntersections(
  segments: readonly Segment[],
  options: SweepOptions = {},
): SweepResult {
  return new Sweep(segments, options).run();
}

/** The options of `findRingIntersections`. */
export interface RingSweepOptions {
  /** Stops once this many intersections are reported; see `SweepOptions.limit`. */
  readonly limit?: number;
  /**
   * Reports only intersections of this kind. Pairs of other kinds are left out
   * and do not count towards `limit`, so a caller can ask for the crossings of a
   * ring that has many touches and overlaps.
   */
  readonly only?: IntersectionKind;
}

interface RingEdge extends Segment {
  /** Index of the edge's first position in the ring. */
  readonly index: number;
}

/**
 * Finds where the edges of one ring meet each other: edge `i` runs from
 * `ring[i]` to `ring[i + 1]`, and the indices in the result are those.
 *
 * Two consecutive edges always share a vertex, so that touch is not reported
 * (this includes the last edge and the first of a closed ring). Two consecutive
 * edges that double back over each other, a spike, do overlap and are reported.
 * Edges of zero length, from a repeated position, are skipped, and the edges
 * either side of one count as consecutive.
 */
export function findRingIntersections(
  ring: readonly Position[],
  options: RingSweepOptions = {},
): RingSweepResult {
  const edges: RingEdge[] = [];
  for (let index = 0; index + 1 < ring.length; index++) {
    const start = ring[index] as Position;
    const end = ring[index + 1] as Position;
    if (!samePosition(start, end)) {
      edges.push({ start, end, index });
    }
  }
  const closed =
    ring.length > 1 &&
    samePosition(ring[0] as Position, ring[ring.length - 1] as Position);
  const adjacent = (first: number, second: number): boolean =>
    second === first + 1 ||
    (closed && first === 0 && second === edges.length - 1);
  const result = findSegmentIntersections(edges, {
    limit: options.limit,
    ignore: (first, second, kind) =>
      (options.only !== undefined && kind !== options.only) ||
      (kind === "touch" && adjacent(first, second)),
  });
  return {
    stopped: result.stopped,
    intersections: result.intersections.map((found) => ({
      ...found,
      first: (edges[found.first] as RingEdge).index,
      second: (edges[found.second] as RingEdge).index,
    })),
  };
}
