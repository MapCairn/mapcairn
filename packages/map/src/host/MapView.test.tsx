import {
  createFakeServices,
  FAKE_RASTER_BASEMAP,
  FAKE_VECTOR_BASEMAP,
  FakeMapAdapter as FakeAdapter,
  type FakeServices,
  type MapAdapter,
  type MapAdapterFactory,
  MapEngineError,
  type MapMountOptions,
  type ViewState,
} from "@karta/core";

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { type MapContextValue, useMap } from "./MapContext";
import { MapView, type MapViewProps } from "./MapView";

const VIEW: ViewState = {
  center: { lat: -33.92, lng: 18.42 },
  zoom: 9,
  bearing: 0,
};

/** Animation frames queued by the component, flushed by the test. */
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

function flushFrames(): void {
  act(() => {
    const queued = [...frames.values()];
    frames.clear();
    for (const callback of queued) {
      callback(0);
    }
  });
}

beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Lets pending mount and `setBasemap` promises settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Captures the latest context value for assertions. */
function Probe({ onValue }: { onValue: (value: MapContextValue) => void }) {
  onValue(useMap());
  return null;
}

interface Harness {
  services: FakeServices;
  latest: () => MapContextValue;
  host: () => HTMLElement;
  adapter: (index?: number) => FakeAdapter;
  rerender: (props: Partial<MapViewProps>) => void;
  unmount: () => void;
}

function tree(
  services: FakeServices,
  props: Partial<MapViewProps>,
  onValue: (value: MapContextValue) => void,
  children?: ReactNode,
) {
  return (
    <ServicesProvider services={services}>
      <MapView
        initialView={VIEW}
        basemap={FAKE_RASTER_BASEMAP}
        testId="map"
        {...props}
      >
        <Probe onValue={onValue} />
        {children}
      </MapView>
    </ServicesProvider>
  );
}

async function setup(
  props: Partial<MapViewProps> = {},
  services: FakeServices = createFakeServices(),
  children?: ReactNode,
): Promise<Harness> {
  let value: MapContextValue | null = null;
  const onValue = (next: MapContextValue) => {
    value = next;
  };
  let current = props;
  const view = render(tree(services, current, onValue, children));
  await settle();
  return {
    services,
    latest: () => {
      if (!value) {
        throw new Error("no context value");
      }
      return value;
    },
    host: () => screen.getByTestId("map"),
    adapter: (index = services.fakes.maps.length - 1) => {
      const adapter = services.fakes.maps[index];
      if (!adapter) {
        throw new Error(`no adapter ${index}`);
      }
      return adapter;
    },
    rerender: (next) => {
      current = { ...current, ...next };
      view.rerender(tree(services, current, onValue, children));
    },
    unmount: view.unmount,
  };
}

/** A factory whose adapters wait for the test before `mount` resolves. */
function heldFactory(): {
  factory: MapAdapterFactory;
  adapters: FakeAdapter[];
  release: (index: number) => Promise<void>;
  fail: (index: number, error: unknown) => Promise<void>;
} {
  const adapters: FakeAdapter[] = [];
  const holds: {
    resolve: () => void;
    reject: (error: unknown) => void;
  }[] = [];
  const factory: MapAdapterFactory = () => {
    const adapter = new FakeAdapter();
    const realMount = adapter.mount.bind(adapter);
    adapter.mount = (host, options: MapMountOptions) =>
      new Promise<void>((resolve, reject) => {
        holds.push({
          resolve: () => {
            realMount(host, options).then(resolve, reject);
          },
          reject,
        });
      });
    adapters.push(adapter);
    return adapter;
  };
  return {
    factory,
    adapters,
    release: async (index) => {
      holds[index]?.resolve();
      await settle();
      await settle();
    },
    fail: async (index, error) => {
      holds[index]?.reject(error);
      await settle();
    },
  };
}

