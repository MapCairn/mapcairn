// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { isScriptless } from "./scriptlessPage";

describe("isScriptless", () => {
  it("is false when no route says it runs no script", () => {
    expect(isScriptless([{}, { handle: { language: "en-GB" } }])).toBe(false);
  });

  it("is true when any matched route says it runs no script, parent or child", () => {
    expect(
      isScriptless([{ handle: { scripts: "none" } }, { handle: {} }]),
    ).toBe(true);
    expect(
      isScriptless([{ handle: undefined }, { handle: { scripts: "none" } }]),
    ).toBe(true);
  });

  it("ignores any other value", () => {
    expect(isScriptless([{ handle: { scripts: "inline" } }])).toBe(false);
    expect(isScriptless([{ handle: null }])).toBe(false);
  });
});
