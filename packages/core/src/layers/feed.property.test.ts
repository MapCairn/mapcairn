// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SAMPLE_ALERT_LAYER } from "../fakes/layerFixtures";
import { LayerError } from "../ports/errors";
import { failureOf } from "../propertyTesting/failureOf";
import {
  responseBody,
  SAMPLE_DEFINITIONS,
} from "../propertyTesting/layerArbitraries";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import { createDecoderRegistry } from "./decoders";
import { decodeDetail, decodeFeed } from "./feed";

/** What decoding can lead to: features, or one of the two refusals the functions document. */
const DECODE_OUTCOMES = ["features", "invalid", "empty"];

const decoders = createDecoderRegistry();

/** What running `decode` led to. Any failure but a {@link LayerError} escapes. */
function outcomeOf(decode: () => unknown): string {
  return failureOf(LayerError, decode)?.kind ?? "features";
}

describe("decodeFeed", () => {
  it("decodes or refuses any response body with a layer error", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SAMPLE_DEFINITIONS),
        responseBody,
        (definition, body) => {
          expect(DECODE_OUTCOMES).toContain(
            outcomeOf(() => decodeFeed(definition, body, decoders)),
          );
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });
});

describe("decodeDetail", () => {
  it("decodes or refuses any response body with a layer error", () => {
    fc.assert(
      fc.property(responseBody, (body) => {
        expect(DECODE_OUTCOMES).toContain(
          outcomeOf(() => decodeDetail(SAMPLE_ALERT_LAYER, body, decoders)),
        );
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
