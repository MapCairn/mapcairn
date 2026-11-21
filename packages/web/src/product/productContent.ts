// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  PLAYGROUND_PATH,
  SOURCE_REPOSITORY_URL,
} from "../constants/siteConfig";
import { EMBED_EXAMPLE_FILES } from "./embedExampleFiles";

/*
 * The product page's words, once. The page (`ProductPage.tsx`), its Markdown
 * twin (`/index.md`), `/llms-full.txt` and the FAQ structured data are all
 * rendered from this module, so none of them can say something the others do
 * not. The page is developer-facing and English only (see
 * `scripts/copy-check/allowlist.mjs`).
 *
 * Evergreen by design: it describes what the SDK is and how it is built, not
 * counts, dates, plans or what is in progress, so a change to the SDK normally
 * needs nothing here. What is current lives in the repository's documentation.
 * The one status line, that the SDK is before version 1.0, is the deliberate
 * exception (`STATUS_LINE`): it goes when 1.0 ships.
 *
 * Links: the repository's front page from exactly two places, the hero's View
 * on GitHub and the footer's Source code, and from the footer a short, named set
 * of pages in it (`REPOSITORY_PAGES`: the documentation, the release notes, the
 * licence guide, the security policy and Discussions, which an adopter looks
 * for next) and the example app, which the text names. The package on npm from
 * the hero's View on npm, the project's Mastodon profile from the footer (with
 * `rel="me"`), and otherwise only this site's own pages. Never an issue, a pull
 * request or a milestone, and no other page of the repository.
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

/** The icon a legend item is drawn with: a name the page maps to a Lucide icon, so this module stays free of React. */
export type LegendIcon =
  | "interface"
  | "layers"
  | "accessible"
  | "private"
  | "ports"
  | "design";

/** One item of a legend: its icon, its name and what it means, always shown. */
export interface LegendItem {
  readonly icon: LegendIcon;
  readonly name: string;
  readonly text: Line;
}

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
  | {
      readonly kind: "install";
      readonly label: string;
      readonly options: readonly InstallOption[];
    }
  | { readonly kind: "details"; readonly items: readonly Disclosure[] }
  | { readonly kind: "legend"; readonly items: readonly LegendItem[] }
  | { readonly kind: "deepLinks"; readonly links: readonly InlineLink[] };

/** One package manager and the command that installs the SDK with it. */
export interface InstallOption {
  readonly manager: string;
  readonly command: string;
}

/** A section of the page: an h2 and its blocks. */
export interface Section {
  readonly id: string;
  readonly heading: string;
  readonly blocks: readonly Block[];
}

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

/** The repository's pages on GitHub, which are not its front page. */
const REPOSITORY_BLOB = `${SOURCE_REPOSITORY_URL}/blob/main`;

/** The README's documentation section, the index of the guides, which the footer names Documentation. */
export const DOCUMENTATION_LINK: InlineLink = {
  text: "Documentation",
  href: `${SOURCE_REPOSITORY_URL}#documentation`,
};

/** What a GIS application needs and what the SDK has, partly has or lacks: the answer on production readiness links it. */
export const CAPABILITY_MATRIX_LINK: InlineLink = {
  text: "capability matrix",
  href: `${REPOSITORY_BLOB}/docs/guides/capability-matrix.md`,
};

/** What changed in each release. */
export const RELEASE_NOTES_LINK: InlineLink = {
  text: "Release notes",
  href: `${SOURCE_REPOSITORY_URL}/releases`,
};

/** What the AGPL-3.0 means for an app that uses the SDK, in plain words. */
export const LICENCE_GUIDE_LINK: InlineLink = {
  text: "Licence guide",
  href: `${REPOSITORY_BLOB}/docs/guides/licence.md`,
};

/** How to report a vulnerability, and what the project supports. */
export const SECURITY_LINK: InlineLink = {
  text: "Security",
  href: `${REPOSITORY_BLOB}/SECURITY.md`,
};

