// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { render, screen } from "@testing-library/react";
import { SearchX } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Button } from "../Button";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders a level 2 heading by default", () => {
    render(<EmptyState heading="No places yet" />);
    expect(
      screen.getByRole("heading", { level: 2, name: "No places yet" }),
    ).toBeTruthy();
  });

  it("renders the heading level it is given", () => {
    for (const level of [2, 3, 4, 5, 6] as const) {
      const { unmount } = render(
        <EmptyState heading={`Level ${level}`} headingLevel={level} />,
      );
      expect(
        screen.getByRole("heading", { level, name: `Level ${level}` }),
      ).toBeTruthy();
      unmount();
    }
  });

  it("renders the body text as a paragraph", () => {
    render(
      <EmptyState heading="No results">Try a different search.</EmptyState>,
    );
    expect(screen.getByText("Try a different search.").tagName).toBe("P");
  });

  it("renders a decorative icon and an action", () => {
    render(
      <EmptyState
        heading="No results"
        icon={SearchX}
        action={<Button>Clear search</Button>}
        data-testid="empty"
      />,
    );
    const root = screen.getByTestId("empty");
    expect(root.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy();
  });

  it("never renders an empty heading", () => {
    const { rerender } = render(<EmptyState heading="" />);
    expect(screen.queryByRole("heading")).toBeNull();
    rerender(<EmptyState heading="   " />);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("omits the icon, body and action when they are not given", () => {
    render(<EmptyState heading="Nothing here" data-testid="empty" />);
    const root = screen.getByTestId("empty");
    expect(root.querySelector("svg")).toBeNull();
    expect(root.querySelector("p")).toBeNull();
    expect(root.children).toHaveLength(1);
  });

  it("merges a class name onto the root", () => {
    render(<EmptyState heading="Nothing" className="extra" data-testid="e" />);
    expect(screen.getByTestId("e").className).toContain("extra");
  });
});
