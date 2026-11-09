import {
  type BasemapDefinition,
  buildAttribution,
  createFakeServices,
  DEFAULT_FAKE_VIEW,
  FAKE_VECTOR_BASEMAP,
} from "@karta/core";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderChrome, testMapContext } from "../MapChrome/chromeTestHarness";
import {
  ATTRIBUTION_FADE_MS,
  ATTRIBUTION_INTRO_MS,
  Attribution,
} from "./Attribution";
import { onMapIcon } from "./Attribution.css";

const BASEMAP: BasemapDefinition = {
  ...FAKE_VECTOR_BASEMAP,
  attribution: [
    { text: "OpenStreetMap contributors", href: "https://osm.example/copy" },
    { text: "Plain credit" },
  ],
};

/**
 * A map that has not mounted an engine, so the credits are not shown on
 * their own: these tests start from the collapsed button.
 */
const SETTLED = testMapContext({ adapter: null });

function button(): HTMLElement {
  return screen.getByRole("button", { name: "Map credits" });
}

function open(): HTMLElement {
  fireEvent.click(button());
  return screen.getByRole("region", { name: "Map credits" });
}

describe("Attribution", () => {
  it("draws its bare icon with the map halo, so it shows on a light map in a dark theme", () => {
    renderChrome(<Attribution basemap={BASEMAP} />, { map: SETTLED });
    expect(button().className.split(" ")).toContain(onMapIcon);
  });

  it("is a collapsed Map credits button that controls a hidden region", () => {
    const { container } = renderChrome(<Attribution basemap={BASEMAP} />, {
      map: SETTLED,
    });
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
    renderChrome(<Attribution basemap={BASEMAP} />, { map: SETTLED });
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
    renderChrome(<Attribution basemap={BASEMAP} />, { map: SETTLED });
    open();
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "OpenStreetMap contributors" }),
    );
  });

  it("closes on Escape and returns focus to the button", () => {
    renderChrome(<Attribution basemap={BASEMAP} />, { map: SETTLED });
    open();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button());
  });

  it("closes when the button is pressed again", () => {
    renderChrome(<Attribution basemap={BASEMAP} />, { map: SETTLED });
    open();
    fireEvent.click(button());
    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button());
  });

  it("closes on a pointer down outside, but not inside", () => {
    renderChrome(<Attribution basemap={BASEMAP} />, { map: SETTLED });
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
    renderChrome(<Attribution basemap={BASEMAP} />, { map: SETTLED });
    open();
    elsewhere.focus();
    fireEvent.pointerDown(elsewhere);
    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it("closes when the map moves, but not for the view it opened on", () => {
    const { rerenderChrome } = renderChrome(<Attribution basemap={BASEMAP} />, {
      map: testMapContext({ adapter: null, view: DEFAULT_FAKE_VIEW }),
    });
    open();
    rerenderChrome(<Attribution basemap={BASEMAP} />, {
      map: testMapContext({ adapter: null, view: DEFAULT_FAKE_VIEW }),
    });
    expect(button()).toHaveAttribute("aria-expanded", "true");
    rerenderChrome(<Attribution basemap={BASEMAP} />, {
      map: testMapContext({
        adapter: null,
        view: { ...DEFAULT_FAKE_VIEW, zoom: 5 },
      }),
    });
    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button());
  });

  it("ignores keys other than Escape", () => {
    renderChrome(<Attribution basemap={BASEMAP} />, { map: SETTLED });
    open();
    fireEvent.keyDown(document.activeElement as Element, { key: "a" });
    expect(button()).toHaveAttribute("aria-expanded", "true");
  });

  it("names the engine credit too, so attribution is never dropped", () => {
    renderChrome(<Attribution basemap={BASEMAP} />, { map: SETTLED });
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
    const { container } = renderChrome(<Attribution basemap={BASEMAP} />, {
      map: SETTLED,
    });
    sizeRegion(container, { content: 120, visible: 120 });
    expect(open()).toHaveAttribute("data-placement", "above");
  });

  it("moves beside the end stack when the credits would scroll above the button", () => {
    const { container } = renderChrome(<Attribution basemap={BASEMAP} />, {
      map: SETTLED,
    });
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

/*
 * OSMF attribution guidelines: credits may be collapsed only after they have
 * been shown, on dismissal, on map interaction or after about five seconds.
 */
describe("Attribution on first load", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The popover the button controls, shown or not. */
  function region(): HTMLElement {
    const id = button().getAttribute("aria-controls") ?? "";
    const popover = document.getElementById(id);
    if (!popover) {
      throw new Error("No credits popover");
    }
    return popover;
  }

  /** A map whose engine mounts, with a way to report a user zoom. */
  function mountedMap() {
    const listeners = new Set<() => void>();
    const map = testMapContext({
      onUserZoom: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    });
    const userZoom = () => {
      act(() => {
        for (const listener of [...listeners]) {
          listener();
        }
      });
    };
    return { map, userZoom, listeners };
  }

  it("waits for the map to start, then shows the credits without taking focus", () => {
    const { rerenderChrome } = renderChrome(<Attribution basemap={BASEMAP} />, {
      map: SETTLED,
    });
    expect(button()).toHaveAttribute("aria-expanded", "false");
    const before = document.activeElement;
    rerenderChrome(<Attribution basemap={BASEMAP} />, {
      map: testMapContext(),
    });
    expect(button()).toHaveAttribute("aria-expanded", "true");
    expect(region()).toBeVisible();
    expect(region()).not.toHaveAttribute("role");
    expect(document.activeElement).toBe(before);
  });

  it("marks the root once the first showing has started, so callers can tell a collapsed start from a finished intro", () => {
    const { rerenderChrome, container } = renderChrome(
      <Attribution basemap={BASEMAP} />,
      { map: SETTLED },
    );
    const root = container.querySelector('[data-chrome="attribution"]');
    expect(root).not.toHaveAttribute("data-intro-started");
    rerenderChrome(<Attribution basemap={BASEMAP} />, {
      map: testMapContext(),
    });
    expect(root).toHaveAttribute("data-intro-started", "true");
  });

  it("collapses after five seconds, fading out", () => {
    vi.useFakeTimers();
    renderChrome(<Attribution basemap={BASEMAP} />);
    act(() => {
      vi.advanceTimersByTime(ATTRIBUTION_INTRO_MS - 1);
    });
    expect(button()).toHaveAttribute("aria-expanded", "true");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(region()).toHaveAttribute("data-closing", "true");
    act(() => {
      vi.advanceTimersByTime(ATTRIBUTION_FADE_MS);
    });
    expect(region()).toHaveAttribute("hidden");
    expect(region()).not.toHaveAttribute("data-closing");
  });

  it("collapses at once, without a fade, under reduced motion", () => {
    vi.useFakeTimers();
    const services = createFakeServices();
    services.fakes.preferences.set({ reducedMotion: true });
    renderChrome(<Attribution basemap={BASEMAP} />, { services });
    expect(button()).toHaveAttribute("aria-expanded", "true");
    act(() => {
      vi.advanceTimersByTime(ATTRIBUTION_INTRO_MS);
    });
    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(region()).toHaveAttribute("hidden");
    expect(region()).not.toHaveAttribute("data-closing");
  });

  it("collapses on the first zoom the person makes", () => {
    vi.useFakeTimers();
    const { map, userZoom, listeners } = mountedMap();
    renderChrome(<Attribution basemap={BASEMAP} />, { map });
    userZoom();
    expect(button()).toHaveAttribute("aria-expanded", "false");
    act(() => {
      vi.advanceTimersByTime(ATTRIBUTION_FADE_MS);
    });
    expect(region()).toHaveAttribute("hidden");
    expect(listeners.size).toBe(0);
  });

  it("collapses when the map moves", () => {
    vi.useFakeTimers();
    const { rerenderChrome } = renderChrome(<Attribution basemap={BASEMAP} />);
    rerenderChrome(<Attribution basemap={BASEMAP} />, {
      map: testMapContext({ view: { ...DEFAULT_FAKE_VIEW, zoom: 5 } }),
    });
    expect(button()).toHaveAttribute("aria-expanded", "false");
  });

  it("stays open when the map reports the same view again, as after a resize", () => {
    const { rerenderChrome } = renderChrome(<Attribution basemap={BASEMAP} />);
    rerenderChrome(<Attribution basemap={BASEMAP} />, {
      map: testMapContext({
        view: {
          ...DEFAULT_FAKE_VIEW,
          center: { ...DEFAULT_FAKE_VIEW.center },
        },
      }),
    });
    expect(button()).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses on a press outside it", () => {
    renderChrome(<Attribution basemap={BASEMAP} />);
    fireEvent.pointerDown(document.body);
    expect(button()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on a press of the button, like an open popover", () => {
    renderChrome(<Attribution basemap={BASEMAP} />);
    fireEvent.click(button());
    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(region()).toHaveAttribute("hidden");
  });

  it("stays open once focus moves into it", () => {
    vi.useFakeTimers();
    renderChrome(<Attribution basemap={BASEMAP} />);
    const link = screen.getByRole("link", {
      name: "OpenStreetMap contributors",
    });
    act(() => {
      link.focus();
    });
    act(() => {
      vi.advanceTimersByTime(ATTRIBUTION_INTRO_MS + ATTRIBUTION_FADE_MS);
    });
    expect(button()).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(link);
  });

  it("is shown only once", () => {
    vi.useFakeTimers();
    const { rerenderChrome } = renderChrome(<Attribution basemap={BASEMAP} />);
    act(() => {
      vi.advanceTimersByTime(ATTRIBUTION_INTRO_MS + ATTRIBUTION_FADE_MS);
    });
    rerenderChrome(<Attribution basemap={BASEMAP} />, { map: SETTLED });
    rerenderChrome(<Attribution basemap={BASEMAP} />, {
      map: testMapContext(),
    });
    expect(button()).toHaveAttribute("aria-expanded", "false");
  });

  it("stays open when the person opens it themselves", () => {
    vi.useFakeTimers();
    renderChrome(<Attribution basemap={BASEMAP} />);
    fireEvent.click(button());
    fireEvent.click(button());
    expect(button()).toHaveAttribute("aria-expanded", "true");
    act(() => {
      vi.advanceTimersByTime(ATTRIBUTION_INTRO_MS * 3);
    });
    expect(button()).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "OpenStreetMap contributors" }),
    );
  });
});
