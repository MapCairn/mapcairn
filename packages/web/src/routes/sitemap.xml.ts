// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { PLAYGROUND_PATH, SITE_URL } from "../constants/siteConfig";
import { staticTextResponse } from "./staticTextResponse";

/**
 * Every page this site wants indexed, kept in step with `routes.ts` by hand
 * and checked against it by a test. There is no `lastmod`: nothing records
 * when a page last changed, and a guessed date would be wrong. The pages under
 * `/docs/` are not listed: the documentation Worker writes its own sitemap,
 * which `robots.txt` names.
 */
const SITEMAP_XML_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}${PLAYGROUND_PATH}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${SITE_URL}/privacy</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
`;

/**
 * React Router resource route: generates `/sitemap.xml` from
 * `SITEMAP_XML_BODY`/`SITE_URL` rather than a hand-maintained static file,
 * so every emitted URL is guaranteed absolute and points at the current
 * production origin.
 */
export function loader(): Response {
  return staticTextResponse(SITEMAP_XML_BODY, "application/xml; charset=utf-8");
}
