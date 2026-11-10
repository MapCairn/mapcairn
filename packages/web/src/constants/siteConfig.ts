/**
 * Canonical production origin, with no trailing slash.
 * @remarks Single source of truth for `workers/app.ts`'s old-hostname
 *   redirect target and for every absolute URL emitted by the generated
 *   `robots.txt`/`sitemap.xml`/`llms.txt` routes, so the production domain
 *   can't drift out of sync between them.
 */
export const SITE_URL = "https://mapcairn.timothybrits.co.za";

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
