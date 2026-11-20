// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ThemeOverride } from "@mapcairn/theme";

/** A host theme the style guide can serve: a scope and the colours that apply in it. */
export interface HostTheme {
  /** The selector of the element the theme applies in. */
  scope: string;
  /** The colours, for light and dark. */
  override: ThemeOverride;
}

/**
 * The host themes served at `/design/host-theme/:name`, so the browser tests
 * load generated stylesheets from the app's own origin under its policy.
 * Two scopes with different colours stand in for two themed maps on a page.
 */
export const HOST_THEMES: Readonly<Record<string, HostTheme>> = {
  green: {
    scope: ".host-green",
    override: {
      colour: {
        light: { accent: "#0b5c3a", accentTint: "#d9efe4" },
        dark: { accent: "#7fd9aa", accentTint: "#17382a" },
      },
    },
  },
  brown: {
    scope: "#host-brown",
    override: {
      colour: {
        light: { accent: "#7a3b00", accentTint: "#fbe6d2" },
        dark: { accent: "#f5b97f", accentTint: "#3a2412" },
      },
    },
  },
};
