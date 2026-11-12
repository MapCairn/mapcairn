// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ResolvedTheme } from "../ports/settings";
import type { ThemeSource } from "../ports/theme";

/**
 * A scripted {@link ThemeSource}.
 *
 * How to script it: pass the starting system theme (light by default) and
 * call `setSystemTheme(theme)` to change it. Subscribers are notified only
 * when the theme actually changes, like a media query. `apply` notifies
 * nobody; it records the theme in `appliedTheme` (null until first applied)
 * and every call in `applyCalls`.
 */
export class FakeThemeSource implements ThemeSource {
  readonly applyCalls: ResolvedTheme[] = [];

  #systemTheme: ResolvedTheme;
  #listeners = new Set<(theme: ResolvedTheme) => void>();

  constructor(systemTheme: ResolvedTheme = "light") {
    this.#systemTheme = systemTheme;
  }

  /** The last theme passed to `apply`, or null if none has been. */
  get appliedTheme(): ResolvedTheme | null {
    return this.applyCalls.at(-1) ?? null;
  }

  /** Changes the system theme and notifies subscribers if it differs. */
  setSystemTheme(theme: ResolvedTheme): void {
    if (theme === this.#systemTheme) {
      return;
    }
    this.#systemTheme = theme;
    for (const listener of [...this.#listeners]) {
      listener(theme);
    }
  }

  getSystemTheme(): ResolvedTheme {
    return this.#systemTheme;
  }

  subscribe(listener: (theme: ResolvedTheme) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  apply(theme: ResolvedTheme): void {
    this.applyCalls.push(theme);
  }
}
