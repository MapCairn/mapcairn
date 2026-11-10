/**
 * Canonical production origin, with no trailing slash.
 * @remarks Single source of truth for `workers/app.ts`'s old-hostname
 *   redirect target and for every absolute URL emitted by the generated
 *   `robots.txt`/`sitemap.xml`/`llms.txt` routes, so the production domain
 *   can't drift out of sync between them.
 */
export const SITE_URL = "https://karta.timothybrits.co.za";

/**
 * Every origin the Worker serves the site on. A client error report from any
 * of them is accepted. The second address is attached before the canonical
 * address moves to it, so the move needs no change here.
 */
export const SITE_ORIGINS: readonly string[] = [
  new URL(SITE_URL).origin,
  "https://mapcairn.timothybrits.co.za",
];

/** Pixel width of `public/og-image.png`, the Open Graph/Twitter card preview image (`scripts/generateOgImage.ts`), matching its `og:image:width`/`twitter:image` meta tags. */
export const OG_IMAGE_WIDTH = 1200;

/** Pixel height of `public/og-image.png`, matching its `og:image:height` meta tag. */
export const OG_IMAGE_HEIGHT = 630;
