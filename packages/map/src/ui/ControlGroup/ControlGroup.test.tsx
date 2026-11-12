// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { render, screen, within } from "@testing-library/react";
import { Compass, Minus, Plus } from "lucide-react";
import { describe, expect, it } from "vitest";
import { IconButton } from "../IconButton";
import { ControlGroup } from "./ControlGroup";

describe("ControlGroup", () => {
  it("is a named group containing its buttons in order", () => {
    render(
      <ControlGroup label="Zoom" data-chrome="zoom" data-testid="zoom-group">
        <IconButton label="Zoom in" icon={Plus} />
        <IconButton label="Zoom out" icon={Minus} />
      </ControlGroup>,
    );
    const group = screen.getByRole("group", { name: "Zoom" });
    expect(group.getAttribute("data-chrome")).toBe("zoom");
    expect(screen.getByTestId("zoom-group")).toBe(group);
    const names = within(group)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["Zoom in", "Zoom out"]);
  });

  it("is not a toolbar and does not trap focus", () => {
    render(
      <ControlGroup label="Zoom">
        <IconButton label="Zoom in" icon={Plus} />
        <IconButton label="Compass" icon={Compass} />
      </ControlGroup>,
    );
    expect(screen.queryByRole("toolbar")).toBeNull();
    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("tabindex")).toBeNull();
    }
  });

  it("merges an extra class name onto the surface", () => {
    render(
      <ControlGroup label="Zoom" className="extra" data-testid="g">
        <IconButton label="Zoom in" icon={Plus} />
      </ControlGroup>,
    );
    expect(screen.getByTestId("g").className).toContain("extra");
  });

  it("keeps working without an extra class name", () => {
    render(
      <ControlGroup label="Zoom" data-testid="g">
        <IconButton label="Zoom in" icon={Plus} />
      </ControlGroup>,
    );
    expect(screen.getByTestId("g").className.length).toBeGreaterThan(0);
  });
});
