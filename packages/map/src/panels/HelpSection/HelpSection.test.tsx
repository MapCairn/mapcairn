import {
  createFakeServices,
  FakeDevicePreferences,
  mapKeyHelp,
} from "@karta/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServicesProvider } from "../../services";
import { HelpSection } from "./HelpSection";

function renderHelp(
  options: {
    finePointer?: boolean;
    supportsRotation?: boolean;
    headingLevel?: 3 | 4;
  } = {},
) {
  const { finePointer = true, supportsRotation = true, headingLevel } = options;
  const services = createFakeServices({
    preferences: new FakeDevicePreferences({ finePointer }),
  });
  return render(
    <ServicesProvider services={services}>
      <HelpSection
        supportsRotation={supportsRotation}
        headingLevel={headingLevel}
      />
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
      renderHelp({ supportsRotation: true });
      const entries = mapKeyHelp({ supportsRotation: true });
      const terms = screen.getAllByRole("term");
      const definitions = screen.getAllByRole("definition");
      expect(terms.map((term) => term.textContent)).toEqual(
        entries.map((entry) => entry.keys),
      );
      expect(definitions.map((definition) => definition.textContent)).toEqual(
        entries.map((entry) => entry.description),
      );
    });

    it("lists rotation shortcuts only when the engine can rotate", () => {
      const { unmount } = renderHelp({ supportsRotation: true });
      expect(screen.getByText("Rotate the map")).toBeInTheDocument();
      expect(screen.getByText("Home or 0")).toBeInTheDocument();
      unmount();
      renderHelp({ supportsRotation: false });
      expect(screen.queryByText("Rotate the map")).toBeNull();
      expect(screen.queryByText("Home or 0")).toBeNull();
      expect(screen.getByText("Shift with an arrow key")).toBeInTheDocument();
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
      "Karta aims to meet WCAG 2.2 level AA. Every action that uses a gesture, such as a long press or a drag, also has a button or a keyboard shortcut.";
    expect(screen.getByText(text)).toBeInTheDocument();
    const region = screen.getByTestId("sheet-section-help");
    expect(region.querySelector("a")).toBeNull();
    expect(region.textContent).not.toMatch(/@/);
  });
});
