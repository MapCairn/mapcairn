// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MetaDescriptor } from "react-router";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SITE_URL,
} from "./constants/siteConfig";
import type { JsonLdNode } from "./structuredData";

/**
 * The link preview images, each 1200 by 630 and drawn by the project itself
 * in one survey sheet look (`src/product/shareCard.ts`): the product page's
 * card (`scripts/generateSdkOgImage.ts`) and the playground's, for the map and
 * the pages around it (`scripts/generateOgImage.ts`). Their alt text says the
 * words on the card and what the sheet shows.
 */
export const PREVIEW_IMAGES = {
  product: {
    path: "/og-sdk.png",
    alt: "MapCairn: accessible map interfaces for the public. An open-source React SDK for public-interest maps, beside a survey sheet of contour lines with a pin, a measured line and a cairn.",
  },
  map: {
    path: "/og-image.png",
    alt: "The MapCairn playground: search places, compare basemaps and measure distances or areas, beside a survey sheet of contour lines with a pin, a measured line and a cairn.",
  },
} as const;

/** Which preview image a page uses. */
export type PreviewImage = keyof typeof PREVIEW_IMAGES;

/** The viewport tag every page carries. */
const VIEWPORT: MetaDescriptor = {
  name: "viewport",
  content: "width=device-width, initial-scale=1, viewport-fit=cover",
};

/** What one route says about itself. */
export interface PageMeta {
  readonly title: string;
  readonly description: string;
  /** The page's canonical, absolute URL. */
  readonly url: string;
  readonly image: PreviewImage;
  /** The page's structured data, as one JSON-LD document. */
  readonly structuredData: JsonLdNode;
}

/**
 * Builds the full `<title>`/`<meta>` tag set for one route from its own
 * title, description, canonical URL, preview image and structured data,
 * including every Open Graph and Twitter card tag derived from them.
 * @remarks Every route calls this directly with its own values, rather than
 *   exporting a `meta()` that only sets `title`/`description` and inheriting
 *   the rest from the root route via `matches`: React Router's per-route
 *   `meta()` replaces its parent's output entirely, and `title`/`description`
 *   aren't the only tags derived from a page's identity; `og:title`,
 *   `og:description`, `og:url`, `og:image`, `twitter:title`,
 *   `twitter:description` and the JSON-LD all are too. A route that only
 *   patched the first two would leave the rest silently describing whichever
 *   route rendered first.
 */
export function buildPageMeta({
  title,
  description,
  url,
  image,
  structuredData,
}: PageMeta): MetaDescriptor[] {
  const preview = PREVIEW_IMAGES[image];
  const imageUrl = `${SITE_URL}${preview.path}`;
  return [
    { title },
    { name: "description", content: description },
    VIEWPORT,
    { name: "robots", content: "index, follow" },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "MapCairn" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:locale", content: "en_GB" },
    { property: "og:image", content: imageUrl },
    { property: "og:image:width", content: String(OG_IMAGE_WIDTH) },
    { property: "og:image:height", content: String(OG_IMAGE_HEIGHT) },
    { property: "og:image:alt", content: preview.alt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: imageUrl },
    { name: "twitter:image:alt", content: preview.alt },
    { "script:ld+json": structuredData },
  ];
}
