// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeMapAdapter,
  type LayerDefinition,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_TIME_LAYER,
  StaticLayerRegistry,
} from "@mapcairn/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChromeLayoutProvider } from "../chrome/layoutContext";
import {
  stubResizeObserver,
  testChromeLayout,
  testMapContext,
} from "../chrome/MapChrome/chromeTestHarness";
import { MapContext } from "../host";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { MapKey, type MapKeyProps } from "./MapKey";
import { type DataLayers, useDataLayers } from "./useDataLayers";

const TIMED_LAYER: LayerDefinition = {
  ...SAMPLE_TIME_LAYER,
  legend: [{ label: "Heavy rain", colour: "ordinal-5" }],
};

function setup(
  options: {
    readonly definitions?: readonly LayerDefinition[];
    readonly layout?: "sheet" | "panel";
    readonly props?: Partial<MapKeyProps>;
  } = {},
) {
  const {
    definitions = [
      SAMPLE_FEED_LAYER,
      SAMPLE_ALERT_LAYER,
      SAMPLE_HEATMAP_LAYER,
      SAMPLE_TILE_LAYER,
      TIMED_LAYER,
    ],
    layout = "panel",
    props = {},
  } = options;
  const services = createFakeServices({
    layers: new StaticLayerRegistry(definitions),
  });
  const handle: { current: DataLayers | null } = { current: null };
  function Harness() {
    const layers = useDataLayers({ now: () => Date.UTC(2026, 10, 9, 12) });
    handle.current = layers;
    return <MapKey layers={layers} {...props} />;
  }
  const map = testMapContext({ adapter: new FakeMapAdapter() });
  const tree = (current: "sheet" | "panel") => (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <MapContext.Provider value={map}>
          <ChromeLayoutProvider value={testChromeLayout({ layout: current })}>
            <Harness />
          </ChromeLayoutProvider>
        </MapContext.Provider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
  const view = render(tree(layout));
  return {
    ...view,
    /** Re-renders with a new chrome layout, as resizing the window does. */
    resize: (next: "sheet" | "panel") => view.rerender(tree(next)),
    turnOn: (...ids: string[]) =>
      act(() => {
        for (const id of ids) {
          handle.current?.setEnabled(id, true);
        }
      }),
    turnOff: (...ids: string[]) =>
      act(() => {
        for (const id of ids) {
          handle.current?.setEnabled(id, false);
        }
      }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const region = () => screen.queryByRole("region", { name: "Map key" });

describe("MapKey", () => {
  it("shows nothing while no layer that is on has a key", () => {
    const { turnOn } = setup();
    expect(region()).toBeNull();
    turnOn(SAMPLE_TILE_LAYER.id);
    expect(region()).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is a Map key region with a heading and one block for each layer that has a key", () => {
    const { turnOn } = setup();
    turnOn(SAMPLE_FEED_LAYER.id, SAMPLE_TILE_LAYER.id, SAMPLE_HEATMAP_LAYER.id);
    const key = screen.getByRole("region", { name: "Map key" });
    expect(
      within(key).getByRole("heading", { name: "Map key", level: 2 }),
    ).toBeInTheDocument();
    const names = within(key)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(names).toEqual([SAMPLE_FEED_LAYER.name, SAMPLE_HEATMAP_LAYER.name]);
    const list = within(key).getByRole("list", {
      name: `${SAMPLE_FEED_LAYER.name} key`,
    });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(["Below 3", "3 to 5", "5 and above"]);
    expect(
      within(key).getByRole("list", {
        name: `${SAMPLE_HEATMAP_LAYER.name} key`,
      }),
    ).toBeInTheDocument();
  });

  it("gives each block its own test id and leaves out a layer that is turned off", () => {
    const { turnOn, turnOff } = setup();
    turnOn(SAMPLE_FEED_LAYER.id, SAMPLE_ALERT_LAYER.id);
    expect(screen.getByTestId("map-key-sample-points")).toBeInTheDocument();
    expect(screen.getByTestId("map-key-sample-alerts")).toBeInTheDocument();
    turnOff(SAMPLE_FEED_LAYER.id);
    expect(screen.queryByTestId("map-key-sample-points")).toBeNull();
    turnOff(SAMPLE_ALERT_LAYER.id);
    expect(region()).toBeNull();
  });

  it("says in words which time a layer is set to", () => {
    const { turnOn } = setup();
    turnOn(TIMED_LAYER.id, SAMPLE_FEED_LAYER.id);
    const timed = screen.getByTestId(`map-key-${TIMED_LAYER.id}`);
    expect(timed).toHaveTextContent(/Showing \d\d:\d\d UTC on \d+ \w+ \d{4}/);
    expect(screen.getByTestId("map-key-sample-points")).not.toHaveTextContent(
      "Showing",
    );
  });

  describe("minimising", () => {
    it("collapses to a chip with the count and a strip of glyphs, and restores in place", () => {
      const { turnOn } = setup();
      turnOn(SAMPLE_FEED_LAYER.id, SAMPLE_ALERT_LAYER.id);
      const minimise = screen.getByRole("button", { name: "Minimise map key" });
      expect(minimise).toHaveAttribute("aria-expanded", "true");
      expect(minimise).toHaveAttribute(
        "aria-controls",
        screen.getByTestId("map-key-body").id,
      );
      minimise.focus();

      fireEvent.click(minimise);

      const chip = screen.getByRole("button", { name: "Key, 2 layers" });
      expect(chip).toBe(minimise);
      expect(chip).toHaveAttribute("aria-expanded", "false");
      expect(chip).toHaveFocus();
      expect(chip.querySelectorAll("svg[aria-hidden='true']").length).toBe(3);
      expect(screen.queryByTestId("map-key-sample-points")).toBeNull();
      expect(
        screen.getByRole("region", { name: "Map key" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Map key" }),
      ).toBeInTheDocument();

      fireEvent.click(chip);

      expect(screen.getByTestId("map-key-sample-points")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Minimise map key" }),
      ).toHaveFocus();
    });

    it("counts one layer in the singular", () => {
      const { turnOn } = setup({ props: { defaultMinimised: true } });
      turnOn(SAMPLE_FEED_LAYER.id);
      expect(
        screen.getByRole("button", { name: "Key, 1 layer" }),
      ).toBeInTheDocument();
    });

    it("keeps its choice while layers come and go, even with none on", () => {
      const { turnOn, turnOff } = setup();
      turnOn(SAMPLE_FEED_LAYER.id);
      fireEvent.click(screen.getByRole("button", { name: "Minimise map key" }));
      turnOff(SAMPLE_FEED_LAYER.id);
      expect(region()).toBeNull();
      turnOn(SAMPLE_ALERT_LAYER.id);
      expect(
        screen.getByRole("button", { name: "Key, 1 layer" }),
      ).toBeInTheDocument();
    });
  });

  describe("where it starts", () => {
    it("is open in the side panel layout", () => {
      const { turnOn } = setup({ layout: "panel" });
      turnOn(SAMPLE_FEED_LAYER.id);
      expect(
        screen.getByRole("button", { name: "Minimise map key" }),
      ).toBeInTheDocument();
    });

    it("is minimised in the bottom sheet layout, because the screen is small", () => {
      const { turnOn } = setup({ layout: "sheet" });
      turnOn(SAMPLE_FEED_LAYER.id);
      expect(
        screen.getByRole("button", { name: "Key, 1 layer" }),
      ).toHaveAttribute("aria-expanded", "false");
    });

    it("follows the host's choice over the layout", () => {
      const open = setup({
        layout: "sheet",
        props: { defaultMinimised: false },
      });
      open.turnOn(SAMPLE_FEED_LAYER.id);
      expect(
        screen.getByRole("button", { name: "Minimise map key" }),
      ).toBeInTheDocument();
      open.unmount();

      const minimised = setup({
        layout: "panel",
        props: { defaultMinimised: true },
      });
      minimised.turnOn(SAMPLE_FEED_LAYER.id);
      expect(
        screen.getByRole("button", { name: "Key, 1 layer" }),
      ).toBeInTheDocument();
    });

    it("follows the layout until the person chooses, then keeps their choice", () => {
      const { turnOn, resize } = setup({ layout: "sheet" });
      turnOn(SAMPLE_FEED_LAYER.id);
      resize("panel");
      expect(
        screen.getByRole("button", { name: "Minimise map key" }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Minimise map key" }));
      resize("sheet");
      resize("panel");
      expect(
        screen.getByRole("button", { name: "Key, 1 layer" }),
      ).toBeInTheDocument();
    });
  });

  describe("when it scrolls", () => {
    function shape(
      element: HTMLElement,
      scrollHeight: number,
      clientHeight: number,
    ) {
      Object.defineProperty(element, "scrollHeight", {
        value: scrollHeight,
        configurable: true,
      });
      Object.defineProperty(element, "clientHeight", {
        value: clientHeight,
        configurable: true,
      });
    }

    it("has a tab stop and a name only while its content is taller than it is", () => {
      const observers = stubResizeObserver();
      const { turnOn } = setup();
      turnOn(SAMPLE_FEED_LAYER.id);
      const body = screen.getByTestId("map-key-body");
      expect(body).not.toHaveAttribute("tabindex");
      expect(body).not.toHaveAttribute("aria-label");

      shape(body, 500, 300);
      act(() => {
        observers.trigger();
      });
      expect(
        screen.getByRole("region", { name: "Layer keys" }),
      ).toHaveAttribute("tabindex", "0");

      shape(body, 300, 300);
      act(() => {
        observers.trigger();
      });
      expect(body).not.toHaveAttribute("tabindex");
      expect(body).not.toHaveAttribute("aria-label");
    });

    it("watches the blocks too, and stops while minimised", () => {
      const observers = stubResizeObserver();
      const { turnOn } = setup();
      turnOn(SAMPLE_FEED_LAYER.id);
      const body = screen.getByTestId("map-key-body");
      expect(observers.isObserved(body)).toBe(true);
      expect(observers.isObserved(body.firstElementChild as Element)).toBe(
        true,
      );
      fireEvent.click(screen.getByRole("button", { name: "Minimise map key" }));
      expect(observers.active).toBe(0);
    });

    it("does not look where the browser has no ResizeObserver", () => {
      vi.stubGlobal("ResizeObserver", undefined);
      const { turnOn } = setup();
      turnOn(SAMPLE_FEED_LAYER.id);
      expect(screen.getByTestId("map-key-body")).not.toHaveAttribute(
        "tabindex",
      );
    });
  });
});
