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
import { ProductPage } from "./ProductPage";
import * as styles from "./ProductPage.css";
import {
  EMBED_EXAMPLE_CODE,
  HEADLINE,
  INSTALL_COMMAND,
  LEDE,
  lineToText,
} from "./productContent";

const REPO = "https://github.com/MapCairn/mapcairn";
const MASTODON = "https://en.osm.town/@mapcairn";

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
      "Build accessible, privacy-respecting map applications for the public",
    );
  });

  it("says under the h1 what MapCairn is and which teams it is for", () => {
    renderPage();
    const lede = screen.getByRole("heading", { level: 1 })
      .nextElementSibling as HTMLElement;
    expect(lede.tagName).toBe("P");
    expect(lede).toHaveTextContent(
      "MapCairn is an open-source React SDK for teams building public-interest maps, such as open data and hazard maps.",
    );
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
      "@mapcairn/adapter-maplibre",
    ]) {
      expect(within(embed).getByText(name)).toBeInTheDocument();
    }
  });

  it("leads with the umbrella's install command, ahead of the example and of any single package", () => {
    renderPage();
    const embed = section("Embed a map");
    const install = within(embed).getByText(INSTALL_COMMAND);
    expect(install.tagName).toBe("CODE");
    const example = within(embed).getByRole("region", {
      name: "Embedding example",
    });
    expect(
      install.compareDocumentPosition(example) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const first = embed.querySelector("p");
    expect(first?.textContent).toContain("@mapcairn/sdk");
    expect(first?.textContent).not.toContain("@mapcairn/core");
    expect(embed.textContent).toContain("advanced option");
  });

  it("puts the install command and the advanced option into /llms.txt", async () => {
    const text = await llmsLoader().text();
    expect(text).toContain(INSTALL_COMMAND);
    expect(text).toContain("advanced option");
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
    ).toEqual([
      "Source code",
      "Mastodon",
      "Try the playground",
      "Privacy policy",
    ]);
  });

  it("links the footer's Mastodon entry to the project profile with rel=me so the profile can verify the site", () => {
    renderPage();
    const link = within(screen.getByRole("contentinfo")).getByRole("link", {
      name: "Mastodon",
    });
    expect(link).toHaveAttribute("href", "https://en.osm.town/@mapcairn");
    expect(link).toHaveAttribute("rel", "me");
  });

  it("links only to the repository's front page, the Mastodon profile or this site: no Markdown file, folder, section or contributing page", () => {
    renderPage();
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "");
    for (const href of hrefs) {
      expect(
        href === REPO || href === MASTODON || /^[/#]/.test(href),
        href,
      ).toBe(true);
      expect(href).not.toMatch(/\.md(#.*)?$/);
      expect(href).not.toMatch(
        /#(documentation|licence)$|\/tree\/|\/contribute/,
      );
    }
  });

  it("asks nothing of a third party: no image, frame, script source or stylesheet from elsewhere", () => {
    const html = renderToStaticMarkup(
      <ProductPage clipboard={new FakeClipboard()} />,
    );
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

  it("draws its artwork once, in the hero, as decoration only", () => {
    renderPage();
    const art = screen.getAllByTestId("survey-art");
    expect(art).toHaveLength(1);
    expect(art[0]).toHaveAttribute("aria-hidden", "true");
    expect(art[0]).toHaveAttribute("focusable", "false");
  });
});

describe("the embedding example", () => {
  it("shares the README's interface code, character for character", () => {
    const embed = README.slice(README.indexOf("## Embed a map"));
    const block = /```tsx\n([\s\S]*?)\n```/.exec(embed)?.[1] ?? "";
    const interfaceCode = EMBED_EXAMPLE_CODE.slice(
      EMBED_EXAMPLE_CODE.indexOf("function MapScreen"),
    );
    expect(interfaceCode.startsWith("function MapScreen")).toBe(true);
    expect(interfaceCode).toContain("function Chrome");
    expect(block).toContain(interfaceCode);
  });

  it("starts at the first import, with no licence header or note", () => {
    expect(
      EMBED_EXAMPLE_CODE.startsWith('import "@mapcairn/theme/tokens.css";'),
    ).toBe(true);
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

describe("copying the embedding example", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The copy button beside the example. */
  function copyButton(): HTMLElement {
    return within(
      screen.getByRole("region", { name: "Embed a map" }),
    ).getByRole("button", { name: "Copy code" });
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
    await waitFor(() =>
      expect(clipboard.written).toEqual([EMBED_EXAMPLE_CODE]),
    );
    const code = screen.getByRole("region", { name: "Embedding example" });
    expect(clipboard.written[0]).toBe(code.textContent);
  });

  it("says Copied on the button and in the polite live region, and keeps focus on the button", async () => {
    renderPage();
    const button = copyButton();
    button.focus();
    fireEvent.click(button);
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(liveRegions().polite).toHaveTextContent("Code copied"),
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
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
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
    const copied = screen.getByRole("button", { name: "Copied" });
    copied.focus();
    fireEvent.click(copied);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(COPIED_FEEDBACK_MS - 100);
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBe(copied);
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
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
    await act(async () => {
      pending[0]?.({ ok: false, reason: "denied" });
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBe(button);
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
      await screen.findByRole("button", { name: "Copy failed" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(liveRegions().assertive).toHaveTextContent(
        "Could not copy. Select the code and copy it manually.",
      ),
    );
    expect(document.activeElement).toBe(button);
    const code = screen.getByRole("region", { name: "Embedding example" });
    expect(code).toHaveAttribute("tabindex", "0");
    expect(code.textContent).toBe(EMBED_EXAMPLE_CODE);
  });

  it("copies again after a failure once the clipboard works", async () => {
    const clipboard = new FakeClipboard();
    clipboard.failWith("unsupported");
    renderPage(clipboard);
    fireEvent.click(copyButton());
    const failed = await screen.findByRole("button", { name: "Copy failed" });
    clipboard.succeed();
    fireEvent.click(failed);
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
    expect(clipboard.written).toEqual([EMBED_EXAMPLE_CODE]);
  });

  it("renders on the server with the button and no message", () => {
    const html = renderToStaticMarkup(
      <ProductPage clipboard={new FakeClipboard()} />,
    );
    expect(html).toContain(">Copy code</button>");
    expect(html).not.toContain("Code copied");
  });
});
