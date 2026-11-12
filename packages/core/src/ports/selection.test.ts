// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { featureRefKey } from "./selection";

describe("featureRefKey", () => {
  it("is equal for two references exactly when both ids are equal", () => {
    expect(featureRefKey({ layerId: "a", featureId: "1" })).toBe(
      featureRefKey({ layerId: "a", featureId: "1" }),
    );
    expect(featureRefKey({ layerId: "a", featureId: "1" })).not.toBe(
      featureRefKey({ layerId: "a", featureId: "2" }),
    );
    expect(featureRefKey({ layerId: "a", featureId: "1" })).not.toBe(
      featureRefKey({ layerId: "b", featureId: "1" }),
    );
  });

  it("does not confuse ids that would join to the same text", () => {
    expect(featureRefKey({ layerId: "a\u0000b", featureId: "c" })).not.toBe(
      featureRefKey({ layerId: "a", featureId: "b\u0000c" }),
    );
    expect(featureRefKey({ layerId: "a", featureId: "" })).not.toBe(
      featureRefKey({ layerId: "", featureId: "a" }),
    );
  });
});
