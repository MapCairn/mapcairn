// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { serialiseUrlHash } from "@mapcairn/core";
import {
  PLAYGROUND_PATH,
  SOURCE_REPOSITORY_URL,
} from "../constants/siteConfig";
import embedExampleSource from "./embedExample.tsx?raw";

/*
 * The product page's words, once. The page (`ProductPage.tsx`), its Markdown
 * twin (`/index.md`), `/llms-full.txt` and the FAQ structured data are all
 * rendered from this module, so none of them can say something the others do
 * not. The page is developer-facing and English only (see
 * `scripts/copy-check/allowlist.mjs`); every claim here is checked against the
 * code and the documents named in the pull request that added it.
 */

/** A link inside a block of text. Paths starting with `/` are on this site. */
export interface InlineLink {
  readonly text: string;
  readonly href: string;
}

/** A name from the code, shown as code. */
export interface InlineCode {
  readonly code: string;
}

/** A run of text: plain words, a link or a name from the code. */
export type Inline = string | InlineLink | InlineCode;

/** One line of text made of runs. */
export type Line = readonly Inline[];

/** A term and its description, as in a legend or a glossary. */
export interface Term {
  readonly term: Line;
  readonly description: Line;
}

/** A question and its answer, both on the page. */
export interface Question {
  readonly question: string;
  readonly answer: readonly Line[];
}

/** One block of a section, in reading order. */
export type Block =
  | { readonly kind: "paragraph"; readonly text: Line }
  | { readonly kind: "list"; readonly items: readonly Line[] }
  | { readonly kind: "terms"; readonly items: readonly Term[] }
  | { readonly kind: "subheading"; readonly text: string }
  | {
      readonly kind: "code";
      readonly label: string;
      readonly language: string;
      readonly code: string;
    }
  | { readonly kind: "faq"; readonly items: readonly Question[] }
  | { readonly kind: "actions" }
  | { readonly kind: "deepLinks"; readonly links: readonly InlineLink[] };

/** A section of the page: an h2, its blocks, and the links that go deeper. */
export interface Section {
  readonly id: string;
  readonly heading: string;
  readonly blocks: readonly Block[];
  /** Where to read more, as plain links with descriptive names. */
  readonly further: readonly InlineLink[];
}

/** A file in the repository, on GitHub. */
function repoFile(path: string): string {
  return `${SOURCE_REPOSITORY_URL}/blob/main/${path}`;
}

/** An issue in the repository, on GitHub. */
function issue(number: number): string {
  return `${SOURCE_REPOSITORY_URL}/issues/${number}`;
}

/** The playground opened in a state a shared link can carry. */
function playgroundAt(state: Parameters<typeof serialiseUrlHash>[0]): string {
  return `${PLAYGROUND_PATH}${serialiseUrlHash(state)}`;
}

/** The issue that tracks publishing the packages to npm. */
export const FIRST_RELEASE_ISSUE_URL = issue(1);

/** The primary action, wherever the page offers it. */
export const GITHUB_ACTION: InlineLink = {
  text: "View on GitHub",
  href: SOURCE_REPOSITORY_URL,
};

/** The secondary action, wherever the page offers it. */
export const PLAYGROUND_ACTION: InlineLink = {
  text: "Try the playground",
  href: PLAYGROUND_PATH,
};

/** The page title, for the tab, search results and link previews. */
export const PRODUCT_TITLE =
  "MapCairn | Open-source SDK for accessible map applications";

/** The meta description, for search results and link previews. */
export const PRODUCT_DESCRIPTION =
  "An open-source SDK for accessible, privacy-respecting map applications on MapLibre GL JS and React: a complete map interface, open data layers as data, measuring and drawing tools, and a design system. AGPL-3.0.";

/** The page's one h1. */
export const HEADLINE =
  "An open-source SDK for accessible, privacy-respecting map applications";

/** The paragraph under the h1. */
export const LEDE: Line = [
  "MapCairn gives a team building a public-interest map the parts that are slow to get right: a complete map interface, open data layers defined as data, measuring and drawing tools, and a design system. It is built on MapLibre GL JS and React, and every service sits behind a small interface you can replace.",
];

/** The legend beside the headline: the facts a developer checks first. */
export const FACTS: readonly Term[] = [
  {
    term: ["Licence"],
    description: ["AGPL-3.0, open source"],
  },
  {
    term: ["Built with"],
    description: ["TypeScript, React and MapLibre GL JS"],
  },
  {
    term: ["Accessibility"],
    description: ["WCAG 2.2 AA is the target, in light and dark"],
  },
  {
    term: ["Status"],
    description: [
      "In development, used from the repository. ",
      { text: "Not on npm yet", href: FIRST_RELEASE_ISSUE_URL },
    ],
  },
];

