// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapAttributionEntry,
  buildAttribution,
  getBasemap,
} from "@mapcairn/core";
import {
  PLAYGROUND_PATH,
  SOURCE_REPOSITORY_URL,
} from "../constants/siteConfig";
import {
  CAPTURE_BASEMAP_NAMES,
  type CaptureSubjectId,
  type CaptureTheme,
  captureSubject,
  measuredReadout,
} from "./captureSubjects";
import { EMBED_EXAMPLE_FILES } from "./embedExampleFiles";

/*
 * The product page's words, once. The page (`ProductPage.tsx`), its Markdown
 * twin (`/index.md`), `/llms-full.txt` and the FAQ structured data are all
 * rendered from this module, so none of them can say something the others do
 * not. The page is developer-facing and English only (see
 * `scripts/copy-check/allowlist.mjs`).
 *
 * It is ordered by what an evaluator needs to decide: what it is and how to
 * try it, the playground at work, what you get, when it fits, the licence,
 * the cost and how ready it is, the smallest mount, then the questions that
 * remain. It describes the design rather than counts or plans. The facts
 * that change with each release, the latest version and its date, are read
 * from the changelog at build time (`releaseFacts.server.ts`) and placed by a
 * `release` block, so no sentence here goes stale; the status line
 * (`STATUS_LINE`) goes when 1.0 ships.
 *
 * Links: the repository's front page from three places (the header's GitHub,
 * the hero's View on GitHub and the footer's Source code), a short named set
 * of its pages (`REPOSITORY_PAGES` in the footer, with the capability matrix,
 * the embedding walkthrough and the example app where the text needs them),
 * the project's Mastodon profile from the footer (with `rel="me"`), and
 * otherwise only this site's own pages. Never an issue, a pull request or a
 * milestone, and no other page of the repository.
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

/** One thing you get: a short name and what it lets you do, always shown. */
export interface Feature {
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
  | { readonly kind: "details"; readonly items: readonly Disclosure[] }
  | { readonly kind: "features"; readonly items: readonly Feature[] }
  /** The latest release and its date, which each renderer reads from the changelog. */
  | { readonly kind: "release" };

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

/** The repository's pages on GitHub, which are not its front page. */
const REPOSITORY_BLOB = `${SOURCE_REPOSITORY_URL}/blob/main`;

/** The README's documentation section, the index of the guides, which the header and footer name Docs and Documentation. */
export const DOCUMENTATION_LINK: InlineLink = {
  text: "Documentation",
  href: `${SOURCE_REPOSITORY_URL}#documentation`,
};

/** What a GIS application needs and what the SDK has, partly has or lacks: the readiness text links it. */
export const CAPABILITY_MATRIX_LINK: InlineLink = {
  text: "capability matrix",
  href: `${REPOSITORY_BLOB}/docs/guides/capability-matrix.md`,
};

/** The whole embedding app, file by file, which the page's excerpt leads to. */
export const EMBED_GUIDE_LINK: InlineLink = {
  text: "embedding walkthrough",
  href: `${REPOSITORY_BLOB}/docs/guides/embed-a-map.md`,
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
 * The pages of the repository, other than its front page, that the footer
 * links, in its order. With the capability matrix, the embedding walkthrough
 * and the example app, which the text links, they are the whole set the page
 * may link past the front page; the tests hold it to that set, each for the
 * reason beside it in the test.
 */
export const REPOSITORY_PAGES: readonly InlineLink[] = [
  DOCUMENTATION_LINK,
  RELEASE_NOTES_LINK,
  LICENCE_GUIDE_LINK,
  SECURITY_LINK,
  DISCUSSIONS_LINK,
];

/** The page's one filled button, in the hero: the playground. */
export const PLAYGROUND_ACTION: InlineLink = {
  text: "Try the playground",
  href: PLAYGROUND_PATH,
};

/** The repository, a quiet text link under the hero's install command. */
export const GITHUB_ACTION: InlineLink = {
  text: "View on GitHub",
  href: SOURCE_REPOSITORY_URL,
};

/** The header's three links, in order: the playground, the documentation and the repository. */
export const HEADER_LINKS: readonly InlineLink[] = [
  { text: "Playground", href: PLAYGROUND_PATH },
  { text: "Docs", href: DOCUMENTATION_LINK.href },
  { text: "GitHub", href: SOURCE_REPOSITORY_URL },
];

/** The umbrella package's page on npm. */
export const NPM_PACKAGE_URL = "https://www.npmjs.com/package/@mapcairn/sdk";

/** The package's page on npm, which `/llms.txt` lists among its links; the page itself does not link it. */
export const NPM_ACTION: InlineLink = {
  text: "View on npm",
  href: NPM_PACKAGE_URL,
};

/** The page title, for the tab, search results and link previews. */
export const PRODUCT_TITLE =
  "MapCairn | Open-source SDK for accessible map applications";

/** The page's one h1: what MapCairn makes, and what it is built on, so an evaluator knows at once whether it fits. */
export const HEADLINE = "Accessible map interfaces for React and MapLibre";

/** The sentence under the h1: what MapCairn is and what it gives you. */
export const LEDE: Line = [
  "MapCairn is an open-source React SDK for public-interest maps: the whole interface around a MapLibre map, with search, measuring, drawing and data layers ready to use.",
];

/**
 * The hero's three badges, plain text drawn by the page's own CSS (no image,
 * so no request to another site). Accessibility is a target the project
 * tests against, so the badge says "Targets", as the text does.
 */
export const BADGES: readonly string[] = [
  "Targets WCAG 2.2 AA",
  "AGPL-3.0",
  "MapLibre GL JS",
];

/** The accessible name of the list of badges. */
export const BADGES_LABEL = "At a glance";

/** The umbrella package and its three peers, as every package manager is asked to add them. */
const INSTALL_PACKAGES = "@mapcairn/sdk react react-dom maplibre-gl";

/**
 * The install command the page leads with: the umbrella package and its three
 * peers, from npm's default tag, the same line as the README's. With the names
 * of the package managers in `INSTALL_OPTIONS`, it is the one place the page
 * names npm.
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

/** The copy button's name before the thing it copies, and what it announces. */
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

/** The release line's words around the version and its date. */
export const RELEASE_TEXT = {
  /** The line, with the version and the day written out. */
  line: (version: string, date: string) =>
    `The latest release is ${version}, released on ${date}.`,
} as const;

/** One line of project status, in the readiness text. */
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

/** The words of one picture. */
export interface PlateText {
  /** What the picture shows, apart from its theme and basemap: the start of its alt text and what `/index.md` says in its place. */
  readonly description: string;
  /** The line under the picture, before its basemaps and credits. */
  readonly caption: string;
}

/**
 * The words of each picture, which are captures of the running playground
 * (`captureSubjects.ts`). The capture script checks the length each picture
 * measures against the subject's `readout`, so what the description says is
 * what the picture shows. The two are one view at two sizes: the narrow one
 * on a phone, the wide one from the tablet width.
 */
export const PLATES: Readonly<Record<CaptureSubjectId, PlateText>> = {
  hero: {
    description: `The MapCairn playground over Cape Town with the Measure tool open: a line of ${measuredReadout("hero")} measured from the slopes of Lion's Head to the city centre, with its length and the Distance and Area choices in the toolbar.`,
    caption: "The playground, measuring across Cape Town.",
  },
  heroWide: {
    description: `The MapCairn playground over Cape Town on a wide screen with the Measure tool open: a line of ${measuredReadout("heroWide")} measured from the slopes of Lion's Head to the city centre, with its length and the Distance and Area choices in the toolbar.`,
    caption: "The playground, measuring across Cape Town.",
  },
};

/** The picture the page shows on a phone, and the one it shows from the tablet width: the same view at two sizes. */
export const DEMO_PLATES = { narrow: "hero", wide: "heroWide" } as const;

/**
 * The alt text of a picture: what it shows, then the basemap and the theme it
 * is drawn in, so the picture for each theme says what is in it.
 */
export function plateAlt(id: CaptureSubjectId, theme: CaptureTheme): string {
  const basemap = CAPTURE_BASEMAP_NAMES[captureSubject(id).basemaps[theme]];
  return `${PLATES[id].description} The map is drawn over the ${basemap} basemap, in the ${theme} theme.`;
}

/** The basemaps a picture is drawn over, by theme, in words for its caption. */
export function plateBasemaps(id: CaptureSubjectId): string {
  const { basemaps } = captureSubject(id);
  return `The basemap is ${CAPTURE_BASEMAP_NAMES[basemaps.light]} in the light theme and ${CAPTURE_BASEMAP_NAMES[basemaps.dark]} in the dark theme.`;
}

/**
 * The credits that go with a picture: those the map itself shows for each
 * basemap it is drawn over, from the basemap's definition in the SDK, so they
 * cannot differ from the playground's own. Each credit appears once.
 */
export function plateCredits(
  id: CaptureSubjectId,
): readonly BasemapAttributionEntry[] {
  const credits = Object.values(captureSubject(id).basemaps).flatMap(
    (basemapId) => {
      const basemap = getBasemap(basemapId);
      if (basemap === undefined) {
        throw new Error(`No basemap ${basemapId}.`);
      }
      return buildAttribution(basemap);
    },
  );
  return credits.filter(
    (credit, index) =>
      credits.findIndex((other) => other.text === credit.text) === index,
  );
}

/** What leads the credits under a picture. */
export const PLATE_CREDITS_LEAD = "Map credits:";

/** The credits of a picture as plain words, for `/index.md` and `/llms-full.txt`. */
export function plateCreditsText(id: CaptureSubjectId): string {
  return `${PLATE_CREDITS_LEAD} ${plateCredits(id)
    .map((credit) => credit.text)
    .join(", ")}.`;
}

/** The README's whole app, whose provider tree the page shows. */
const MAIN_FILE =
  EMBED_EXAMPLE_FILES.find((file) => file.name === "src/main.tsx")?.code ?? "";

/**
 * The lines of a source from the one that starts with `start` to the first
 * closing brace at the start of a line, so an excerpt is cut from the real file
 * and cannot differ from it.
 */
export function excerptOf(source: string, start: string): string {
  const lines = source.split("\n");
  const first = lines.findIndex((line) => line.startsWith(start));
  const last = lines.findIndex((line, index) => index > first && line === "}");
  if (first < 0 || last < 0) {
    throw new Error(`No block starting with "${start}" to cut.`);
  }
  return lines.slice(first, last + 1).join("\n");
}

/** The mount the page shows: the README's `App`, the SDK's providers round the map, cut from its `main.tsx`. */
export const EMBED_EXCERPT = excerptOf(MAIN_FILE, "function App()");

/** The page's sections, in reading order. */
export const SECTIONS: readonly Section[] = [
  {
    id: "what-you-get",
    heading: "What you get",
    blocks: [
      {
        kind: "features",
        items: [
          {
            name: "Accessible by default",
            text: [
              "WCAG 2.2 AA is the target in the light and the dark theme. Every gesture has a keyboard or single-tap equivalent, the map itself pans and zooms from the keyboard, announcements go through one live region, and automated accessibility checks run on every pull request.",
            ],
          },
          {
            name: "Private by design",
            text: [
              "Apart from the basemap, nothing is requested until a person asks: a layer loads when it is turned on, a search when it is submitted. The exception is search suggestions, which a host may turn on and which send the text typed so far. No accounts, no tracking, settings kept on the device, and nothing proxied.",
            ],
          },
          {
            name: "The whole interface, not just the map",
            text: [
              "Search by place or by coordinates, measuring, drawing and editing shapes with import and export, directions through a routing provider you supply, a layers panel with keys and feature cards, saving the map as an image, and links that carry what is on the map. An open data layer is one definition, and the SDK draws it and builds its key, card and list.",
            ],
          },
          {
            name: "Your own providers, without forking",
            text: [
              "Search, routing, storage and the map engine each sit behind a small interface with an in-memory fake and a shared contract suite, and a basemap is a definition you add as data. Swap in your own search, routing or tiles without touching the interface, and test the interface without WebGL or a network.",
            ],
          },
        ],
      },
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
    id: "licence",
    heading: "Licence, cost and readiness",
    blocks: [
      { kind: "subheading", text: "What the AGPL-3.0 asks of your app" },
      {
        kind: "paragraph",
        text: [
          "MapCairn is AGPL-3.0-only, an open-source licence that allows commercial use: you may use it, change it, sell a product built on it and charge for services that run it.",
        ],
      },
      {
        kind: "paragraph",
        text: [
          "The price is the source. When you serve an app that includes the SDK to people's browsers, you must offer them the corresponding source of the code you combine with the SDK and serve with it, under the same licence. An app that only your own staff use is not distributed, so that duty does not apply to it. If you modify the SDK and let people use your version over a network, you must offer them its source.",
        ],
      },
      { kind: "subheading", text: "Your options" },
      {
        kind: "list",
        items: [
          [
            "Publish your app's source under the AGPL-3.0 and link to it from the app, the usual way for a public site.",
          ],
          [
            "Keep the app inside your own organisation, where it is not distributed.",
          ],
          [
            "Ask about separate terms for a closed-source app. Keeping an app's source private while it is distributed with the SDK inside needs separate terms. A licence for closed-source use is not on offer yet. The author is open to talking about other terms.",
          ],
        ],
      },
      {
        kind: "paragraph",
        text: [
          "The ",
          { text: "licence guide", href: LICENCE_GUIDE_LINK.href },
          " says it in plain words, with examples and what it is unsure about. It is not legal advice.",
        ],
      },
      { kind: "subheading", text: "What it costs" },
      {
        kind: "paragraph",
        text: [
          "Nothing to install or use. The services a map uses, such as tiles, search and routing, are yours to choose, and each provider has its own terms. The SDK's own dependencies are permissively licensed, and the project's lint fails on one that is not.",
        ],
      },
      { kind: "subheading", text: "How ready it is" },
      { kind: "release" },
      {
        kind: "paragraph",
        text: [
          "The reference site runs on it in production, and every change passes the project's unit, browser and accessibility tests before it is merged. ",
          STATUS_LINE,
        ],
      },
      {
        kind: "paragraph",
        text: [
          "What it does not have: a prebuilt bundle for pages without React. The published packages are checked in a plain Vite and React app in Chromium, and no other framework or bundler has been tried. The project has one volunteer maintainer. What the SDK has, partly has and lacks is in the ",
          {
            text: "capability matrix",
            href: CAPABILITY_MATRIX_LINK.href,
          },
          ".",
        ],
      },
    ],
  },
  {
    id: "embed",
    heading: "Embed a map",
    blocks: [
      {
        kind: "paragraph",
        text: [
          "The command at the top of the page installs ",
          { code: "@mapcairn/sdk" },
          " with its peers. A whole Vite and React app is three files: ",
          { code: "index.html" },
          ", a short style sheet that gives the map a height, and ",
          { code: "src/main.tsx" },
          ", which builds the services with the MapLibre adapter and mounts the map inside the SDK's providers:",
        ],
      },
      {
        kind: "code",
        label: "src/main.tsx, an excerpt",
        language: "tsx",
        code: EMBED_EXCERPT,
      },
      {
        kind: "paragraph",
        text: [
          "The ",
          { text: "embedding walkthrough", href: EMBED_GUIDE_LINK.href },
          " has all three files, what each part does and the Content Security Policy the page needs. Search and the rest of the interface run on in-memory fakes until you add adapters, and the map asks a public tile provider for its tiles once it mounts, so choose the basemap whose terms and privacy you accept.",
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
            summary: "How do I start?",
            detail: [
              [
                "Install ",
                { code: "@mapcairn/sdk" },
                " with the command at the top of the page and follow the ",
                { text: "embedding walkthrough", href: EMBED_GUIDE_LINK.href },
                ". Or start from the example app in ",
                { text: "examples/embed", href: EXAMPLE_APP_LINK.href },
                " in the source on GitHub, which uses the SDK only through its public entry points.",
              ],
            ],
          },
          {
            summary: "Which packages does it install?",
            detail: [
              [
                "One, ",
                { code: "@mapcairn/sdk" },
                ", which re-exports the packages below; the MapLibre adapter is at the subpath ",
                { code: "@mapcairn/sdk/adapter-maplibre" },
                ". Each is also published on its own, as the advanced option for a host that wants fewer dependencies.",
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
          {
            summary: "Which frameworks does it work with?",
            detail: [
              [
                "React, with any bundler that handles a CSS import: the styles are compiled stylesheets, so no style plugin is needed. The map engine is MapLibre GL JS, reached through an adapter.",
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
            summary: "What does it send to third parties?",
            detail: [
              [
                "The SDK sends nothing by itself, apart from the basemap: requests come from the adapters a host supplies, and only when a person asks. The reference site counts page views with Cloudflare Web Analytics, which is cookieless, and its browser contacts the map tile providers, the search and routing services when you use them, and a layer's provider when you turn it on, as ",
                { text: "its privacy policy", href: "/privacy" },
                " lists.",
              ],
            ],
          },
          {
            summary: "What does the playground use?",
            detail: [
              [
                "The playground is the reference site, built from these packages. Its search, directions and data layers are this site's adapters and definitions, built on public community services (Nominatim for search and the FOSSGIS Valhalla server for directions) that are not meant for other sites' production traffic.",
              ],
              [
                "Your app supplies its own providers. The SDK ships the interface, the MapLibre adapter and in-memory fakes.",
              ],
            ],
          },
        ],
      },
    ],
  },
];
