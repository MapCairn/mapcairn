// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type ClipboardPort,
  type ClipboardResult,
  FakeClipboard,
} from "@mapcairn/core";
import { compositeOver, contrastRatio, tokenValues } from "@mapcairn/theme";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAP_LINK_REDIRECT_SCRIPT } from "../app/mapLinkRedirect";
import { loader as markdownLoader } from "../routes/index.md";
import { loader as llmsLoader } from "../routes/llms.txt";
import { loader as fullLoader } from "../routes/llms-full.txt";
import { COPIED_FEEDBACK_MS } from "./CopyCodeButton";
import { CAPTURE_SUBJECTS, CAPTURE_THEMES } from "./captureSubjects";
import { EMBED_EXAMPLE_FILES } from "./embedExampleFiles";
import { ProductPage } from "./ProductPage";
import * as styles from "./ProductPage.css";
import {
  CAIRN_LINE,
  CAPABILITY_MATRIX_LINK,
  EMBED_EXCERPT,
  EMBED_GUIDE_LINK,
  excerptOf,
  faqEntries,
  HEADLINE,
  INSTALL_COMMAND,
  LEDE,
  lineToText,
  NPM_PACKAGE_URL,
  PLATE_CREDITS_LEAD,
  PLATES,
  plateAlt,
  plateCredits,
  plateCreditsText,
  REPOSITORY_PAGES,
} from "./productContent";

const REPO = "https://github.com/MapCairn/mapcairn";
const MASTODON = "https://en.osm.town/@mapcairn";
const NPM_PACKAGE = "https://www.npmjs.com/package/@mapcairn/sdk";

/** The licence guide's path on the documentation site, which the footer and the licence answer link. */
const LICENCE_GUIDE_PATH = "/docs/guides/licence/";

/**
 * The pages the footer links, in its order, each with the
 * reason an adopter looks for it. Issue #639 allowed this named set, and
 * nothing else past the front page.
 */
const FOOTER_REPOSITORY_PAGES = [
  ["Documentation", "/docs/"],
  ["Release notes", `${REPO}/releases`],
  ["Licence guide", LICENCE_GUIDE_PATH],
  ["Security", `${REPO}/blob/main/.github/SECURITY.md`],
  ["Discussions", `${REPO}/discussions`],
] as const;

/** The capability matrix, which the production answer links for what the SDK has and lacks. */
const CAPABILITY_MATRIX = "/docs/guides/capability-matrix/";

/** The example app, which the answer on how to use the SDK links. */
const EXAMPLE_APP = `${REPO}/tree/main/examples/embed`;

/** The README, whose embedding example the page cuts its excerpt from. */
const README = readFileSync(
  path.resolve(__dirname, "../../../../README.md"),
  "utf8",
);

/**
 * Get started, the embedding walkthrough the page links, which holds the whole
 * app. The docs site's `check` marker on a code fence is dropped, so the blocks
 * read as the README writes them.
 */
