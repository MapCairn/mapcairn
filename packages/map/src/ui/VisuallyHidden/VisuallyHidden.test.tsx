import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VisuallyHidden } from "./VisuallyHidden";

describe("VisuallyHidden", () => {
  it("keeps its text in the accessibility tree", () => {
    render(<VisuallyHidden>Skip ahead</VisuallyHidden>);
    expect(screen.getByText("Skip ahead")).toBeTruthy();
  });

  it("renders a span by default and any element on request", () => {
    const { rerender } = render(<VisuallyHidden>text</VisuallyHidden>);
    expect(screen.getByText("text").tagName).toBe("SPAN");
    rerender(
      <VisuallyHidden as="h1" id="title">
        MapCairn
      </VisuallyHidden>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "MapCairn" }),
    ).toBeTruthy();
  });

  it("merges an extra class name and passes other attributes through", () => {
    render(
      <VisuallyHidden className="extra" data-testid="hidden">
        text
      </VisuallyHidden>,
    );
    const element = screen.getByTestId("hidden");
    expect(element.className).toContain("extra");
    expect(element.className.split(" ").length).toBeGreaterThan(1);
  });
});
