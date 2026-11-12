// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  computeScaleBar,
  createFakeServices,
  DEFAULT_FAKE_VIEW,
  FakeMapAdapter,
  formatLatLng,
} from "@mapcairn/core";
import { act, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapContext } from "../../host";
import { ServicesProvider } from "../../services";
import {
  renderChrome,
  testChromeLayout,
  testMapContext,
} from "../MapChrome/chromeTestHarness";
import {
  CursorCoordinates,
  MapReadout,
  SCALE_BAR_IDLE_MS,
  SCALE_BAR_MAX_WIDTH_PX,
  ScaleBar,
} from "./MapReadout";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function adapterAtZoom(zoom: number): FakeMapAdapter {
  const adapter = new FakeMapAdapter();
  adapter.setView({ zoom, center: { lat: -33.9, lng: 18.4 } });
  return adapter;
}

function expectedBar(adapter: FakeMapAdapter, units: "metric" | "imperial") {
  return computeScaleBar({
    metresPerPixel: adapter.metresPerPixel(),
    maxWidthPx: SCALE_BAR_MAX_WIDTH_PX,
    units,
  });
}

describe("ScaleBar", () => {
  it("is an image named with the spoken scale and shows the short label", () => {
    const adapter = adapterAtZoom(12);
    renderChrome(<ScaleBar units="metric" />, {
      map: testMapContext({ adapter, view: adapter.getView() }),
    });
    const bar = expectedBar(adapter, "metric");
    const image = screen.getByRole("img", { name: bar.accessibleLabel });
    expect(image).toHaveAttribute("data-chrome", "scale-bar");
    expect(image).toHaveTextContent(bar.label);
    expect(bar.accessibleLabel).toMatch(/^Scale: /);
  });

  it("uses imperial units when asked", () => {
    const adapter = adapterAtZoom(12);
    renderChrome(<ScaleBar units="imperial" />, {
      map: testMapContext({ adapter, view: adapter.getView() }),
    });
    const bar = expectedBar(adapter, "imperial");
    expect(bar.unit === "ft" || bar.unit === "mi").toBe(true);
    expect(
      screen.getByRole("img", { name: bar.accessibleLabel }),
    ).toBeInTheDocument();
  });

  it("sizes the bar through CSS custom properties, never a style attribute", () => {
    const adapter = adapterAtZoom(12);
    renderChrome(<ScaleBar units="metric" />, {
      map: testMapContext({ adapter, view: adapter.getView() }),
    });
    const bar = expectedBar(adapter, "metric");
    const image = screen.getByRole("img");
    const track = screen.getByTestId("scale-bar-track");
    expect(Number(track.style.getPropertyValue("--scale-ratio"))).toBeCloseTo(
      bar.widthPx / SCALE_BAR_MAX_WIDTH_PX,
    );
    expect(track.style.getPropertyValue("--scale-max")).toBe(
      `${SCALE_BAR_MAX_WIDTH_PX}px`,
    );
    expect(image).toBeInTheDocument();
  });

  it("server-renders without a style attribute, for the strict style CSP", () => {
    const adapter = adapterAtZoom(12);
    const html = renderToString(
      <ServicesProvider services={createFakeServices()}>
        <MapContext.Provider
          value={testMapContext({ adapter, view: adapter.getView() })}
        >
          <MapReadout units="metric" latlng={{ lat: 1, lng: 2 }} />
        </MapContext.Provider>
      </ServicesProvider>,
    );
    expect(html).toContain("scale-bar");
    expect(html).not.toMatch(/style=/);
  });

  it("recomputes when the view changes", () => {
    const adapter = adapterAtZoom(12);
    const { rerenderChrome } = renderChrome(<ScaleBar units="metric" />, {
      map: testMapContext({ adapter, view: adapter.getView() }),
    });
    const before = expectedBar(adapter, "metric").accessibleLabel;
    adapter.setView({ zoom: 6 });
    rerenderChrome(<ScaleBar units="metric" />, {
      map: testMapContext({ adapter, view: adapter.getView() }),
    });
    const after = expectedBar(adapter, "metric").accessibleLabel;
    expect(after).not.toBe(before);
    expect(screen.getByRole("img", { name: after })).toBeInTheDocument();
  });

  it("renders nothing while there is no adapter", () => {
    renderChrome(<ScaleBar units="metric" />, {
      map: testMapContext({ adapter: null }),
    });
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("fades after the idle delay and reappears when the zoom changes", () => {
    const adapter = adapterAtZoom(12);
    const { rerenderChrome } = renderChrome(<ScaleBar units="metric" />, {
      map: testMapContext({ adapter, view: adapter.getView() }),
    });
    const image = screen.getByRole("img");
    expect(image).toHaveAttribute("data-idle", "false");
    act(() => {
      vi.advanceTimersByTime(SCALE_BAR_IDLE_MS - 1);
    });
    expect(image).toHaveAttribute("data-idle", "false");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(image).toHaveAttribute("data-idle", "true");

    adapter.setView({ zoom: 13 });
    rerenderChrome(<ScaleBar units="metric" />, {
      map: testMapContext({ adapter, view: adapter.getView() }),
    });
    expect(screen.getByRole("img")).toHaveAttribute("data-idle", "false");
  });

  /** A map host whose focus is keyboard focus (`:focus-visible`) or not. */
  function mapHost(focusVisible: boolean | "unsupported") {
    const host = document.createElement("section");
    const inner = document.createElement("button");
    host.append(inner);
    document.body.append(host);
    Object.defineProperty(host, "matches", {
      value: (selector: string): boolean => {
        if (focusVisible === "unsupported") {
          throw new SyntaxError(`Unsupported selector ${selector}`);
        }
        return selector === ":focus-visible" ? focusVisible : false;
      },
    });
    const adapter = adapterAtZoom(12);
    renderChrome(<ScaleBar units="metric" />, {
      map: testMapContext({
        adapter,
        view: adapter.getView(),
        hostElement: host,
      }),
    });
    return { host, inner };
  }

  it("still fades when the map took focus from a click or tap", () => {
    const { host } = mapHost(false);
    act(() => {
      host.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(SCALE_BAR_IDLE_MS);
    });
    expect(screen.getByRole("img")).toHaveAttribute("data-idle", "true");
    host.remove();
  });

  it("fades again once a keyboard user starts using the pointer on the map", () => {
    const { host } = mapHost(true);
    act(() => {
      host.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    act(() => {
      host.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(SCALE_BAR_IDLE_MS);
    });
    expect(screen.getByRole("img")).toHaveAttribute("data-idle", "true");
    host.remove();
  });

  it("treats focus as keyboard focus where :focus-visible is unsupported", () => {
    const { host } = mapHost("unsupported");
    act(() => {
      host.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(SCALE_BAR_IDLE_MS * 3);
    });
    expect(screen.getByRole("img")).toHaveAttribute("data-idle", "false");
    host.remove();
  });

  it("never fades while the map has keyboard focus", () => {
    const { host, inner } = mapHost(true);
    act(() => {
      host.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(SCALE_BAR_IDLE_MS * 3);
    });
    expect(screen.getByRole("img")).toHaveAttribute("data-idle", "false");

    // Moving focus within the map keeps it shown.
    act(() => {
      host.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: inner }),
      );
      vi.advanceTimersByTime(SCALE_BAR_IDLE_MS * 3);
    });
    expect(screen.getByRole("img")).toHaveAttribute("data-idle", "false");

    // Leaving the map starts the idle timer again.
    act(() => {
      host.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: null }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(SCALE_BAR_IDLE_MS);
    });
    expect(screen.getByRole("img")).toHaveAttribute("data-idle", "true");
    host.remove();
  });

  it("never fades under reduced motion", () => {
    const adapter = adapterAtZoom(12);
    const { services } = renderChrome(<ScaleBar units="metric" />, {
      map: testMapContext({ adapter, view: adapter.getView() }),
    });
    act(() => {
      services.fakes.preferences.set({ reducedMotion: true });
    });
    act(() => {
      vi.advanceTimersByTime(SCALE_BAR_IDLE_MS * 3);
    });
    expect(screen.getByRole("img")).toHaveAttribute("data-idle", "false");
  });
});

