// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { parseThemeChoice, resolveTheme } from "./index";

describe("resolveTheme", () => {
  it("follows the system only when the choice is system", () => {
    expect(resolveTheme("system", "light")).toBe("light");
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });
});

describe("parseThemeChoice", () => {
  it("accepts the three valid choices", () => {
    expect(parseThemeChoice("system")).toBe("system");
    expect(parseThemeChoice("light")).toBe("light");
    expect(parseThemeChoice("dark")).toBe("dark");
  });

  it("turns anything else into system", () => {
    for (const raw of [
      undefined,
      null,
      "",
      "Dark",
      "blue",
      '"dark"',
      0,
      1,
      {},
      [],
      true,
    ]) {
      expect(parseThemeChoice(raw)).toBe("system");
    }
  });
});