describe("mounting and accessibility", () => {
  it("renders one focusable map region described by keyboard instructions", async () => {
    const { host } = await setup();
    const region = screen.getByRole("region", { name: "Map" });
    expect(region).toBe(host());
    expect(region).toHaveAttribute("aria-roledescription", "map");
    expect(region).toHaveAttribute("tabindex", "0");
    const describedBy = region.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const help = document.getElementById(describedBy as string);
    expect(help?.textContent).toMatch(/Arrow keys: pan the map\./);
    expect(help?.textContent).toMatch(/Plus or minus: zoom in or out\./);
  });

  it("includes rotation and pointing north in the instructions", async () => {
    const { host } = await setup();
    const help = document.getElementById(
      host().getAttribute("aria-describedby") as string,
    )?.textContent;
    expect(help).toMatch(/Shift with left or right arrow: rotate the map./);
    expect(help).toMatch(/Home or 0: point the map north again./);
  });

  it("mounts the adapter into a child element with the initial view, basemap, motion preference and Save data", async () => {
    const mount = vi.spyOn(FakeAdapter.prototype, "mount");
    const { host, adapter, latest } = await setup();
    expect(mount).toHaveBeenCalledTimes(1);
    const [element, options] = mount.mock.calls[0] as [
      HTMLElement,
      MapMountOptions,
    ];
    expect(element).not.toBe(host());
    expect(host().contains(element)).toBe(true);
    expect(latest().hostElement).toBe(element);
    expect(options).toEqual({
      view: VIEW,
      basemap: FAKE_RASTER_BASEMAP,
      reducedMotion: false,
      saveData: false,
    });
    expect(adapter().keyboardEnabled).toBe(false);
    expect(adapter().animationEnabled).toBe(true);
  });

  it("marks the map host and exposes the normalised zoom as data attributes", async () => {
    const { host, adapter } = await setup();
    expect(host()).toHaveAttribute("data-map-host", "");
    expect(host()).toHaveAttribute("data-zoom", "9.00");
    act(() => {
      adapter().setView({ zoom: 10.256 });
    });
    expect(host()).toHaveAttribute("data-zoom", "10.26");
    expect(host().getAttribute("style")).toBeNull();
  });

  it("provides the map state through useMap", async () => {
    const { latest, adapter } = await setup();
    const value = latest();
    expect(value.adapter).toBe(adapter());
    expect(value.view).toEqual(adapter().getView());
    expect(value.minZoom).toBe(2);
    expect(value.maxZoom).toBe(12);
    expect(value.canZoomIn).toBe(true);
    expect(value.canZoomOut).toBe(true);
    expect(value.loading).toBe(false);
    expect(value.tileError).toBe(false);
    expect(value.error).toBeNull();
  });

  it("reports the zoom limits as reached at either end", async () => {
    const { latest, adapter } = await setup({
      initialView: { ...VIEW, zoom: 12 },
    });
    expect(latest().canZoomIn).toBe(false);
    act(() => {
      adapter().setView({ zoom: 2 });
    });
    flushFrames();
    expect(latest().canZoomIn).toBe(true);
    expect(latest().canZoomOut).toBe(false);
  });

  it("focuses the region through focusMap", async () => {
    const { latest, host } = await setup();
    act(() => {
      latest().focusMap();
    });
    expect(document.activeElement).toBe(host());
  });

  it("throws when useMap is read outside a MapView", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe onValue={() => undefined} />)).toThrow(
      /inside a MapView/,
    );
  });

  it("puts the id on the map region, for a skip link to target", async () => {
    await setup({ id: "map-region" });
    expect(screen.getByRole("region", { name: "Map" })).toHaveAttribute(
      "id",
      "map-region",
    );
  });

  it("renders the chrome around the region, inside the map context", async () => {
    let fromChrome: MapContextValue | null = null;
    const { adapter, host } = await setup({
      chrome: (region) => (
        <div data-testid="chrome">
          <Probe
            onValue={(value) => {
              fromChrome = value;
            }}
          />
          <div data-testid="background">{region}</div>
        </div>
      ),
    });
    const background = screen.getByTestId("background");
    expect(screen.getByTestId("chrome")).toContainElement(background);
    expect(background).toContainElement(host());
    expect(fromChrome).not.toBeNull();
    expect((fromChrome as MapContextValue | null)?.adapter).toBe(adapter());
    const help = document.getElementById(
      host().getAttribute("aria-describedby") as string,
    );
    expect(background).toContainElement(help);
  });

  it("server-renders the chrome around the empty host", () => {
    const html = renderToString(
      <ServicesProvider services={createFakeServices()}>
        <MapView
          initialView={VIEW}
          basemap={FAKE_VECTOR_BASEMAP}
          testId="map"
          chrome={(region) => <div data-testid="chrome">{region}</div>}
        />
      </ServicesProvider>,
    );
    expect(html).toMatch(/data-testid="chrome"><section/);
    expect(html).not.toMatch(/style=/);
  });

  it("server-renders an empty host with no style attribute and no engine", () => {
    const services = createFakeServices();
    const factory = vi.fn(services.createMapAdapter);
    const html = renderToString(
      <ServicesProvider services={{ ...services, createMapAdapter: factory }}>
        <MapView initialView={VIEW} basemap={FAKE_VECTOR_BASEMAP} testId="map">
          <span>child</span>
        </MapView>
      </ServicesProvider>,
    );
    expect(html).not.toMatch(/style=/);
    expect(html).toMatch(/data-map-host=""/);
    expect(html).toMatch(/aria-busy="true"/);
    expect(html).toMatch(/child/);
    expect(factory).not.toHaveBeenCalled();
  });
});

describe("view updates", () => {
  it("updates the context view at most once per frame while the map moves", async () => {
    const { latest, adapter } = await setup();
    const before = latest().view;
    act(() => {
      adapter().panBy(10, 0);
      adapter().panBy(10, 0);
      adapter().zoomIn();
    });
    expect(frames.size).toBe(1);
    expect(latest().view).toBe(before);
    flushFrames();
    expect(latest().view).toEqual(adapter().getView());
    expect(latest().view.zoom).toBe(10);
  });

  it("calls onViewChange on moveEnd only", async () => {
    const onViewChange = vi.fn();
    const { adapter } = await setup({ onViewChange });
    act(() => {
      adapter().setView({ zoom: 10 });
    });
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith(adapter().getView());
  });

  it("forwards map clicks", async () => {
    const onClick = vi.fn();
    const { adapter } = await setup({ onClick });
    act(() => {
      adapter().simulateClick({ lat: 1, lng: 2 });
    });
    expect(onClick).toHaveBeenCalledWith(
      expect.objectContaining({ latlng: { lat: 1, lng: 2 } }),
    );
  });
});

