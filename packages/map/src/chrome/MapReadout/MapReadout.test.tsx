import {
  computeScaleBar,
  createFakeServices,
  DEFAULT_FAKE_VIEW,
  FakeMapAdapter,
  formatLatLng,
} from "@karta/core";
import { act, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapContext } from "../../host";
import { ServicesProvider } from "../../services";
import { renderChrome, testMapContext } from "../MapChrome/chromeTestHarness";
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
    host.matches = (selector: string) => {
      if (focusVisible === "unsupported") {
        throw new SyntaxError(`Unsupported selector ${selector}`);
      }
      return selector === ":focus-visible" ? focusVisible : false;
    };
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

describe("CursorCoordinates", () => {
  it("shows the formatted position", () => {
    const latlng = { lat: -26.2041, lng: 28.0473 };
    renderChrome(<CursorCoordinates latlng={latlng} />);
    const readout = screen.getByText(formatLatLng(latlng));
    expect(readout).toHaveAttribute("data-chrome", "cursor-coordinates");
  });

  it("renders nothing without a position", () => {
    const { container } = renderChrome(<CursorCoordinates latlng={null} />);
    expect(container.querySelector("[data-chrome]")).toBeNull();
  });
});

describe("MapReadout", () => {
  it("stacks the scale bar and the coordinates in one floating element", () => {
    const latlng = { lat: 1, lng: 2 };
    renderChrome(<MapReadout units="metric" latlng={latlng} />, {
      map: testMapContext({ view: DEFAULT_FAKE_VIEW }),
    });
    const readout = screen.getByTestId("map-readout");
    expect(readout).toHaveAttribute("data-chrome", "map-readout");
    expect(readout).toContainElement(screen.getByRole("img"));
    expect(readout).toContainElement(screen.getByText(formatLatLng(latlng)));
  });

  it("is a landmark named Map scale, so the readout sits inside a landmark", () => {
    renderChrome(<MapReadout units="metric" latlng={null} />, {
      map: testMapContext({ view: DEFAULT_FAKE_VIEW }),
    });
    const region = screen.getByRole("region", { name: "Map scale" });
    expect(region.tagName).toBe("SECTION");
    expect(region).toBe(screen.getByTestId("map-readout"));
  });
});