/**
 * The embedding example, from the first line that starts with `import`,
 * exactly as it compiles: the licence header and the note above it are left out.
 */
export const EMBED_EXAMPLE_CODE = embedExampleSource
  .slice(embedExampleSource.search(/^import /m))
  .trimEnd();

/** A line as plain text: the words of its links and names, with no markup. */
export function lineToText(line: Line): string {
  return line
    .map((run) => {
      if (typeof run === "string") {
        return run;
      }
      return "code" in run ? run.code : run.text;
    })
    .join("");
}

/** The page's questions and answers as plain text, for its FAQ structured data. */
export function faqEntries(): { question: string; answer: string }[] {
  return SECTIONS.flatMap((section) => section.blocks)
    .filter((block) => block.kind === "faq")
    .flatMap((block) => block.items)
    .map(({ question, answer }) => ({
      question,
      answer: answer.map(lineToText).join(" "),
    }));
}

/** The page's sections, in reading order. */
export const SECTIONS: readonly Section[] = [
  {
    id: "who-it-is-for",
    heading: "Who it is for",
    blocks: [
      {
        kind: "paragraph",
        text: [
          "Teams that build maps for the public, such as governments, non-profits, researchers and civic technology groups, whose maps have to work for everyone, ask for nothing they do not need, and stay maintainable for years.",
        ],
      },
      {
        kind: "paragraph",
        text: [
          "A map renderer draws the map. Everything around it is still yours to build: the search box, the sheet or side panel, the layer list and its key, measuring and drawing, keyboard control, announcements for screen readers, and the tests that keep them working. MapCairn is that part, built and tested.",
        ],
      },
      {
        kind: "paragraph",
        text: [
          "It is not a hosted service, a dataset or a GIS analysis engine, and MapLibre GL JS is its only map engine.",
        ],
      },
    ],
    further: [
      { text: "Read the README on GitHub", href: repoFile("README.md") },
    ],
  },
  {
    id: "the-code",
    heading: "What the code looks like",
    blocks: [
      {
        kind: "paragraph",
        text: [
          "An app wraps the map in a services provider and gives it the services it uses. This is a whole app, and the same code is compiled and rendered by the project's tests:",
        ],
      },
      {
        kind: "code",
        label: "Embedding example",
        language: "tsx",
        code: EMBED_EXAMPLE_CODE,
      },
      {
        kind: "terms",
        items: [
          {
            term: [{ code: "createFakeServices()" }],
            description: [
              "The services: search, storage, the map adapter and the rest. These are the SDK's fakes, which request nothing; a real app passes its own adapters, such as one over MapLibre GL JS.",
            ],
          },
          {
            term: [
              { code: "ServicesProvider" },
              ", ",
              { code: "LiveRegionProvider" },
              ", ",
              { code: "TooltipProvider" },
            ],
            description: [
              "The providers: the services for every component below, the one announcer for screen readers, and tooltips.",
            ],
          },
          {
            term: [{ code: "MapView" }],
            description: [
              "The map region, with keyboard control and focus, which drives the engine through the map adapter. The search box, controls, sheet and credits go in its ",
              { code: "chrome" },
              ", laid out by ",
              { code: "MapChrome" },
              ".",
            ],
          },
        ],
      },
      {
        kind: "paragraph",
        text: [
          "The packages are not on npm yet, so today you use them from the repository. ",
          {
            text: "Publishing the first release is tracked in issue 1",
            href: FIRST_RELEASE_ISSUE_URL,
          },
          ".",
        ],
      },
    ],
    further: [
      {
        text: "Embed the SDK in an app of your own",
        href: repoFile("docs/guides/extending.md"),
      },
      {
        text: "The example app in examples/embed",
        href: `${SOURCE_REPOSITORY_URL}/tree/main/examples/embed`,
      },
    ],
  },
  {
    id: "packages",
    heading: "What is in the SDK",
    blocks: [
      {
        kind: "terms",
        items: [
          {
            term: [{ code: "@mapcairn/core" }],
            description: [
              "The port interfaces, pure logic, basemap definitions, fakes and contract suites. No React and no browser globals.",
            ],
          },
          {
            term: [{ code: "@mapcairn/map" }],
            description: [
              "The map interface: the chrome, the sheet and its panels, the tools, ",
              { code: "MapView" },
              " and the services provider.",
            ],
          },
          {
            term: [{ code: "@mapcairn/react" }],
            description: ["Generic React hooks."],
          },
          {
            term: [{ code: "@mapcairn/theme" }],
            description: [
              "The typed design tokens and their contrast calculations.",
            ],
          },
        ],
      },
      {
        kind: "paragraph",
        text: [
          "Beside them, ",
          { code: "@mapcairn/geolint" },
          " is a GeoJSON linter, a command and a library under Apache-2.0, independent of the rest.",
        ],
      },
    ],
    further: [
      {
        text: "The packages, in the README",
        href: `${repoFile("README.md")}#what-is-in-the-box`,
      },
    ],
  },
  {
    id: "how-it-is-built",
    heading: "How it is built",
    blocks: [
      {
        kind: "list",
        items: [
          [
            "The interface depends on ports, never on MapLibre or a browser service. Search, search suggestions, routing, storage, geolocation, the clipboard and the rest are small interfaces, each with a fake and a shared contract suite, so the whole interface can be tested without WebGL.",
          ],
          [
            "Adapters, the code that touches an engine or a network service, live in the host and are wired together once.",
          ],
          [
            "Geometry, measurement, formatting, URL state and the interface's state machine are plain functions with no DOM, held to 95 percent test coverage.",
          ],
          [
            "Layers are data. A layer is one definition: a feed, raster or vector tiles, a heatmap, or a query for what is in view. MapCairn draws it and builds its legend, card and list.",
          ],
          [
            "The design system is typed tokens only, light and dark, with one accent and contrast checked in tests. A style scanner rejects raw colours, off-scale spacing and unnamed controls.",
          ],
        ],
      },
    ],
    further: [
      {
        text: "The architecture: layers, ports and adapters",
        href: repoFile("ARCHITECTURE.md"),
      },
      {
        text: "The design system: tokens, layout and accessibility contracts",
        href: repoFile("DESIGN.md"),
      },
    ],
  },
  {
    id: "accessibility-and-privacy",
    heading: "Accessibility and privacy you can check",
    blocks: [
      { kind: "subheading", text: "Accessibility" },
      {
        kind: "list",
        items: [
          ["WCAG 2.2 AA is the target, in the light and the dark theme."],
          [
            "Every gesture has a keyboard or single-tap equivalent: the arrow keys pan, plus and minus zoom, and P drops a pin.",
          ],
          [
            "Announcements go through one live region, throttled and de-duplicated, so a screen reader hears each outcome once.",
          ],
          [
            "Automated accessibility checks run on every pull request, in both themes and at widths from 320 pixels.",
          ],
        ],
      },
      { kind: "subheading", text: "Privacy" },
      {
        kind: "list",
        items: [
          [
            "Nothing is requested until a person asks, except the search suggestions a host may turn on, which send the text typed so far.",
          ],
          [
            "No accounts and no tracking. Settings stay on the device, in local storage.",
          ],
          [
            "Nothing is proxied: the browser talks to each provider directly, and only after it is asked to.",
          ],
          [
            "The reference site names every provider it can contact in its privacy policy and its credits.",
          ],
        ],
      },
    ],
    further: [
      { text: "The reference site's privacy policy", href: "/privacy" },
      {
        text: "The accessibility contracts in DESIGN.md",
        href: `${repoFile("DESIGN.md")}#components-and-accessibility-contracts`,
      },
    ],
  },
  {
    id: "see-it-working",
    heading: "See it working",
    blocks: [
      {
        kind: "paragraph",
        text: [
          "The playground is the reference site built from these packages, and the app the project's browser tests run against. Search for a place or a pair of coordinates, measure a distance or an area, draw shapes and export them as GeoJSON, CSV or WKT, switch the basemap, turn on an open data layer, and switch the language to Afrikaans in Settings.",
        ],
      },
      {
        kind: "deepLinks",
        links: [
          {
            text: "Open the playground over Cape Town",
            href: playgroundAt({
              view: {
                center: { lat: -33.92, lng: 18.42 },
                zoom: 11,
                bearing: 0,
              },
            }),
          },
          {
            text: "Open the playground on the Dark basemap",
            href: playgroundAt({ basemapId: "dark" }),
          },
          {
            text: "Open the playground with the past day's earthquakes turned on",
            href: playgroundAt({
              view: { center: { lat: 20, lng: 0 }, zoom: 1.5, bearing: 0 },
              layers: { enabled: ["earthquakes"], controls: {} },
            }),
          },
        ],
      },
      { kind: "actions" },
    ],
    further: [
      {
        text: "Using the reference site",
        href: repoFile("docs/guides/using-the-reference-site.md"),
      },
    ],
  },
  {
    id: "status",
    heading: "What works today, and what does not yet",
    blocks: [
      { kind: "subheading", text: "Works today" },
      {
        kind: "list",
        items: [
          [
            "Search by place name or coordinates, with optional suggestions as you type.",
          ],
          [
            "Measuring, and drawing and editing shapes, with GeoJSON, CSV and WKT import and export.",
          ],
          ["Directions through a routing provider you supply."],
          [
            "Data layers from feeds, raster and vector tiles, heatmaps and queries for what is in view, with a key on the map.",
          ],
          [
            "Links that carry the view, the basemap, the layers and drawn shapes, and saving the map as an image.",
          ],
        ],
      },
      { kind: "subheading", text: "Not yet" },
      {
        kind: "list",
        items: [
          [
            {
              text: "Packages published to npm, with versioned releases",
              href: FIRST_RELEASE_ISSUE_URL,
            },
          ],
          [
            {
              text: "A simpler way into an existing server-rendered application",
              href: issue(51),
            },
          ],
          [
            {
              text: "Support for any language a host chooses",
              href: issue(231),
            },
            ", in progress: the interface already reads its text from a message catalogue, and the reference site offers English and Afrikaans.",
          ],
          [{ text: "Importing GPX and KML files", href: issue(227) }],
          [{ text: "Tiles read from a PMTiles archive", href: issue(192) }],
          [{ text: "Hosts that sit behind a login", href: issue(45) }],
        ],
      },
    ],
    further: [
      {
        text: "The capability matrix: what MapCairn has, partly has and lacks",
        href: repoFile("docs/guides/capability-matrix.md"),
      },
      { text: "The roadmap", href: repoFile("ROADMAP.md") },
    ],
  },
  {
    id: "licence",
    heading: "Licence",
    blocks: [
      {
        kind: "paragraph",
        text: [
          "MapCairn is open source under the AGPL-3.0, and each SDK package carries its own copy. If you ship the SDK in a product, or let people use a modified version over a network, you publish the corresponding source under the same licence.",
        ],
      },
      {
        kind: "paragraph",
        text: [
          "The SDK packages depend only on permissively licensed packages, and the project's lint fails when a new production dependency has any other licence. The GeoJSON linter, ",
          { code: "@mapcairn/geolint" },
          ", is Apache-2.0.",
        ],
      },
    ],
    further: [{ text: "The licence text", href: repoFile("LICENSE") }],
  },
  {
    id: "questions",
    heading: "Questions developers ask first",
    blocks: [
      {
        kind: "faq",
        items: [
          {
            question: "Which frameworks does it work with?",
            answer: [
              [
                "React 19, and a bundler that runs vanilla-extract, such as Vite with its vanilla-extract plugin. The map engine is MapLibre GL JS, reached through an adapter.",
              ],
            ],
          },
          {
            question: "What does it cost?",
            answer: [
              [
                "Nothing: it is open source under the AGPL-3.0. The services a map uses, such as tiles, search and routing, are yours to choose, and each provider has its own terms.",
              ],
            ],
          },
          {
            question: "Is it ready for production?",
            answer: [
              [
                "The reference site runs on it in production. The packages have no published release yet, so you use them from the repository until ",
                { text: "the first release", href: FIRST_RELEASE_ISSUE_URL },
                ".",
              ],
            ],
          },
          {
            question: "Can I use my own tiles and my own search?",
            answer: [
              [
                "Yes. A basemap is a definition you add as data, and search, suggestions and routing are ports you implement with an adapter of your own, checked by the SDK's contract suites.",
              ],
            ],
          },
          {
            question: "How is it licensed?",
            answer: [
              [
                "The SDK is AGPL-3.0. The GeoJSON linter is Apache-2.0. The SDK's own dependencies are permissively licensed.",
              ],
            ],
          },
          {
            question: "Is it accessible?",
            answer: [
              [
                "WCAG 2.2 AA is the target in both themes. Everything works from the keyboard, announcements go through one live region, and automated accessibility checks run on every pull request.",
              ],
            ],
          },
          {
            question: "What does it send to third parties?",
            answer: [
              [
                "The SDK sends nothing by itself: requests come from the adapters a host supplies, and only when a person asks. The reference site's browser contacts the map tile providers, the search and routing services when you use them, and a layer's provider when you turn it on, as ",
                { text: "its privacy policy", href: "/privacy" },
                " lists.",
              ],
            ],
          },
        ],
      },
    ],
    further: [],
  },
  {
    id: "follow-and-help",
    heading: "Follow the project and help",
    blocks: [
      {
        kind: "paragraph",
        text: [
          "MapCairn is developed in the open: the roadmap, the governance and every decision are in the repository. Star it to follow it, open an issue for a bug or an idea, or read the contributing guide to send a change.",
        ],
      },
      { kind: "actions" },
    ],
    further: [
      { text: "Open issues", href: `${SOURCE_REPOSITORY_URL}/issues` },
      { text: "The contributing guide", href: repoFile("CONTRIBUTING.md") },
      { text: "The roadmap", href: repoFile("ROADMAP.md") },
      { text: "How decisions are made", href: repoFile("GOVERNANCE.md") },
    ],
  },
];
