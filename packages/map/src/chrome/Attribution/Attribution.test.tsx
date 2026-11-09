import {
  type BasemapDefinition,
  buildAttribution,
  DEFAULT_FAKE_VIEW,
  FAKE_VECTOR_BASEMAP,
} from "@karta/core";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderChrome, testMapContext } from "../MapChrome/chromeTestHarness";
import { Attribution } from "./Attribution";

const BASEMAP: BasemapDefinition = {
  ...FAKE_VECTOR_BASEMAP,
  attribution: [
    { text: "OpenStreetMap contributors", href: "https://osm.example/copy" },
    { text: "Plain credit" },
  ],
};

function button(): HTMLElement {
  return screen.getByRole("button", { name: "Map credits" });
}

function open(): HTMLElement {
  fireEvent.click(button());
  return screen.getByRole("region", { name: "Map credits" });
}

describe("Attribution", () => {
  it("is a collapsed Map credits button that controls a hidden region", () => {
    const { container } = renderChrome(<Attribution basemap={BASEMAP} />);
    const credits = button();
    expect(credits).toHaveAttribute("aria-expanded", "false");
    const controlled = credits.getAttribute("aria-controls");
    expect(controlled).toBeTruthy();
    const region = container.querySelector(`#${CSS.escape(controlled ?? "")}`);
    expect(region).toHaveAttribute("hidden");
    expect(container.querySelector('[data-chrome="attribution"]')).toBe(
      credits.closest("[data-chrome]"),
    );
  });

  it("opens into a labelled region of real links built from the basemap", () => {
    renderChrome(<Attribution basemap={BASEMAP} />);
    const region = open();
    expect(button()).toHaveAttribute("aria-expanded", "true");
    expect(region).toHaveAttribute(
      "id",
      button().getAttribute("aria-controls"),
    );
    expect(region).toHaveAttribute("data-chrome", "attribution-popover");
    const entries = buildAttribution(BASEMAP);
    for (const entry of entries) {
      if (entry.href) {
        const link = screen.getByRole("link", { name: entry.text });
        expect(link).toHaveAttribute("href", entry.href);
        expect(link).toHaveAttribute("rel", "noopener");
        expect(link).not.toHaveAttribute("target");
      } else {
        expect(region).toHaveTextContent(entry.text);
      }
    }
  });

  it("moves focus to the first link when it opens", () => {
    renderChrome(<Attribution basemap={BASEMAP} />);
    open();
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "OpenStreetMap contributors" }),
    );
  });

  it("closes on Escape and returns focus to the button", () => {
    renderChrome(<Attribution basemap={BASEMAP} />);
    open();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button());
  });

  it("closes when the button is pressed again", () => {
    renderChrome(<Attribution basemap={BASEMAP} />);
    open();
    fireEvent.click(button());
    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button());
  });

  it("closes on a pointer down outside, but not inside", () => {
    renderChrome(<Attribution basemap={BASEMAP} />);
    const region = open();
    fireEvent.pointerDown(region);
    expect(button()).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerDown(document.body);
    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button());
  });

  it("does not take focus back when it was already elsewhere", () => {
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    renderChrome(<Attribution basemap={BASEMAP} />);
    open();
    elsewhere.focus();
    fireEvent.pointerDown(elsewhere);
    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it("closes when the map moves, but not for the view it opened on", () => {
    const { rerenderChrome } = renderChrome(<Attribution basemap={BASEMAP} />, {
      map: testMapContext({ view: DEFAULT_FAKE_VIEW }),
    });
    open();
    rerenderChrome(<Attribution basemap={BASEMAP} />, {
      map: testMapContext({ view: DEFAULT_FAKE_VIEW }),
    });
    expect(button()).toHaveAttribute("aria-expanded", "true");
    rerenderChrome(<Attribution basemap={BASEMAP} />, {
      map: testMapContext({ view: { ...DEFAULT_FAKE_VIEW, zoom: 5 } }),
    });
    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button());
  });

  it("ignores keys other than Escape", () => {
    renderChrome(<Attribution basemap={BASEMAP} />);
    open();
    fireEvent.keyDown(document.activeElement as Element, { key: "a" });
    expect(button()).toHaveAttribute("aria-expanded", "true");
  });

  it("names the engine credit too, so attribution is never dropped", () => {
    renderChrome(<Attribution basemap={BASEMAP} />);
    open();
    expect(screen.getByRole("link", { name: "MapLibre" })).toBeInTheDocument();
  });

  /** Gives the (still hidden) region a content height and a visible height. */
  function sizeRegion(
    container: HTMLElement,
    size: { content: number; visible: number },
  ) {
    const region = container.querySelector<HTMLElement>(
      '[data-chrome="attribution-popover"]',
    );
    if (!region) {
      throw new Error("No credits region");
    }
    Object.defineProperty(region, "scrollHeight", {
      get: () => size.content,
      configurable: true,
    });
    Object.defineProperty(region, "clientHeight", {
      get: () => size.visible,
      configurable: true,
    });
  }

  it("opens above the button when the credits fit there", () => {
    const { container } = renderChrome(<Attribution basemap={BASEMAP} />);
    sizeRegion(container, { content: 120, visible: 120 });
    expect(open()).toHaveAttribute("data-placement", "above");
  });

  it("moves beside the end stack when the credits would scroll above the button", () => {
    const { container } = renderChrome(<Attribution basemap={BASEMAP} />);
    const size = { content: 140, visible: 48 };
    sizeRegion(container, size);
    const region = open();
    expect(region).toHaveAttribute("data-placement", "beside");
    // Focus still lands on the first link.
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "OpenStreetMap contributors" }),
    );

    // Closed and opened again with room above, it goes back above.
    fireEvent.click(button());
    size.visible = 140;
    expect(open()).toHaveAttribute("data-placement", "above");
  });
});
