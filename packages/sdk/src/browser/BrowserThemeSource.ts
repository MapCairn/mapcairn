// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type ResolvedTheme,
  THEME_ATTRIBUTE,
  type ThemeSource,
} from "@mapcairn/core";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * A {@link ThemeSource} that follows the device's colour scheme and writes the
 * resolved theme on one element, not on the page, so two maps can differ and
 * a mount changes nothing outside its own element.
 */
export class BrowserThemeSource implements ThemeSource {
  readonly #element: HTMLElement;

  constructor(element: HTMLElement) {
    this.#element = element;
  }

  getSystemTheme(): ResolvedTheme {
    return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
  }

  subscribe(listener: (theme: ResolvedTheme) => void): () => void {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => listener(query.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }

  apply(theme: ResolvedTheme): void {
    this.#element.setAttribute(THEME_ATTRIBUTE, theme);
  }
}
