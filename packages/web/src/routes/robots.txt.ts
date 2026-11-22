// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { DOCS_PATH, SITE_URL } from "../constants/siteConfig";
import { staticTextResponse } from "./staticTextResponse";

const ROBOTS_TXT_BODY = `# MapCairn is open source. Search engines and AI crawlers are welcome to read
# every page; /llms.txt summarises the project for language models.
User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
Sitemap: ${SITE_URL}${DOCS_PATH}sitemap.xml
`;

/**
 * React Router resource route: generates `/robots.txt` from `SITE_URL`
 * rather than a hand-maintained static file, so its `Sitemap:` directive
 * can't drift from the app's actual production origin.
 */
export function loader(): Response {
  return staticTextResponse(ROBOTS_TXT_BODY, "text/plain; charset=utf-8");
}
