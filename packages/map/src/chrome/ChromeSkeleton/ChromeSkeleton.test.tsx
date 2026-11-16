// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  FakeMessageCatalogue,
  PANEL_MAX_HEIGHT_EXCLUSIVE,
  PANEL_MIN_WIDTH,
} from "@mapcairn/core";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { panelLayoutQuery } from "../MapChrome/MapChrome.css";
import { ChromeSkeleton, chromeSkeletonCopy } from "./ChromeSkeleton";

const COPY = chromeSkeletonCopy(new FakeMessageCatalogue());

describe("ChromeSkeleton", () => {
  it("is decorative: hidden from assistive technology and inert", () => {
    render(<ChromeSkeleton copy={COPY} />);
    const skeleton = screen.getByTestId("chrome-skeleton");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton).toHaveAttribute("inert");
  });

  it("draws every control the real chrome shows by default, in its slots", () => {
    render(<ChromeSkeleton copy={COPY} />);
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

  it("always draws the Settings button, last in the main group after Locate me", () => {
    render(<ChromeSkeleton copy={COPY} />);
    const labels = [
      ...screen
        .getByTestId("chrome-skeleton")
        .querySelectorAll('[data-skeleton="controls"] button'),
    ].map((button) => button.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Map options",
      "Measure distance and area",
      "Locate me",
      "Settings",
    ]);
  });

  it("draws the Directions button only when the host offers directions", () => {
    const { rerender } = render(<ChromeSkeleton copy={COPY} />);
    const skeleton = screen.getByTestId("chrome-skeleton");
    expect(skeleton.querySelector('[aria-label="Directions"]')).toBeNull();
    rerender(<ChromeSkeleton copy={COPY} directions />);
    expect(skeleton.querySelector('[aria-label="Directions"]')).not.toBeNull();
  });

  it("draws the Draw shapes button only for a host that offers drawing", () => {
    const { rerender } = render(<ChromeSkeleton copy={COPY} />);
    const skeleton = screen.getByTestId("chrome-skeleton");
    expect(skeleton.querySelector('[aria-label="Draw shapes"]')).toBeNull();
    rerender(<ChromeSkeleton copy={COPY} draw />);
    expect(skeleton.querySelector('[aria-label="Draw shapes"]')).not.toBeNull();
  });

  it("offers nothing to tab to or click, because it is rendered inert", () => {
    render(<ChromeSkeleton copy={COPY} />);
    const skeleton = screen.getByTestId("chrome-skeleton");
    for (const button of skeleton.querySelectorAll("button")) {
      expect(button).toHaveAttribute("tabindex", "-1");
    }
    expect(skeleton.querySelector("input")).toHaveAttribute("readonly");
  });

  it("renders on the server without a provider and without any style attribute", () => {
    const html = renderToString(<ChromeSkeleton copy={COPY} />);
    expect(html).toContain('data-testid="chrome-skeleton"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/\sinert(=""|\s|>)/);
    expect(html).not.toMatch(/style=/);
  });
});

describe("ChromeSkeleton words", () => {
  it("takes every visible and accessible word from the copy it is given, which the host reads from the catalogue", () => {
    const words = chromeSkeletonCopy(
      new FakeMessageCatalogue({
        overrides: {
          "tools.search.places": "Soek plekke",
          "tools.search.label": "Soek",
          "chrome.endStack.controls": "Kaartkontroles",
          "chrome.endStack.mapOptions": "Kaartopsies",
          "chrome.endStack.settings": "Instellings",
          "chrome.endStack.zoomIn": "Zoem in",
          "chrome.attribution.label": "Kaartkrediete",
        },
      }),
    );
    render(<ChromeSkeleton copy={words} directions draw />);
    const skeleton = screen.getByTestId("chrome-skeleton");
    expect(skeleton.querySelector("input")).toHaveAttribute(
      "placeholder",
      "Soek plekke",
    );
    const labels = [...skeleton.querySelectorAll("[aria-label]")].map(
      (element) => element.getAttribute("aria-label"),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        "Soek",
        "Kaartkontroles",
        "Kaartopsies",
        "Instellings",
        "Zoem in",
        "Kaartkrediete",
      ]),
    );
    expect(labels).not.toContain("Map options");
  });

  it("reads the same keys as the live controls, so the two say the same words", () => {
    const catalogue = new FakeMessageCatalogue();
    chromeSkeletonCopy(catalogue);
    expect(catalogue.calls.map((call) => call.key)).toEqual(
      expect.arrayContaining([
        "tools.search.places",
        "chrome.endStack.mapOptions",
        "chrome.attribution.label",
      ]),
    );
  });
});

describe("panelLayoutQuery", () => {
  it("is built from the constants chooseLayout uses, so the two cannot drift", () => {
    expect(panelLayoutQuery).toBe(
      `(min-width: ${PANEL_MIN_WIDTH}px), (height < ${PANEL_MAX_HEIGHT_EXCLUSIVE}px)`,
    );
  });
});
