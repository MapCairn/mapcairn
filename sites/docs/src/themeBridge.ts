// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { THEME_STORAGE_KEY } from "@mapcairn/core";

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
export const THEME_BRIDGE_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(s==="light"||s==="dark"){localStorage.setItem(${JSON.stringify(FRAMEWORK_THEME_KEY)},s)}else if(s==="system"){localStorage.removeItem(${JSON.stringify(FRAMEWORK_THEME_KEY)})}}catch(e){}})()`;
