// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
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
 * `scripts/copy-check/allowlist.mjs`).
 *
 * Evergreen by design: it describes what the SDK is and how it is built, not
 * counts, versions, dates, plans or what is in progress, so a change to the SDK
 * normally needs nothing here. What is current lives in the repository's
 * documentation, which the page links to.
 *
 * Links: GitHub's own pages (the repository, its documentation and licence
 * sections and its contributing page), this site and the page's own anchors.
 * Never a Markdown file, an issue, a pull request or a milestone. A
 * documentation site (#199 in the repository) will replace the documentation
 * link when it exists.
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

/** One item that opens to show more: a one-line summary and the detail under it. */
export interface Disclosure {
  readonly summary: string;
  readonly detail: readonly Line[];
}

/** One block of a section, in reading order. */
export type Block =
  | { readonly kind: "paragraph"; readonly text: Line }
  | { readonly kind: "list"; readonly items: readonly Line[] }
  | { readonly kind: "subheading"; readonly text: string }
  | {
      readonly kind: "code";
      readonly label: string;
      readonly language: string;
      readonly code: string;
    }
  | { readonly kind: "details"; readonly items: readonly Disclosure[] }
  | { readonly kind: "actions" }
  | { readonly kind: "deepLinks"; readonly links: readonly InlineLink[] };

/** A section of the page: an h2, its blocks, and the links that go further. */
export interface Section {
  readonly id: string;
  readonly heading: string;
  readonly blocks: readonly Block[];
  /** Where to read more, as plain links with descriptive names. */
  readonly further: readonly InlineLink[];
}

/** The repository's front page at its documentation section, where GitHub shows the README's table of guides. */
export const DOCUMENTATION_URL = `${SOURCE_REPOSITORY_URL}#documentation`;

/** GitHub's own page on how to contribute to the repository. */
export const CONTRIBUTE_URL = `${SOURCE_REPOSITORY_URL}/contribute`;

/** The README's licence section on the repository's front page, which also says where the credits are. */
export const LICENCE_URL = `${SOURCE_REPOSITORY_URL}#licence`;

/** The example app's folder on GitHub. */
const EXAMPLE_URL = `${SOURCE_REPOSITORY_URL}/tree/main/examples/embed`;

/**
 * The playground opened over a place, through the same address the playground
 * writes when a view is shared (`#map=zoom/latitude/longitude`). A test reads
 * each back with the app's own hash parser. Views only: a place does not go
 * away, where a basemap or a layer might.
 */
export const DEEP_LINKS: readonly InlineLink[] = [
  {
    text: "Open the playground over Cape Town",
    href: `${PLAYGROUND_PATH}#map=11.00/-33.92000/18.42000`,
  },
  {
    text: "Open the playground over the whole world",
    href: `${PLAYGROUND_PATH}#map=1.50/20.00000/0.00000`,
  },
];

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

/** The page's one h1: the pitch in one sentence. */
export const HEADLINE =
  "An open-source SDK for accessible, privacy-respecting map applications";

/** The short paragraph under the h1. */
export const LEDE: Line = [
  "The whole interface around a MapLibre map, open data layers written as data, and every service behind a small interface you can replace. For teams building maps for the public.",
];

/** The line under the hero's two buttons. */
export const HERO_NOTE: Line = [
  "Open source under the AGPL-3.0. Contributions are welcome.",
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

/** The id of the section that holds the questions. */
export const QUESTIONS_ID = "questions";

/** The page's questions and answers as plain text, for its FAQ structured data. */
export function faqEntries(): { question: string; answer: string }[] {
  return SECTIONS.filter((section) => section.id === QUESTIONS_ID)
    .flatMap((section) => section.blocks)
    .filter((block) => block.kind === "details")
    .flatMap((block) => block.items)
    .map(({ summary, detail }) => ({
      question: summary,
      answer: detail.map(lineToText).join(" "),
    }));
}

/** The page's sections, in reading order. */
export const SECTIONS: readonly Section[] = [
  {
    id: "embed",
    heading: "Embed a map",
    blocks: [
      {
        kind: "paragraph",
        text: [
          "This is a whole React app: the map, the SDK's interface around it and a search box. The project's tests compile and render this exact code.",
        ],
      },
      {
        kind: "code",
        label: "Embedding example",
        language: "tsx",
        code: EMBED_EXAMPLE_CODE,
      },
      {
        kind: "details",
        items: [
          {
            summary: "What each part does",
            detail: [
              [
                { code: "ServicesProvider" },
                " holds the services: search, storage, the map adapter and the rest. ",
                { code: "createFakeServices()" },
                " gives the SDK's in-memory fakes, which request nothing and draw no map tiles; a real app passes its own adapters, such as one over MapLibre GL JS.",
              ],
              [
                { code: "LiveRegionProvider" },
                " and ",
                { code: "TooltipProvider" },
                " add the one announcer for screen readers and the tooltips.",
              ],
              [
                { code: "MapView" },
                " is the map region, with keyboard control and focus. ",
                { code: "MapChrome" },
                " lays out everything over the map in named slots, here the search box at the top.",
              ],
            ],
          },
          {
            summary: "The packages",
            detail: [
              [
                { code: "@mapcairn/core" },
                ": the port interfaces, pure logic, basemap definitions, fakes and contract suites. No React and no browser globals.",
              ],
              [
                { code: "@mapcairn/map" },
                ": the map interface, from the chrome, the sheet and its panels to the tools and ",
                { code: "MapView" },
                ".",
              ],
              [{ code: "@mapcairn/react" }, ": generic React hooks."],
              [
                { code: "@mapcairn/theme" },
                ": the typed design tokens and their contrast calculations.",
              ],
              [
                "Beside them, ",
                { code: "@mapcairn/geolint" },
                " is a GeoJSON linter under Apache-2.0, independent of the rest.",
              ],
            ],
          },
        ],
      },
    ],
    further: [
      { text: "The example app on GitHub", href: EXAMPLE_URL },
      { text: "The documentation on GitHub", href: DOCUMENTATION_URL },
    ],
  },
  {
    id: "what-you-get",
    heading: "What you get",
    blocks: [
      {
        kind: "paragraph",
        text: ["What a map renderer leaves to you, built and tested."],
      },
      {
        kind: "details",
        items: [
          {
            summary: "A finished map interface",
            detail: [
              [
                "Search by place or by coordinates, measuring, drawing and editing shapes with import and export, directions through a routing provider you supply, a layers panel with keys and feature cards, saving the map as an image, and links that carry what is on the map.",
              ],
            ],
          },
          {
            summary: "Open data layers written as data",
            detail: [
              [
                "A layer is one definition: a feed, tiles, a heatmap or a query for what is in view. The SDK draws it, builds its key, card and list, keeps words beside every colour, and validates the definition.",
              ],
            ],
          },
          {
            summary: "Accessible by default",
            detail: [
              [
                "WCAG 2.2 AA is the target in the light and the dark theme. Every gesture has a keyboard or single-tap equivalent, announcements go through one live region, and automated accessibility checks run on every pull request.",
              ],
            ],
          },
          {
            summary: "Private by design",
            detail: [
              [
                "Apart from the basemap, nothing is requested until a person asks: a layer loads when it is turned on, a search when it is submitted. The exception is search suggestions, which a host may turn on and which send the text typed so far. No accounts, no tracking, settings kept on the device, and nothing proxied.",
              ],
            ],
          },
          {
            summary: "Every service behind a port",
            detail: [
              [
                "The interface never imports MapLibre or an adapter. Search, routing, storage, layers, the map engine and the rest are small interfaces, each with an in-memory fake and a shared contract suite, so the whole interface can be tested without WebGL or a network, and any service replaced without touching it.",
              ],
            ],
          },
          {
            summary: "A design system with checked contrast",
            detail: [
              [
                "Typed tokens only, light and dark themes and one accent. The contrast of every token pair is calculated in a test, and a style scanner rejects raw colours, off-scale spacing and unnamed controls.",
              ],
            ],
          },
        ],
      },
    ],
    further: [],
  },
  {
    id: "see-it-working",
    heading: "See it working",
    blocks: [
      {
        kind: "paragraph",
        text: [
          "The playground is the reference site, built from these packages. Search for a place or a pair of coordinates, measure and draw, switch the basemap, turn on a data layer, or change the language in Settings.",
        ],
      },
      { kind: "deepLinks", links: DEEP_LINKS },
    ],
    further: [],
  },
  {
    id: "fit",
    heading: "When it fits, and when it does not",
    blocks: [
      { kind: "subheading", text: "It fits a team that" },
      {
        kind: "list",
        items: [
          ["builds in React and wants a finished, accessible map interface;"],
          [
            "shows open data that the browser fetches straight from its provider, only when asked;",
          ],
          ["wants to test its map interface against fakes, without WebGL."],
        ],
      },
      { kind: "subheading", text: "It is not" },
      {
        kind: "list",
        items: [
          ["a hosted service, a dataset or a GIS analysis engine;"],
          ["a wrapper for map engines other than MapLibre GL JS."],
        ],
      },
    ],
    further: [
      {
        text: "What MapCairn has and lacks today, in the documentation",
        href: DOCUMENTATION_URL,
      },
    ],
  },
  {
    id: QUESTIONS_ID,
    heading: "Questions",
    blocks: [
      {
        kind: "details",
        items: [
          {
            summary: "How do I use it?",
            detail: [
              [
                "From its source on GitHub: clone the repository and build it, or start from the example app in ",
                { code: "examples/embed" },
                ", which uses the SDK only through its public entry points. The playground shows the whole SDK working.",
              ],
            ],
          },
          {
            summary: "Is it ready for production?",
            detail: [
              [
                "The reference site runs on it in production, and every change passes the project's unit, browser and accessibility tests before it is merged. What it has and lacks today is in the documentation on GitHub.",
              ],
            ],
          },
          {
            summary: "Is it accessible?",
            detail: [
              [
                "WCAG 2.2 AA is the target in both themes. Every gesture has a keyboard or single-tap equivalent, the map itself can be panned and zoomed from the keyboard, and announcements go through one live region. Automated accessibility checks run on every pull request.",
              ],
            ],
          },
          {
            summary: "Which frameworks does it work with?",
            detail: [
              [
                "React, with a bundler that runs vanilla-extract, such as Vite with its vanilla-extract plugin. The map engine is MapLibre GL JS, reached through an adapter.",
              ],
            ],
          },
          {
            summary: "What does it cost?",
            detail: [
              [
                "Nothing: it is open source under the AGPL-3.0. The services a map uses, such as tiles, search and routing, are yours to choose, and each provider has its own terms.",
              ],
            ],
          },
          {
            summary: "Can I use my own tiles and my own search?",
            detail: [
              [
                "Yes. A basemap is a definition you add as data, and search, suggestions and routing are ports you implement with an adapter of your own, checked by the SDK's contract suites.",
              ],
            ],
          },
          {
            summary: "How is it licensed?",
            detail: [
              [
                "The SDK is AGPL-3.0: if you ship it in a product, or let people use a modified version over a network, you publish the corresponding source under the same licence. The GeoJSON linter is Apache-2.0, and the SDK's own dependencies are permissively licensed.",
              ],
            ],
          },
          {
            summary: "What does it send to third parties?",
            detail: [
              [
                "The SDK sends nothing by itself: requests come from the adapters a host supplies, and only when a person asks. The reference site counts page views with Cloudflare Web Analytics, which is cookieless, and its browser contacts the map tile providers, the search and routing services when you use them, and a layer's provider when you turn it on, as ",
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
          "MapCairn is developed in the open. Star the repository to follow it, report a bug or suggest an idea, or send a change.",
        ],
      },
      { kind: "actions" },
    ],
    further: [{ text: "How to contribute", href: CONTRIBUTE_URL }],
  },
];
