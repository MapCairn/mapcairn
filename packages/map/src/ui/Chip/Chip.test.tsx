// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { fireEvent, render, screen } from "@testing-library/react";
import { MapPin } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("is a static label without onClick", () => {
    render(<Chip data-testid="chip">Roads</Chip>);
    const chip = screen.getByTestId("chip");
    expect(chip.tagName).toBe("SPAN");
    expect(chip.textContent).toBe("Roads");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is a toggle button with aria-pressed when it has onClick", () => {
    const onClick = vi.fn();
    render(
      <Chip onClick={onClick} data-testid="chip">
        Roads
      </Chip>,
    );
    const button = screen.getByRole("button", { name: "Roads" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("chip")).toBe(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("reports selected through aria-pressed and a check icon", () => {
    render(
      <Chip selected onClick={vi.fn()}>
        Roads
      </Chip>,
    );
    const button = screen.getByRole("button", { name: "Roads" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("shows a selected static chip with a check and no pressed state", () => {
    render(
      <Chip selected data-testid="chip">
        Roads
      </Chip>,
    );
    const chip = screen.getByTestId("chip");
    expect(chip.querySelector("svg")).not.toBeNull();
    expect(chip.hasAttribute("aria-pressed")).toBe(false);
  });

  it("shows the leading icon when unselected and swaps it for the check when selected", () => {
    const { rerender } = render(<Chip icon={MapPin}>Places</Chip>);
    const unselected = screen.getByText("Places").querySelector("svg");
    expect(unselected).not.toBeNull();
    rerender(
      <Chip icon={MapPin} selected>
        Places
      </Chip>,
    );
    const selected = screen.getByText("Places").querySelector("svg");
    expect(selected).not.toBeNull();
    expect(selected?.outerHTML).not.toBe(unselected?.outerHTML);
    expect(screen.getByText("Places").querySelectorAll("svg")).toHaveLength(1);
  });

  it("shows no icon when there is none and it is unselected", () => {
    render(<Chip>Plain</Chip>);
    expect(screen.getByText("Plain").querySelector("svg")).toBeNull();
  });

  it("can be focused, and merges a class name", () => {
    render(
      <Chip onClick={vi.fn()} className="extra">
        Roads
      </Chip>,
    );
    const button = screen.getByRole("button");
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.className).toContain("extra");
  });

  it("gives selected and actionable chips different classes", () => {
    const { rerender } = render(<Chip data-testid="chip">A</Chip>);
    const plain = screen.getByTestId("chip").className;
    rerender(
      <Chip data-testid="chip" selected>
        A
      </Chip>,
    );
    expect(screen.getByTestId("chip").className).not.toBe(plain);
    rerender(
      <Chip data-testid="chip" onClick={vi.fn()}>
        A
      </Chip>,
    );
    expect(screen.getByTestId("chip").className).not.toBe(plain);
  });
});
