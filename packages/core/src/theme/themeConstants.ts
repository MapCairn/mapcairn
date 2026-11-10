import type { ResolvedTheme } from "../ports/settings";

/** The `localStorage` key holding the theme choice as a plain string. */
export const THEME_STORAGE_KEY = "mapcairn:theme";

/**
 * The key the theme choice was stored under before the project was renamed
 * from Karta. The pre-paint script reads it when the current key is absent, so
 * a returning visitor sees no flash, and the settings store moves it to
 * {@link THEME_STORAGE_KEY} on the first visit.
 */
export const LEGACY_THEME_STORAGE_KEY = "karta:theme";

/** The attribute on the root element that carries the resolved theme. */
export const THEME_ATTRIBUTE = "data-theme";

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
