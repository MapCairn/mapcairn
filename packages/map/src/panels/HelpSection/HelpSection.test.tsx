// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  DRAW_KEY_HELP,
  FakeDevicePreferences,
  MAP_KEY_HELP,
} from "@mapcairn/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServicesProvider } from "../../services";
import { HelpSection } from "./HelpSection";

function renderHelp(
  options: { finePointer?: boolean; headingLevel?: 3 | 4 } = {},
) {
  const { finePointer = true, headingLevel } = options;
  const services = createFakeServices({
    preferences: new FakeDevicePreferences({ finePointer }),
  });
  return render(
    <ServicesProvider services={services}>
      <HelpSection headingLevel={headingLevel} />
    </ServicesProvider>,
  );
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
    expect(search).toHaveTextContent("a place name or a pair of coordinates");
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
        entries.map((entry) => entry.keys),
      );
      expect(definitions.map((definition) => definition.textContent)).toEqual(
        entries.map((entry) => entry.description),
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
      ).toEqual(DRAW_KEY_HELP.map((entry) => entry.keys));
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
