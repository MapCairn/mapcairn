// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ResolvedTheme } from "./settings";

/**
 * The operating system's colour scheme, and the place the resolved theme is
 * applied. The ui combines it with the stored choice through the core resolver.
 */
export interface ThemeSource {
  getSystemTheme(): ResolvedTheme;
  /** Calls the listener when the system preference changes. Returns the unsubscribe function. */
  subscribe(listener: (theme: ResolvedTheme) => void): () => void;
  /**
   * Reflects the resolved theme onto the document: the `data-theme`
   * attribute, the `color-scheme` property and the `theme-color` meta tag.
   */
  apply(theme: ResolvedTheme): void;
}
