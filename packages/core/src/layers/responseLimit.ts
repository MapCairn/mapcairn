// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { isFeedLayer, type LayerDefinition, loadsFeatures } from "./definition";

/**
 * The most bytes of a feed, query or detail answer a source reads when the
 * definition sets no `maxResponseBytes`: 4 MiB. The largest answer the
 * reference site's definitions document is the country outlines, about
 * 840 KB decoded, so this is about five times that. An answer past the limit
 * is refused as `invalid` without being held in memory whole.
 */
export const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

/**
 * The most a definition may raise its own `maxResponseBytes` to: 16 MiB.
 * A body is held as text and parsed in the page, so a limit past this is
 * refused when the definition is validated.
 */
export const MAX_RESPONSE_BYTES_CEILING = 16 * 1024 * 1024;

/**
 * The byte limit a source applies to a layer's feed or query answer: the
 * source's `maxResponseBytes` when it sets one, otherwise
 * {@link DEFAULT_MAX_RESPONSE_BYTES}. A layer with no feed or query source
 * has no such answer and gets the default.
 */
export function feedResponseLimit(definition: LayerDefinition): number {
  return (
    (loadsFeatures(definition)
      ? definition.source.maxResponseBytes
      : undefined) ?? DEFAULT_MAX_RESPONSE_BYTES
  );
}

/**
 * The byte limit a source applies to a layer's detail answer: the detail
 * block's `maxResponseBytes` when it sets one, otherwise
 * {@link DEFAULT_MAX_RESPONSE_BYTES}.
 */
export function detailResponseLimit(definition: LayerDefinition): number {
  return (
    (isFeedLayer(definition)
      ? definition.detail?.maxResponseBytes
      : undefined) ?? DEFAULT_MAX_RESPONSE_BYTES
  );
}
