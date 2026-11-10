import { SITE_URL } from "../constants/siteConfig";
import { staticTextResponse } from "./staticTextResponse";

const LLMS_TXT_BODY = `# MapCairn

> Explore an interactive map. Search places, compare basemaps and measure distances or areas.

## Pages

- [Map](${SITE_URL}/): search places, choose a basemap and measure distances or areas.
- [Privacy policy](${SITE_URL}/privacy): what data this site collects.
`;

/** Provides canonical English guidance for crawlers without advertising datasets. */
export function loader(): Response {
  return staticTextResponse(LLMS_TXT_BODY, "text/plain; charset=utf-8");
}