/**
 * What a screen reader or a copy of the text carries: the content left after
 * the `aria-hidden` visual parts are removed. Compared with `toBe`, so a
 * missing or doubled space shows.
 */
function spokenText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }
  return clone.textContent ?? "";
}

describe("CursorCoordinates", () => {
  const latlng = { lat: -26.2041, lng: 28.0473 };

  it("shows the formatted position", () => {
    renderChrome(<CursorCoordinates latlng={latlng} />);
    const readout = screen.getByText(formatLatLng(latlng)).closest("p");
    expect(readout).toHaveAttribute("data-chrome", "cursor-coordinates");
  });

  it("renders nothing without a position or a zoom", () => {
    const { container } = renderChrome(<CursorCoordinates latlng={null} />);
    expect(container.querySelector("[data-chrome]")).toBeNull();
  });

  it("shows the zoom beside the position, with one decimal at most", () => {
    renderChrome(<CursorCoordinates latlng={latlng} zoom={12.46} />);
    const readout = screen.getByText(formatLatLng(latlng)).closest("p");
    expect(readout).toContainElement(screen.getByText("z 12.5"));
  });

  it("shows the zoom alone while there is no position", () => {
    renderChrome(<CursorCoordinates latlng={null} zoom={12} />);
    expect(screen.getByText("z 12").closest("p")).toHaveAttribute(
      "data-chrome",
      "cursor-coordinates",
    );
  });

  it("shows a z and the figure to sighted users and hides them from a screen reader", () => {
    renderChrome(<CursorCoordinates latlng={null} zoom={12.4} />);
    expect(screen.getByText("z 12.4")).toHaveAttribute("aria-hidden", "true");
  });

  it("reads and copies as one clean 'Zoom 12.4', apart from the coordinates", () => {
    renderChrome(<CursorCoordinates latlng={latlng} zoom={12.4} />);
    const readout = screen.getByText(formatLatLng(latlng)).closest("p");
    expect(readout).not.toBeNull();
    expect(spokenText(readout as Element)).toBe(
      `${formatLatLng(latlng)}, Zoom 12.4`,
    );
  });

  it("reads and copies the zoom alone as 'Zoom 12.4' with no stray separator", () => {
    renderChrome(<CursorCoordinates latlng={null} zoom={12.4} />);
    const readout = screen.getByTestId("zoom-level").closest("p");
    expect(readout).not.toBeNull();
    expect(spokenText(readout as Element)).toBe("Zoom 12.4");
  });

  it("is not a live region, so a zoom change is not announced", () => {
    renderChrome(<CursorCoordinates latlng={null} zoom={12.4} />);
    expect(
      screen.getByTestId("zoom-level").closest("[aria-live], [role=status]"),
    ).toBeNull();
  });
});