describe("loading indicator", () => {
  it("shows while the engine starts and hides on load", async () => {
    const held = heldFactory();
    const services = createFakeServices({ createMapAdapter: held.factory });
    const { latest, host } = await setup({}, services);
    expect(screen.getByTestId("map-loading")).toBeInTheDocument();
    expect(host()).toHaveAttribute("aria-busy", "true");
    expect(latest().loading).toBe(true);
    await held.release(0);
    expect(screen.queryByTestId("map-loading")).toBeNull();
    expect(host()).toHaveAttribute("aria-busy", "false");
  });

  it("shows while tiles load", async () => {
    const { adapter, latest } = await setup();
    act(() => {
      adapter().simulateLoading(true);
    });
    expect(latest().loading).toBe(true);
    expect(screen.getByTestId("map-loading")).toBeInTheDocument();
    act(() => {
      adapter().simulateLoading(false);
    });
    expect(latest().loading).toBe(false);
  });

  it("is animated by default and static with reduced motion", async () => {
    const services = createFakeServices();
    const { adapter } = await setup({}, services);
    act(() => {
      adapter().simulateLoading(true);
    });
    const animated = screen.getByTestId("map-loading").className;
    act(() => {
      services.fakes.preferences.set({ reducedMotion: true });
    });
    expect(screen.getByTestId("map-loading").className).not.toBe(animated);
    expect(screen.getByTestId("map-loading")).toHaveAttribute(
      "data-motion",
      "static",
    );
  });
});

describe("reduced motion", () => {
  it("mounts with reduced motion and follows changes", async () => {
    const services = createFakeServices();
    services.fakes.preferences.set({ reducedMotion: true });
    const mount = vi.spyOn(FakeAdapter.prototype, "mount");
    const { adapter } = await setup({}, services);
    expect(mount.mock.calls[0]?.[1].reducedMotion).toBe(true);
    expect(adapter().animationEnabled).toBe(false);
    act(() => {
      services.fakes.preferences.set({ reducedMotion: false });
    });
    expect(adapter().animationEnabled).toBe(true);
  });
});

