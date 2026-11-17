// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE } from "@mapcairn/core";
import {
  PLAYGROUND_PATH,
  SITE_URL,
  SOURCE_REPOSITORY_URL,
} from "../constants/siteConfig";
import { FIRST_RELEASE_ISSUE_URL } from "./productContent";
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

/**
 * The WebMCP tools the playground registers when the browser offers
 * `document.modelContext`, in the order `useMapModelContextTools` registers
 * them. A test reads that file and keeps this list equal to it.
 */
export const PLAYGROUND_TOOLS: readonly string[] = [
  "search-map-location",
  "set-map-basemap",
  "set-app-theme",
  "measure-distance",
  "measure-area",
];

/** The one-sentence summary. */
const SUMMARY =
  "MapCairn is an open-source SDK, under the AGPL-3.0, for building accessible, privacy-respecting map applications on MapLibre GL JS and React.";

/** What MapCairn is not, and its status, in plain words. */
const DETAILS = `It gives a team a complete map interface, open data layers defined as data, measuring and drawing tools, and a design system, with every service behind a small interface (a port) that a host implements with its own adapter. It is not a hosted service, a dataset or a GIS analysis engine, and MapLibre GL JS is its only map engine.

Status: the packages are not published to npm yet, so they are used from the repository (first release: ${FIRST_RELEASE_ISSUE_URL}).`;

/** The playground's description, the same words its page renders for crawlers. */
const PLAYGROUND_SUMMARY = EN_GB_CATALOGUE["host.map.summary"];

/** The guides and documents, as raw Markdown. */
const DOCUMENTS: readonly (readonly [string, string, string])[] = [
  ["README", "README.md", "what the SDK offers, the packages and the status"],
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
  ["Roadmap", "ROADMAP.md", "what is planned, and what is not"],
];

/** The links of `/llms.txt`, by section. */
function linkSections(): string {
  const docs = DOCUMENTS.map(
    ([name, path, note]) => `- [${name}](${rawFile(path)}): ${note}.`,
  ).join("\n");
  return `## Product

- [MapCairn](${SITE_URL}/): the product page: what the SDK is, who it is for, the embedding example, the status and the licence.
- [Product page as Markdown](${SITE_URL}/index.md): the same page as plain Markdown.

## Playground

- [Map playground](${SITE_URL}${PLAYGROUND_PATH}): ${PLAYGROUND_SUMMARY} A link can carry the view, the basemap and the layers in the part after #, for example ${SITE_URL}${PLAYGROUND_PATH}#map=11.00/-33.92000/18.42000.
- WebMCP: in a browser that offers \`document.modelContext\`, the playground registers ${PLAYGROUND_TOOLS.length} tools for an agent in that browser: ${PLAYGROUND_TOOLS.map((name) => `\`${name}\``).join(", ")}. A place name given to one is sent to the search service, as the privacy policy says; a pair of coordinates is read in the browser.

## Docs

${docs}

## Policies and source

- [Privacy policy](${SITE_URL}/privacy): what the reference site stores and sends, and to whom.
- [Source code](${SOURCE_REPOSITORY_URL}): the repository, issues and pull requests.
- [Licence](${rawFile("LICENSE")}): AGPL-3.0.

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
