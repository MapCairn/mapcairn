// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { visuallyHidden } from "../VisuallyHidden/VisuallyHidden.css";
import { SkipLink } from "./SkipLink";

describe("SkipLink", () => {
  it("is a link to the target with a default name", () => {
    render(<SkipLink targetId="map" data-testid="skip" />);
    const link = screen.getByRole("link", { name: "Skip to map" });
    expect(link.getAttribute("href")).toBe("#map");
    expect(screen.getByTestId("skip")).toBe(link);
  });

  it("takes its own text", () => {
    render(<SkipLink targetId="main">Skip to content</SkipLink>);
    expect(screen.getByRole("link", { name: "Skip to content" })).toBeTruthy();
  });

  it("comes first in the document and is reachable by keyboard", () => {
    render(
      <>
        <SkipLink targetId="map" />
        <button type="button">Search</button>
      </>,
    );
    const focusable = document.body.querySelectorAll("a, button");
    expect(focusable[0]?.textContent).toBe("Skip to map");
    expect(focusable[0]?.getAttribute("tabindex")).toBeNull();
  });

  it("moves focus to the target and stops the hash jump", () => {
    render(
      <>
        <SkipLink targetId="map" />
        <section id="map" tabIndex={-1} aria-label="Map" />
      </>,
    );
    const link = screen.getByRole("link", { name: "Skip to map" });
    const proceeded = fireEvent.click(link);
    expect(document.activeElement).toBe(screen.getByRole("region"));
    expect(proceeded).toBe(false);
  });

  it("leaves the native jump alone when the target is missing", () => {
    render(<SkipLink targetId="missing" />);
    const proceeded = fireEvent.click(screen.getByRole("link"));
    expect(proceeded).toBe(true);
  });

  it("calls a supplied onClick first and respects a prevented default", () => {
    const onClick = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    render(
      <>
        <SkipLink targetId="map" onClick={onClick} />
        <div id="map" tabIndex={-1} />
      </>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.body);
  });

  it("is hidden with the shared visually hidden class", () => {
    render(<SkipLink targetId="map" />);
    expect(screen.getByRole("link").className).toContain(visuallyHidden);
  });

  it("can take focus from the keyboard and merges a class name", () => {
    render(<SkipLink targetId="map" className="extra" />);
    const link = screen.getByRole("link");
    link.focus();
    expect(document.activeElement).toBe(link);
    expect(link.className).toContain("extra");
  });
});
