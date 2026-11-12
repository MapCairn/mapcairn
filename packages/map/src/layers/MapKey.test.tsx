// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  chooseLayout,
  createFakeServices,
  FakeLayerCatalogue,
  FakeMapAdapter,
  type LayerDefinition,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_TIME_LAYER,
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

interface Viewport {
  readonly width: number;
  readonly height: number;
}

const DESKTOP: Viewport = { width: 1280, height: 720 };
const TABLET: Viewport = { width: 768, height: 1024 };
const PHONE: Viewport = { width: 390, height: 844 };
const PHONE_ON_ITS_SIDE: Viewport = { width: 844, height: 390 };
/** What the chrome reports before it has measured anything. */
const UNMEASURED: Viewport = { width: 0, height: 0 };

function setup(
  options: {
    readonly definitions?: readonly LayerDefinition[];
    readonly viewport?: Viewport;
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
    viewport = DESKTOP,
    props = {},
  } = options;
  const services = createFakeServices({
    layers: new FakeLayerCatalogue(definitions),
  });
  const handle: { current: DataLayers | null } = { current: null };
  function Harness() {
    const layers = useDataLayers({ now: () => Date.UTC(2026, 10, 9, 12) });
    handle.current = layers;
    return <MapKey layers={layers} {...props} />;
  }
  const map = testMapContext({ adapter: new FakeMapAdapter() });
  const tree = (current: Viewport) => (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <MapContext.Provider value={map}>
          <ChromeLayoutProvider
            value={testChromeLayout({
              layout: chooseLayout(current),
              viewport: current,
            })}
          >
            <Harness />
          </ChromeLayoutProvider>
        </MapContext.Provider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
  const view = render(tree(viewport));
  return {
    ...view,
    /** Re-renders with a new viewport, as rotating a phone or resizing a window does. */
    resize: (next: Viewport) => view.rerender(tree(next)),
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

/** The one button, named the same open and minimised: "Map key, 2 layers". */
const toggle = () =>
  screen.getByRole("button", { name: /^Map key, \d+ layers?$/ });

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
    it("collapses to a chip with the count and a strip of glyphs, and restores in place, under one name", () => {
      const { turnOn } = setup();
      turnOn(SAMPLE_FEED_LAYER.id, SAMPLE_ALERT_LAYER.id);
      const button = toggle();
      expect(button).toHaveAccessibleName("Map key, 2 layers");
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(button).toHaveAttribute(
        "aria-controls",
        screen.getByTestId("map-key-body").id,
      );
      button.focus();

      fireEvent.click(button);

      expect(toggle()).toBe(button);
      expect(button).toHaveAccessibleName("Map key, 2 layers");
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).toHaveTextContent("Key, 2 layers");
      expect(button).toHaveFocus();
      expect(button.querySelectorAll("svg[aria-hidden='true']").length).toBe(3);
      expect(screen.queryByTestId("map-key-sample-points")).toBeNull();
      expect(
        screen.getByRole("region", { name: "Map key" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Map key" }),
      ).toBeInTheDocument();

      fireEvent.click(button);

      expect(screen.getByTestId("map-key-sample-points")).toBeInTheDocument();
      expect(toggle()).toHaveAttribute("aria-expanded", "true");
      expect(toggle()).toHaveFocus();
    });

    it("shows the glyphs of the first three layers on the chip, and the count says the rest", () => {
      const { turnOn } = setup({ props: { defaultMinimised: true } });
      turnOn(
        SAMPLE_FEED_LAYER.id,
        SAMPLE_ALERT_LAYER.id,
        SAMPLE_HEATMAP_LAYER.id,
        TIMED_LAYER.id,
      );
      const chip = screen.getByRole("button", { name: "Map key, 4 layers" });
      // Three glyphs and the chevron.
      expect(chip.querySelectorAll("svg[aria-hidden='true']").length).toBe(4);
    });

    it("counts one layer in the singular", () => {
      const { turnOn } = setup({ props: { defaultMinimised: true } });
      turnOn(SAMPLE_FEED_LAYER.id);
      expect(toggle()).toHaveAccessibleName("Map key, 1 layer");
      expect(toggle()).toHaveTextContent("Key, 1 layer");
    });

    it("keeps its choice while layers come and go, even with none on", () => {
      const { turnOn, turnOff } = setup();
      turnOn(SAMPLE_FEED_LAYER.id);
      fireEvent.click(toggle());
      turnOff(SAMPLE_FEED_LAYER.id);
      expect(region()).toBeNull();
      turnOn(SAMPLE_ALERT_LAYER.id);
      expect(toggle()).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("where it starts: a phone in either orientation starts minimised", () => {
    const expanded = () => toggle().getAttribute("aria-expanded");

    it("is open on a desktop and on a tablet", () => {
      const desktop = setup({ viewport: DESKTOP });
      desktop.turnOn(SAMPLE_FEED_LAYER.id);
      expect(expanded()).toBe("true");
      desktop.unmount();

      const tablet = setup({ viewport: TABLET });
      tablet.turnOn(SAMPLE_FEED_LAYER.id);
      expect(expanded()).toBe("true");
    });

    it("is minimised on a phone upright and on its side, though the side is the panel layout", () => {
      expect(chooseLayout(PHONE_ON_ITS_SIDE)).toBe("panel");
      const upright = setup({ viewport: PHONE });
      upright.turnOn(SAMPLE_FEED_LAYER.id);
      expect(expanded()).toBe("false");
      upright.unmount();

      const sideways = setup({ viewport: PHONE_ON_ITS_SIDE });
      sideways.turnOn(SAMPLE_FEED_LAYER.id);
      expect(expanded()).toBe("false");
    });

    it("follows the host's choice over the screen", () => {
      const open = setup({
        viewport: PHONE,
        props: { defaultMinimised: false },
      });
      open.turnOn(SAMPLE_FEED_LAYER.id);
      expect(expanded()).toBe("true");
      open.unmount();

      const minimised = setup({
        viewport: DESKTOP,
        props: { defaultMinimised: true },
      });
      minimised.turnOn(SAMPLE_FEED_LAYER.id);
      expect(expanded()).toBe("false");
    });

    it("is decided when the key first appears, so turning the phone does not flip it", () => {
      const { turnOn, resize } = setup({ viewport: PHONE });
      turnOn(SAMPLE_FEED_LAYER.id);
      expect(expanded()).toBe("false");
      resize(PHONE_ON_ITS_SIDE);
      expect(expanded()).toBe("false");
      resize(DESKTOP);
      expect(expanded()).toBe("false");
    });

    it("stays open when a desktop window is made as small as a phone", () => {
      const { turnOn, resize } = setup({ viewport: DESKTOP });
      turnOn(SAMPLE_FEED_LAYER.id);
      resize(PHONE);
      expect(expanded()).toBe("true");
    });

    it("waits for the chrome's first measurement before deciding", () => {
      const { turnOn, resize } = setup({ viewport: UNMEASURED });
      turnOn(SAMPLE_FEED_LAYER.id);
      // Until then it shows minimised, as the chrome does before it measures.
      expect(expanded()).toBe("false");
      resize(DESKTOP);
      expect(expanded()).toBe("true");
      resize(PHONE);
      expect(expanded()).toBe("true");
    });

    it("lets the person's choice win over what was decided, however the screen turns", () => {
      const { turnOn, resize } = setup({ viewport: DESKTOP });
      turnOn(SAMPLE_FEED_LAYER.id);
      fireEvent.click(toggle());
      resize(PHONE);
      resize(DESKTOP);
      expect(expanded()).toBe("false");
    });

    it("is decided once, not again when the key goes and comes back", () => {
      const { turnOn, turnOff, resize } = setup({ viewport: PHONE });
      turnOn(SAMPLE_FEED_LAYER.id);
      turnOff(SAMPLE_FEED_LAYER.id);
      resize(DESKTOP);
      turnOn(SAMPLE_FEED_LAYER.id);
      expect(expanded()).toBe("false");
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
      fireEvent.click(toggle());
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
