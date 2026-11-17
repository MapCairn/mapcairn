// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseUrlHash } from "@mapcairn/core";
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MAP_LINK_REDIRECT_SCRIPT } from "../app/mapLinkRedirect";
import { ProductPage } from "./ProductPage";
import { EMBED_EXAMPLE_CODE } from "./productContent";

const REPO = "https://github.com/MapCairn/mapcairn";

/** The capability matrix, which says what MapCairn has, partly has or lacks. */
const MATRIX = readFileSync(
  path.resolve(__dirname, "../../../../docs/guides/capability-matrix.md"),
  "utf8",
);

/** The README on `main`, whose "Documentation" heading GitHub anchors as `#documentation`. */
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

  it("has one clear order: embed, what you get, see it working, fit, questions, then follow and help", () => {
    renderPage();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      "Embed a map",
      "What you get",
      "See it working",
      "When it fits, and when it does not",
      "Questions",
      "Follow the project and help",
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
    const text = section("What you get").textContent ?? "";
    for (const claim of [
      "WCAG 2.2 AA",
      "arrow keys pan",
      "nothing is requested until a person asks",
      "contract suite",
      "contrast of every token pair",
      "GeoJSON, CSV and WKT",
    ]) {
      expect(text).toContain(claim);
    }
  });

  it("names the four packages, one line each, one tap away", () => {
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

  it("offers the two actions only in the hero and the closing block, View on GitHub first", () => {
    renderPage();
    const main = screen.getByRole("main");
    const github = within(main).getAllByRole("link", {
      name: "View on GitHub",
    });
    const playground = within(main).getAllByRole("link", {
      name: "Try the playground",
    });
    expect(github).toHaveLength(2);
    expect(playground).toHaveLength(2);
    for (const link of github) {
      expect(link).toHaveAttribute("href", REPO);
    }
    for (const link of playground) {
      expect(link).toHaveAttribute("href", "/map");
    }
    expect(within(main).getAllByRole("link")[0]).toHaveAccessibleName(
      "View on GitHub",
    );
    const closing = section("Follow the project and help");
    expect(
      within(closing).getByRole("link", { name: "View on GitHub" }),
    ).toBeInTheDocument();
    expect(
      within(closing).getByRole("link", { name: "Try the playground" }),
    ).toBeInTheDocument();
  });

  it("keeps Playground and GitHub in the header, and both in the footer", () => {
    renderPage();
    const header = screen.getByRole("banner");
    expect(
      within(header).getByRole("link", { name: "Playground" }),
    ).toHaveAttribute("href", "/map");
    expect(
      within(header).getByRole("link", { name: "GitHub" }),
    ).toHaveAttribute("href", REPO);
    const footer = screen.getByRole("contentinfo");
    expect(
      within(footer).getByRole("link", { name: "Try the playground" }),
    ).toHaveAttribute("href", "/map");
    expect(
      within(footer).getByRole("link", { name: "Source code on GitHub" }),
    ).toHaveAttribute("href", REPO);
  });

  it("says what to try in the playground, and opens it in real states through the links it shares", () => {
    renderPage();
    expect(section("See it working")).toHaveTextContent(
      "Search for a place or a pair of coordinates",
    );
    const deepLinks = within(screen.getByTestId("playground-deep-links"))
      .getAllByRole("link")
      .map((link) => ({
        name: link.textContent,
        href: link.getAttribute("href") ?? "",
      }));
    expect(deepLinks.map((link) => link.name)).toEqual([
      "Open the playground over Cape Town",
      "Open the playground on the Dark basemap",
      "Open the playground with the past day's earthquakes turned on",
    ]);
    for (const { href } of deepLinks) {
      expect(href.startsWith("/map#")).toBe(true);
    }
    const [capeTown, dark, earthquakes] = deepLinks.map(({ href }) =>
      parseUrlHash(href.slice(href.indexOf("#"))),
    );
    expect(capeTown?.view?.center).toEqual({ lat: -33.92, lng: 18.42 });
    expect(dark?.basemapId).toBe("dark");
    expect(earthquakes?.layers?.enabled).toEqual(["earthquakes"]);
  });

  it("says nothing about npm, either way", () => {
    const html = renderToStaticMarkup(<ProductPage />);
    expect(html).not.toMatch(/npm/i);
  });

  it("says when it does not fit only with open issues the capability matrix agrees with", () => {
    renderPage();
    const fit = section("When it fits, and when it does not");
    const issueLinks = within(fit)
      .getAllByRole("link")
      .filter((link) => /\/issues\/\d+$/.test(link.getAttribute("href") ?? ""));
    expect(issueLinks.length).toBeGreaterThan(0);
    for (const link of issueLinks) {
      const number = (link.getAttribute("href") ?? "").split("/").at(-1);
      const row = MATRIX.split("\n").find(
        (line) => line.startsWith("|") && line.includes(`[#${number}]`),
      );
      expect(row, `#${number}`).toMatch(/\|\s*(lacks|partial)\s*\|/);
    }
    expect(fit).toHaveTextContent(
      "a hosted service, a dataset or a GIS analysis engine",
    );
  });

  it("states the licence as open source under the AGPL-3.0, and never commercial terms", () => {
    const { container } = renderPage();
    const text = container.textContent ?? "";
    expect(text).toContain("Open source under the AGPL-3.0");
    expect(text).not.toMatch(/commercial/i);
  });

  it("ends with a quiet line that says where it is made, and names no person", () => {
    renderPage();
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("Built with love in South Africa.");
    expect(footer.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(footer).not.toHaveTextContent(/timothy|brits/i);
    for (const name of [
      "Source code on GitHub",
      "Try the playground",
      "Documentation",
      "Roadmap",
      "Privacy policy",
      "Licence and credits",
    ]) {
      expect(within(footer).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(
      within(footer).getByRole("link", { name: "Roadmap" }),
    ).toHaveAttribute("href", `${REPO}/milestones`);
  });

  it("links to no Markdown file: documentation, the roadmap, issues and contributing use GitHub's own pages", () => {
    renderPage();
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "");
    for (const href of hrefs) {
      expect(href).not.toMatch(/\.md(#.*)?$/);
      expect(href).not.toMatch(/\/(blob|raw)\//);
      expect(href).not.toContain("raw.githubusercontent.com");
    }
    expect(hrefs).toContain(`${REPO}#documentation`);
    expect(hrefs).toContain(`${REPO}/milestones`);
    expect(hrefs).toContain(`${REPO}/issues`);
    expect(hrefs).toContain(`${REPO}/contribute`);
    // The anchors the page uses exist on the repository's front page.
    expect(README).toMatch(/^## Documentation$/m);
    expect(README).toMatch(/^## Licence$/m);
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