describe("keyboard", () => {
  async function pressOn(
    key: string,
    init: Partial<KeyboardEventInit> = {},
    props: Partial<MapViewProps> = {},
  ) {
    const harness = await setup(props);
    const spies = {
      panBy: vi.spyOn(harness.adapter(), "panBy"),
      zoomIn: vi.spyOn(harness.adapter(), "zoomIn"),
      zoomOut: vi.spyOn(harness.adapter(), "zoomOut"),
      rotateBy: vi.spyOn(harness.adapter(), "rotateBy"),
      resetBearing: vi.spyOn(harness.adapter(), "resetBearing"),
    };
    const notPrevented = fireEvent.keyDown(harness.host(), { key, ...init });
    return { ...harness, spies, prevented: !notPrevented };
  }

  it.each([
    ["ArrowLeft", -80, 0],
    ["ArrowRight", 80, 0],
    ["ArrowUp", 0, -80],
    ["ArrowDown", 0, 80],
  ])("pans with %s", async (key, dx, dy) => {
    const { spies, prevented } = await pressOn(key);
    expect(spies.panBy).toHaveBeenCalledWith(dx, dy);
    expect(prevented).toBe(true);
  });

  it("pans further with Shift and up or down", async () => {
    const { spies } = await pressOn("ArrowUp", { shiftKey: true });
    expect(spies.panBy).toHaveBeenCalledWith(0, -240);
  });

  it.each([
    ["+", "zoomIn"],
    ["=", "zoomIn"],
    ["-", "zoomOut"],
    ["_", "zoomOut"],
  ] as const)("zooms with %s", async (key, method) => {
    const { spies, prevented } = await pressOn(key);
    expect(spies[method]).toHaveBeenCalledTimes(1);
    expect(prevented).toBe(true);
  });

  it("rotates with Shift and left or right, and resets north with Home or 0", async () => {
    const harness = await pressOn("ArrowRight", { shiftKey: true });
    expect(harness.spies.rotateBy).toHaveBeenCalledWith(15);
    fireEvent.keyDown(harness.host(), { key: "ArrowLeft", shiftKey: true });
    expect(harness.spies.rotateBy).toHaveBeenCalledWith(-15);
    expect(fireEvent.keyDown(harness.host(), { key: "Home" })).toBe(false);
    fireEvent.keyDown(harness.host(), { key: "0" });
    expect(harness.spies.resetBearing).toHaveBeenCalledTimes(2);
  });

  it("drops a pin with P and escapes with Escape", async () => {
    const onDropPinKey = vi.fn();
    const onEscape = vi.fn();
    const { host } = await setup({ onDropPinKey, onEscape });
    expect(fireEvent.keyDown(host(), { key: "p" })).toBe(false);
    expect(fireEvent.keyDown(host(), { key: "P", shiftKey: true })).toBe(false);
    expect(onDropPinKey).toHaveBeenCalledTimes(2);
    expect(fireEvent.keyDown(host(), { key: "Escape" })).toBe(false);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("leaves other keys and browser shortcuts alone", async () => {
    const { host, spies } = await pressOn("a");
    expect(fireEvent.keyDown(host(), { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(host(), { key: "+", ctrlKey: true })).toBe(true);
    expect(spies.zoomIn).not.toHaveBeenCalled();
  });

  it("ignores keys from focusable content inside the region", async () => {
    const onEscape = vi.fn();
    const harness = await setup({ onEscape }, createFakeServices(), [
      <button key="b" type="button">
        Inside
      </button>,
    ]);
    const panBy = vi.spyOn(harness.adapter(), "panBy");
    const button = screen.getByRole("button", { name: "Inside" });
    expect(fireEvent.keyDown(button, { key: "ArrowLeft" })).toBe(true);
    fireEvent.keyDown(button, { key: "Escape" });
    expect(panBy).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("handles keys from inside the engine element", async () => {
    const mount = vi.spyOn(FakeAdapter.prototype, "mount");
    const { adapter } = await setup();
    const panBy = vi.spyOn(adapter(), "panBy");
    const element = mount.mock.calls[0]?.[0] as HTMLElement;
    const inner = document.createElement("div");
    element.append(inner);
    fireEvent.keyDown(inner, { key: "ArrowUp" });
    expect(panBy).toHaveBeenCalledWith(0, -80);
  });

  it("does nothing before the engine has mounted", async () => {
    const held = heldFactory();
    const { host } = await setup(
      {},
      createFakeServices({ createMapAdapter: held.factory }),
    );
    expect(fireEvent.keyDown(host(), { key: "ArrowLeft" })).toBe(true);
  });
});

describe("long-press", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  function down(host: HTMLElement, init: Partial<PointerEventInit> = {}) {
    fireEvent.pointerDown(host, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientX: 100,
      clientY: 50,
      ...init,
    });
  }

  it("fires after 500 ms with the point and its position", async () => {
    const onLongPress = vi.fn();
    const { host, adapter } = await setup({ onLongPress });
    down(host());
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledWith({
      point: { x: 100, y: 50 },
      latlng: adapter().unproject({ x: 100, y: 50 }),
    });
  });

  it("is cancelled by moving more than 10 px but not by a small wobble", async () => {
    const onLongPress = vi.fn();
    const { host } = await setup({ onLongPress });
    down(host());
    fireEvent.pointerMove(host(), { pointerId: 1, clientX: 106, clientY: 58 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(host(), { pointerId: 1 });
    down(host());
    fireEvent.pointerMove(host(), { pointerId: 1, clientX: 111, clientY: 50 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("is cancelled by a second pointer", async () => {
    const onLongPress = vi.fn();
    const { host } = await setup({ onLongPress });
    down(host());
    down(host(), { pointerId: 2, clientX: 200, isPrimary: false });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it.each(["pointerUp", "pointerCancel"] as const)(
    "is cancelled by %s",
    async (event) => {
      const onLongPress = vi.fn();
      const { host } = await setup({ onLongPress });
      down(host());
      fireEvent[event](host(), { pointerId: 1 });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(onLongPress).not.toHaveBeenCalled();
    },
  );

  it("is cancelled when the map moves during the press", async () => {
    const onLongPress = vi.fn();
    const { host, adapter } = await setup({ onLongPress });
    down(host());
    act(() => {
      adapter().panBy(3, 0);
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("ignores buttons other than the primary one", async () => {
    const onLongPress = vi.fn();
    const { host } = await setup({ onLongPress });
    down(host(), { button: 1 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("suppresses the click that follows a long-press, and only that one", async () => {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    const { host, adapter } = await setup({ onLongPress, onClick });
    down(host());
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.pointerUp(host(), { pointerId: 1 });
    act(() => {
      adapter().simulateClick({ lat: 0, lng: 0 });
    });
    expect(onClick).not.toHaveBeenCalled();
    act(() => {
      adapter().simulateClick({ lat: 0, lng: 0 });
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not suppress a later click when the engine sent none after the long-press", async () => {
    const onClick = vi.fn();
    const { host, adapter } = await setup({ onLongPress: vi.fn(), onClick });
    down(host());
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.pointerUp(host(), { pointerId: 1 });
    down(host());
    fireEvent.pointerUp(host(), { pointerId: 1 });
    act(() => {
      adapter().simulateClick({ lat: 0, lng: 0 });
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires on right-click and prevents the context menu", async () => {
    const onLongPress = vi.fn();
    const { host, adapter } = await setup({ onLongPress });
    const notPrevented = fireEvent.contextMenu(host(), {
      clientX: 30,
      clientY: 40,
    });
    expect(notPrevented).toBe(false);
    expect(onLongPress).toHaveBeenCalledWith({
      point: { x: 30, y: 40 },
      latlng: adapter().unproject({ x: 30, y: 40 }),
    });
  });

  it("fires once when a touch long-press also raises a context menu", async () => {
    const onLongPress = vi.fn();
    const { host } = await setup({ onLongPress });
    down(host());
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(fireEvent.contextMenu(host(), { clientX: 100, clientY: 50 })).toBe(
      false,
    );
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("fires at once, and only once, when the context menu comes before the timer", async () => {
    const onLongPress = vi.fn();
    const { host } = await setup({ onLongPress });
    down(host());
    fireEvent.contextMenu(host(), { clientX: 100, clientY: 50 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("ignores moves of other pointers and moves without a press", async () => {
    const onLongPress = vi.fn();
    const { host } = await setup({ onLongPress });
    fireEvent.pointerMove(host(), { pointerId: 1, clientX: 500 });
    down(host());
    fireEvent.pointerMove(host(), { pointerId: 7, clientX: 500 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire when the handler is removed during the press", async () => {
    const onLongPress = vi.fn();
    const { host, rerender } = await setup({ onLongPress });
    down(host());
    rerender({ onLongPress: undefined });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("does nothing without a handler or before the engine has mounted", async () => {
    const held = heldFactory();
    const onLongPress = vi.fn();
    const { host } = await setup(
      { onLongPress },
      createFakeServices({ createMapAdapter: held.factory }),
    );
    expect(fireEvent.contextMenu(host())).toBe(true);
    down(host());
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });
});

describe("basemap changes", () => {
  it("swaps the basemap on the mounted engine without remounting", async () => {
    const other = { ...FAKE_RASTER_BASEMAP, id: "other-raster", maxZoom: 10 };
    const { adapter, rerender, services, latest } = await setup();
    const setBasemap = vi.spyOn(adapter(), "setBasemap");
    rerender({ basemap: other });
    await settle();
    expect(setBasemap).toHaveBeenCalledWith(other, { saveData: false });
    expect(services.fakes.maps).toHaveLength(1);
    expect(latest().maxZoom).toBe(10);
  });

  it("switches between raster and vector basemaps on the same engine, keeping the view, the host and children", async () => {
    const mount = vi.spyOn(FakeAdapter.prototype, "mount");
    const {
      adapter,
      rerender,
      host,
      latest,
      services: { fakes },
    } = await setup(
      { basemap: FAKE_VECTOR_BASEMAP },
      createFakeServices(),
      <span data-testid="child">kept</span>,
    );
    const hostBefore = host();
    const child = screen.getByTestId("child");
    const element = latest().hostElement;
    act(() => {
      adapter().setView({ zoom: 7.5, bearing: 30 });
    });
    const before = adapter().getView();
    rerender({ basemap: FAKE_RASTER_BASEMAP });
    await settle();
    rerender({ basemap: FAKE_VECTOR_BASEMAP });
    await settle();
    expect(fakes.maps).toHaveLength(1);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(adapter().destroyed).toBe(false);
    expect(adapter().getView()).toEqual(before);
    expect(latest().hostElement).toBe(element);
    expect(host()).toBe(hostBefore);
    expect(screen.getByTestId("child")).toBe(child);
  });

  it("keeps one adapter however fast the basemap changes", async () => {
    const { adapter, rerender, services } = await setup();
    const setBasemap = vi.spyOn(adapter(), "setBasemap");
    const third = { ...FAKE_RASTER_BASEMAP, id: "third" };
    rerender({ basemap: FAKE_VECTOR_BASEMAP });
    rerender({ basemap: FAKE_RASTER_BASEMAP });
    rerender({ basemap: third });
    await settle();
    expect(services.fakes.maps).toHaveLength(1);
    expect(setBasemap.mock.calls.at(-1)).toEqual([third, { saveData: false }]);
  });

  it("applies a basemap chosen while the engine was still mounting", async () => {
    const held = heldFactory();
    const { rerender } = await setup(
      {},
      createFakeServices({ createMapAdapter: held.factory }),
    );
    const setBasemap = vi.spyOn(held.adapters[0] as FakeAdapter, "setBasemap");
    rerender({ basemap: FAKE_VECTOR_BASEMAP });
    await held.release(0);
    expect(held.adapters).toHaveLength(1);
    expect(setBasemap).toHaveBeenCalledWith(FAKE_VECTOR_BASEMAP, {
      saveData: false,
    });
  });

  it("ignores a superseded basemap swap", async () => {
    const first = { ...FAKE_RASTER_BASEMAP, id: "first", maxZoom: 11 };
    const second = { ...FAKE_RASTER_BASEMAP, id: "second", maxZoom: 10 };
    const { adapter, rerender, latest } = await setup();
    let releaseFirst: () => void = () => undefined;
    const real = adapter().setBasemap.bind(adapter());
    vi.spyOn(adapter(), "setBasemap").mockImplementation((basemap) =>
      basemap.id === "first"
        ? new Promise<void>((resolve) => {
            releaseFirst = () => {
              real(basemap).then(resolve);
            };
          })
        : real(basemap),
    );
    rerender({ basemap: first });
    rerender({ basemap: second });
    await settle();
    expect(latest().maxZoom).toBe(10);
    releaseFirst();
    await settle();
    expect(latest().maxZoom).toBe(10);
  });
});

describe("engine errors", () => {
  it("reports a failed mount, stops loading and exposes the error", async () => {
    const onEngineError = vi.fn();
    const failing = new FakeAdapter({ failMount: "webgl-unavailable" });
    const services = createFakeServices({ createMapAdapter: () => failing });
    const { latest } = await setup(
      { onEngineError, basemap: FAKE_VECTOR_BASEMAP },
      services,
    );
    expect(onEngineError).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "webgl-unavailable" }),
      FAKE_VECTOR_BASEMAP,
    );
    expect(latest().error?.reason).toBe("webgl-unavailable");
    expect(latest().adapter).toBeNull();
    expect(latest().loading).toBe(false);
    expect(screen.getByTestId("map")).toHaveAttribute("data-state", "error");
  });

  it("ignores a failure from a mount that was already torn down", async () => {
    const held = heldFactory();
    const onEngineError = vi.fn();
    const { unmount } = await setup(
      { onEngineError },
      createFakeServices({ createMapAdapter: held.factory }),
    );
    unmount();
    await held.fail(0, new MapEngineError("load-failed"));
    expect(onEngineError).not.toHaveBeenCalled();
    expect(held.adapters[0]?.destroyed).toBe(true);
  });

  it("ignores a mount that finishes after the map was unmounted", async () => {
    const held = heldFactory();
    const onEngineError = vi.fn();
    const { unmount } = await setup(
      { onEngineError },
      createFakeServices({ createMapAdapter: held.factory }),
    );
    const adapter = held.adapters[0] as FakeAdapter;
    const setKeyboard = vi.spyOn(adapter, "setKeyboardEnabled");
    unmount();
    await held.release(0);
    expect(setKeyboard).not.toHaveBeenCalled();
    expect(onEngineError).not.toHaveBeenCalled();
  });

  it("wraps an unexpected rejection as a load failure", async () => {
    const held = heldFactory();
    const onEngineError = vi.fn();
    const { latest } = await setup(
      { onEngineError },
      createFakeServices({ createMapAdapter: held.factory }),
    );
    await held.fail(0, new TypeError("boom"));
    const [error] = onEngineError.mock.calls[0] as [MapEngineError];
    expect(error).toBeInstanceOf(MapEngineError);
    expect(error.reason).toBe("load-failed");
    expect(error.message).toMatch(/boom/);
    expect(latest().error).toBe(error);
  });

  it("does not mount again when the basemap changes after an engine error", async () => {
    const factory = vi.fn(
      () => new FakeAdapter({ failMount: "webgl-unavailable" }),
    );
    const services = createFakeServices({ createMapAdapter: factory });
    const { rerender, latest } = await setup({}, services);
    rerender({ basemap: FAKE_VECTOR_BASEMAP });
    await settle();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(latest().error?.reason).toBe("webgl-unavailable");
  });

  it("restores focus to the region when focus was inside an engine element replaced on retry", async () => {
    let fail = true;
    const services = createFakeServices();
    const factory: MapAdapterFactory = () =>
      fail
        ? new FakeAdapter({ failMount: "load-failed" })
        : services.createMapAdapter();
    const { latest, host } = await setup(
      {},
      { ...services, createMapAdapter: factory },
    );
    const failed = host().querySelector("div div") as HTMLElement;
    const focusable = document.createElement("button");
    failed.append(focusable);
    focusable.focus();
    fail = false;
    act(() => {
      latest().retry();
    });
    await settle();
    expect(failed.isConnected).toBe(false);
    expect(document.activeElement).toBe(host());
  });

  it("leaves focus alone on retry when it was elsewhere", async () => {
    let fail = true;
    const services = createFakeServices();
    const factory: MapAdapterFactory = () =>
      fail
        ? new FakeAdapter({ failMount: "load-failed" })
        : services.createMapAdapter();
    const outside = document.createElement("button");
    document.body.append(outside);
    const { latest } = await setup(
      {},
      { ...services, createMapAdapter: factory },
    );
    outside.focus();
    fail = false;
    act(() => {
      latest().retry();
    });
    await settle();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("mounts again on retry after an engine error", async () => {
    let fail = true;
    const services = createFakeServices();
    const factory: MapAdapterFactory = () =>
      fail
        ? new FakeAdapter({ failMount: "load-failed" })
        : services.createMapAdapter();
    const { latest } = await setup(
      {},
      { ...services, createMapAdapter: factory },
    );
    expect(latest().error).not.toBeNull();
    fail = false;
    act(() => {
      latest().retry();
    });
    await settle();
    expect(latest().error).toBeNull();
    expect(latest().adapter).toBe(services.fakes.maps[0]);
  });

  it("reports a failed basemap swap as a basemap failure, not an engine error", async () => {
    const onEngineError = vi.fn();
    const onBasemapError = vi.fn();
    const onBasemapApplied = vi.fn();
    const other = { ...FAKE_VECTOR_BASEMAP, id: "other" };
    const { adapter, rerender, latest } = await setup({
      onEngineError,
      onBasemapError,
      onBasemapApplied,
    });
    adapter().failNextBasemap();
    rerender({ basemap: other });
    await settle();
    expect(onBasemapError).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "load-failed" }),
      other,
      FAKE_RASTER_BASEMAP,
    );
    expect(onEngineError).not.toHaveBeenCalled();
    expect(onBasemapApplied).not.toHaveBeenCalled();
    expect(latest().error).toBeNull();
    expect(latest().loading).toBe(false);
    expect(latest().maxZoom).toBe(FAKE_RASTER_BASEMAP.maxZoom);
  });

  it("does not swap again when the basemap goes back to the one the map kept", async () => {
    const other = { ...FAKE_VECTOR_BASEMAP, id: "other" };
    const { adapter, rerender } = await setup();
    adapter().failNextBasemap();
    rerender({ basemap: other });
    await settle();
    const setBasemap = vi.spyOn(adapter(), "setBasemap");
    rerender({ basemap: FAKE_RASTER_BASEMAP });
    await settle();
    expect(setBasemap).not.toHaveBeenCalled();
    // Choosing the failed basemap again tries it again.
    rerender({ basemap: other });
    await settle();
    expect(setBasemap).toHaveBeenCalledWith(other, { saveData: false });
  });

  it("ignores a superseded basemap swap that fails late", async () => {
    const onBasemapError = vi.fn();
    const first = { ...FAKE_RASTER_BASEMAP, id: "first" };
    const { adapter, rerender, latest } = await setup({ onBasemapError });
    let failFirst: () => void = () => undefined;
    const real = adapter().setBasemap.bind(adapter());
    vi.spyOn(adapter(), "setBasemap").mockImplementation((basemap) =>
      basemap.id === "first"
        ? new Promise<void>((_resolve, reject) => {
            failFirst = () => reject(new MapEngineError("load-failed"));
          })
        : real(basemap),
    );
    rerender({ basemap: first });
    rerender({ basemap: FAKE_VECTOR_BASEMAP });
    await settle();
    failFirst();
    await settle();
    expect(onBasemapError).not.toHaveBeenCalled();
    expect(latest().maxZoom).toBe(FAKE_VECTOR_BASEMAP.maxZoom);
  });

  it("reports each basemap swap that loaded, but not a superseded one", async () => {
    const onBasemapApplied = vi.fn();
    const first = { ...FAKE_RASTER_BASEMAP, id: "first" };
    const { rerender } = await setup({ onBasemapApplied });
    rerender({ basemap: first });
    rerender({ basemap: FAKE_VECTOR_BASEMAP });
    await settle();
    expect(onBasemapApplied.mock.calls).toEqual([[FAKE_VECTOR_BASEMAP]]);
  });
});

describe("engine failure after load", () => {
  it("exposes a fatal error, stops loading and reports it", async () => {
    const onEngineError = vi.fn();
    const { adapter, latest } = await setup({ onEngineError });
    act(() => {
      adapter().simulateLoading(true);
      adapter().simulateFatalError();
    });
    expect(latest().error?.reason).toBe("stopped");
    expect(latest().loading).toBe(false);
    expect(latest().tileError).toBe(false);
    expect(onEngineError).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "stopped" }),
      FAKE_RASTER_BASEMAP,
    );
    expect(screen.getByTestId("map")).toHaveAttribute("data-state", "error");
  });
});

describe("user zoom", () => {
  it("tells subscribers about zoom keys and engine gestures, not zooms made in code", async () => {
    const { adapter, latest, host } = await setup();
    const listener = vi.fn();
    const unsubscribe = latest().onUserZoom(listener);

    act(() => {
      adapter().setView({ zoom: 8 });
      adapter().zoomIn();
    });
    expect(listener).not.toHaveBeenCalled();

    act(() => {
      adapter().simulateUserZoom(5);
    });
    expect(listener).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(host(), { key: "+" });
    fireEvent.keyDown(host(), { key: "-" });
    expect(listener).toHaveBeenCalledTimes(3);

    // Other keys move the map without zooming.
    fireEvent.keyDown(host(), { key: "ArrowLeft" });
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    act(() => {
      adapter().simulateUserZoom(6);
    });
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe("tile errors", () => {
  it("raises tileError and keeps it through a load that also failed", async () => {
    const { adapter, latest } = await setup();
    act(() => {
      adapter().simulateLoading(true);
      adapter().simulateTileError();
    });
    expect(latest().tileError).toBe(true);
    act(() => {
      adapter().simulateLoading(false);
    });
    expect(latest().tileError).toBe(true);
  });

  it("clears tileError after a clean loading cycle", async () => {
    const { adapter, latest } = await setup();
    act(() => {
      adapter().simulateTileError();
    });
    act(() => {
      adapter().simulateLoading(true);
    });
    act(() => {
      adapter().simulateLoading(false);
    });
    expect(latest().tileError).toBe(false);
  });

  it("re-applies the basemap on retry and clears the error when it loads", async () => {
    const { adapter, latest } = await setup();
    const setBasemap = vi.spyOn(adapter(), "setBasemap");
    act(() => {
      adapter().simulateTileError();
    });
    act(() => {
      latest().retry();
    });
    await settle();
    expect(setBasemap).toHaveBeenCalledWith(FAKE_RASTER_BASEMAP, {
      saveData: false,
    });
    expect(latest().tileError).toBe(false);
  });

  it("does nothing on retry before the engine has mounted", async () => {
    const held = heldFactory();
    const { latest } = await setup(
      {},
      createFakeServices({ createMapAdapter: held.factory }),
    );
    act(() => {
      latest().retry();
    });
    expect(held.adapters).toHaveLength(1);
  });
});

describe("pointer position", () => {
  it("reports the position under a mouse once per frame, and null on leave", async () => {
    const onPointerMove = vi.fn();
    const { host, adapter } = await setup({ onPointerMove });
    fireEvent.pointerMove(host(), {
      pointerType: "mouse",
      clientX: 5,
      clientY: 5,
    });
    fireEvent.pointerMove(host(), {
      pointerType: "pen",
      clientX: 20,
      clientY: 30,
    });
    expect(onPointerMove).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    flushFrames();
    expect(onPointerMove).toHaveBeenCalledTimes(1);
    expect(onPointerMove).toHaveBeenCalledWith(
      adapter().unproject({ x: 20, y: 30 }),
    );
    fireEvent.pointerMove(host(), { pointerType: "mouse", clientX: 1 });
    fireEvent.pointerLeave(host(), { pointerType: "mouse" });
    expect(onPointerMove).toHaveBeenLastCalledWith(null);
    expect(frames.size).toBe(0);
  });

  it("ignores touch, and does nothing without a handler or an engine", async () => {
    const onPointerMove = vi.fn();
    const { host } = await setup({ onPointerMove });
    fireEvent.pointerMove(host(), { pointerType: "touch", clientX: 5 });
    fireEvent.pointerLeave(host(), { pointerType: "touch" });
    expect(frames.size).toBe(0);
    expect(onPointerMove).not.toHaveBeenCalled();

    const held = heldFactory();
    const second = await setup(
      { onPointerMove, testId: "second" },
      createFakeServices({ createMapAdapter: held.factory }),
    );
    const secondHost = screen.getByTestId("second");
    fireEvent.pointerMove(secondHost, { pointerType: "mouse" });
    flushFrames();
    expect(onPointerMove).not.toHaveBeenCalled();
    second.unmount();

    const third = await setup({ testId: "third" });
    fireEvent.pointerMove(screen.getByTestId("third"), {
      pointerType: "mouse",
    });
    expect(frames.size).toBe(0);
    third.unmount();
  });

  it("cancels a pending frame on unmount", async () => {
    const { host, unmount } = await setup({ onPointerMove: vi.fn() });
    fireEvent.pointerMove(host(), { pointerType: "mouse" });
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });
});

describe("cursor", () => {
  it("uses a different class for the crosshair cursor", async () => {
    const { host, rerender } = await setup();
    const grab = host().className;
    rerender({ cursor: "crosshair" });
    expect(host().className).not.toBe(grab);
  });
});

describe("unmount", () => {
  it("destroys the adapter and leaves no subscriptions, frames or timers", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const unsubscribed: string[] = [];
    const subscribed: string[] = [];
    const services = createFakeServices();
    const factory: MapAdapterFactory = () => {
      const adapter = services.createMapAdapter() as FakeAdapter;
      const realOn = adapter.on.bind(adapter);
      adapter.on = ((event, handler) => {
        subscribed.push(event);
        const off = realOn(event, handler);
        return () => {
          unsubscribed.push(event);
          off();
        };
      }) as MapAdapter["on"];
      return adapter;
    };
    const { unmount, adapter, host } = await setup(
      { onLongPress: vi.fn() },
      { ...services, createMapAdapter: factory },
    );
    act(() => {
      adapter().panBy(5, 5);
    });
    fireEvent.pointerDown(host(), { pointerId: 1, button: 0 });
    expect(frames.size).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(adapter().destroyed).toBe(true);
    expect(subscribed.length).toBeGreaterThan(0);
    expect([...unsubscribed].sort()).toEqual([...subscribed].sort());
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("re-projects when the host is resized", async () => {
    const observers: ResizeObserverCallback[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          observers.push(callback);
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    let renders = 0;
    const services = createFakeServices();
    const { unmount } = await setup(
      {},
      services,
      <Counter
        onRender={() => {
          renders += 1;
        }}
      />,
    );
    const before = renders;
    act(() => {
      for (const callback of observers) {
        callback([], {} as ResizeObserver);
      }
    });
    flushFrames();
    expect(renders).toBeGreaterThan(before);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});

function Counter({ onRender }: { onRender: () => void }) {
  useMap();
  onRender();
  return null;
}

describe("Save data", () => {
  /** A vector basemap that leaves a layer out in Save data mode. */
  const WITH_RELIEF = {
    ...FAKE_VECTOR_BASEMAP,
    id: "with-relief",
    saveDataOmitLayers: ["relief"],
  };

  it("mounts the engine in Save data mode when the device asks for it", async () => {
    const services = createFakeServices();
    services.fakes.preferences.set({ saveData: true });
    const { adapter } = await setup({ basemap: WITH_RELIEF }, services);
    expect(adapter().saveData).toBe(true);
  });

  it("lets a stored choice win over the device in both directions", async () => {
    const asking = createFakeServices();
    asking.fakes.preferences.set({ saveData: true });
    asking.fakes.settings.set({ saveData: false });
    expect((await setup({}, asking)).adapter().saveData).toBe(false);
    const quiet = createFakeServices();
    quiet.fakes.settings.set({ saveData: true });
    expect((await setup({}, quiet)).adapter().saveData).toBe(true);
  });

  it("redraws a basemap that leaves layers out when Save data is switched, without remounting", async () => {
    const mount = vi.spyOn(FakeAdapter.prototype, "mount");
    const { adapter, services } = await setup({ basemap: WITH_RELIEF });
    const setBasemap = vi.spyOn(adapter(), "setBasemap");
    act(() => {
      services.fakes.settings.set({ saveData: true });
    });
    await settle();
    expect(setBasemap).toHaveBeenCalledTimes(1);
    expect(setBasemap).toHaveBeenLastCalledWith(WITH_RELIEF, {
      saveData: true,
    });
    act(() => {
      services.fakes.settings.set({ saveData: false });
    });
    await settle();
    expect(setBasemap).toHaveBeenCalledTimes(2);
    expect(setBasemap).toHaveBeenLastCalledWith(WITH_RELIEF, {
      saveData: false,
    });
    expect(mount).toHaveBeenCalledTimes(1);
  });

  it("applies a Save data change made while the engine was still mounting", async () => {
    const held = heldFactory();
    const services = createFakeServices({ createMapAdapter: held.factory });
    await setup({ basemap: WITH_RELIEF }, services);
    const setBasemap = vi.spyOn(held.adapters[0] as FakeAdapter, "setBasemap");
    act(() => {
      services.fakes.settings.set({ saveData: true });
    });
    await held.release(0);
    expect(held.adapters[0]?.saveData).toBe(true);
    expect(setBasemap).toHaveBeenCalledWith(WITH_RELIEF, { saveData: true });
  });

  it("does not redraw a basemap with nothing to leave out", async () => {
    const { adapter, services } = await setup({ basemap: FAKE_RASTER_BASEMAP });
    const setBasemap = vi.spyOn(adapter(), "setBasemap");
    act(() => {
      services.fakes.settings.set({ saveData: true });
    });
    await settle();
    expect(setBasemap).not.toHaveBeenCalled();
  });

  it("passes Save data to every later swap and to a retry", async () => {
    const services = createFakeServices();
    services.fakes.settings.set({ saveData: true });
    const { adapter, rerender, latest } = await setup(
      { basemap: FAKE_RASTER_BASEMAP },
      services,
    );
    const setBasemap = vi.spyOn(adapter(), "setBasemap");
    rerender({ basemap: WITH_RELIEF });
    await settle();
    expect(setBasemap).toHaveBeenLastCalledWith(WITH_RELIEF, {
      saveData: true,
    });
    act(() => {
      adapter().simulateTileError();
    });
    act(() => {
      latest().retry();
    });
    await settle();
    expect(setBasemap).toHaveBeenCalledTimes(2);
    expect(setBasemap).toHaveBeenLastCalledWith(WITH_RELIEF, {
      saveData: true,
    });
  });
});
