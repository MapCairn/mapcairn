// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The key the reference site stores the colour choice under, written out in
 * the script below. `themeBridge.test.ts` keeps it equal to core's
 * `THEME_STORAGE_KEY`, so the script is plain text and builds nothing from a
 * value.
 */
export const SHARED_THEME_KEY = "mapcairn:theme";

/** The key the framework stores its own colour-mode choice under. */
export const FRAMEWORK_THEME_KEY = "theme";

/**
 * The inline script that makes the framework start from the choice the reader
 * made on the reference site, which shares this origin. It runs in the head,
 * before the framework's own pre-paint script reads its key: it copies an
 * explicit `light` or `dark` from `mapcairn:theme` to the framework's key, and
 * clears that key for `system` so the system's preference applies. Any other
 * value, a blocked store included, changes nothing. The pages hash it in the
 * Content-Security-Policy (`plugins/securityHeadersPlugin.ts`).
 */
export const THEME_BRIDGE_SCRIPT =
  '(function(){try{var s=localStorage.getItem("mapcairn:theme");if(s==="light"||s==="dark"){localStorage.setItem("theme",s)}else if(s==="system"){localStorage.removeItem("theme")}}catch(e){}})()';
