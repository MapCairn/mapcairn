// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Canonical production origin, with no trailing slash.
 * @remarks Single source of truth for `workers/app.ts`'s old-hostname
 *   redirect target and for every absolute URL emitted by the generated
 *   `robots.txt`/`sitemap.xml`/`llms.txt` routes, so the production domain
 *   can't drift out of sync between them.
 */
export const SITE_URL = "https://mapcairn.timothybrits.co.za";

/**
 * What the site is, in a sentence or two, for search results and link
 * previews: the product page's description, and the site's own for a page
 * with none (an error page). Kept here, away from the product page's content,
 * so every page can use it without loading that content.
 */
export const PRODUCT_DESCRIPTION =
  "An open-source SDK for accessible, privacy-respecting map applications on MapLibre GL JS and React: a complete map interface, open data layers as data, measuring and drawing tools, and a design system. AGPL-3.0.";

/** The path of the product page, the site's front page. */
export const PRODUCT_PATH = "/";

/** The path of the playground: the reference site's map. */
export const PLAYGROUND_PATH = "/map";

/** The public repository that holds the site's source code, linked from Help. */
export const SOURCE_REPOSITORY_URL = "https://github.com/MapCairn/mapcairn";

/**
 * The hostname the site had before its name changed. It stays attached to the
 * Worker, which redirects pages on it to {@link SITE_URL}, so the address that
 * was shared widely keeps working.
 */
export const PREVIOUS_HOSTNAME = "karta.timothybrits.co.za";

/**
 * Every origin the Worker serves the site on. A client error report from any
 * of them is accepted, so a page still open on the previous address can
 * report an error.
 */
export const SITE_ORIGINS: readonly string[] = [
  new URL(SITE_URL).origin,
  `https://${PREVIOUS_HOSTNAME}`,
];

/** Pixel width of `public/og-image.png`, the Open Graph/Twitter card preview image (`scripts/generateOgImage.ts`), matching its `og:image:width`/`twitter:image` meta tags. */
export const OG_IMAGE_WIDTH = 1200;

/** Pixel height of `public/og-image.png`, matching its `og:image:height` meta tag. */
export const OG_IMAGE_HEIGHT = 630;
