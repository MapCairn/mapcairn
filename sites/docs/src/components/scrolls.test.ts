// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { scrolls } from "./scrolls";

describe("scrolls", () => {
  it("is true when the content is wider than the box", () => {
    expect(scrolls({ scrollWidth: 640, clientWidth: 320 })).toBe(true);
  });

  it("is false when the content fits, exactly or with room", () => {
    expect(scrolls({ scrollWidth: 320, clientWidth: 320 })).toBe(false);
    expect(scrolls({ scrollWidth: 200, clientWidth: 320 })).toBe(false);
  });
});
