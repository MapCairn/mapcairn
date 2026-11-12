// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Surface } from "./Surface";

describe("Surface", () => {
  it("renders a div by default and the requested element otherwise", () => {
    const { rerender } = render(<Surface data-testid="s">content</Surface>);
    expect(screen.getByTestId("s").tagName).toBe("DIV");
    for (const tag of ["section", "aside", "nav"] as const) {
      rerender(
        <Surface as={tag} data-testid="s" aria-label="Region">
          content
        </Surface>,
      );
      expect(screen.getByTestId("s").tagName).toBe(tag.toUpperCase());
    }
  });

  it("exposes landmarks with their accessible names", () => {
    render(
      <Surface as="nav" aria-label="Map tools">
        content
      </Surface>,
    );
    expect(screen.getByRole("navigation", { name: "Map tools" })).toBeTruthy();
  });

  it("gives each variant and radius its own class", () => {
    const classesFor = (
      variant: "floating" | "raised" | "flat",
      radius: "pill" | "control" | "sheet",
    ) => {
      const { unmount } = render(
        <Surface data-testid="s" variant={variant} radius={radius} />,
      );
      const value = screen.getByTestId("s").className;
      unmount();
      return value;
    };
    const variants = ["floating", "raised", "flat"] as const;
    const radii = ["pill", "control", "sheet"] as const;
    const seen = new Set(
      variants.flatMap((variant) =>
        radii.map((radius) => classesFor(variant, radius)),
      ),
    );
    expect(seen.size).toBe(9);
  });

  it("defaults to a floating control surface", () => {
    render(
      <>
        <Surface data-testid="default" />
        <Surface data-testid="explicit" variant="floating" radius="control" />
      </>,
    );
    expect(screen.getByTestId("default").className).toBe(
      screen.getByTestId("explicit").className,
    );
  });

  it("merges an extra class name and passes attributes through", () => {
    render(
      <Surface className="extra" data-chrome="search" data-testid="s">
        content
      </Surface>,
    );
    const element = screen.getByTestId("s");
    expect(element.className).toContain("extra");
    expect(element.getAttribute("data-chrome")).toBe("search");
  });
});
