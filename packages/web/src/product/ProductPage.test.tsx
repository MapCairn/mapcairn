// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseUrlHash, serialiseUrlHash } from "@mapcairn/core";
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MAP_LINK_REDIRECT_SCRIPT } from "../app/mapLinkRedirect";
import { ProductPage } from "./ProductPage";
import * as styles from "./ProductPage.css";
import { EMBED_EXAMPLE_CODE } from "./productContent";

const REPO = "https://github.com/MapCairn/mapcairn";

/** The README, whose embedding example the page shows. */
const README = readFileSync(
  path.resolve(__dirname, "../../../../README.md"),
  "utf8",
);

/** The example app the embedding example is checked against. */
const EXAMPLE_APP = readFileSync(
  path.resolve(__dirname, "../../../../examples/embed/src/ExampleApp.tsx"),
  "utf8",
);

function renderPage() {
  return render(<ProductPage />);
}

/** A section by its heading. */
function section(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

describe("the product page stands on its own", () => {
  it("has one h1 that says what MapCairn is", () => {
    renderPage();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(
      "An open-source SDK for accessible, privacy-respecting map applications",
    );
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

  it("lists at most six things you get, each one line, with the detail one tap away and in the page", () => {
    renderPage();
    const items = within(section("What you get")).getAllByRole("group");
    expect(items.length).toBeLessThanOrEqual(6);
    for (const item of items) {
      expect(item.tagName).toBe("DETAILS");
      const summary = item.querySelector("summary");
      expect(summary?.textContent?.length).toBeLessThan(45);
      expect(item.querySelector("p")?.textContent?.length).toBeGreaterThan(60);
    }
  });

  it("names the SDK's packages, one line each, one tap away", () => {
    renderPage();
    const embed = section("Embed a map");
    for (const name of [
      "@mapcairn/core",
      "@mapcairn/map",
      "@mapcairn/react",
      "@mapcairn/theme",
    ]) {
      expect(within(embed).getByText(name)).toBeInTheDocument();
    }
  });

  it("shows the embedding example in its own focusable, named region", () => {
    renderPage();
    const code = screen.getByRole("region", { name: "Embedding example" });
    expect(code.tagName).toBe("PRE");
    expect(code).toHaveAttribute("tabindex", "0");
    expect(code.textContent).toBe(EMBED_EXAMPLE_CODE);
  });

  it("highlights the example's syntax with classes, never an inline style", () => {
    renderPage();
    const code = screen.getByRole("region", { name: "Embedding example" });
    const spans = [...code.querySelectorAll("span")];
    const classOf = (text: string) =>
      spans.find((span) => span.textContent === text)?.className;
    expect(classOf("import")).toBe(styles.codeKeyword);
    expect(classOf('"@mapcairn/core"')).toBe(styles.codeMuted);
    expect(classOf("11")).toBe(styles.codeMuted);
    expect(classOf("ServicesProvider")).toBe(styles.codeName);
    expect(code.querySelector("[style]")).toBeNull();
  });

  it("offers the two actions once, in the hero, View on GitHub first", () => {
    renderPage();
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("link", { name: "View on GitHub" }),
    ).toHaveAttribute("href", REPO);
    expect(
      within(main).getByRole("link", { name: "Try the playground" }),
    ).toHaveAttribute("href", "/map");
    expect(within(main).getAllByRole("link")[0]).toHaveAccessibleName(
      "View on GitHub",
    );
  });

  it("links to the repository from exactly two places: the hero's button and the footer's Source code", () => {
    renderPage();
    const github = screen
      .getAllByRole("link")
      .filter((link) =>
        (link.getAttribute("href") ?? "").startsWith("https://github.com/"),
      );
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

  it("states the licence as open source under the AGPL-3.0", () => {
    const { container } = renderPage();
    expect(container.textContent).toContain("Open source under the AGPL-3.0");
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
    ).toEqual(["Source code", "Try the playground", "Privacy policy"]);
  });

  it("links only to the repository's front page or to this site: no Markdown file, folder, section or contributing page", () => {
    renderPage();
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "");
    for (const href of hrefs) {
      expect(href === REPO || /^[/#]/.test(href), href).toBe(true);
      expect(href).not.toMatch(/\.md(#.*)?$/);
      expect(href).not.toMatch(
        /#(documentation|licence)$|\/tree\/|\/contribute/,
      );
    }
  });

  it("asks nothing of a third party: no image, frame, script source or stylesheet from elsewhere", () => {
    const html = renderToStaticMarkup(<ProductPage />);
    expect(html).not.toMatch(/<(img|iframe|link|object|embed)\b/);
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
    const html = renderToStaticMarkup(<ProductPage />);
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

  it("draws its artwork once, in the hero, as decoration only", () => {
    renderPage();
    const art = screen.getAllByTestId("survey-art");
    expect(art).toHaveLength(1);
    expect(art[0]).toHaveAttribute("aria-hidden", "true");
    expect(art[0]).toHaveAttribute("focusable", "false");
  });
});

describe("the embedding example", () => {
  it("is the README's example, character for character", () => {
    const embed = README.slice(README.indexOf("## Embed a map"));
    const block = /```tsx\n([\s\S]*?)\n```/.exec(embed)?.[1];
    expect(block).toBe(EMBED_EXAMPLE_CODE);
  });

  it("starts at the first import, with no licence header or note", () => {
    expect(EMBED_EXAMPLE_CODE.startsWith("import {")).toBe(true);
    expect(EMBED_EXAMPLE_CODE).not.toMatch(/SPDX|\/\*|\/\//);
  });

  it("builds the same providers in the same order as the example app", () => {
    const order = (source: string) =>
      [
        ...source.matchAll(
          /<(ServicesProvider|LiveRegionProvider|TooltipProvider|MapView)\b/g,
        ),
      ].map((match) => match[1]);
    expect(order(EMBED_EXAMPLE_CODE)).toEqual([
      "ServicesProvider",
      "LiveRegionProvider",
      "TooltipProvider",
      "MapView",
    ]);
    expect(order(EXAMPLE_APP)).toEqual(order(EMBED_EXAMPLE_CODE));
  });

  it("imports only from the SDK's public entry points and React", () => {
    const sources = [...EMBED_EXAMPLE_CODE.matchAll(/from "([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(sources).toEqual(["@mapcairn/core", "@mapcairn/map", "react"]);
  });
});
