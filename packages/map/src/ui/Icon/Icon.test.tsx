import { render, screen } from "@testing-library/react";
import { Search } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("is hidden from assistive technology by default", () => {
    render(<Icon icon={Search} data-testid="icon" />);
    const svg = screen.getByTestId("icon");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("becomes a named image when given a label", () => {
    render(<Icon icon={Search} label="Search" />);
    const image = screen.getByRole("img", { name: "Search" });
    expect(image.getAttribute("aria-hidden")).toBeNull();
  });

  it("is not focusable and passes native attributes and class names through", () => {
    render(<Icon icon={Search} data-testid="icon" className="extra" />);
    const svg = screen.getByTestId("icon");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.getAttribute("class")).toContain("extra");
  });

  it("adds the spin class only when spinning", () => {
    const { rerender } = render(<Icon icon={Search} data-testid="icon" />);
    const plain = screen.getByTestId("icon").getAttribute("class") ?? "";
    rerender(<Icon icon={Search} data-testid="icon" spinning />);
    const spun = screen.getByTestId("icon").getAttribute("class") ?? "";
    expect(spun.split(" ").length).toBe(plain.split(" ").length + 1);
  });
});
