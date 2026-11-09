import { fireEvent, render, screen } from "@testing-library/react";
import { Plus, Search } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
  it("is a button named for its action, with a hidden icon", () => {
    render(<IconButton label="Zoom in" icon={Plus} data-testid="zoom" />);
    const button = screen.getByRole("button", { name: "Zoom in" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(screen.getByTestId("zoom")).toBe(button);
  });

  it("calls onClick once per click", () => {
    const onClick = vi.fn();
    render(<IconButton label="Search" icon={Search} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not activate on pointer down", () => {
    const onClick = vi.fn();
    render(<IconButton label="Search" icon={Search} onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Search" });
    fireEvent.pointerDown(button);
    fireEvent.mouseDown(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("reports pressed state and draws the pressed bar only when pressed", () => {
    const { rerender } = render(
      <IconButton label="Measure" icon={Search} pressed={false} />,
    );
    const button = screen.getByRole("button", { name: "Measure" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.querySelectorAll("span")).toHaveLength(0);
    rerender(<IconButton label="Measure" icon={Search} pressed />);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    const bar = button.querySelector("span");
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
  });

  it("is not a toggle when pressed is undefined", () => {
    render(<IconButton label="Locate me" icon={Search} />);
    expect(
      screen
        .getByRole("button", { name: "Locate me" })
        .hasAttribute("aria-pressed"),
    ).toBe(false);
  });

  it("uses aria-disabled, stays focusable and ignores clicks", () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Locate me" icon={Search} disabled onClick={onClick} />,
    );
    const button = screen.getByRole("button", { name: "Locate me" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is not aria-disabled when enabled", () => {
    render(<IconButton label="Locate me" icon={Search} />);
    expect(
      screen
        .getByRole("button", { name: "Locate me" })
        .hasAttribute("aria-disabled"),
    ).toBe(false);
  });

  it("shows a spinning loader and ignores clicks while busy", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <IconButton label="Locate me" icon={Search} onClick={onClick} />,
    );
    const idle = screen
      .getByRole("button")
      .querySelector("svg")
      ?.getAttribute("class");
    rerender(
      <IconButton label="Locate me" icon={Search} busy onClick={onClick} />,
    );
    const button = screen.getByRole("button", { name: "Locate me" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    const busyIcon = button.querySelector("svg");
    expect(busyIcon?.getAttribute("class")).not.toBe(idle);
    expect(busyIcon?.getAttribute("class")?.split(" ").length).toBeGreaterThan(
      (idle ?? "").split(" ").length,
    );
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("passes expanded and controls through", () => {
    render(
      <IconButton
        label="Map options"
        icon={Search}
        expanded={false}
        controls="options-panel"
      />,
    );
    const button = screen.getByRole("button", { name: "Map options" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe("options-panel");
  });

  it("gives each size its own class and merges a class name", () => {
    const { rerender } = render(
      <IconButton label="A" icon={Search} className="extra" />,
    );
    const control = screen.getByRole("button").className;
    expect(control).toContain("extra");
    rerender(<IconButton label="A" icon={Search} size="compact" />);
    expect(screen.getByRole("button").className).not.toBe(control);
  });

  it("is a native button, so Enter and Space need no extra handler", () => {
    const onClick = vi.fn();
    render(<IconButton label="Search" icon={Search} onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Search" });
    // happy-dom does not synthesise the click a browser fires for Enter or
    // Space on a native button, so assert the element is one.
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("tabindex")).toBeNull();
  });
});
