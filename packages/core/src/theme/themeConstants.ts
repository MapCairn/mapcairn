// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ResolvedTheme } from "../ports/settings";

/** The `localStorage` key holding the theme choice as a plain string. */
export const THEME_STORAGE_KEY = "mapcairn:theme";

/** The attribute on the root element that carries the resolved theme. */
export const THEME_ATTRIBUTE = "data-theme";

/**
 * The `localStorage` key holding the map shape setting, as JSON (`"globe"`).
 * The settings store writes it; the pre-paint script reads it.
 */
export const PROJECTION_STORAGE_KEY = "mapcairn:projection";

/**
 * The attribute the pre-paint script puts on the root element, with the value
 * `globe`, when the stored map shape is a globe, so the placeholder painted
 * before the app mounts already shows the space around a globe.
 */
export const MAP_SHAPE_ATTRIBUTE = "data-map-shape";

/** The `name` of the meta tag that tints the browser chrome. */
export const THEME_COLOR_META_NAME = "theme-color";

/**
 * The `theme-color` meta content for each resolved theme. Opaque hex values
 * only, since browsers ignore transparency here. Keep these in step with the
 * surface colour tokens.
 */
export const THEME_COLOR_META: Readonly<Record<ResolvedTheme, string>> = {
  light: "#fcfcfb",
  dark: "#13161a",
};
