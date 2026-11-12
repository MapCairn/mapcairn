// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LayerFeature } from "./layers";

/**
 * The area a feature query searches: a GeoJSON `Polygon`, an outer ring and
 * then any holes, each ring closed, as `[longitude, latitude]` positions. It
 * uses plain arrays, so the `Polygon` that `shapeGeometry` gives for a drawn
 * polygon or circle passes straight in.
 */
export interface QueryArea {
  readonly type: "Polygon";
  readonly coordinates: number[][][];
}

/**
 * One feature a query found: its layer's id and the feature itself, so the
 * caller can show it without loading its layer. The hit's `layerId` and the
 * feature's `id` are the two ids a `FeatureRef` keeps.
 */
export interface SelectionHit {
  readonly layerId: string;
  readonly feature: LayerFeature;
}

/** What {@link FeatureQuery.within} needs. */
export interface FeatureQueryRequest {
  /** Where to look. */
  readonly area: QueryArea;
  /** The layers to look in, and no others. Empty asks about nothing. */
  readonly layerIds: readonly string[];
  /**
   * The most hits to return, a whole number of at least 1. A caller that has
   * room for `n` more asks for `n + 1`, so that `n + 1` hits back tell it that
   * more lie inside, and the host can stop looking once it has them.
   */
  readonly limit: number;
  readonly signal?: AbortSignal;
}

/**
 * Finds the features that lie inside an area, which a host can often do
 * better than the browser, for example from a server that holds the layers.
 * Optional on `Services`: a host that supplies none offers no selection by
 * shape, and the ui must not require it. The SDK sends nothing itself, so a
 * host whose query sends a shape or layer ids to a server tells its visitors.
 *
 * It is a port of its own so that `FeatureSelection` stays synchronous.
 *
 * Rules for every implementation:
 * - Every hit's `layerId` is one of the request's `layerIds`, and a feature
 *   is listed once.
 * - It returns `limit` hits when at least that many lie inside, and every hit
 *   when fewer do. It returns no more than `limit`, in any order.
 * - An empty `layerIds` resolves with no hits.
 * - It rejects only with a `FeatureQueryError`: `network` when the request
 *   failed, `invalid` when the request was not valid (an `area` that is not a
 *   closed polygon on the globe, or a `limit` that is not a whole number of at
 *   least 1) or the answer could not be read, `unsupported` when the host
 *   cannot answer for the layers or the area, and `aborted` when the signal
 *   fires first, whether before the call or while it is pending. The ui
 *   ignores `aborted`.
 */
export interface FeatureQuery {
  within(request: FeatureQueryRequest): Promise<readonly SelectionHit[]>;
}
