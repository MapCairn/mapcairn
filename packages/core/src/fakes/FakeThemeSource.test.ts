// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  runThemeSourceContract,
  type ThemeSourceSubject,
} from "../contracts/themeSource.contract";
import { FakeThemeSource } from "./FakeThemeSource";

runThemeSourceContract("FakeThemeSource", (): ThemeSourceSubject => {
  const source = new FakeThemeSource();
  return {
    source,
    controls: {
      setSystemTheme: (theme) => source.setSystemTheme(theme),
      applied: () => source.appliedTheme,
    },
  };
});

describe("FakeThemeSource", () => {
  it("starts light unless told otherwise", () => {
    expect(new FakeThemeSource().getSystemTheme()).toBe("light");
    expect(new FakeThemeSource("dark").getSystemTheme()).toBe("dark");
  });

  it("notifies subscribers only when the system theme changes", () => {
    const source = new FakeThemeSource("light");
    let calls = 0;
    source.subscribe(() => {
      calls += 1;
    });
    source.setSystemTheme("light");
    expect(calls).toBe(0);
    source.setSystemTheme("dark");
    expect(calls).toBe(1);
  });

  it("records the applied theme and every apply call", () => {
    const source = new FakeThemeSource();
    expect(source.appliedTheme).toBeNull();
    source.apply("dark");
    source.apply("dark");
    source.apply("light");
    expect(source.appliedTheme).toBe("light");
    expect(source.applyCalls).toEqual(["dark", "dark", "light"]);
  });
});
