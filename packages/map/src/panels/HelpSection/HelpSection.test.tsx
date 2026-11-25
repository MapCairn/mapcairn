// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  DRAW_KEY_HELP,
  FakeDevicePreferences,
  FakeMessageCatalogue,
  MAP_KEY_HELP,
  resolveText,
} from "@mapcairn/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServicesProvider } from "../../services";
import { type HelpAbout, HelpSection } from "./HelpSection";

const english = new FakeMessageCatalogue();
const words = (text: string) => resolveText(english, text);

function renderHelp(
  options: {
    finePointer?: boolean;
    headingLevel?: 3 | 4;
    onStartTour?: () => void;
  } = {},
) {
  const { finePointer = true, headingLevel, onStartTour } = options;
  const services = createFakeServices({
    preferences: new FakeDevicePreferences({ finePointer }),
  });
  const view = render(
    <ServicesProvider services={services}>
      <HelpSection headingLevel={headingLevel} onStartTour={onStartTour} />
    </ServicesProvider>,
  );
  return { ...view, services };
}

describe("HelpSection", () => {
  it("is a region named Help with an h3, and subheadings at h4", () => {
    renderHelp();
    expect(screen.getByRole("region", { name: "Help" })).toBe(
      screen.getByTestId("sheet-section-help"),
    );
    expect(
      screen.getByRole("heading", { name: "Help", level: 3 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Keyboard", level: 4 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Accessibility", level: 4 }),
    ).toBeInTheDocument();
  });

  it("says that search takes coordinates as well as place names", () => {
    renderHelp();
    expect(
      screen.getByRole("heading", { name: "Search", level: 4 }),
    ).toBeInTheDocument();
    const search = screen.getByTestId("help-search");
    expect(search).toHaveTextContent("a place name or coordinates");
    expect(search).toHaveTextContent("-26.2041, 28.0473");
    expect(search).toHaveTextContent("26.2041° S, 28.0473° E");
    expect(search).toHaveTextContent("then press Enter or Search");
    expect(search).toHaveTextContent("a decimal point or a degree sign");
    expect(search).toHaveTextContent("not sent to the geocoder");
    expect(search).toHaveTextContent("loads map tiles for that area");
  });

  it("follows the heading level it is given", () => {
    renderHelp({ headingLevel: 4 });
    expect(
      screen.getByRole("heading", { name: "Help", level: 4 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Keyboard", level: 5 }),
    ).toBeInTheDocument();
  });

  describe("with a fine pointer", () => {
    it("lists every shortcut as a term and its description", () => {
      renderHelp();
      const entries = MAP_KEY_HELP;
      const keyboard = within(screen.getByTestId("help-keyboard"));
      const terms = keyboard.getAllByRole("term");
      const definitions = keyboard.getAllByRole("definition");
      expect(terms.map((term) => term.textContent)).toEqual(
        entries.map((entry) => words(entry.keys)),
      );
      expect(definitions.map((definition) => definition.textContent)).toEqual(
        entries.map((entry) => words(entry.description)),
      );
    });

    it("lists the drawing shortcuts in their own subsection", () => {
      renderHelp();
      const drawing = within(screen.getByTestId("help-drawing"));
      expect(
        screen.getByRole("heading", { name: "Drawing", level: 4 }),
      ).toBeInTheDocument();
      expect(
        drawing.getAllByRole("term").map((term) => term.textContent),
      ).toEqual(DRAW_KEY_HELP.map((entry) => words(entry.keys)));
    });

    it("lists the rotation shortcuts", () => {
      renderHelp();
      expect(screen.getByText("Rotate the map")).toBeInTheDocument();
      expect(screen.getByText("Home or 0")).toBeInTheDocument();
    });

    it("keeps the keyboard group in the Keyboard subsection", () => {
      renderHelp();
      const keyboard = screen.getByTestId("help-keyboard");
      expect(within(keyboard).getByText("Arrow keys")).toBeInTheDocument();
    });
  });

  describe("on a touch screen", () => {
    it("shows nothing about the keyboard", () => {
      renderHelp({ finePointer: false });
      expect(screen.queryByRole("heading", { name: "Keyboard" })).toBeNull();
      expect(screen.queryByRole("term")).toBeNull();
      expect(screen.queryByText(/keyboard shortcuts/i)).toBeNull();
      expect(screen.queryByTestId("help-keyboard")).toBeNull();
      expect(screen.queryByTestId("help-drawing")).toBeNull();
    });

    it("still states the accessibility target", () => {
      renderHelp({ finePointer: false });
      expect(
        screen.getByRole("heading", { name: "Accessibility" }),
      ).toBeInTheDocument();
    });
  });

  it("states the accessibility aim plainly and gives no contact address", () => {
    renderHelp();
    const text =
      "MapCairn aims to meet WCAG 2.2 level AA. Every action that uses a gesture, such as a long press or a drag, also has a button or a keyboard shortcut.";
    expect(screen.getByText(text)).toBeInTheDocument();
    const region = screen.getByTestId("sheet-section-help");
    expect(region.querySelector("a")).toBeNull();
    expect(region.textContent).not.toMatch(/@/);
  });
});

describe("the host's About block", () => {
  const about = {
    heading: "About this map",
    text: "Open source, released under a licence.",
    link: { href: "https://example.org/source", label: "Read the source" },
  };

  function renderAbout(props: { about?: HelpAbout } = {}) {
    const services = createFakeServices();
    return render(
      <ServicesProvider services={services}>
        <HelpSection {...props} />
      </ServicesProvider>,
    );
  }

  it("shows the host's heading, text and a link that opens in a new tab", () => {
    renderAbout({ about });
    const block = within(screen.getByTestId("help-about"));
    expect(
      block.getByRole("heading", { name: "About this map", level: 4 }),
    ).toBeInTheDocument();
    expect(block.getByText(about.text)).toBeInTheDocument();
    const link = block.getByRole("link", {
      name: "Read the source (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", about.link.href);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("sits below the other Help sections", () => {
    renderAbout({ about });
    const region = screen.getByTestId("sheet-section-help");
    const headings = within(region)
      .getAllByRole("heading", { level: 4 })
      .map((heading) => heading.textContent);
    expect(headings.at(-1)).toBe("About this map");
    expect(headings).toContain("Accessibility");
  });

  it.each([
    ["a javascript: address", "javascript:alert(1)"],
    ["a data: address", "data:text/html,hello"],
    ["a relative address", "/source"],
    ["a malformed address", "http://"],
    ["an empty address", ""],
  ])("shows the heading and text but no link for %s", (_name, href) => {
    renderAbout({ about: { ...about, link: { ...about.link, href } } });
    const block = within(screen.getByTestId("help-about"));
    expect(block.getByText(about.text)).toBeInTheDocument();
    expect(block.queryByRole("link")).toBeNull();
  });

  it("links an http address as well as an https one", () => {
    renderAbout({
      about: { ...about, link: { ...about.link, href: "http://example.org/" } },
    });
    expect(
      within(screen.getByTestId("help-about")).getByRole("link"),
    ).toHaveAttribute("href", "http://example.org/");
  });

  it("shows nothing when the host passes none", () => {
    renderAbout();
    expect(screen.queryByTestId("help-about")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  describe("the link to the host's own page", () => {
    const home = { href: "/", label: "About this project" };

    it("comes first, in the same tab, with no new-tab note", () => {
      renderAbout({ about: { ...about, homeLink: home } });
      const block = within(screen.getByTestId("help-about"));
      const links = block.getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual([
        "About this project",
        "Read the source (opens in a new tab)",
      ]);
      const [first] = links;
      expect(first).toHaveAttribute("href", "/");
      expect(first).not.toHaveAttribute("target");
    });

    it.each([
      ["a path on the site", "/about"],
      ["an https address", "https://example.org/about"],
    ])("takes %s", (_name, href) => {
      renderAbout({ about: { ...about, homeLink: { ...home, href } } });
      expect(
        within(screen.getByTestId("help-about")).getByRole("link", {
          name: "About this project",
        }),
      ).toHaveAttribute("href", href);
    });

    it.each([
      ["a javascript: address", "javascript:alert(1)"],
      ["an address on another site with no scheme", "//example.org/"],
      ["a backslash the browser reads as a second slash", "/\\example.org/x"],
      ["a relative address that is not a path", "about"],
      ["an empty address", ""],
    ])("is left out for %s", (_name, href) => {
      renderAbout({ about: { ...about, homeLink: { ...home, href } } });
      expect(
        within(screen.getByTestId("help-about")).queryByRole("link", {
          name: "About this project",
        }),
      ).toBeNull();
    });
  });
});

describe("message catalogue", () => {
  it("asks for its text and headings by key", () => {
    const { services } = renderHelp({ onStartTour: () => undefined });
    expect(services.fakes.messages.calls.map((call) => call.key)).toEqual(
      expect.arrayContaining([
        "panels.help.title",
        "panels.help.tourHeading",
        "panels.help.tourDescription",
        "panels.help.tourStart",
        "panels.help.searchHeading",
        "panels.help.searchDescription",
        "panels.help.keyboardHeading",
        "panels.help.drawingHeading",
        "panels.help.accessibilityHeading",
        "panels.help.accessibilityDescription",
      ]),
    );
    for (const call of services.fakes.messages.calls) {
      expect(call.params).toEqual({});
    }
  });
});

describe("HelpSection key help text", () => {
  it("looks each keyed shortcut up in the catalogue", () => {
    const services = createFakeServices({
      preferences: new FakeDevicePreferences({ finePointer: true }),
      messages: new FakeMessageCatalogue({
        overrides: {
          "keyHelp.keys.arrowKeys": "Pyltoetse",
          "keyHelp.map.pan": "Skuif die kaart",
        },
      }),
    });
    render(
      <ServicesProvider services={services}>
        <HelpSection />
      </ServicesProvider>,
    );
    const keyboard = within(screen.getByTestId("help-keyboard"));
    expect(keyboard.getByText("Pyltoetse")).toBeInTheDocument();
    expect(keyboard.getByText("Skuif die kaart")).toBeInTheDocument();
  });
});
