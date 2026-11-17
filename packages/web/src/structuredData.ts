// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  PLAYGROUND_PATH,
  SITE_URL,
  SOURCE_REPOSITORY_URL,
} from "./constants/siteConfig";

/*
 * The schema.org structured data each page carries, as JSON-LD. Every field
 * states a fact that holds in the repository: the licence is the one in
 * `LICENSE`, the language the one in the packages' source, the repository the
 * one Help links to. Nothing here is a rating, an organisation with invented
 * details or a claim the pages do not make.
 */

/** A JSON-LD node: a plain object with a `@type`. */
export type JsonLdNode = Readonly<Record<string, unknown>>;

/** The SPDX identifier of the licence, and its canonical page. */
const LICENCE_ID = "AGPL-3.0-only";
const LICENCE_URL = `https://spdx.org/licenses/${LICENCE_ID}.html`;

const WEBSITE_ID = `${SITE_URL}/#website`;
const SOFTWARE_ID = `${SITE_URL}/#software`;

/** The site itself. */
export function websiteNode(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: "MapCairn",
    url: `${SITE_URL}/`,
    inLanguage: "en-GB",
  };
}

/** The SDK's source code: what the product page describes. */
export function softwareSourceCodeNode(description: string): JsonLdNode {
  return {
    "@type": "SoftwareSourceCode",
    "@id": SOFTWARE_ID,
    name: "MapCairn",
    description,
    url: `${SITE_URL}/`,
    codeRepository: SOURCE_REPOSITORY_URL,
    license: LICENCE_URL,
    programmingLanguage: "TypeScript",
    runtimePlatform: "Web browser",
    isAccessibleForFree: true,
  };
}

/** The playground: the reference site's map, built from the SDK. */
export function playgroundNode(description: string): JsonLdNode {
  return {
    "@type": "WebApplication",
    name: "MapCairn playground",
    description,
    url: `${SITE_URL}${PLAYGROUND_PATH}`,
    applicationCategory: "MappingApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript and WebGL.",
    isAccessibleForFree: true,
    license: LICENCE_URL,
    inLanguage: ["en-GB", "af"],
    isPartOf: { "@id": WEBSITE_ID },
    isBasedOn: { "@id": SOFTWARE_ID },
  };
}

/** A page of the site that is neither the product nor the playground. */
export function webPageNode(
  name: string,
  description: string,
  url: string,
): JsonLdNode {
  return {
    "@type": "WebPage",
    name,
    description,
    url,
    isPartOf: { "@id": WEBSITE_ID },
  };
}

/** One step of a breadcrumb trail. */
export interface Crumb {
  readonly name: string;
  readonly url: string;
}

/** The trail from the product page to this one. */
export function breadcrumbNode(trail: readonly Crumb[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

/** The first step of every trail: the product page. */
export const HOME_CRUMB: Crumb = { name: "MapCairn", url: `${SITE_URL}/` };

/** A question and its answer as plain text, both shown on the page. */
export interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

/** The questions the product page answers. */
export function faqNode(entries: readonly FaqEntry[]): JsonLdNode {
  return {
    "@type": "FAQPage",
    mainEntity: entries.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

/** Several nodes as one JSON-LD document. */
export function jsonLdGraph(nodes: readonly JsonLdNode[]): JsonLdNode {
  return { "@context": "https://schema.org", "@graph": nodes };
}
