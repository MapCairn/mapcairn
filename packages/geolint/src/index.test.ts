// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { TOOL_NAME } from "./index.js";

describe("the package entry", () => {
  it("names the tool", () => {
    expect(TOOL_NAME).toBe("geolint");
  });
});
