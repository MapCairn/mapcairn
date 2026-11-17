// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseUrlHash } from "@mapcairn/core";
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MAP_LINK_REDIRECT_SCRIPT } from "../app/mapLinkRedirect";
import { SITE_URL } from "../constants/siteConfig";
import { ProductPage } from "./ProductPage";
import { EMBED_EXAMPLE_CODE } from "./productContent";

const REPO = "https://github.com/MapCairn/mapcairn";

/** The capability matrix, where every "Works today" item must be a "has". */
const MATRIX = readFileSync(
  path.resolve(__dirname, "../../../../docs/guides/capability-matrix.md"),
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

/** The list under an h3 inside a section, by the h3's name. */
function listUnder(name: string): string[] {
  const heading = screen.getByRole("heading", { level: 3, name });
  const list = heading.nextElementSibling as HTMLElement;
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
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

  it("answers, by heading, everything a developer asks before clicking through", () => {
    renderPage();
    const sections = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(sections).toEqual([
      "Who it is for",
      "What the code looks like",
      "What is in the SDK",
      "How it is built",
      "Accessibility and privacy you can check",
      "See it working",
      "What works today, and what does not yet",
      "Licence",
      "Questions developers ask first",
      "Follow the project and help",
    ]);
  });

  it("names the four packages, one line each", () => {
    renderPage();
    const packages = screen.getByRole("region", { name: "What is in the SDK" });
    for (const name of [
      "@mapcairn/core",
      "@mapcairn/map",
      "@mapcairn/react",
      "@mapcairn/theme",
    ]) {
      expect(within(packages).getByText(name)).toBeInTheDocument();
    }
  });

  it("shows the embedding example in its own focusable, named region", () => {
    renderPage();
    const code = screen.getByRole("region", { name: "Embedding example" });
    expect(code.tagName).toBe("PRE");
    expect(code).toHaveAttribute("tabindex", "0");
    expect(code.textContent).toBe(EMBED_EXAMPLE_CODE);
  });

  it("makes View on GitHub the first action, and offers it again at the end", () => {
    renderPage();
    const main = screen.getByRole("main");
    const actions = within(main).getAllByRole("link", {
      name: "View on GitHub",
    });
    expect(actions.length).toBeGreaterThanOrEqual(2);
    for (const action of actions) {
      expect(action).toHaveAttribute("href", REPO);
    }
    const first = within(main).getAllByRole("link")[0];
    expect(first).toHaveAccessibleName("View on GitHub");
    const last = screen.getByRole("region", {
      name: "Follow the project and help",
    });
    expect(
      within(last).getByRole("link", { name: "View on GitHub" }),
    ).toBeInTheDocument();
  });

  it("puts the playground one link away everywhere: header, hero, See it working, the end and the footer", () => {
    renderPage();
    const header = screen.getByRole("banner");
    expect(
      within(header).getByRole("link", { name: "Playground" }),
    ).toHaveAttribute("href", "/map");
    expect(
      within(header).getByRole("link", { name: "GitHub" }),
    ).toHaveAttribute("href", REPO);
    const tries = screen.getAllByRole("link", { name: "Try the playground" });
    // Hero, See it working, the closing actions and the footer.
    expect(tries).toHaveLength(4);
    for (const link of tries) {
      expect(link).toHaveAttribute("href", "/map");
    }
    expect(
      within(screen.getByRole("contentinfo")).getByRole("link", {
        name: "Try the playground",
      }),
    ).toBeInTheDocument();
  });

  it("opens the playground in real states through the links it shares", () => {
    renderPage();
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

  it("says the packages are not on npm yet, links issue 1, and shows no install command or badge", () => {
    const { container } = renderPage();
    const code = screen.getByRole("region", {
      name: "What the code looks like",
    });
    expect(code).toHaveTextContent("The packages are not on npm yet");
    expect(
      within(code).getByRole("link", {
        name: "Publishing the first release is tracked in issue 1",
      }),
    ).toHaveAttribute("href", `${REPO}/issues/1`);
    expect(container.textContent).not.toMatch(/npm (install|i) /);
    expect(container.querySelector("img")).toBeNull();
  });

  it("lists as working today only what the capability matrix says MapCairn has", () => {
    renderPage();
    const today = listUnder("Works today");
    expect(today.length).toBeGreaterThan(3);
    const has = [
      [
        "Search by place name or coordinates",
        "Place search through a replaceable provider",
      ],
      ["Search by place name or coordinates", "Coordinates typed into search"],
      [
        "GeoJSON, CSV and WKT import and export",
        "Importing drawn shapes from GeoJSON, WKT and CSV files",
      ],
      [
        "Directions through a routing provider",
        "A route through ordered stops",
      ],
      ["vector tiles", "Vector tiles styled by source layer"],
      ["heatmaps", "Heatmaps with controls"],
      [
        "Links that carry the view, the basemap, the layers and drawn shapes",
        "A link that carries view, basemap, layers and shapes",
      ],
      ["saving the map as an image", "Save the map as an image"],
    ];
    for (const [claim, evidence] of has) {
      expect(today.join(" ")).toContain(claim);
      const row = MATRIX.split("\n").find((line) =>
        line.toLowerCase().includes((evidence ?? "").toLowerCase()),
      );
      expect(row, evidence).toMatch(/\|\s*has\s*\|/);
    }
  });

  it("lists as not yet only what has an open issue, and claims no planned feature as built", () => {
    renderPage();
    const notYet = screen.getByRole("heading", { level: 3, name: "Not yet" })
      .nextElementSibling as HTMLElement;
    for (const link of within(notYet).getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(
        /^https:\/\/github\.com\/MapCairn\/mapcairn\/issues\/\d+$/,
      );
    }
    for (const [number, phrase] of [
      ["192", "PMTiles"],
      ["227", "GPX and KML"],
      ["45", "behind a login"],
      ["231", "any language"],
    ] as const) {
      const row = MATRIX.split("\n").find((line) =>
        line.includes(`[#${number}]`),
      );
      expect(row, phrase).toMatch(/\|\s*(lacks|partial)\s*\|/);
    }
  });

  it("states the licence as open source under the AGPL-3.0, and never commercial terms", () => {
    const { container } = renderPage();
    const text = container.textContent ?? "";
    expect(text).toContain("open source under the AGPL-3.0");
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
      "Privacy policy",
      "Credits",
      "Roadmap",
    ]) {
      expect(within(footer).getByRole("link", { name })).toBeInTheDocument();
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
      const href = link.getAttribute("href") ?? "";
      expect(href).toMatch(/^(\/|#|https:\/\/)/);
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

  it("draws its artwork as decoration only", () => {
    renderPage();
    const art = screen.getByTestId("survey-art");
    expect(art).toHaveAttribute("aria-hidden", "true");
    expect(art).toHaveAttribute("focusable", "false");
  });

  it("links the privacy policy as a page on this site", () => {
    renderPage();
    for (const link of screen.getAllByRole("link", {
      name: /privacy policy/i,
    })) {
      expect(link.getAttribute("href")).toBe("/privacy");
    }
    expect(SITE_URL.startsWith("https://")).toBe(true);
  });
});

describe("the embedding example", () => {
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

  it("starts at the first import, with no licence header or note", () => {
    expect(EMBED_EXAMPLE_CODE.startsWith("import {")).toBe(true);
    expect(EMBED_EXAMPLE_CODE).not.toMatch(/SPDX|\/\*|\/\//);
  });

  it("imports only from the SDK's public entry points and React", () => {
    const sources = [...EMBED_EXAMPLE_CODE.matchAll(/from "([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(sources).toEqual(["@mapcairn/core", "@mapcairn/map", "react"]);
  });
});
