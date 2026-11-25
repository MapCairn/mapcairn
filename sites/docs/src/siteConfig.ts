// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The documentation site's canonical origin, with no trailing slash. The
 * Worker's Custom Domain (`cloudflare.config.ts`) and Docusaurus's `url` both
 * come from here, so a change of hostname is one edit.
 */
export const SITE_ORIGIN = "https://docs.mapcairn.com";

/**
 * The reference site's origin, with no trailing slash. The documentation
 * links to its pages by full address, because they are on another origin;
 * `siteConfig.test.ts` keeps it equal to the reference site's own constant.
 */
export const HOST_ORIGIN = "https://mapcairn.com";

/** Where the site is served on its origin, with both slashes. */
export const BASE_URL = "/";

/** The project's public repository. */
export const REPOSITORY_URL = "https://github.com/MapCairn/mapcairn";
