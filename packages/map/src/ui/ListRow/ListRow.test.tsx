// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Layers } from "lucide-react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ListRow } from "./ListRow";

function renderInList(ui: ReactNode) {
  return render(<ul>{ui}</ul>);
}

describe("ListRow", () => {
  it("is a list item with its label", () => {
    renderInList(<ListRow label="Positron" data-testid="row" />);
    const item = screen.getByRole("listitem");
    expect(item.textContent).toBe("Positron");
    expect(screen.getByTestId("row")).toBe(item);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows secondary text, a trailing node and a hidden leading icon", () => {
    renderInList(
      <ListRow
        icon={Layers}
        label="Streets"
        secondary="OpenStreetMap tiles"
        trailing={<span>3 MB</span>}
      />,
    );
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("OpenStreetMap tiles")).toBeTruthy();
    expect(within(item).getByText("3 MB")).toBeTruthy();
    expect(item.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("omits the empty slots", () => {
    renderInList(<ListRow label="Plain" />);
    const item = screen.getByRole("listitem");
    expect(item.querySelector("svg")).toBeNull();
    expect(item.querySelectorAll("span")).toHaveLength(2);
  });

  it("becomes a full-width button inside the li when clickable", () => {
    const onClick = vi.fn();
    renderInList(
      <ListRow label="Liberty" secondary="Vector" onClick={onClick} />,
    );
    const item = screen.getByRole("listitem");
    const button = within(item).getByRole("button", {
      name: "Liberty Vector",
    });
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is reachable by keyboard when clickable and not otherwise", () => {
    renderInList(
      <>
        <ListRow label="One" onClick={vi.fn()} />
        <ListRow label="Two" />
      </>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    const button = screen.getByRole("button");
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("marks a selected clickable row with a check icon and aria-current", () => {
    renderInList(<ListRow label="Dark" selected onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Dark" });
    expect(button.getAttribute("aria-current")).toBe("true");
    expect(button.querySelectorAll("svg")).toHaveLength(1);
  });

  it("does not mark an unselected row", () => {
    renderInList(<ListRow label="Dark" onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Dark" });
    expect(button.hasAttribute("aria-current")).toBe(false);
    expect(button.querySelector("svg")).toBeNull();
  });

  it("marks a selected plain row on the list item", () => {
    renderInList(<ListRow label="Dark" selected />);
    const item = screen.getByRole("listitem");
    expect(item.getAttribute("aria-current")).toBe("true");
    expect(item.querySelector("svg")).not.toBeNull();
  });

  it("merges a class name onto the list item", () => {
    renderInList(<ListRow label="Dark" className="extra" />);
    expect(screen.getByRole("listitem").className).toContain("extra");
  });
});
