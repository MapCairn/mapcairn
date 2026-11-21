// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type ClipboardPort,
  type ClipboardResult,
  FakeClipboard,
  parseUrlHash,
  serialiseUrlHash,
} from "@mapcairn/core";
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
  CAPABILITY_MATRIX_LINK,
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

/**
 * The pages of the repository the footer links, in its order, each with the
 * reason an adopter looks for it. Issue #639 allowed this named set, and
 * nothing else past the front page.
 */
const FOOTER_REPOSITORY_PAGES = [
  ["Documentation", `${REPO}#documentation`],
  ["Release notes", `${REPO}/releases`],
  ["Licence guide", `${REPO}/blob/main/docs/guides/licence.md`],
  ["Security", `${REPO}/blob/main/SECURITY.md`],
  ["Discussions", `${REPO}/discussions`],
] as const;

/** The capability matrix, which the production answer links for what the SDK has and lacks. */
const CAPABILITY_MATRIX = `${REPO}/blob/main/docs/guides/capability-matrix.md`;

/** The example app, which the answer on how to use the SDK links. */
const EXAMPLE_APP = `${REPO}/tree/main/examples/embed`;

/** The README, whose embedding example the page shows. */
const README = readFileSync(
  path.resolve(__dirname, "../../../../README.md"),
  "utf8",
);

/** The entry file of the embedding example, the one that holds the app. */
const MAIN_CODE =
  EMBED_EXAMPLE_FILES.find((file) => file.name === "src/main.tsx")?.code ?? "";

