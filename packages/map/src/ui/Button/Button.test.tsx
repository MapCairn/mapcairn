import { fireEvent, render, screen } from "@testing-library/react";
import { Download } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("is a button named by its text, typed button by default", () => {
    render(<Button data-testid="go">Retry</Button>);
    const button = screen.getByRole("button", { name: "Retry" });
    expect(button.getAttribute("type")).toBe("button");
    expect(screen.getByTestId("go")).toBe(button);
  });

  it("lets the caller choose another type", () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  it("gives each variant its own class", () => {
    const classes = (["primary", "secondary", "quiet"] as const).map(
      (variant) => {
        const { unmount } = render(<Button variant={variant}>Go</Button>);
        const value = screen.getByRole("button").className;
        unmount();
        return value;
      },
    );
    expect(new Set(classes).size).toBe(3);
  });

  it("defaults to the primary variant", () => {
    render(
      <>
        <Button>One</Button>
        <Button variant="primary">Two</Button>
      </>,
    );
    const [one, two] = screen.getAllByRole("button");
    expect(one?.className).toBe(two?.className);
  });

  it("shows a hidden leading icon and keeps the text as the name", () => {
    render(<Button icon={Download}>Download</Button>);
    const button = screen.getByRole("button", { name: "Download" });
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("renders no icon when none is given", () => {
    render(<Button>Plain</Button>);
    expect(screen.getByRole("button").querySelector("svg")).toBeNull();
  });

  it("calls onClick when enabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("uses aria-disabled, stays focusable and ignores clicks when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Go" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is not aria-disabled or aria-busy by default", () => {
    render(<Button>Go</Button>);
    const button = screen.getByRole("button");
    expect(button.hasAttribute("aria-disabled")).toBe(false);
    expect(button.hasAttribute("aria-busy")).toBe(false);
  });

  it("swaps the icon for a loader and ignores clicks while busy", () => {
    const onClick = vi.fn();
    render(
      <Button busy icon={Download} onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector("svg")).not.toBeNull();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows a loader when busy even without an icon, and merges a class name", () => {
    render(
      <Button busy className="extra">
        Save
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.className).toContain("extra");
  });
});