/** Where questions are asked and answered in public. */
export const DISCUSSIONS_LINK: InlineLink = {
  text: "Discussions",
  href: `${SOURCE_REPOSITORY_URL}/discussions`,
};

/** The example app that uses the SDK only through its public entry points. */
export const EXAMPLE_APP_LINK: InlineLink = {
  text: "examples/embed",
  href: `${SOURCE_REPOSITORY_URL}/tree/main/examples/embed`,
};

/**
 * The pages of the repository, other than its front page, that the page may
 * link, in the order the footer lists them. The tests hold the page to this
 * set (and the example app), each for the reason beside it in the test.
 */
export const REPOSITORY_PAGES: readonly InlineLink[] = [
  DOCUMENTATION_LINK,
  RELEASE_NOTES_LINK,
  LICENCE_GUIDE_LINK,
  SECURITY_LINK,
  DISCUSSIONS_LINK,
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

/** The umbrella package's page on npm. */
export const NPM_PACKAGE_URL = "https://www.npmjs.com/package/@mapcairn/sdk";

/** The package's page on npm, offered after the playground and never as the primary action. */
export const NPM_ACTION: InlineLink = {
  text: "View on npm",
  href: NPM_PACKAGE_URL,
};

/** The page title, for the tab, search results and link previews. */
export const PRODUCT_TITLE =
  "MapCairn | Open-source SDK for accessible map applications";

/** The page's one h1: what a team can build with MapCairn, and for whom. */
export const HEADLINE =
  "Build accessible, privacy-respecting map applications for the public";

/** The short paragraph under the h1: what MapCairn is, who it is for and what it gives them. */
export const LEDE: Line = [
  "MapCairn is an open-source React SDK for teams building public-interest maps, such as open data and hazard maps. It gives you the whole interface around a MapLibre map, open data layers written as data, and every service behind a small interface you can replace.",
];

/** The umbrella package and its three peers, as every package manager is asked to add them. */
const INSTALL_PACKAGES = "@mapcairn/sdk react react-dom maplibre-gl";

/**
 * The install command the page leads with: the umbrella package and its three
 * peers, from npm's default tag, the same line as the README's. With the link
 * to the package (`NPM_ACTION`) and the names of the package managers in
 * `INSTALL_OPTIONS`, it is the one place the page names npm.
 */
export const INSTALL_COMMAND = `npm install ${INSTALL_PACKAGES}`;

/** The install command for each package manager, npm first. */
export const INSTALL_OPTIONS: readonly InstallOption[] = [
  { manager: "npm", command: INSTALL_COMMAND },
  { manager: "pnpm", command: `pnpm add ${INSTALL_PACKAGES}` },
  { manager: "yarn", command: `yarn add ${INSTALL_PACKAGES}` },
  { manager: "bun", command: `bun add ${INSTALL_PACKAGES}` },
];

/** What the SDK needs, from the umbrella package's `peerDependencies`; a test keeps the two in step. */
export const INSTALL_REQUIREMENTS: Line = [
  "Needs React 19, ",
  { code: "maplibre-gl" },
  " 6.18 or later and a bundler that handles CSS imports.",
];

/** The accessible name of the region that holds one manager's command. */
export function installCommandLabel(manager: string): string {
  return `Install command for ${manager}`;
}

/** What a copy button names when it copies one manager's command, in its name and its announcements. */
export function installCopyLabel(manager: string): string {
  return `${manager} install command`;
}

/** The group's accessible name, the install block's label. */
export const INSTALL_GROUP_LABEL = "Package manager";

/** The copy button's words beside a code example, and what it announces. */
export const COPY_CODE = {
  idle: "Copy code",
  copied: "Copied",
  failed: "Copy failed",
  /** What is announced when a file copied, naming the file. */
  copiedMessage: (file: string) => `Code copied, ${file}`,
  /** What is announced when a file did not copy, naming it and saying what to do instead. */
  failedMessage: (file: string) =>
    `Could not copy ${file}. Select the code and copy it manually.`,
} as const;

/** The line under the hero's three actions. */
export const HERO_NOTE: Line = [
  "Open source under the AGPL-3.0, which allows commercial use. Contributions are welcome.",
];

/** One line of project status, in the answer on whether it is ready for production. */
export const STATUS_LINE =
  "It is before version 1.0: a minor release can change the public API, and each release's notes name what to change.";

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
          "Install ",
          { code: "@mapcairn/sdk" },
          ", the one package most apps need, with its peers. Its root holds the interface, and the MapLibre adapter that draws the map is at the subpath ",
          { code: "@mapcairn/sdk/adapter-maplibre" },
          ".",
        ],
      },
      {
        kind: "install",
        label: INSTALL_GROUP_LABEL,
        options: INSTALL_OPTIONS,
      },
      { kind: "paragraph", text: INSTALL_REQUIREMENTS },
      {
        kind: "paragraph",
        text: [
          "This is a whole React app in a Vite project: the map from the MapLibre adapter, the SDK's interface around it and a search box. Add ",
          { code: "src/page.css" },
          ", a short style sheet, so the map has a height, and replace the project's ",
          { code: "index.html" },
          " and ",
          { code: "src/main.tsx" },
          " with the ones below.",
        ],
      },
      ...EMBED_EXAMPLE_FILES.map(
        ({ name, language, code }): Block => ({
          kind: "code",
          label: name,
          language,
          code,
        }),
      ),
      {
        kind: "paragraph",
        text: [
          "The app imports the SDK only through its package, and the project's tests type-check this exact code the way an app outside the repository would. The map asks a public tile provider for its tiles once it mounts, so choose the basemap whose terms and privacy you accept.",
        ],
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
                " gives the in-memory services, with the adapter passed in to draw the map; search shows sample results until you add a search adapter.",
              ],
              [
                { code: "createMapLibreMapAdapter" },
                " draws the map with MapLibre GL JS. It needs the address of the engine's worker file, which a Vite app gets from the ",
                { code: "?worker&url" },
                " import.",
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
            summary: "What is inside the SDK",
            detail: [
              [
                "The umbrella re-exports the packages below, so one install covers them. Each is also published on its own, as the advanced option for a host that wants fewer dependencies.",
              ],
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
                { code: "@mapcairn/adapter-maplibre" },
                ": the MapLibre GL JS map adapter. It is the only part that imports a map engine, and the umbrella's root never does.",
              ],
            ],
          },
        ],
      },
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
        kind: "legend",
        items: [
          {
            icon: "interface",
            name: "A finished map interface",
            text: [
              "Search by place or by coordinates, measuring, drawing and editing shapes with import and export, directions through a routing provider you supply, a layers panel with keys and feature cards, saving the map as an image, and links that carry what is on the map.",
            ],
          },
          {
            icon: "layers",
            name: "Open data layers written as data",
            text: [
              "A layer is one definition: a feed, tiles, a heatmap or a query for what is in view. The SDK draws it, builds its key, card and list, keeps words beside every colour, and validates the definition.",
            ],
          },
          {
            icon: "accessible",
            name: "Accessible by default",
            text: [
              "WCAG 2.2 AA is the target in the light and the dark theme. Every gesture has a keyboard or single-tap equivalent, announcements go through one live region, and automated accessibility checks run on every pull request.",
            ],
          },
          {
            icon: "private",
            name: "Private by design",
            text: [
              "Apart from the basemap, nothing is requested until a person asks: a layer loads when it is turned on, a search when it is submitted. The exception is search suggestions, which a host may turn on and which send the text typed so far. No accounts, no tracking, settings kept on the device, and nothing proxied.",
            ],
          },
          {
            icon: "ports",
            name: "Every service behind a port",
            text: [
              "The interface never imports MapLibre or an adapter. Search, routing, storage, layers, the map engine and the rest are small interfaces, each with an in-memory fake and a shared contract suite, so the whole interface can be tested without WebGL or a network, and any service replaced without touching it.",
            ],
          },
          {
            icon: "design",
            name: "A design system with checked contrast",
            text: [
              "Typed tokens only, light and dark themes and one accent. The contrast of every token pair is calculated in a test, and a style scanner rejects raw colours, off-scale spacing and unnamed controls.",
            ],
          },
        ],
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
          "The playground is the reference site, built from these packages. Search for a place or a pair of coordinates, measure and draw, switch the basemap, turn on a data layer, or change the language in Settings.",
        ],
      },
      {
        kind: "paragraph",
        text: [
          "What the playground adds is its own: its search, directions and data layers are this site's adapters and definitions, built on public community services (Nominatim for search and the FOSSGIS Valhalla server for directions) that are not meant for other sites' production traffic.",
        ],
      },
      {
        kind: "paragraph",
        text: [
          "Your app supplies its own providers. The SDK ships the interface, the MapLibre adapter and in-memory fakes.",
        ],
      },
      { kind: "deepLinks", links: DEEP_LINKS },
    ],
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
          ["wants to test its map interface against fakes, without WebGL;"],
          [
            "needs the interface in its own language, left to right or right to left, and can supply the words: interface text comes from a message catalogue the host provides, plurals, lists, numbers and units follow its language, and the layout mirrors.",
          ],
        ],
      },
      { kind: "subheading", text: "It is not" },
      {
        kind: "list",
        items: [
          ["a hosted service, a dataset or a GIS analysis engine;"],
          [
            "a set of translations or fonts: the SDK ships British English, and the host supplies the words for any other language and a font for a script that IBM Plex Sans does not cover;",
          ],
          ["a wrapper for map engines other than MapLibre GL JS."],
        ],
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
                "Install ",
                { code: "@mapcairn/sdk" },
                ", as the first section shows. Or start from the example app in ",
                { text: "examples/embed", href: EXAMPLE_APP_LINK.href },
                " in the source on GitHub, which uses the SDK only through its public entry points. The playground shows the whole SDK working.",
              ],
            ],
          },
          {
            summary: "Is it ready for production?",
            detail: [
              [
                "The reference site runs on it in production, and every change passes the project's unit, browser and accessibility tests before it is merged. What it has and lacks today is in the ",
                {
                  text: "capability matrix",
                  href: CAPABILITY_MATRIX_LINK.href,
                },
                " on GitHub.",
              ],
              [STATUS_LINE],
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
                "React, with any bundler that handles a CSS import: the styles are compiled stylesheets, so no style plugin is needed. The map engine is MapLibre GL JS, reached through an adapter.",
              ],
            ],
          },
          {
            summary: "What does it cost?",
            detail: [
              [
                "Nothing: it is open source under the AGPL-3.0, which allows commercial use. The services a map uses, such as tiles, search and routing, are yours to choose, and each provider has its own terms. The ",
                { text: "licence guide", href: LICENCE_GUIDE_LINK.href },
                " says what the licence means for your project.",
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
                "The SDK is AGPL-3.0-only, an open-source licence. If you distribute an app that includes the SDK, including by serving it to people's browsers, you must give them access to the corresponding source of the code you combine with the SDK and serve with it, under the same licence.",
              ],
              [
                "If you modify the SDK and let people interact with your modified version over a network, you must give them access to its corresponding source. Keeping an app's source private while it is distributed with the SDK inside needs separate terms. A licence for closed-source use is not on offer yet. The SDK's own dependencies are permissively licensed.",
              ],
            ],
          },
          {
            summary: "What does it send to third parties?",
            detail: [
              [
                "The SDK sends nothing by itself, apart from the basemap: requests come from the adapters a host supplies, and only when a person asks. The reference site counts page views with Cloudflare Web Analytics, which is cookieless, and its browser contacts the map tile providers, the search and routing services when you use them, and a layer's provider when you turn it on, as ",
                { text: "its privacy policy", href: "/privacy" },
                " lists.",
              ],
            ],
          },
        ],
      },
    ],
  },
];
