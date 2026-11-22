// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { THEME_STORAGE_KEY } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import {
  FRAMEWORK_THEME_KEY,
  SHARED_THEME_KEY,
  THEME_BRIDGE_SCRIPT,
} from "./themeBridge";

/** Runs the script against a fake store and returns what it left in it. */
function run(initial: Record<string, string>): Record<string, string> {
  const store = { ...initial };
  const localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
  new Function("localStorage", THEME_BRIDGE_SCRIPT)(localStorage);
  return store;
}

describe("THEME_BRIDGE_SCRIPT", () => {
  it("names the keys it reads and writes as the reference site and the framework do", () => {
    expect(SHARED_THEME_KEY).toBe(THEME_STORAGE_KEY);
    expect(THEME_BRIDGE_SCRIPT).toContain(
      `localStorage.getItem("${THEME_STORAGE_KEY}")`,
    );
    expect(THEME_BRIDGE_SCRIPT).toContain(
      `localStorage.setItem("${FRAMEWORK_THEME_KEY}",s)`,
    );
    expect(THEME_BRIDGE_SCRIPT).toContain(
      `localStorage.removeItem("${FRAMEWORK_THEME_KEY}")`,
    );
  });

  it.each(["light", "dark"])(
    "copies an explicit %s choice to the framework's key",
    (choice) => {
      expect(run({ [THEME_STORAGE_KEY]: choice })[FRAMEWORK_THEME_KEY]).toBe(
        choice,
      );
    },
  );

  it("clears the framework's key for the system choice", () => {
    expect(
      run({ [THEME_STORAGE_KEY]: "system", [FRAMEWORK_THEME_KEY]: "dark" })[
        FRAMEWORK_THEME_KEY
      ],
    ).toBeUndefined();
  });

  it("changes nothing when the shared key is missing or not a choice", () => {
    expect(run({ [FRAMEWORK_THEME_KEY]: "dark" })[FRAMEWORK_THEME_KEY]).toBe(
      "dark",
    );
    expect(
      run({ [THEME_STORAGE_KEY]: "sepia", [FRAMEWORK_THEME_KEY]: "dark" })[
        FRAMEWORK_THEME_KEY
      ],
    ).toBe("dark");
  });

  it("does not throw when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() =>
      new Function("localStorage", THEME_BRIDGE_SCRIPT)(blocked),
    ).not.toThrow();
  });
});
