// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { PLAYGROUND_PATH } from "../constants/siteConfig";

/**
 * The inline script the product page at `/` runs before it paints, so a link
 * shared before the map moved to `/map` still opens the map. A shared link
 * keeps the map's state after `#` (`#map=...`, `#basemap=...`, `#layers=...`),
 * which the server never sees, so only the browser can tell. When the hash
 * holds a `key=value` pair, the script replaces the address with the
 * playground's, keeping the query and the hash, so the back button does not
 * return to the product page. The page's own anchors (`#questions`) hold no
 * `=` and stay.
 *
 * @remarks Its SHA-256 is allowed by the content security policy in
 *   `public/_headers` and `constants/securityHeaders.ts`, beside the theme
 *   script's; `inlineScripts.test.ts` hashes this exact string and checks both
 *   files. It is guarded so it never throws.
 */
export const MAP_LINK_REDIRECT_SCRIPT = `(function(){try{var hash=location.hash;if(/^#[^=]+=/.test(hash))location.replace(${JSON.stringify(PLAYGROUND_PATH)}+location.search+hash)}catch(e){}})()`;