function renderPage(clipboard: ClipboardPort = new FakeClipboard()) {
  return render(<ProductPage clipboard={clipboard} />);
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
  it("has one h1 that says what teams can build, and for whom", () => {
    renderPage();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(
      "Accessible map interfaces for the public",
    );
  });

  it("says under the h1 what MapCairn is and which teams it is for", () => {
    renderPage();
    const lede = screen.getByRole("heading", { level: 1 })
      .nextElementSibling as HTMLElement;
    expect(lede.tagName).toBe("P");
    expect(lede).toHaveTextContent(
      "MapCairn is an open-source React SDK for public-interest maps",
    );
    expect(lede.textContent?.match(/\.(\s|$)/g)).toHaveLength(1);
    expect(lede).toHaveTextContent("WCAG 2.2 AA as the target");
    expect(lede).toHaveTextContent(
      "by default, nothing requested beyond the basemap until a person asks, unless a host turns on search suggestions",
    );
  });

  it("points no answer at a section that lacks the install block, on the page, in /index.md and in /llms-full.txt", async () => {
    const answers = faqEntries().map(({ answer }) => answer);
    for (const answer of answers) {
      expect(answer).not.toMatch(/\b(first|embed\w*|above) section\b/i);
    }
    const pointer = answers.find((answer) =>
      answer.includes("the command at the top of the page"),
    );
    expect(pointer).toBeDefined();
    renderPage();
    const group = screen.getByRole("group", { name: "Package manager" });
    const first = document.querySelector("main section") as HTMLElement;
    expect(
      group.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    for (const text of [
      await markdownLoader().text(),
      await fullLoader().text(),
    ]) {
      expect(text).toContain("the command at the top of the page");
      expect(text.indexOf(INSTALL_COMMAND)).toBeLessThan(text.indexOf("\n## "));
      expect(text).not.toMatch(/as the first section shows/);
    }
  });

  it("puts the same hero at the top of /index.md and in /llms-full.txt", async () => {
    const hero = `# ${HEADLINE}\n\n${lineToText(LEDE)}\n`;
    expect((await markdownLoader().text()).startsWith(hero)).toBe(true);
    expect(await fullLoader().text()).toContain(hero);
  });

  it("has one clear order: embed, what you get, see it working, fit, then questions", () => {
    renderPage();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      "Embed a map",
      "What you get",
      "See it working",
      "When it fits, and when it does not",
      "Questions",
    ]);
  });

  it("shows what you get as a legend that is always open: at most six things, each with an icon, a short name and its meaning", () => {
    renderPage();
    const you = section("What you get");
    expect(you.querySelector("details")).toBeNull();
    const items = within(you).getAllByRole("listitem");
    expect(items.length).toBeLessThanOrEqual(6);
    for (const item of items) {
      const icon = item.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      const name = item.querySelector(`.${styles.legendName}`);
      expect(name?.textContent?.length).toBeLessThan(45);
      expect(item.querySelector("p")?.textContent?.length).toBeGreaterThan(60);
    }
  });

  it("puts what you get in /index.md as headings with their text, as it did when they opened", async () => {
    const markdown = await markdownLoader().text();
    expect(markdown).toContain(
      "### A finished map interface\n\nSearch by place or by coordinates",
    );
  });

  it("names the SDK's packages, one line each, one tap away", () => {
    renderPage();
    const embed = section("Embed a map");
    for (const name of [
      "@mapcairn/core",
      "@mapcairn/map",
      "@mapcairn/react",
      "@mapcairn/theme",
      "@mapcairn/adapter-maplibre",
    ]) {
      expect(within(embed).getByText(name)).toBeInTheDocument();
    }
  });

  it("puts the install block in the hero, between the lede and the actions, and not again in the embedding section", () => {
    renderPage();
    const h1 = screen.getByRole("heading", { level: 1 });
    const group = screen.getByRole("group", { name: "Package manager" });
    expect(h1.parentElement).toContainElement(group);
    expect(section("Embed a map").querySelector("fieldset")).toBeNull();
    expect(
      (h1.nextElementSibling as HTMLElement).compareDocumentPosition(group) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const github = within(screen.getByRole("main")).getByRole("link", {
      name: "View on GitHub",
    });
    expect(
      group.compareDocumentPosition(github) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("leads with the umbrella's install command, ahead of the example and of any single package", () => {
    renderPage();
    const embed = section("Embed a map");
    const install = screen.getByText(INSTALL_COMMAND);
    expect(install.tagName).toBe("CODE");
    const example = within(embed).getByRole("region", { name: "index.html" });
    expect(
      install.compareDocumentPosition(example) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const first = embed.querySelector("p");
    expect(first?.textContent).toContain("@mapcairn/sdk");
    expect(first?.textContent).not.toContain("@mapcairn/core");
    expect(embed.textContent).toContain("advanced option");
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

  it("shows each file of the embedding example in its own focusable region, named for the file, in the order they are made", () => {
    renderPage();
    const embed = section("Embed a map");
    const regions = within(embed)
      .getAllByRole("region")
      .filter(
        (region) => region.tagName === "PRE" && !region.closest("fieldset"),
      );
    expect(regions.map((region) => region.getAttribute("aria-label"))).toEqual([
      "index.html",
      "src/page.css",
      "src/main.tsx",
    ]);
    regions.forEach((region, index) => {
      expect(region).toHaveAttribute("tabindex", "0");
      expect(region.textContent).toBe(EMBED_EXAMPLE_FILES[index]?.code);
    });
  });

  it("heads each file with its name, beside its own copy button", () => {
    renderPage();
    const embed = section("Embed a map");
    for (const { name } of EMBED_EXAMPLE_FILES) {
      const region = within(embed).getByRole("region", { name });
      const heading = region.parentElement?.firstElementChild;
      expect(heading?.textContent).toContain(name);
      expect(
        within(heading as HTMLElement).getByRole("button", {
          name: `Copy code, ${name}`,
        }),
      ).toHaveTextContent("Copy code");
    }
  });

  it("highlights the example's syntax with classes, never an inline style", () => {
    renderPage();
    const code = screen.getByRole("region", { name: "src/main.tsx" });
    const spans = [...code.querySelectorAll("span")];
    const classOf = (text: string) =>
      spans.find((span) => span.textContent === text)?.className;
    expect(classOf("import")).toBe(styles.codeKeyword);
    expect(classOf('"@mapcairn/sdk"')).toBe(styles.codeMuted);
    expect(classOf("11")).toBe(styles.codeMuted);
    expect(classOf("ServicesProvider")).toBe(styles.codeName);
    expect(code.querySelector("[style]")).toBeNull();
  });

  it("offers three actions once, in the hero: View on GitHub first, then the playground and the npm package", () => {
    renderPage();
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("link", { name: "View on GitHub" }),
    ).toHaveAttribute("href", REPO);
    expect(
      within(main).getByRole("link", { name: "Try the playground" }),
    ).toHaveAttribute("href", "/map");
    expect(
      within(main).getByRole("link", { name: "View on npm" }),
    ).toHaveAttribute("href", NPM_PACKAGE);
    expect(NPM_PACKAGE_URL).toBe(NPM_PACKAGE);
    expect(
      within(main)
        .getAllByRole("link")
        .slice(0, 3)
        .map((link) => link.textContent),
    ).toEqual(["View on GitHub", "Try the playground", "View on npm"]);
  });

  it("offers View on GitHub as the one button and the playground and npm as two links in a row under it", () => {
    renderPage();
    const main = within(screen.getByRole("main"));
    const github = main.getByRole("link", { name: "View on GitHub" });
    const playground = main.getByRole("link", { name: "Try the playground" });
    const npm = main.getByRole("link", { name: "View on npm" });
    expect(github.className).toContain(styles.primaryAction);
    const row = playground.closest("ul") as HTMLElement;
    expect(row).not.toBeNull();
    expect(within(row).getAllByRole("link")).toEqual([playground, npm]);
    expect(row).not.toContainElement(github);
    expect(playground.className).not.toContain(styles.primaryAction);
    expect(
      github.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("links to npm from exactly one place, the hero, and nowhere else", () => {
    renderPage();
    const npm = screen
      .getAllByRole("link")
      .filter((link) =>
        (link.getAttribute("href") ?? "").startsWith("https://www.npmjs.com/"),
      );
    expect(npm).toHaveLength(1);
    expect(screen.getByRole("main")).toContainElement(npm[0] ?? null);
  });

  it("links to the npm package from /index.md and /llms-full.txt too", async () => {
    expect(await markdownLoader().text()).toContain(
      `[View on npm](${NPM_PACKAGE})`,
    );
    expect(await fullLoader().text()).toContain(
      `[View on npm](${NPM_PACKAGE})`,
    );
  });

  it("links to the repository's front page from exactly two places: the hero's button and the footer's Source code", () => {
    renderPage();
    const github = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === REPO);
    expect(github.map((link) => link.textContent)).toEqual([
      "View on GitHub",
      "Source code",
    ]);
    for (const link of github) {
      expect(link).toHaveAttribute("href", REPO);
    }
    const [hero, footer] = github;
    expect(screen.getByRole("main")).toContainElement(hero ?? null);
    expect(screen.getByRole("contentinfo")).toContainElement(footer ?? null);
  });

  it("keeps only Playground in the header", () => {
    renderPage();
    const header = screen.getByRole("banner");
    expect(
      within(header)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["MapCairn", "/"],
      ["Playground", "/map"],
    ]);
  });

  it("opens the playground through links its own hash parser reads as a view", () => {
    renderPage();
    const deepLinks = within(screen.getByTestId("playground-deep-links"))
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "");
    expect(deepLinks.length).toBeGreaterThan(0);
    for (const href of deepLinks) {
      expect(href.startsWith("/map#")).toBe(true);
      // The address round-trips through the app's own reader and writer.
      const state = parseUrlHash(href.slice(href.indexOf("#")));
      expect(state.view).toBeDefined();
      expect(`/map${serialiseUrlHash(state)}`).toBe(href);
    }
  });

  it("says what MapCairn is not", () => {
    renderPage();
    const fit = section("When it fits, and when it does not");
    expect(fit).toHaveTextContent(
      "a hosted service, a dataset or a GIS analysis engine",
    );
  });

  it("states the licence as open source under the AGPL-3.0, which allows commercial use", () => {
    const { container } = renderPage();
    expect(container.textContent).toContain(
      "Open source under the AGPL-3.0, which allows commercial use.",
    );
  });

  it("answers what it costs with nothing, that the licence allows commercial use, and a link to the licence guide", () => {
    renderPage();
    const answer = screen.getByText(/^Nothing: it is open source/, {
      selector: "p",
    });
    expect(answer).toHaveTextContent(
      "Nothing: it is open source under the AGPL-3.0, which allows commercial use.",
    );
    expect(
      within(answer).getByRole("link", { name: "licence guide" }),
    ).toHaveAttribute("href", `${REPO}/blob/main/docs/guides/licence.md`);
  });

  it("keeps the README's sentence that a licence for closed-source use is not on offer yet, and says closed-source use needs separate terms", () => {
    const { container } = renderPage();
    expect(container.textContent).toContain(
      "A licence for closed-source use is not on offer yet.",
    );
    expect(container.textContent).toContain(
      "needs separate terms. A licence for closed-source use",
    );
  });

  it("says in See it working what the playground adds, and where its services' terms apply", () => {
    renderPage();
    const see = section("See it working");
    expect(see).toHaveTextContent(
      "its search, directions and data layers are this site's adapters and definitions",
    );
    expect(see).toHaveTextContent(
      "Nominatim for search and the FOSSGIS Valhalla server for directions",
    );
    expect(see).toHaveTextContent(
      "not meant for other sites' production traffic",
    );
    expect(see).toHaveTextContent(
      "Your app supplies its own providers. The SDK ships the interface, the MapLibre adapter and in-memory fakes.",
    );
  });

  it("says in the production answer that it is before 1.0, and that each release's notes name what to change", () => {
    renderPage();
    const production = screen.getByText(/^The reference site runs on it/, {
      selector: "p",
    });
    expect(production.nextElementSibling).toHaveTextContent(
      "It is before version 1.0: a minor release can change the public API, and each release's notes name what to change.",
    );
  });

  it("links the capability matrix and the example app in the text instead of naming them", () => {
    renderPage();
    expect(
      screen.getByRole("link", { name: "capability matrix" }),
    ).toHaveAttribute("href", CAPABILITY_MATRIX_LINK.href);
    expect(
      screen.getByRole("link", { name: "examples/embed" }),
    ).toHaveAttribute("href", EXAMPLE_APP);
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

  it("links only to the repository's front page, the named set of its pages (and the example app), the package page, the Mastodon profile or this site: no other file, folder, section or contributing page", () => {
    renderPage();
    const named = new Set<string>([
      ...FOOTER_REPOSITORY_PAGES.map(([, href]) => href),
      EXAMPLE_APP,
      CAPABILITY_MATRIX,
    ]);
    // The credits a picture carries, which its basemaps ask for wherever the map shows.
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
          href === NPM_PACKAGE ||
          href === MASTODON ||
          creditHrefs.has(href) ||
          /^[/#]/.test(href),
        href,
      ).toBe(true);
      expect(href).not.toMatch(/#licence$|\/contribute/);
    }
  });

  it("asks nothing of a third party: no image, frame, script source or stylesheet from elsewhere", () => {
    const html = renderToStaticMarkup(
      <ProductPage clipboard={new FakeClipboard()} />,
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
      <ProductPage clipboard={new FakeClipboard()} />,
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
});

/** The figure of a picture by its subject. */
function plate(id: string): HTMLElement {
  return screen.getByTestId(`plate-${id}`);
}

describe("the pictures", () => {
  it("shows the hero's picture in a figure after the h1, in the hero", () => {
    renderPage();
    const hero = plate("hero");
    expect(hero.tagName).toBe("FIGURE");
    expect(
      screen.getByRole("heading", { level: 1 }).compareDocumentPosition(hero),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole("main").firstElementChild).toContainElement(hero);
  });

  it("puts the phone capture in What you get, before the legend", () => {
    renderPage();
    const you = section("What you get");
    const figure = plate("basemaps");
    expect(you).toContainElement(figure);
    const [legend] = within(you).getAllByRole("list");
    expect(figure.compareDocumentPosition(legend as Element)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  for (const { id, width, height } of CAPTURE_SUBJECTS) {
    it(`draws the ${id} picture as two lazy images of its size, one for each theme, each with its own alt text, from this site`, () => {
      renderPage();
      const images = within(plate(id)).getAllByRole("img", { hidden: true });
      expect(images).toHaveLength(CAPTURE_THEMES.length);
      for (const [index, theme] of CAPTURE_THEMES.entries()) {
        const image = images[index] as HTMLElement;
        expect(image).toHaveAttribute("width", String(width));
        expect(image).toHaveAttribute("height", String(height));
        expect(image).toHaveAttribute("loading", "lazy");
        expect(image).toHaveAttribute("decoding", "async");
        expect(image).toHaveAttribute("alt", plateAlt(id, theme));
        expect(image.getAttribute("src")).toMatch(
          new RegExp(`^/.*${id}-${theme}.*\\.webp$`),
        );
      }
    });
  }

  it("tells in each alt text what the picture shows, the basemap and the theme, and the hero names the length it measures", () => {
    for (const { id } of CAPTURE_SUBJECTS) {
      for (const theme of CAPTURE_THEMES) {
        const alt = plateAlt(id, theme);
        expect(alt).toContain(PLATES[id].description);
        expect(alt).toContain(`${theme} theme`);
      }
    }
    expect(plateAlt("hero", "light")).toContain("3.42 km");
    expect(plateAlt("hero", "light")).toContain("Bright basemap");
    expect(plateAlt("hero", "dark")).toContain("Fiord basemap");
  });

  it("credits the map under every picture, in the words and links of the basemap's own definition", () => {
    renderPage();
    for (const { id } of CAPTURE_SUBJECTS) {
      const credits = plateCredits(id);
      expect(credits.map((credit) => credit.text)).toEqual([
        "© OpenStreetMap contributors",
        "OpenFreeMap",
        "OpenMapTiles",
        "MapLibre",
      ]);
      const lead = within(plate(id)).getByText(PLATE_CREDITS_LEAD, {
        exact: false,
      });
      const links = within(lead).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(
        credits.map((credit) => credit.text),
      );
      expect(links.map((link) => link.getAttribute("href"))).toEqual(
        credits.map((credit) => credit.href),
      );
      // Pinned, so a change to a definition's link is seen here and in ATTRIBUTIONS.md.
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        "https://www.openstreetmap.org/copyright",
        "https://openfreemap.org",
        "https://openmaptiles.org",
        "https://maplibre.org",
      ]);
      expect(plate(id)).toHaveTextContent(PLATES[id].caption);
    }
  });

  it("names the basemap of each theme in the caption, so either picture is described", () => {
    renderPage();
    expect(plate("hero")).toHaveTextContent(
      "The basemap is Bright in the light theme and Fiord in the dark theme.",
    );
  });

  it("draws a collar of latitude and longitude ticks round each picture, as decoration only", () => {
    renderPage();
    for (const { id } of CAPTURE_SUBJECTS) {
      const collars = [
        within(plate(id)).getByTestId("plate-latitude"),
        within(plate(id)).getByTestId("plate-longitude"),
      ];
      for (const collar of collars) {
        expect(collar).toHaveAttribute("aria-hidden", "true");
        expect(collar).toHaveAttribute("focusable", "false");
        expect(collar.querySelectorAll("line").length).toBeGreaterThanOrEqual(
          2,
        );
        const labels = [...collar.querySelectorAll("text")].map(
          (text) => text.textContent ?? "",
        );
        expect(labels.length).toBeGreaterThanOrEqual(2);
        for (const label of labels) {
          expect(label).toMatch(/^\d+°\d\d′\d\d″[NSEW]$/);
        }
      }
    }
  });

  it("swaps the pictures with CSS alone: each picture's dark twin carries the class that starts hidden", () => {
    renderPage();
    for (const { id } of CAPTURE_SUBJECTS) {
      const [light, dark] = within(plate(id)).getAllByRole("img", {
        hidden: true,
      });
      expect(light).toHaveClass(styles.plateLight);
      expect(dark).toHaveClass(styles.plateDark);
    }
  });

  it("describes each picture and its credits in /index.md and /llms-full.txt, in step with the page", async () => {
    for (const text of [
      await markdownLoader().text(),
      await fullLoader().text(),
    ]) {
      for (const { id } of CAPTURE_SUBJECTS) {
        expect(text).toContain(PLATES[id].description);
        expect(text).toContain(plateCreditsText(id));
      }
    }
  });
});

/** The README's code blocks of one language, after its "Embed a map" heading. */
function readmeBlocks(language: string): string[] {
  const embed = README.slice(README.indexOf("## Embed a map"));
  return [
    ...embed.matchAll(
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

  it("is the same code in /index.md and /llms-full.txt, each file under its name", async () => {
    for (const text of [
      await markdownLoader().text(),
      await fullLoader().text(),
    ]) {
      for (const { name, language, code } of EMBED_EXAMPLE_FILES) {
        expect(text).toContain(
          `\`${name}\`:\n\n\`\`\`${language}\n${code}\n\`\`\``,
        );
      }
    }
  });

  it("no longer says the fakes draw a map, and says what draws it", () => {
    renderPage();
    const embed = section("Embed a map");
    expect(embed.textContent).toContain(
      "This is a whole React app in a Vite project: the map from the MapLibre adapter, the SDK's interface around it and a search box.",
    );
    expect(embed.textContent).toContain(
      "with the adapter passed in to draw the map; search shows sample results until you add a search adapter",
    );
    expect(embed.textContent).not.toContain("draw no map tiles");
    expect(embed.textContent).toContain(
      "Add src/page.css, a short style sheet, so the map has a height",
    );
    expect(embed.textContent).not.toContain("three lines");
    expect(embed.textContent).not.toContain("other two files");
    expect(embed.textContent).toContain(
      "imports the SDK only through its package",
    );
  });
});

describe("what the page says the SDK sends", () => {
  it("names the basemap as the one request the SDK's map makes by itself", () => {
    renderPage();
    expect(
      screen.getByRole("region", { name: "Questions" }).textContent,
    ).toContain("The SDK sends nothing by itself, apart from the basemap:");
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
    ).getByRole("button", { name: "Copy code, src/main.tsx" });
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
    await waitFor(() => expect(clipboard.written).toEqual([MAIN_CODE]));
    const code = screen.getByRole("region", { name: "src/main.tsx" });
    expect(clipboard.written[0]).toBe(code.textContent);
  });

  it("says Copied on the button and in the polite live region, and keeps focus on the button", async () => {
    renderPage();
    const button = copyButton();
    button.focus();
    fireEvent.click(button);
    expect(
      await screen.findByRole("button", { name: "Copied, src/main.tsx" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(liveRegions().polite).toHaveTextContent(
        "Code copied, src/main.tsx",
      ),
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
      screen.getByRole("button", { name: "Copied, src/main.tsx" }),
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
    const copied = screen.getByRole("button", { name: "Copied, src/main.tsx" });
    copied.focus();
    fireEvent.click(copied);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(COPIED_FEEDBACK_MS - 100);
    });
    expect(screen.getByRole("button", { name: "Copied, src/main.tsx" })).toBe(
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
      await screen.findByRole("button", { name: "Copied, src/main.tsx" }),
    ).toBeInTheDocument();
    await act(async () => {
      pending[0]?.({ ok: false, reason: "denied" });
    });
    expect(screen.getByRole("button", { name: "Copied, src/main.tsx" })).toBe(
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
      await screen.findByRole("button", { name: "Copy failed, src/main.tsx" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(liveRegions().assertive).toHaveTextContent(
        "Could not copy src/main.tsx. Select the code and copy it manually.",
      ),
    );
    expect(document.activeElement).toBe(button);
    const code = screen.getByRole("region", { name: "src/main.tsx" });
    expect(code).toHaveAttribute("tabindex", "0");
    expect(code.textContent).toBe(MAIN_CODE);
  });

  it("copies again after a failure once the clipboard works", async () => {
    const clipboard = new FakeClipboard();
    clipboard.failWith("unsupported");
    renderPage(clipboard);
    fireEvent.click(copyButton());
    const failed = await screen.findByRole("button", {
      name: "Copy failed, src/main.tsx",
    });
    clipboard.succeed();
    fireEvent.click(failed);
    expect(
      await screen.findByRole("button", { name: "Copied, src/main.tsx" }),
    ).toBeInTheDocument();
    expect(clipboard.written).toEqual([MAIN_CODE]);
  });

  it("names the file in what it announces, for each of the three buttons", async () => {
    renderPage();
    for (const { name } of EMBED_EXAMPLE_FILES) {
      fireEvent.click(
        screen.getByRole("button", { name: `Copy code, ${name}` }),
      );
      await waitFor(() =>
        expect(liveRegions().polite).toHaveTextContent(`Code copied, ${name}`),
      );
    }
  });

  it("leaves no duplicate test id on the three blocks and their buttons", () => {
    const { container } = renderPage();
    expect(
      container.querySelectorAll("[data-testid='copy-code']"),
    ).toHaveLength(0);
    expect(container.querySelectorAll("[data-testid$='-code']")).toHaveLength(
      0,
    );
  });

  it("renders on the server with the button and no message", () => {
    const html = renderToStaticMarkup(
      <ProductPage clipboard={new FakeClipboard()} />,
    );
    expect(html).toContain(">Copy code</button>");
    expect(html).not.toContain("Code copied");
  });
});