describe("MapReadout", () => {
  const sheet = testChromeLayout({ layout: "sheet" });
  const panel = testChromeLayout({ layout: "panel" });

  function renderReadout(
    props: Partial<ComponentProps<typeof MapReadout>>,
    layout = panel,
    zoom = 12.4,
  ) {
    return renderChrome(
      <MapReadout units="metric" latlng={null} {...props} />,
      {
        map: testMapContext({ view: { ...DEFAULT_FAKE_VIEW, zoom } }),
        layout,
      },
    );
  }

  it("stacks the scale bar and the coordinates in one floating element", () => {
    const latlng = { lat: 1, lng: 2 };
    renderReadout({ latlng });
    const readout = screen.getByTestId("map-readout");
    expect(readout).toHaveAttribute("data-chrome", "map-readout");
    expect(readout).toContainElement(screen.getByRole("img"));
    expect(readout).toContainElement(screen.getByText(formatLatLng(latlng)));
  });

  it("is a landmark named Map scale, so the readout sits inside a landmark", () => {
    renderReadout({});
    const region = screen.getByRole("region", { name: "Map scale" });
    expect(region.tagName).toBe("SECTION");
    expect(region).toBe(screen.getByTestId("map-readout"));
  });

  it("shows the map's zoom level in the side panel layout", () => {
    renderReadout({});
    expect(screen.getByTestId("map-readout")).toContainElement(
      screen.getByText("z 12.4"),
    );
  });

  it("leaves the zoom out in the sheet layout, so the readout stays short", () => {
    const latlng = { lat: 1, lng: 2 };
    renderReadout({ latlng }, sheet);
    expect(screen.queryByTestId("zoom-level")).toBeNull();
    expect(screen.getByText(formatLatLng(latlng))).toBeInTheDocument();
  });

  it("follows zoom changes", () => {
    const { rerenderChrome } = renderReadout({});
    rerenderChrome(<MapReadout units="metric" latlng={null} />, {
      map: testMapContext({ view: { ...DEFAULT_FAKE_VIEW, zoom: 13 } }),
      layout: panel,
    });
    expect(screen.queryByText("z 12.4")).toBeNull();
    expect(screen.getByText("z 13")).toBeInTheDocument();
  });

  it("shows the zoom beside the coordinates", () => {
    const latlng = { lat: 1, lng: 2 };
    renderReadout({ latlng }, panel, 7);
    const coordinates = screen.getByText(formatLatLng(latlng)).closest("p");
    expect(coordinates).toContainElement(screen.getByText("z 7"));
  });

  it("leaves the zoom out when showZoom is false, even in the side panel layout", () => {
    const latlng = { lat: 1, lng: 2 };
    renderReadout({ latlng, showZoom: false });
    expect(screen.queryByTestId("zoom-level")).toBeNull();
    expect(screen.getByText(formatLatLng(latlng))).toBeInTheDocument();
  });

  it("shows the zoom when showZoom is true, even in the sheet layout", () => {
    renderReadout({ showZoom: true }, sheet);
    expect(screen.getByText("z 12.4")).toBeInTheDocument();
  });

  it("shows no coordinates element with no position and no zoom", () => {
    renderReadout({ showZoom: false });
    expect(screen.getByTestId("map-readout").querySelector("p")).toBeNull();
  });
});
