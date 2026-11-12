// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { ResolvedTheme } from "../ports/settings";
import type { ThemeSource } from "../ports/theme";

/**
 * How the theme contract scripts a source. A real adapter implements these
 * by mocking `matchMedia` and reading the document it applies the theme to.
 */
export interface ThemeSourceControls {
  /** Changes the operating system's colour scheme, as the user would. */
  setSystemTheme(theme: ResolvedTheme): void;
  /** The theme currently reflected on the document, or null when none is. */
  applied(): ResolvedTheme | null;
}

/** One theme source under test, with its controls. */
export interface ThemeSourceSubject {
  readonly source: ThemeSource;
  readonly controls: ThemeSourceControls;
}

/**
 * Runs the shared behavioural suite for a {@link ThemeSource}. Every test
 * calls `create` for a fresh subject.
 */
export function runThemeSourceContract(
  name: string,
  create: () => ThemeSourceSubject,
): void {
  describe(`ThemeSource contract: ${name}`, () => {
    it("reports the system theme as light or dark", () => {
      const { source } = create();
      expect(["light", "dark"]).toContain(source.getSystemTheme());
    });

    it("follows the system theme", () => {
      const { source, controls } = create();
      controls.setSystemTheme("dark");
      expect(source.getSystemTheme()).toBe("dark");
      controls.setSystemTheme("light");
      expect(source.getSystemTheme()).toBe("light");
    });

    it("notifies subscribers with the new theme when the system changes", () => {
      const { source, controls } = create();
      controls.setSystemTheme("light");
      const seen: ResolvedTheme[] = [];
      source.subscribe((theme) => seen.push(theme));
      controls.setSystemTheme("dark");
      expect(seen).toEqual(["dark"]);
    });

    it("stops notifying after unsubscribe, and unsubscribing twice is safe", () => {
      const { source, controls } = create();
      controls.setSystemTheme("light");
      const seen: ResolvedTheme[] = [];
      const unsubscribe = source.subscribe((theme) => seen.push(theme));
      controls.setSystemTheme("dark");
      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
      controls.setSystemTheme("light");
      expect(seen).toEqual(["dark"]);
    });

    it("reflects an applied theme on the document", () => {
      const { source, controls } = create();
      source.apply("dark");
      expect(controls.applied()).toBe("dark");
      source.apply("light");
      expect(controls.applied()).toBe("light");
    });

    it("is idempotent when the same theme is applied twice", () => {
      const { source, controls } = create();
      source.apply("dark");
      expect(() => source.apply("dark")).not.toThrow();
      expect(controls.applied()).toBe("dark");
    });

    it("does not notify subscribers when a theme is applied", () => {
      const { source } = create();
      let calls = 0;
      source.subscribe(() => {
        calls += 1;
      });
      source.apply("dark");
      expect(calls).toBe(0);
    });
  });
}
