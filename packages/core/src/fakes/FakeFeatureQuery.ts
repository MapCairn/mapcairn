// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type GeometryError, validateGeometry } from "../geometry";
import { FeatureQueryError, type FeatureQueryErrorKind } from "../ports/errors";
import type {
  FeatureQuery,
  FeatureQueryRequest,
  SelectionHit,
} from "../ports/featureQuery";
import { abortable } from "./internal";

/** The failures {@link FakeFeatureQuery.failWith} can script. */
export type FakeFeatureQueryFailure = Exclude<FeatureQueryErrorKind, "aborted">;

/** Rejects a request the port rules call invalid. */
function checkRequest({ area, limit }: FeatureQueryRequest): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new FeatureQueryError(
      "invalid",
      "A query needs a limit that is a whole number of at least 1.",
    );
  }
  try {
    validateGeometry(area);
  } catch (error) {
    // `validateGeometry` throws only a `GeometryError`.
    throw new FeatureQueryError("invalid", (error as GeometryError).message);
  }
  if (area.type !== "Polygon") {
    throw new FeatureQueryError("invalid", "A query needs a polygon.");
  }
}

/** The first `limit` hits in the named layers, each feature once. */
function selectHits(
  hits: readonly SelectionHit[],
  layerIds: readonly string[],
  limit: number,
): SelectionHit[] {
  const named = new Set(layerIds);
  const seen = new Set<string>();
  const selected: SelectionHit[] = [];
  for (const hit of hits) {
    const key = JSON.stringify([hit.layerId, hit.feature.id]);
    if (!named.has(hit.layerId) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    selected.push(hit);
    if (selected.length === limit) {
      break;
    }
  }
  return selected;
}

function abortedError(): FeatureQueryError {
  return new FeatureQueryError("aborted", "The query was cancelled.");
}

/**
 * A scripted {@link FeatureQuery} with no network and no timers.
 *
 * How to script it:
 * - `respondWith(hits)` says what lies inside whatever area is asked about.
 *   It answers every later query with the first `limit` of those hits in the
 *   layers asked about, each feature once, as the port rules require. With no
 *   script it finds nothing.
 * - `failWith(kind)` makes every query reject with a `FeatureQueryError` until
 *   `clearFailure()`.
 * - `hold()` keeps every later query pending until the function it returns is
 *   called, which also lets the queries held since then answer.
 * - A request is checked first: a `limit` that is not a whole number of at
 *   least 1, or an `area` that is not a closed polygon on the globe, rejects as
 *   `invalid`. The check comes before any hold or failure, so a bad request
 *   never uses a script.
 * - Every query honours its `AbortSignal` by rejecting with a
 *   `FeatureQueryError` of kind `aborted`, before the call or while it is
 *   held.
 * - `calls` records what the ui asked.
 */
export class FakeFeatureQuery implements FeatureQuery {
  readonly calls: FeatureQueryRequest[] = [];

  #hits: readonly SelectionHit[] = [];
  #failure: FakeFeatureQueryFailure | null = null;
  #held: Promise<void> | null = null;

  /** Answers every later query from these hits. */
  respondWith(hits: readonly SelectionHit[]): void {
    this.#hits = hits;
  }

  /** Makes every later query reject with a `FeatureQueryError` of this kind. */
  failWith(kind: FakeFeatureQueryFailure): void {
    this.#failure = kind;
  }

  /** Stops {@link FakeFeatureQuery.failWith} failing queries. */
  clearFailure(): void {
    this.#failure = null;
  }

  /** Holds every later query until the returned function is called. */
  hold(): () => void {
    let release!: () => void;
    this.#held = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      this.#held = null;
      release();
    };
  }

  within(request: FeatureQueryRequest): Promise<readonly SelectionHit[]> {
    this.calls.push(request);
    return abortable(
      async () => {
        checkRequest(request);
        await this.#held;
        if (this.#failure !== null) {
          throw new FeatureQueryError(this.#failure);
        }
        return selectHits(this.#hits, request.layerIds, request.limit);
      },
      request.signal,
      abortedError,
    );
  }
}
