// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices } from "@mapcairn/core";
import {
  fireEvent,
  render as renderBare,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services";
import { PinSection } from "./PinSection";

function render(ui: ReactElement, services = createFakeServices()) {
  return renderBare(
    <ServicesProvider services={services}>{ui}</ServicesProvider>,
  );
}

describe("PinSection", () => {
  it("is a region named Pin with an h3", () => {
    render(<PinSection hasPin={false} onDropPin={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Pin" })).toBe(
      screen.getByTestId("sheet-section-pin"),
    );
    expect(
      screen.getByRole("heading", { name: "Pin", level: 3 }),
    ).toBeInTheDocument();
  });

  it("follows the heading level it is given", () => {
    render(<PinSection hasPin={false} onDropPin={vi.fn()} headingLevel={4} />);
    expect(screen.getByRole("heading", { level: 4 })).toBeInTheDocument();
  });

  it("drops a pin from the button", () => {
    const onDropPin = vi.fn();
    render(<PinSection hasPin={false} onDropPin={onDropPin} />);
    const button = screen.getByRole("button", {
      name: "Drop pin at map centre",
    });
    expect(button).toBe(screen.getByTestId("drop-pin-button"));
    fireEvent.click(button);
    expect(onDropPin).toHaveBeenCalledTimes(1);
  });

  it("keeps the button when a pin is on the map", () => {
    render(<PinSection hasPin onDropPin={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Drop pin at map centre" }),
    ).toBeInTheDocument();
  });

  it("has no note while there is no pin", () => {
    render(<PinSection hasPin={false} onDropPin={vi.fn()} />);
    expect(screen.queryByText("A pin is on the map.")).toBeNull();
  });

  it("notes that a pin is on the map, as plain text", () => {
    render(<PinSection hasPin onDropPin={vi.fn()} />);
    const note = screen.getByText("A pin is on the map.");
    expect(note.tagName).toBe("P");
    expect(note.hasAttribute("aria-live")).toBe(false);
    expect(note.hasAttribute("role")).toBe(false);
  });

  it("renders its children after the button, for the pin card", () => {
    render(
      <PinSection hasPin onDropPin={vi.fn()}>
        <div data-testid="pin-card">Card</div>
      </PinSection>,
    );
    const card = screen.getByTestId("pin-card");
    const button = screen.getByRole("button");
    expect(
      button.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("asks the catalogue for its words by key", () => {
    const services = createFakeServices();
    render(<PinSection hasPin onDropPin={vi.fn()} />, services);
    expect(services.fakes.messages.calls.map((call) => call.key)).toEqual(
      expect.arrayContaining([
        "panels.pin.title",
        "panels.pin.drop",
        "panels.pin.note",
      ]),
    );
  });
});
