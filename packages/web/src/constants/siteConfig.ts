// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Canonical production origin, with no trailing slash.
 * @remarks Single source of truth for `workers/app.ts`'s old-hostname
 *   redirect target and for every absolute URL emitted by the generated
 *   `robots.txt`/`sitemap.xml`/`llms.txt` routes, so the production domain
 *   can't drift out of sync between them.
 */
export const SITE_URL = "https://mapcairn.com";

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

/**
 * Where the documentation site is served, with a trailing slash. A second
 * Worker answers it (`sites/docs`) on its own hostname, so it is not a route
 * of this app.
 */
export const DOCS_URL = "https://docs.mapcairn.com/";

/** The public repository that holds the site's source code, linked from Help. */
export const SOURCE_REPOSITORY_URL = "https://github.com/MapCairn/mapcairn";

/**
 * The project's Mastodon profile. The product page's footer links to it with
 * `rel="me"`, which lets Mastodon verify that the profile owns this site.
 */
export const MASTODON_PROFILE_URL = "https://en.osm.town/@mapcairn";

/**
 * The hostnames that stay attached to the Worker only to redirect: the two
 * the site had before it moved to its own domain, and the `www` form of the
 * current one. A page on any of them goes to {@link SITE_URL}, so an address
 * that was shared widely keeps working.
 */
export const REDIRECTED_HOSTNAMES: readonly string[] = [
  "karta.timothybrits.co.za",
  "mapcairn.timothybrits.co.za",
  "www.mapcairn.com",
];

/**
 * Every origin the Worker serves the site on. A client error report from any
 * of them is accepted, so a page still open on a redirected address can
 * report an error.
 */
export const SITE_ORIGINS: readonly string[] = [
  new URL(SITE_URL).origin,
  ...REDIRECTED_HOSTNAMES.map((hostname) => `https://${hostname}`),
];

/** Pixel width of `public/og-image.png`, the Open Graph/Twitter card preview image (`scripts/generateOgImage.ts`), matching its `og:image:width`/`twitter:image` meta tags. */
export const OG_IMAGE_WIDTH = 1200;

/** Pixel height of `public/og-image.png`, matching its `og:image:height` meta tag. */
export const OG_IMAGE_HEIGHT = 630;
