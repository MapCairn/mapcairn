// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The reference site's canonical origin, with no trailing slash. The Worker's
 * route (`cloudflare.config.ts`) and Docusaurus's `url` both come from here,
 * so a change of hostname is one edit; `siteConfig.test.ts` keeps it equal to
 * the reference site's own constant.
 */
export const SITE_ORIGIN = "https://mapcairn.timothybrits.co.za";

/** The DNS zone that holds the hostname, which the Worker's route names. */
export const ZONE = "timothybrits.co.za";

/** Where the site is served on the origin, with both slashes. */
export const BASE_URL = "/docs/";

/** The paths of the reference site that the documentation links to. */
export const HOST_PATHS: readonly string[] = ["/", "/map", "/privacy"];

/** The project's public repository. */
export const REPOSITORY_URL = "https://github.com/MapCairn/mapcairn";
