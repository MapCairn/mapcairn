// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE } from "@mapcairn/core";
import {
  PLAYGROUND_PATH,
  SITE_URL,
  SOURCE_REPOSITORY_URL,
} from "../constants/siteConfig";
import { productMarkdown } from "./productMarkdown";

/*
 * `/llms.txt` and `/llms-full.txt`, in the llmstxt.org layout: an h1, a
 * one-sentence summary as a blockquote, a few plain paragraphs, then sections
 * of links with a note each. The product comes first and the playground
 * second. Both files are built from the product page's own content and the
 * catalogue's English text, so they cannot drift from what the pages say.
 */

/** A file in the repository as raw Markdown, which a model reads best. */
function rawFile(path: string): string {
  return `${SOURCE_REPOSITORY_URL.replace("https://github.com/", "https://raw.githubusercontent.com/")}/main/${path}`;
}

/** The one-sentence summary. */
const SUMMARY =
  "MapCairn is an open-source SDK, under the AGPL-3.0, for building accessible, privacy-respecting map applications on MapLibre GL JS and React.";

/** What MapCairn is, what it is not, and how to use it today, in plain words. */
const DETAILS = `It gives a team a complete map interface, open data layers defined as data, measuring and drawing tools, and a design system, with every service behind a small interface (a port) that a host implements with its own adapter. It is not a hosted service, a dataset or a GIS analysis engine, and MapLibre GL JS is its only map engine.

It is used from its source on GitHub (linked below): clone the repository and build it, or start from the example app in \`examples/embed\`.`;

/** The playground's description, the same words its page renders for crawlers. */
const PLAYGROUND_SUMMARY = EN_GB_CATALOGUE["host.map.summary"];

/** The guides and documents, as raw Markdown. */
const DOCUMENTS: readonly (readonly [string, string, string])[] = [
  [
    "README",
    "README.md",
    "what the SDK offers, how to embed it and the packages",
  ],
  [
    "Embedding and extending",
    "docs/guides/extending.md",
    "embedding the SDK in an app, and adding basemaps, layers, search and routing providers and adapters",
  ],
  [
    "Serving layers",
    "docs/guides/serving-layers.md",
    "which layer kind to serve from your own server, with OGC API Features, WMS and WMTS examples",
  ],
  [
    "Content Security Policy",
    "docs/guides/content-security-policy.md",
    "the directives a page hosting the SDK needs, and why",
  ],
  [
    "Translating the SDK",
    "docs/guides/translate-the-sdk.md",
    "using the SDK in another language and offering a choice of languages",
  ],
  [
    "Capability matrix",
    "docs/guides/capability-matrix.md",
    "what a GIS application needs, and what MapCairn has, partly has or lacks",
  ],
  [
    "Architecture",
    "ARCHITECTURE.md",
    "layers, ports and adapters, the map adapter and data layers",
  ],
  [
    "Design system",
    "DESIGN.md",
    "tokens, layout slots and accessibility contracts",
  ],
  [
    "Roadmap",
    "ROADMAP.md",
    "where the project is going, and what it will not do",
  ],
];

/** The links of `/llms.txt`, by section. */
function linkSections(): string {
  const docs = DOCUMENTS.map(
    ([name, path, note]) => `- [${name}](${rawFile(path)}): ${note}.`,
  ).join("\n");
  return `## Product

- [MapCairn](${SITE_URL}/): the product page: what the SDK is, who it is for, the embedding example, when it fits and the licence.
- [Product page as Markdown](${SITE_URL}/index.md): the same page as plain Markdown.

## Playground

- [Map playground](${SITE_URL}${PLAYGROUND_PATH}): ${PLAYGROUND_SUMMARY} A link can carry the view, the basemap and the layers in the part after #, for example ${SITE_URL}${PLAYGROUND_PATH}#map=11.00/-33.92000/18.42000.
- WebMCP: in a browser that offers \`document.modelContext\`, the playground registers tools an agent in that browser can call to work the map, such as searching for a place or measuring. A place name given to one is sent to the search service, as the privacy policy says.

## Docs

${docs}

## Policies and source

- [Privacy policy](${SITE_URL}/privacy): what the reference site stores and sends, and to whom.
- [Source code](${SOURCE_REPOSITORY_URL}): the repository, open source under the AGPL-3.0.

## Optional

- [Full text](${SITE_URL}/llms-full.txt): this file with the product page's whole text.`;
}

/** The body of `/llms.txt`. */
export function llmsText(): string {
  return `# MapCairn

> ${SUMMARY}

${DETAILS}

${linkSections()}
`;
}

/** The body of `/llms-full.txt`: the links, then the product page's whole text. */
export function llmsFullText(): string {
  return `${llmsText()}
---

${productMarkdown()}`;
}
