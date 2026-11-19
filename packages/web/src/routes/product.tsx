// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useState } from "react";
import type { LinksFunction, MetaFunction } from "react-router";
import type { ModulePreloadHandle } from "../app/modulePreload";
import { buildPageMeta } from "../buildPageMeta";
import { createProductClipboard } from "../composition/productClipboard";
import { PRODUCT_DESCRIPTION, SITE_URL } from "../constants/siteConfig";
import type { PageLanguageHandle } from "../i18n/pageLanguage";
import { ProductPage } from "../product/ProductPage";
import { faqEntries, PRODUCT_TITLE } from "../product/productContent";
import {
  faqNode,
  jsonLdGraph,
  softwareSourceCodeNode,
  websiteNode,
} from "../structuredData";

/** The product page's canonical URL: the site's front page. */
const PRODUCT_URL = `${SITE_URL}/`;

/**
 * React Router route module export: the product page's title, description,
 * Open Graph and Twitter tags (with the SDK's own preview image) and
 * structured data: the site, the SDK's source code and the questions the page
 * answers, each answer on the page.
 */
export const meta: MetaFunction = () =>
  buildPageMeta({
    title: PRODUCT_TITLE,
    description: PRODUCT_DESCRIPTION,
    url: PRODUCT_URL,
    image: "product",
    structuredData: jsonLdGraph([
      websiteNode(),
      softwareSourceCodeNode(PRODUCT_DESCRIPTION),
      faqNode(faqEntries()),
    ]),
  });

/**
 * React Router route module export: the canonical link, and the page's text
 * as Markdown for readers that prefer it.
 */
export const links: LinksFunction = () => [
  { rel: "canonical", href: PRODUCT_URL },
  {
    rel: "alternate",
    type: "text/markdown",
    href: "/index.md",
    title: "MapCairn product page as Markdown",
  },
];

/**
 * React Router route module export: the page is English only, so the
 * document's language stays English whatever the playground was set to. It
 * is readable before its scripts run, so they are not preloaded in the head,
 * where they would delay the first paint.
 */
export const handle: PageLanguageHandle & ModulePreloadHandle = {
  language: "en-GB",
  modulePreload: false,
};

/**
 * React Router route module export: the product page at `/`, with the
 * browser clipboard for its copy button and no other service.
 */
export default function ProductRoute() {
  const [clipboard] = useState(createProductClipboard);
  return <ProductPage clipboard={clipboard} />;
}
