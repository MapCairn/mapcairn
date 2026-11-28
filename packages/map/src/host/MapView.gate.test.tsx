// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE } from "@mapcairn/core";
import { act, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const VIEW = { center: { lat: 0, lng: 0 }, zoom: 3, bearing: 0 };
const NOTICE = EN_GB_CATALOGUE["app.banner.engineFailed"];

/**
 * A page that has not loaded the interface's private elements yet. Each test
 * imports the map afresh, over a definition that loads when the test says so,
 * fails, or never settles.
 */
async function coldPage() {
  vi.resetModules();
  let release: () => void = () => undefined;
  let refuse: (reason: Error) => void = () => undefined;
  const gate = new Promise<void>((resolve, reject) => {
    release = resolve;
    refuse = reject;
  });
  vi.doMock("../lit/privateElements", async (importOriginal) => {
    const original =
      await importOriginal<typeof import("../lit/privateElements")>();
    const { createLazyDefinition } = await import("../lit/lazyDefinition");
    return {
      ...original,
      privateElements: createLazyDefinition(
        async () => {
          await gate;
          return (await import("../lit/elements")).definePrivateElements();
        },
        { timeoutMs: original.ELEMENTS_LOAD_TIMEOUT_MS },
      ),
    };
  });
  const core = await import("@mapcairn/core");
  const { ServicesProvider } = await import("../services");
  const { LiveRegionProvider } = await import("../ui/LiveRegion");
  const { MeasureToolbar, useMeasure } = await import(
    "../tools/MeasureToolbar"
  );
  const { MapView } = await import("./MapView");
  const { privateElements, ELEMENTS_LOAD_TIMEOUT_MS } = await import(
    "../lit/privateElements"
  );
  const adapters: unknown[] = [];
  const services = core.createFakeServices({
    createMapAdapter: core.createFakeMapAdapterFactory((adapter) => {
      adapters.push(adapter);
    }),
  });
  function Toolbar() {
    return (
      <MeasureToolbar
        measure={useMeasure("metric")}
        onAddPointAtCentre={() => undefined}
        onDone={() => undefined}
      />
    );
  }
  const page = (view: ReactNode) => (
    <ServicesProvider services={services}>
      <LiveRegionProvider>{view}</LiveRegionProvider>
    </ServicesProvider>
  );
  return {
    adapters,
    page,
    MapView,
    Toolbar,
    basemap: core.FAKE_RASTER_BASEMAP,
    CoreEngineError: core.MapEngineError,
    bound: ELEMENTS_LOAD_TIMEOUT_MS,
    load: async () => {
      release();
      await act(() => privateElements.define());
    },
    fail: async () => {
      refuse(new Error("offline"));
      await act(() => privateElements.define());
    },
  };
}

const assertive = () => screen.getByTestId("live-region-assertive");

describe("a map view before its interface has loaded", () => {
  afterEach(() => {
    vi.doUnmock("../lit/privateElements");
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("draws nothing and starts no engine, then draws the whole interface at once", async () => {
    const cold = await coldPage();
    const chrome = vi.fn((map: ReactNode) => (
      <>
        {map}
        <cold.Toolbar />
      </>
    ));
    const view = render(
      cold.page(
        <cold.MapView
          initialView={VIEW}
          basemap={cold.basemap}
          chrome={chrome}
        />,
      ),
    );
    expect(view.container.querySelector("[data-map-host]")).toBeNull();
    expect(chrome).not.toHaveBeenCalled();
    expect(cold.adapters).toHaveLength(0);

    await cold.load();

    expect(screen.getByRole("region", { name: "Map" })).toBeInTheDocument();
    expect(cold.adapters).toHaveLength(1);
    // The toolbar's own mount effect found the control's buttons drawn.
    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: "Distance" }),
    );
  });

  it("holds nothing in a server's markup and hydrates it as it is, even once loaded", async () => {
    const cold = await coldPage();
    const tree = cold.page(
      <cold.MapView initialView={VIEW} basemap={cold.basemap} />,
    );
    const container = document.body.appendChild(document.createElement("div"));
    container.innerHTML = renderToString(tree);
    expect(container.querySelector("[data-map-host]")).toBeNull();
    await cold.load();
    const mismatch = vi.fn();

    const root = await act(async () =>
      hydrateRoot(
        container,
        createElement(() => tree),
        {
          onRecoverableError: mismatch,
        },
      ),
    );

    expect(mismatch).not.toHaveBeenCalled();
    expect(container.querySelector("[data-map-host]")).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("says once, visibly and aloud, that the map could not start when the load fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cold = await coldPage();
    const onEngineError = vi.fn();
    const chrome = vi.fn((map: ReactNode) => map);
    const element = (
      <cold.MapView
        id="map-region"
        testId="map-host"
        initialView={VIEW}
        basemap={cold.basemap}
        chrome={chrome}
        onEngineError={(error, basemap) => onEngineError(error, basemap)}
      />
    );
    const view = render(cold.page(element));

    await cold.fail();
    view.rerender(cold.page(element));

    const region = screen.getByRole("region", { name: "Map" });
    expect(region).toHaveTextContent(NOTICE);
    expect(region).toBeVisible();
    expect(region.id).toBe("map-region");
    expect(region).toHaveAttribute("data-testid", "map-host");
    expect(region).toHaveAttribute("data-state", "error");
    expect(region.getAttribute("tabindex")).toBe("-1");
    expect(assertive()).toHaveTextContent(NOTICE);
    // One announcement and no second live region saying the same.
    expect(region.querySelector("[aria-live], [role=alert]")).toBeNull();
    expect(onEngineError).toHaveBeenCalledExactlyOnceWith(
      expect.any(cold.CoreEngineError),
      cold.basemap,
    );
    expect(onEngineError.mock.calls[0]?.[0]).toMatchObject({
      reason: "load-failed",
    });
    expect(chrome).not.toHaveBeenCalled();
    expect(cold.adapters).toHaveLength(0);
  });

  it("names the map the failure is about, when the page has more than one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cold = await coldPage();
    render(
      cold.page(
        <cold.MapView initialView={VIEW} basemap={cold.basemap} label="Pine" />,
      ),
    );

    await cold.fail();

    expect(
      screen.getByRole("region", { name: "Map (Pine)" }),
    ).toHaveTextContent(NOTICE);
    expect(assertive()).toHaveTextContent(`Pine: ${NOTICE}`);
  });

  it("does not wait in silence for a load that never settles", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cold = await coldPage();
    const onEngineError = vi.fn();
    render(
      cold.page(
        <cold.MapView
          initialView={VIEW}
          basemap={cold.basemap}
          onEngineError={onEngineError}
        />,
      ),
    );

    await act(() => vi.advanceTimersByTimeAsync(cold.bound - 1));
    expect(screen.queryByRole("region", { name: "Map" })).toBeNull();
    expect(onEngineError).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(screen.getByRole("region", { name: "Map" })).toHaveTextContent(
      NOTICE,
    );
    expect(assertive()).toHaveTextContent(NOTICE);
    expect(onEngineError).toHaveBeenCalledTimes(1);
  });
});
