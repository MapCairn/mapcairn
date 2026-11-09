import { PANEL_MAX_HEIGHT_EXCLUSIVE, PANEL_MIN_WIDTH } from "@karta/core";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { panelLayoutQuery } from "../MapChrome/MapChrome.css";
import { ChromeSkeleton } from "./ChromeSkeleton";

describe("ChromeSkeleton", () => {
  it("is decorative: hidden from assistive technology and inert", () => {
    render(<ChromeSkeleton />);
    const skeleton = screen.getByTestId("chrome-skeleton");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton).toHaveAttribute("inert");
  });

  it("draws every control the real chrome shows by default, in its slots", () => {
    render(<ChromeSkeleton />);
    const skeleton = screen.getByTestId("chrome-skeleton");
    const slot = (name: string) =>
      skeleton.querySelector(`[data-skeleton-slot="${name}"]`);

    expect(slot("top-start")?.querySelector("[data-skeleton]")).toHaveAttribute(
      "data-skeleton",
      "search",
    );
    const endStack = slot("end-stack");
    expect(
      endStack?.querySelector('[data-skeleton="controls"]'),
    ).not.toBeNull();
    expect(endStack?.querySelector('[data-skeleton="zoom"]')).not.toBeNull();
    expect(
      slot("bottom-end")?.querySelector('[data-skeleton="credits"]'),
    ).not.toBeNull();
  });

  it("offers nothing to tab to or click, because it is rendered inert", () => {
    render(<ChromeSkeleton />);
    const skeleton = screen.getByTestId("chrome-skeleton");
    for (const button of skeleton.querySelectorAll("button")) {
      expect(button).toHaveAttribute("tabindex", "-1");
    }
    expect(skeleton.querySelector("input")).toHaveAttribute("readonly");
  });

  it("renders on the server without a provider and without any style attribute", () => {
    const html = renderToString(<ChromeSkeleton />);
    expect(html).toContain('data-testid="chrome-skeleton"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/\sinert(=""|\s|>)/);
    expect(html).not.toMatch(/style=/);
  });
});

describe("panelLayoutQuery", () => {
  it("is built from the constants chooseLayout uses, so the two cannot drift", () => {
    expect(panelLayoutQuery).toBe(
      `(min-width: ${PANEL_MIN_WIDTH}px), (height < ${PANEL_MAX_HEIGHT_EXCLUSIVE}px)`,
    );
  });
});
