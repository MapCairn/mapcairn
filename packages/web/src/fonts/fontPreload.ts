// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import latinFontUrl from "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2?url";

/**
 * Link descriptors that preload the Latin face of IBM Plex Sans, for a route's
 * `links` export. Only this face is preloaded: it covers the interface copy,
 * while Latin Extended loads on demand through its `unicode-range`.
 * @remarks The href is Vite's `?url` import of the same file `fonts.css`
 *   names, so the hashed build URL matches the request the stylesheet makes.
 *   Without `crossOrigin: "anonymous"` the browser would fetch the font twice,
 *   because font requests are always CORS-enabled.
 */
export const fontPreloadLinks = [
  {
    rel: "preload",
    href: latinFontUrl,
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
] as const;
