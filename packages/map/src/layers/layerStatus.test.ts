// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { LayerError } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { errorKind } from "./layerStatus";

describe("errorKind", () => {
  it("is the kind of a layer error, and invalid for anything else", () => {
    expect(errorKind(new LayerError("network"))).toBe("network");
    expect(errorKind(new LayerError("aborted"))).toBe("aborted");
    expect(errorKind(new Error("boom"))).toBe("invalid");
    expect(errorKind("boom")).toBe("invalid");
  });
});