const GET_STARTED = readFileSync(
  path.resolve(__dirname, "../../../../sites/docs/docs/get-started.md"),
  "utf8",
).replaceAll(/^```(tsx?) (?:no-)?check$/gm, "```$1");

/** The walkthrough's path on the documentation site (its front page), which the page links. */
const GET_STARTED_URL = "/docs/";

/** The name of the excerpt's code region and of its copy button. */
const EXCERPT = "src/main.tsx, an excerpt";

/** A release for the page to name, as the route's loader gives it. */
const RELEASE = { version: "0.1.0", date: "2026-11-21" } as const;

/** The entry file of the embedding example, the one that holds the app. */
const MAIN_CODE =
  EMBED_EXAMPLE_FILES.find((file) => file.name === "src/main.tsx")?.code ?? "";

function renderPage(
  clipboard: ClipboardPort = new FakeClipboard(),
  release: { readonly version: string; readonly date: string } = RELEASE,
) {
  return render(<ProductPage clipboard={clipboard} release={release} />);
}

/** The page's polite and assertive live regions. */
function liveRegions() {
  return {
    polite: screen.getByTestId("live-region-polite"),
    assertive: screen.getByTestId("live-region-assertive"),
  };
}

/** A section by its heading. */
function section(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

describe("the product page stands on its own", () => {
  it("has one h1 that says what it makes and what it is built on", () => {
    renderPage();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(
      "Accessible map interfaces for React and MapLibre",
    );
  });

  it("says under the h1, in one sentence, what MapCairn is and what it gives, and that the services are the team's to choose", () => {
    renderPage();
    const lede = screen.getByRole("heading", { level: 1 })
      .nextElementSibling as HTMLElement;
    expect(lede.tagName).toBe("P");
    expect(lede).toHaveTextContent(
      "MapCairn is an open-source React SDK for public-interest maps",
    );
    expect(lede).toHaveTextContent(
      "the interface around a MapLibre map, with search, measuring, drawing and a layers panel",
    );
    expect(lede).toHaveTextContent(
      "for the search and routing services you choose",
    );
    // The SDK ships no search service and no data layer of its own.
    expect(lede).not.toHaveTextContent(/data layers|ready to use/);
    expect(lede.textContent?.match(/\.(\s|$)/g)).toHaveLength(1);
  });

  it("points at nothing by its position: no answer or paragraph says the top of the page, above or below", async () => {
    renderPage();
    const prose = [...document.querySelectorAll("main p, main li")]
      .map((element) => element.textContent ?? "")
      .join("\n");
    expect(prose).not.toMatch(
      /\b(top of the page|see above|see below|the first section)\b/i,
    );
    for (const text of [
      await markdownLoader().text(),
      await fullLoader().text(),
    ]) {
      expect(text).not.toMatch(/top of the page/i);
      expect(text.indexOf(INSTALL_COMMAND)).toBeLessThan(text.indexOf("\n## "));
    }
  });

  it("puts the same hero at the top of /index.md and in /llms-full.txt", async () => {
    const hero = `# ${HEADLINE}\n\n${lineToText(LEDE)}\n`;
    expect((await markdownLoader().text()).startsWith(hero)).toBe(true);
    expect(await fullLoader().text()).toContain(hero);
  });

  it("says what a cairn is under the lede, and carries it into /index.md, /llms.txt and /llms-full.txt", async () => {
    renderPage();
    const sentence = lineToText(CAIRN_LINE);
    expect(sentence).toBe(
      "A cairn is a pile of stones that walkers add to, marking the way for whoever comes next.",
    );
    const lede = screen.getByText(lineToText(LEDE));
    expect(lede.nextElementSibling?.textContent).toBe(sentence);
    for (const text of [
      await markdownLoader().text(),
      await llmsLoader().text(),
      await fullLoader().text(),
    ]) {
      expect(text).toContain(sentence);
    }
  });

  it("has one order, by what an evaluator needs to decide: what you get, fit, licence and cost, readiness, the mount, then the questions", () => {
    renderPage();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      "What you get",
      "When it fits, and when it does not",
      "Licence and cost",
      "How ready it is",
      "Embed a map",
      "Questions",
    ]);
  });

  it("keeps the heading levels in order: one h1, h2 for each section, h3 inside them", () => {
    const { container } = renderPage();
    const levels = [...container.querySelectorAll("h1, h2, h3, h4")].map(
      (heading) => Number(heading.tagName.slice(1)),
    );
    expect(levels[0]).toBe(1);
    levels.forEach((level, index) => {
      expect(level - (levels[index - 1] ?? 0)).toBeLessThanOrEqual(1);
    });
    expect(levels).not.toContain(4);
  });

  it("shows what you get open, as at most four benefits, accessibility and privacy first, each an h3 and what it lets you do", () => {
    renderPage();
    const you = section("What you get");
    expect(you.querySelector("details")).toBeNull();
    const items = within(you).getAllByRole("listitem");
    expect(items.length).toBeLessThanOrEqual(4);
    const names = items.map(
      (item) => within(item).getByRole("heading", { level: 3 }).textContent,
    );
    expect(names.slice(0, 2)).toEqual([
      "Accessible by default",
      "Private by design",
    ]);
    for (const item of items) {
      const name = within(item).getByRole("heading", { level: 3 });
      expect(name.textContent?.length).toBeLessThan(45);
      expect(item.querySelector("p")?.textContent?.length).toBeGreaterThan(60);
    }
  });

  it("says what you get as benefits in plain words, not architecture or jargon", () => {
    renderPage();
    const you = section("What you get");
    const names = within(you)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent ?? "");
    for (const name of names) {
      expect(name).not.toMatch(/\b(port|adapter|token|contract)s?\b/i);
    }
    expect(you.textContent).not.toMatch(
      /live region|proxied|feature cards?|contract suite|\bkeys\b|\bports?\b/i,
    );
    expect(you).toHaveTextContent(
      "Use your own search, routing and tiles without forking the interface",
    );
    expect(you).toHaveTextContent("screen readers are told what changes");
    expect(you).toHaveTextContent("It asks for nothing until a person does");
    expect(you).toHaveTextContent(
      "The one exception is search suggestions, which a host may turn on and which send the text typed so far.",
    );
  });

  it("puts what you get in /index.md as headings with their text", async () => {
    const markdown = await markdownLoader().text();
    expect(markdown).toContain(
      "### Accessible by default\n\nWCAG 2.2 AA is the target in the light and the dark theme.",
    );
  });

  it("names the SDK's packages, one line each, in an answer one tap away", () => {
    renderPage();
    const questions = section("Questions");
    for (const name of [
      "@mapcairn/core",
      "@mapcairn/map",
      "@mapcairn/react",
      "@mapcairn/theme",
      "@mapcairn/adapter-maplibre",
    ]) {
      expect(within(questions).getByText(name)).toBeInTheDocument();
    }
    expect(questions.textContent).toContain("advanced option");
  });

  it("orders the hero: the h1, the lede, the playground button, the install command, then the repository link", () => {
    renderPage();
    const h1 = screen.getByRole("heading", { level: 1 });
    const main = within(screen.getByRole("main"));
    const playground = main.getByRole("link", { name: "Try the playground" });
    const group = screen.getByRole("group", { name: "Package manager" });
    const github = main.getByRole("link", { name: "View on GitHub" });
    expect(h1.parentElement).toContainElement(group);
    expect(h1.parentElement).toContainElement(github);
    const order = [
      h1.nextElementSibling as HTMLElement,
      playground,
      group,
      github,
    ];
    order.slice(1).forEach((element, index) => {
      expect(
        (order[index] as HTMLElement).compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
    expect(section("Embed a map").querySelector("fieldset")).toBeNull();
  });

  it("leads with the umbrella's install command, ahead of the example", () => {
    renderPage();
    const install = screen.getByText(INSTALL_COMMAND);
    expect(install.tagName).toBe("CODE");
    const example = within(section("Embed a map")).getByRole("region", {
      name: EXCERPT,
    });
    expect(
      install.compareDocumentPosition(example) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const first = section("Embed a map").querySelector("p");
    expect(first?.textContent).toContain("@mapcairn/sdk");
    expect(first?.textContent).not.toContain("@mapcairn/core");
  });

  it("installs the umbrella from the default npm tag, as the README does, with no tag after the package name", async () => {
    expect(INSTALL_COMMAND).toBe(
      "npm install @mapcairn/sdk react react-dom maplibre-gl",
    );
    expect(README).toContain(INSTALL_COMMAND);
    expect(await markdownLoader().text()).not.toContain("@next");
    expect(await llmsLoader().text()).not.toContain("@next");
    expect(await fullLoader().text()).not.toContain("@next");
  });

  it("puts the install command and the advanced option into /llms.txt", async () => {
    const text = await llmsLoader().text();
    expect(text).toContain(INSTALL_COMMAND);
    expect(text).toContain("advanced option");
  });

  it("highlights the excerpt's syntax with classes, never an inline style", () => {
    renderPage();
    const code = screen.getByRole("region", { name: EXCERPT });
    const spans = [...code.querySelectorAll("span")];
    const classOf = (text: string) =>
      spans.find((span) => span.textContent === text)?.className;
    expect(classOf("function")).toBe(styles.codeKeyword);
    expect(classOf("const")).toBe(styles.codeKeyword);
    expect(classOf("MapView")).toBe(styles.codeName);
    expect(code.querySelector("[style]")).toBeNull();
  });

  it("makes Try the playground the page's one filled button, and its first link in the main content", () => {
    const { container } = renderPage();
    const main = screen.getByRole("main");
    const playground = within(main).getByRole("link", {
      name: "Try the playground",
    });
    expect(playground).toHaveAttribute("href", "/map");
    expect(playground.className).toContain(styles.primaryAction);
    expect(container.querySelectorAll(`.${styles.primaryAction}`)).toHaveLength(
      1,
    );
    expect(within(main).getAllByRole("link")[0]).toBe(playground);
  });

  it("offers the repository in the hero as a quiet text link after the install command, not as a button", () => {
    renderPage();
    const github = within(screen.getByRole("main")).getByRole("link", {
      name: "View on GitHub",
    });
    expect(github).toHaveAttribute("href", REPO);
    expect(github.className).toContain(styles.tertiaryLink);
    expect(github.className).not.toContain(styles.primaryAction);
  });

  it("shows three badges as text drawn by the page, accessibility as a target, and the licence badge leads to the licence section", () => {
    renderPage();
    const badges = screen.getByRole("list", { name: "At a glance" });
    expect(
      within(badges)
        .getAllByRole("listitem")
        .map((badge) => badge.textContent),
    ).toEqual(["Targets WCAG 2.2 AA", "AGPL-3.0-only", "MapLibre GL JS"]);
    expect(badges.querySelector("img, svg")).toBeNull();
    const links = within(badges).getAllByRole("link");
    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([["AGPL-3.0-only", "#licence"]]);
    expect(document.getElementById("licence")).toBe(
      section("Licence and cost"),
    );
  });

  it("names the latest release and its date once, in the hero, from what the loader read, with a link to how ready it is", () => {
    const { container } = renderPage(new FakeClipboard(), {
      version: "9.8.7",
      date: "2030-02-03",
    });
    const line = screen.getByTestId("hero-release");
    expect(line).toHaveTextContent(
      "The latest release is 9.8.7, released on 3 February 2030. How ready it is",
    );
    expect(
      within(line).getByRole("link", { name: "How ready it is" }),
    ).toHaveAttribute("href", "#readiness");
    expect(document.getElementById("readiness")).toBe(
      section("How ready it is"),
    );
    expect(container.textContent?.match(/The latest release is/g)).toHaveLength(
      1,
    );
  });

  it("does not link the npm package from the page, which the install command already names", () => {
    renderPage();
    const npm = screen
      .getAllByRole("link")
      .filter((link) =>
        (link.getAttribute("href") ?? "").startsWith("https://www.npmjs.com/"),
      );
    expect(npm).toHaveLength(0);
    expect(NPM_PACKAGE_URL).toBe(NPM_PACKAGE);
  });

  it("links the npm package from /llms.txt, among the policies and source", async () => {
    expect(await llmsLoader().text()).toContain(
      `[View on npm](${NPM_PACKAGE})`,
    );
    expect(await markdownLoader().text()).not.toContain(NPM_PACKAGE);
  });

  it("links to the repository's front page from exactly three places: the header's GitHub, the hero's View on GitHub and the footer's Source code", () => {
    renderPage();
    const github = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === REPO);
    expect(github.map((link) => link.textContent)).toEqual([
      "GitHub",
      "View on GitHub",
      "Source code",
    ]);
    const [header, hero, footer] = github;
    expect(screen.getByRole("banner")).toContainElement(header ?? null);
    expect(screen.getByRole("main")).toContainElement(hero ?? null);
    expect(screen.getByRole("contentinfo")).toContainElement(footer ?? null);
  });

  it("keeps the brand, Playground, Docs and GitHub in the header, and nothing else", () => {
    renderPage();
    const header = screen.getByRole("banner");
    expect(
      within(header)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["MapCairn", "/"],
      ["Playground", "/map"],
      ["Docs", "/docs/"],
      ["GitHub", REPO],
    ]);
  });

  it("links the playground from the header, the hero's button and the footer, and nowhere else", () => {
    renderPage();
    const playground = screen
      .getAllByRole("link")
      .filter((link) => (link.getAttribute("href") ?? "").startsWith("/map"));
    expect(playground.map((link) => link.getAttribute("href"))).toEqual([
      "/map",
      "/map",
      "/map",
    ]);
    const [header, hero, footer] = playground;
    expect(screen.getByRole("banner")).toContainElement(header ?? null);
    expect(screen.getByRole("main")).toContainElement(hero ?? null);
    expect(screen.getByRole("contentinfo")).toContainElement(footer ?? null);
  });

  it("says what MapCairn is not", () => {
    renderPage();
    const fit = section("When it fits, and when it does not");
    expect(fit).toHaveTextContent(
      "a hosted service, a dataset or a GIS analysis engine",
    );
  });

  it("answers the licence and the cost in plain prose that is always shown, in short groups", () => {
    renderPage();
    const licence = section("Licence and cost");
    expect(licence.querySelector("details")).toBeNull();
    expect(
      within(licence)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["What the AGPL-3.0 asks of your app", "What it costs"]);
    expect(licence.querySelector(`.${styles.groups}`)).not.toBeNull();
  });

  it("states the licence in the guide's words: open source under the AGPL-3.0-only, which allows commercial use, on condition the source stays available", () => {
    renderPage();
    const licence = section("Licence and cost");
    expect(licence).toHaveTextContent(
      "MapCairn is AGPL-3.0-only, an open-source licence that allows commercial use",
    );
    expect(licence).toHaveTextContent(
      "The condition is that the source stays available.",
    );
    expect(licence).toHaveTextContent(
      "An app you distribute with the SDK inside, including by serving it to people's browsers, is offered under the AGPL-3.0 with the corresponding source of the code you combine with the SDK and serve with it.",
    );
    expect(licence).toHaveTextContent(
      "An app that only your own staff use is not distributed",
    );
    expect(licence).toHaveTextContent(
      "If you modify the SDK and let people use your version over a network, you must offer them its source.",
    );
    expect(
      within(licence).getByRole("link", { name: "licence guide" }),
    ).toHaveAttribute("href", LICENCE_GUIDE_PATH);
    expect(licence).toHaveTextContent("It is not legal advice.");
  });

  it("says nothing about other licensing or terms, anywhere on the page", () => {
    const { container } = renderPage();
    expect(container.textContent).not.toMatch(
      /closed-source|separate terms|other terms|not on offer|licen[cs]e for|alternative licen/i,
    );
  });

  it("says what it costs: nothing to install or use, each provider's own terms, and permissive dependencies", () => {
    renderPage();
    const licence = section("Licence and cost");
    expect(licence).toHaveTextContent(
      "The SDK costs nothing to install or use.",
    );
    expect(licence).toHaveTextContent(
      "The services a map uses, such as tiles, search and routing, are yours to choose, and each provider has its own terms.",
    );
    expect(licence).toHaveTextContent(
      "The SDK's production dependencies are all permissively licensed, and the project's checks fail if one is not.",
    );
  });

  it("opens how ready it is with a plain answer, then where it runs, what has been tried and what it lacks, without repeating the release", () => {
    renderPage();
    const ready = section("How ready it is");
    const first = ready.querySelector("h2")?.nextElementSibling;
    expect(first?.tagName).toBe("P");
    expect(first).toHaveTextContent(
      "It is before version 1.0 and not stable: a minor release can change the public API, and each release's notes say what to change.",
    );
    expect(
      within(ready)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Where it runs", "What has been tried", "What it lacks"]);
    expect(ready).toHaveTextContent(
      "The reference site runs on it in production",
    );
    expect(ready).toHaveTextContent(
      "The published packages are checked in a plain Vite and React app in Chromium. The reference site's browser tests run in Chromium and WebKit.",
    );
    expect(ready).toHaveTextContent(
      "There is no prebuilt bundle for pages without React",
    );
    expect(ready).toHaveTextContent("one volunteer maintainer");
    expect(ready).not.toHaveTextContent("The latest release is");
    expect(
      within(ready).getByRole("link", { name: "capability matrix" }),
    ).toHaveAttribute("href", CAPABILITY_MATRIX_LINK.href);
  });

  it("says in the fit section when it does not fit, with the real reasons", () => {
    renderPage();
    const fit = section("When it fits, and when it does not");
    expect(
      within(fit)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["It fits a team that", "It does not fit if you need"]);
    for (const reason of [
      "a prebuilt bundle for pages without React",
      "only Vite has",
      "the project has one volunteer maintainer",
      "the AGPL-3.0 asks you to offer the source of an app you distribute with the SDK inside",
    ]) {
      expect(fit).toHaveTextContent(reason);
    }
    expect(fit).toHaveTextContent("a ready-made, accessible map interface");
  });

  it("answers which frameworks it works with in the same words as the readiness text: React 19, a bundler that handles CSS, only Vite tried", () => {
    renderPage();
    expect(section("Questions")).toHaveTextContent(
      "React 19, with a bundler that handles CSS imports: the styles are compiled stylesheets, so no style plugin is needed. Only Vite has been tried.",
    );
  });

  it("asks each remaining question once: no question the sections above already answer", () => {
    expect(faqEntries().map(({ question }) => question)).toEqual([
      "Which packages does it install?",
      "Which frameworks does it work with?",
      "What does the playground use?",
    ]);
  });

  it("says in an answer what the playground adds, and where its services' terms apply", () => {
    renderPage();
    const questions = section("Questions");
    expect(questions).toHaveTextContent(
      "Its search, directions and data layers are this site's adapters and definitions",
    );
    expect(questions).toHaveTextContent(
      "Nominatim for search and the FOSSGIS Valhalla server for directions",
    );
    expect(questions).toHaveTextContent(
      "not meant for other sites' production traffic",
    );
    expect(questions).toHaveTextContent(
      "Your app supplies its own providers. The SDK ships the interface, the MapLibre adapter and in-memory fakes.",
    );
  });

  it("links the example app, the walkthrough and the capability matrix once each, in the text, instead of naming them", () => {
    renderPage();
    expect(
      screen.getByRole("link", { name: "capability matrix" }),
    ).toHaveAttribute("href", CAPABILITY_MATRIX_LINK.href);
    expect(
      screen.getByRole("link", { name: "examples/embed" }),
    ).toHaveAttribute("href", EXAMPLE_APP);
    expect(
      screen.getByRole("link", { name: "embedding walkthrough" }),
    ).toHaveAttribute("href", GET_STARTED_URL);
    expect(EMBED_GUIDE_LINK.href).toBe(GET_STARTED_URL);
  });

  it("ends with a quiet line that says where it is made, then the licence and its links, and nothing else", () => {
    renderPage();
    const footer = screen.getByRole("contentinfo");
    const lines = [...footer.querySelectorAll("p")].map((p) => p.textContent);
    expect(lines).toEqual([
      "Built with love in South Africa.",
      "MapCairn is open source under the AGPL-3.0.",
    ]);
    expect(footer.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(
      within(footer)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Source code",
      "Documentation",
      "Release notes",
      "Licence guide",
      "Security",
      "Discussions",
      "Mastodon",
      "Try the playground",
      "Privacy policy",
    ]);
  });

  it("links the footer's pages of the repository to the named set and nowhere else in it", () => {
    renderPage();
    const footer = within(screen.getByRole("contentinfo"));
    for (const [name, href] of FOOTER_REPOSITORY_PAGES) {
      expect(footer.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(REPOSITORY_PAGES.map((link) => [link.text, link.href])).toEqual(
      FOOTER_REPOSITORY_PAGES.map((page) => [...page]),
    );
  });

  it("links the footer's Mastodon entry to the project profile with rel=me so the profile can verify the site", () => {
    renderPage();
    const link = within(screen.getByRole("contentinfo")).getByRole("link", {
      name: "Mastodon",
    });
    expect(link).toHaveAttribute("href", "https://en.osm.town/@mapcairn");
    expect(link).toHaveAttribute("rel", "me");
  });

  it("links only to the repository's front page, the named set of its pages (with the walkthrough and the example app), the Mastodon profile, the map's credits or this site: no other file, folder, section or contributing page", () => {
    renderPage();
    const named = new Set<string>([
      ...FOOTER_REPOSITORY_PAGES.map(([, href]) => href),
      EXAMPLE_APP,
      CAPABILITY_MATRIX,
      GET_STARTED_URL,
    ]);
    // The credits the picture carries, which its basemaps ask for wherever the map shows.
    const creditHrefs = new Set<string>(
      CAPTURE_SUBJECTS.flatMap(({ id }) =>
        plateCredits(id).flatMap((credit) => credit.href ?? []),
      ),
    );
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "");
    for (const href of hrefs) {
      expect(
        href === REPO ||
          named.has(href) ||
          href === MASTODON ||
          creditHrefs.has(href) ||
          /^[/#]/.test(href),
        href,
      ).toBe(true);
      // The page's own #licence section is linked; the README's is not.
      expect(href).not.toMatch(/github\.com.*#licence$|\/contribute/);
    }
  });

  it("asks nothing of a third party: no image, frame, script source or stylesheet from elsewhere", () => {
    const html = renderToStaticMarkup(
      <ProductPage clipboard={new FakeClipboard()} release={RELEASE} />,
    );
    expect(html).not.toMatch(/<(iframe|link|object|embed)\b/);
    for (const [, source] of html.matchAll(/<img\b[^>]*\ssrc="([^"]*)"/g)) {
      expect(source, "an image's address").toMatch(/^\/(?!\/)/);
    }
    expect(html).not.toMatch(/<script[^>]*\bsrc=/);
    expect(html).not.toMatch(/\ssrc="https?:/);
    expect(html).not.toMatch(/style=/);
  });

  it("links only with plain anchors that have a descriptive name", () => {
    renderPage();
    for (const link of screen.getAllByRole("link")) {
      const name = link.textContent?.trim() ?? "";
      expect(name.length).toBeGreaterThan(2);
      expect(name).not.toMatch(/^(here|click here|read more|more|link)$/i);
      expect(link).not.toHaveAttribute("target");
      expect(link.getAttribute("href") ?? "").toMatch(/^(\/|#|https:\/\/)/);
    }
  });

  it("keeps paragraphs short", () => {
    const { container } = renderPage();
    for (const paragraph of container.querySelectorAll("main p")) {
      expect(paragraph.textContent?.length ?? 0).toBeLessThan(420);
    }
  });

  it("is English only, and says so on its own root", () => {
    renderPage();
    expect(screen.getByTestId("product-page")).toHaveAttribute("lang", "en-GB");
  });

  it("starts with the old map link redirect, exactly as its CSP hash allows", () => {
    const html = renderToStaticMarkup(
      <ProductPage clipboard={new FakeClipboard()} release={RELEASE} />,
    );
    expect(html).toContain(`<script>${MAP_LINK_REDIRECT_SCRIPT}</script>`);
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("<a "));
  });

  it("starts with a skip link to the main content", () => {
    renderPage();
    const [skip] = screen.getAllByRole("link");
    expect(skip).toHaveTextContent("Skip to content");
    expect(skip).toHaveAttribute("href", "#content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "content");
  });

  it("draws the contour motif behind the hero's words as decoration only, with no text in it", () => {
    renderPage();
    const motif = screen.getByTestId("hero-motif");
    expect(motif).toHaveAttribute("aria-hidden", "true");
    expect(motif).toHaveAttribute("focusable", "false");
    expect(motif.querySelector("text")).toBeNull();
    expect(motif.querySelectorAll("path").length).toBeGreaterThan(2);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(motif.parentElement).toContainElement(h1);
    expect(
      motif.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("draws the motif in an ink that keeps the hero's text, muted text and links at 4.5:1 or more where they cross it, in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const roles = tokenValues.themeValues[theme].opaque;
      const line = compositeOver(roles.hairline, roles.pageBackground);
      for (const ink of ["text", "textMuted", "accent"] as const) {
        expect(
          contrastRatio(roles[ink], line),
          `${ink} in ${theme}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("draws its artwork once, after the last section and before the footer, as decoration only", () => {
    renderPage();
    const art = screen.getAllByTestId("survey-art");
    expect(art).toHaveLength(1);
    const lastSection = [...document.querySelectorAll("main section")].at(-1);
    expect(lastSection?.compareDocumentPosition(art[0] as Element)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      art[0]?.compareDocumentPosition(screen.getByRole("contentinfo")),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole("main")).toContainElement(art[0] as HTMLElement);
    expect(art[0]).toHaveAttribute("aria-hidden", "true");
    expect(art[0]).toHaveAttribute("focusable", "false");
  });

  it("keeps all of the artwork's text outside the drawing, in the hidden frame, as the two labels only", () => {
    renderPage();
    const strip = screen.getByTestId("survey-art-frame");
    expect(strip).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("survey-art").querySelector("text")).toBeNull();
    expect(strip.textContent).toBe(
      `${screen.getByTestId("survey-art-spot-height").textContent}${screen.getByTestId("survey-art-length").textContent}`,
    );
    expect(screen.getByTestId("survey-art-spot-height")).toHaveTextContent(
      /^[\d,]+$/,
    );
    expect(screen.getByTestId("survey-art-length")).toHaveTextContent(/ km$/);
  });
});

describe("the picture of the playground", () => {
  it("follows the hero straight away, before the first section, as one figure", () => {
    renderPage();
    const demo = screen.getByTestId("demo");
    expect(demo.tagName).toBe("FIGURE");
    const main = screen.getByRole("main");
    expect(main.children[1]).toBe(demo);
    expect(
      demo.compareDocumentPosition(main.querySelector("section") as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("holds one view at two sizes, the narrow one for a phone and the wide one from the tablet width, chosen by class", () => {
    renderPage();
    expect(screen.getByTestId("plate-hero")).toHaveClass(styles.plateNarrow);
    expect(screen.getByTestId("plate-heroWide")).toHaveClass(styles.plateWide);
  });

  for (const { id, width, height } of CAPTURE_SUBJECTS) {
    it(`draws the ${id} picture as two lazy images of its size, one for each theme, each with its own alt text, from this site`, () => {
      renderPage();
      const images = within(screen.getByTestId(`plate-${id}`)).getAllByRole(
        "img",
        { hidden: true },
      );
      expect(images).toHaveLength(CAPTURE_THEMES.length);
      for (const [index, theme] of CAPTURE_THEMES.entries()) {
        const image = images[index] as HTMLElement;
        expect(image).toHaveAttribute("width", String(width));
        expect(image).toHaveAttribute("height", String(height));
        expect(image).toHaveAttribute("loading", "lazy");
        expect(image).toHaveAttribute("decoding", "async");
        expect(image).toHaveAttribute("alt", plateAlt(id));
        expect(image.getAttribute("src")).toMatch(
          new RegExp(`^/.*${id}-${theme}.*\\.webp$`),
        );
      }
    });
  }

  it("says in each alt text that the picture is a screenshot and what it shows, with the length it measures, and nothing of the theme", () => {
    for (const { id } of CAPTURE_SUBJECTS) {
      const alt = plateAlt(id);
      expect(alt.startsWith("Screenshot: ")).toBe(true);
      expect(alt).toContain(PLATES[id].description);
      expect(alt).toContain("3.37 km");
      expect(alt).not.toMatch(/theme|basemap/i);
    }
  });

  it("credits the map under the picture, in the words and links of the basemap's own definition", () => {
    renderPage();
    for (const { id } of CAPTURE_SUBJECTS) {
      expect(plateCredits(id).map((credit) => credit.text)).toEqual([
        "© OpenStreetMap contributors",
        "OpenFreeMap",
        "OpenMapTiles",
        "MapLibre",
      ]);
    }
    const credits = plateCredits("heroWide");
    const lead = within(screen.getByTestId("demo")).getByText(
      PLATE_CREDITS_LEAD,
      { exact: false },
    );
    const links = within(lead).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(
      credits.map((credit) => credit.text),
    );
    // Pinned, so a change to a definition's link is seen here and in ATTRIBUTIONS.md.
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://www.openstreetmap.org/copyright",
      "https://openfreemap.org",
      "https://openmaptiles.org",
      "https://maplibre.org",
    ]);
    expect(screen.getByTestId("demo")).toHaveTextContent(
      PLATES.heroWide.caption,
    );
  });

  it("captions the picture as a screenshot, and points to the hero's button for the real thing without a second link", () => {
    renderPage();
    expect(screen.getByTestId("demo")).toHaveTextContent(
      "Screenshot of the playground, measuring across Cape Town. The Try the playground button above opens the real thing.",
    );
  });

  it("swaps the pictures with CSS alone: each picture's dark twin carries the class that starts hidden", () => {
    renderPage();
    for (const { id } of CAPTURE_SUBJECTS) {
      const [light, dark] = within(
        screen.getByTestId(`plate-${id}`),
      ).getAllByRole("img", { hidden: true });
      expect(light).toHaveClass(styles.plateLight);
      expect(dark).toHaveClass(styles.plateDark);
    }
  });

  it("links nowhere but the map's credits: the hero's button is the way into the playground", () => {
    renderPage();
    const links = within(screen.getByTestId("demo")).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      plateCredits("heroWide").map((credit) => credit.href),
    );
  });

  it("describes the picture and its credits in /index.md and /llms-full.txt, in step with the page", async () => {
    for (const text of [
      await markdownLoader().text(),
      await fullLoader().text(),
    ]) {
      expect(text).toContain(PLATES.heroWide.description);
      expect(text).toContain(plateCreditsText("heroWide"));
    }
  });
});

/** The README's code blocks of one language, after its "Embed a map" heading. */
function readmeBlocks(language: string): string[] {
  return codeBlocks(README.slice(README.indexOf("## Embed a map")), language);
}

/** The code blocks of one language in a Markdown text. */
function codeBlocks(markdown: string, language: string): string[] {
  return [
    ...markdown.matchAll(
      new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\``, "g"),
    ),
  ].map((match) => match[1] ?? "");
}

describe("the embedding example", () => {
  // `packages/core/src/lint/readme.test.ts` type-checks the README's main.tsx
  // as an outside app would write it, so equal to the README is type-checked.
  it("is the README's index.html, page.css and main.tsx, character for character", () => {
    const code = (name: string) =>
      EMBED_EXAMPLE_FILES.find((file) => file.name === name)?.code;
    expect(EMBED_EXAMPLE_FILES.map((file) => file.name)).toEqual([
      "index.html",
      "src/page.css",
      "src/main.tsx",
    ]);
    expect(readmeBlocks("html")).toEqual([code("index.html")]);
    expect(readmeBlocks("css")).toEqual([code("src/page.css")]);
    expect(readmeBlocks("tsx")).toEqual([code("src/main.tsx")]);
  });

  it("is the same three files in the walkthrough the page links, character for character", () => {
    for (const { language, code } of EMBED_EXAMPLE_FILES) {
      expect(codeBlocks(GET_STARTED, language)).toEqual([code]);
    }
  });

  it("starts main.tsx with the Vite types line, and gives the map a height", () => {
    expect(
      MAIN_CODE.startsWith('/// <reference types="vite/client" />\n'),
    ).toBe(true);
    const css = EMBED_EXAMPLE_FILES.find(
      (file) => file.name === "src/page.css",
    );
    expect(css?.code).toMatch(/height:\s*100%/);
  });

  it("imports only the umbrella, its adapter subpath, React and the page's own style sheet", () => {
    const sources = [
      ...MAIN_CODE.matchAll(/^import (?:[^"]*? from )?"([^"]+)"/gm),
    ].map((match) => match[1]);
    expect(sources).toEqual([
      "@mapcairn/sdk/styles.css",
      "./page.css",
      "@mapcairn/sdk",
      "@mapcairn/sdk/adapter-maplibre",
      "react",
      "react-dom/client",
    ]);
  });

  it("draws the map with the real adapter, so the fakes alone are not the example", () => {
    expect(MAIN_CODE).toContain("createMapLibreMapAdapter");
    expect(MAIN_CODE).toContain("createMapAdapter");
  });

  it("shows on the page one excerpt, the part that mounts the map, cut from the README's main.tsx so it cannot differ from the type-checked app", () => {
    expect(MAIN_CODE).toContain(EMBED_EXCERPT);
    expect(EMBED_EXCERPT.startsWith("function MapScreen() {")).toBe(true);
    expect(EMBED_EXCERPT.endsWith("\n}")).toBe(true);
    expect(EMBED_EXCERPT.split("\n").length).toBeLessThanOrEqual(15);
    expect(EMBED_EXCERPT).toContain("<MapView");
    renderPage();
    const embed = section("Embed a map");
    const regions = within(embed).getAllByRole("region");
    expect(regions.map((region) => region.getAttribute("aria-label"))).toEqual([
      EXCERPT,
    ]);
    expect(regions[0]).toHaveAttribute("tabindex", "0");
    expect(regions[0]?.textContent).toBe(EMBED_EXCERPT);
  });

  it("cuts an excerpt from the line that starts it to the first closing brace at the start of a line, and refuses one that is not there", () => {
    expect(excerptOf("a\nfunction f() {\n  x;\n}\nb\n}", "function f()")).toBe(
      "function f() {\n  x;\n}",
    );
    expect(() => excerptOf("a\nb", "function g()")).toThrow(/No block/);
    expect(() => excerptOf("function g() {\n  open", "function g()")).toThrow(
      /No block/,
    );
  });

  it("heads the excerpt with its name, beside its own copy button in the box's corner", () => {
    renderPage();
    const region = screen.getByRole("region", { name: EXCERPT });
    const heading = region.parentElement?.firstElementChild as HTMLElement;
    expect(heading.textContent).toContain(EXCERPT);
    const button = within(heading).getByRole("button", {
      name: `Copy code, ${EXCERPT}`,
    });
    expect(button.textContent).toBe("");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("carries the excerpt, not the whole app, in /index.md and /llms-full.txt", async () => {
    for (const text of [
      await markdownLoader().text(),
      await fullLoader().text(),
    ]) {
      expect(text).toContain(
        `\`${EXCERPT}\`:\n\n\`\`\`tsx\n${EMBED_EXCERPT}\n\`\`\``,
      );
      expect(text).not.toContain("createRoot(root)");
    }
  });

  it("says the excerpt mounts the map, puts what runs on stand-ins straight under it, and links the walkthrough and the example app", () => {
    renderPage();
    const embed = section("Embed a map");
    expect(embed.textContent).toContain(
      "The install command adds @mapcairn/sdk and its peers. A whole Vite and React app is three files: index.html, a short style sheet that gives the map a height, and src/main.tsx. This part of src/main.tsx mounts the map",
    );
    const box = screen.getByRole("region", { name: EXCERPT }).parentElement;
    expect(box?.nextElementSibling?.tagName).toBe("P");
    expect(box?.nextElementSibling).toHaveTextContent(
      /^Search and the rest of the interface run on in-memory stand-ins until you add adapters/,
    );
    expect(
      within(embed).getByRole("link", { name: "embedding walkthrough" }),
    ).toHaveAttribute("href", GET_STARTED_URL);
    expect(
      within(embed).getByRole("link", { name: "examples/embed" }),
    ).toHaveAttribute("href", EXAMPLE_APP);
  });

  it("gives Get started the README's install line and a heading line for each of the three files", () => {
    expect(README).toContain(`\`\`\`bash\n${INSTALL_COMMAND}\n\`\`\``);
    expect(GET_STARTED).toContain(`\n${INSTALL_COMMAND}\n`);
    for (const { name } of EMBED_EXAMPLE_FILES) {
      expect(GET_STARTED).toContain(`\`${name}\`:`);
    }
  });
});

describe("what the page says the SDK sends", () => {
  it("names the basemap's tiles as the one request the map makes before a person asks for anything", () => {
    renderPage();
    expect(section("What you get").textContent).toContain(
      "It asks for nothing until a person does: the basemap's tiles when the map shows",
    );
  });
});

describe("copying the embedding example", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The copy button beside the example. */
  function copyButton(): HTMLElement {
    return within(
      screen.getByRole("region", { name: "Embed a map" }),
    ).getByRole("button", { name: `Copy code, ${EXCERPT}` });
  }

  it("writes nothing to the clipboard until the visitor asks", () => {
    const clipboard = new FakeClipboard();
    renderPage(clipboard);
    expect(copyButton()).toHaveAttribute("type", "button");
    expect(clipboard.attempts).toEqual([]);
  });

  it("copies the exact source shown, with none of the highlighting markup", async () => {
    const clipboard = new FakeClipboard();
    renderPage(clipboard);
    fireEvent.click(copyButton());
    await waitFor(() => expect(clipboard.written).toEqual([EMBED_EXCERPT]));
    const code = screen.getByRole("region", { name: EXCERPT });
    expect(clipboard.written[0]).toBe(code.textContent);
  });

  it("says Copied on the button and in the polite live region, and keeps focus on the button", async () => {
    renderPage();
    const button = copyButton();
    button.focus();
    fireEvent.click(button);
    expect(
      await screen.findByRole("button", { name: `Copied, ${EXCERPT}` }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(liveRegions().polite).toHaveTextContent(`Code copied, ${EXCERPT}`),
    );
    expect(liveRegions().assertive).toBeEmptyDOMElement();
    expect(document.activeElement).toBe(button);
  });

  it("goes back to Copy code after a while, so the next copy is confirmed again", async () => {
    vi.useFakeTimers();
    renderPage();
    fireEvent.click(copyButton());
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByRole("button", { name: `Copied, ${EXCERPT}` }),
    ).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(COPIED_FEEDBACK_MS);
    });
    expect(copyButton()).toBeInTheDocument();
  });

  it("gives a second successful copy its own full time on Copied, even just before the first one ends", async () => {
    vi.useFakeTimers();
    renderPage();
    fireEvent.click(copyButton());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(COPIED_FEEDBACK_MS - 100);
    });
    const copied = screen.getByRole("button", { name: `Copied, ${EXCERPT}` });
    copied.focus();
    fireEvent.click(copied);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(COPIED_FEEDBACK_MS - 100);
    });
    expect(screen.getByRole("button", { name: `Copied, ${EXCERPT}` })).toBe(
      copied,
    );
    expect(copied).not.toBeDisabled();
    expect(document.activeElement).toBe(copied);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(copyButton()).toBe(copied);
  });

  it("shows the outcome of the latest click when an earlier copy finishes after it", async () => {
    const pending: ((result: ClipboardResult) => void)[] = [];
    const clipboard: ClipboardPort = {
      writeText: () =>
        new Promise<ClipboardResult>((resolve) => {
          pending.push(resolve);
        }),
    };
    renderPage(clipboard);
    const button = copyButton();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(pending).toHaveLength(2);
    await act(async () => {
      pending[1]?.({ ok: true });
    });
    expect(
      await screen.findByRole("button", { name: `Copied, ${EXCERPT}` }),
    ).toBeInTheDocument();
    await act(async () => {
      pending[0]?.({ ok: false, reason: "denied" });
    });
    expect(screen.getByRole("button", { name: `Copied, ${EXCERPT}` })).toBe(
      button,
    );
    expect(liveRegions().assertive).toBeEmptyDOMElement();
  });

  it("reports a failure on the button and assertively, and leaves the code in place to select", async () => {
    const clipboard = new FakeClipboard();
    clipboard.failWith("denied");
    renderPage(clipboard);
    const button = copyButton();
    button.focus();
    fireEvent.click(button);
    expect(
      await screen.findByRole("button", { name: `Copy failed, ${EXCERPT}` }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(liveRegions().assertive).toHaveTextContent(
        `Could not copy ${EXCERPT}. Select the code and copy it manually.`,
      ),
    );
    expect(document.activeElement).toBe(button);
    const code = screen.getByRole("region", { name: EXCERPT });
    expect(code).toHaveAttribute("tabindex", "0");
    expect(code.textContent).toBe(EMBED_EXCERPT);
  });

  it("copies again after a failure once the clipboard works", async () => {
    const clipboard = new FakeClipboard();
    clipboard.failWith("unsupported");
    renderPage(clipboard);
    fireEvent.click(copyButton());
    const failed = await screen.findByRole("button", {
      name: `Copy failed, ${EXCERPT}`,
    });
    clipboard.succeed();
    fireEvent.click(failed);
    expect(
      await screen.findByRole("button", { name: `Copied, ${EXCERPT}` }),
    ).toBeInTheDocument();
    expect(clipboard.written).toEqual([EMBED_EXCERPT]);
  });

  it("names what it copies in what it announces", async () => {
    renderPage();
    fireEvent.click(copyButton());
    await waitFor(() =>
      expect(liveRegions().polite).toHaveTextContent(`Code copied, ${EXCERPT}`),
    );
  });

  it("leaves no duplicate test id on the code and its button", () => {
    const { container } = renderPage();
    expect(
      container.querySelectorAll("[data-testid='copy-code']"),
    ).toHaveLength(0);
    expect(container.querySelectorAll("[data-testid$='-code']")).toHaveLength(
      0,
    );
  });

  it("renders on the server with the button, named in words, and no message", () => {
    const html = renderToStaticMarkup(
      <ProductPage clipboard={new FakeClipboard()} release={RELEASE} />,
    );
    expect(html).toContain(`aria-label="Copy code, ${EXCERPT}"`);
    expect(html).not.toContain("Code copied");
  });
});
