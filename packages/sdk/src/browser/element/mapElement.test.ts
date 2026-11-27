// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { SearchProvider } from "@mapcairn/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MountMapError } from "../MountMapError";
import { mount } from "../mount";
import { harness } from "../testSupport";
import type { MapHandle, MountMapOptions } from "../types";
import { defineElement } from "./defineElement";
import type { MapCairnMapElement } from "./types";

let names = 0;

/** What a test can see of the element it made. */
interface Setup {
  readonly name: string;
  readonly mountFn: ReturnType<typeof vi.fn>;
  readonly handles: MapHandle[];
  readonly options: MountMapOptions[];
  readonly adapters: ReturnType<typeof harness>["adapters"];
}

/** Defines an element under a fresh name that mounts with the fake engine. */
function setup(): Setup {
  names += 1;
  const name = `test-map-${names}`;
  const tools = harness();
  const handles: MapHandle[] = [];
  const options: MountMapOptions[] = [];
  const mountFn = vi.fn((element: HTMLElement, given: MountMapOptions) => {
    options.push(given);
    const handle = mount(element, given, tools.dependencies);
    vi.spyOn(handle, "setView");
    vi.spyOn(handle, "update");
    vi.spyOn(handle, "destroy");
    handles.push(handle);
    return handle;
  });
  defineElement(name, mountFn);
  return { name, mountFn, handles, options, adapters: tools.adapters };
}

const elements: HTMLElement[] = [];

function make(
  { name }: Setup,
  attributes: Record<string, string> = {},
): MapCairnMapElement {
  const element = document.createElement(name) as MapCairnMapElement;
  element.getBoundingClientRect = () =>
    ({ height: 300, width: 400 }) as DOMRect;
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  elements.push(element);
  return element;
}

/** Lets every microtask the element queued run. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  for (const element of elements.splice(0)) {
    element.remove();
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("defining the element", () => {
  it("defines once however often it is asked, and answers with the class", () => {
    const first = defineElement("test-twice", vi.fn());
    const second = defineElement("test-twice", vi.fn());
    expect(first).toBeDefined();
    expect(second).toBe(customElements.get("test-twice"));
    expect(second).toBe(first);
  });

  it("says what is wrong with a name that is not a custom element name", () => {
    for (const name of ["map", "My-Map", "my map"]) {
      expect(() => defineElement(name, vi.fn())).toThrow(MountMapError);
    }
    expect(() => defineElement("map", vi.fn())).toThrow(/hyphen/);
  });
});

describe("an element that exists before it is defined", () => {
  it("keeps the properties and attributes it was given, and mounts once when it is defined", async () => {
    names += 1;
    const name = `test-late-${names}`;
    const element = document.createElement(name) as MapCairnMapElement;
    const search: SearchProvider = {
      search: async () => [],
      reverse: async () => null,
    };
    element.getBoundingClientRect = () =>
      ({ height: 300, width: 400 }) as DOMRect;
    element.setAttribute("tools", "search");
    element.setAttribute("label", "Depots");
    element.services = { search };
    element.layers = [];
    document.body.append(element);
    await settle();
    const tools = harness();
    const options: MountMapOptions[] = [];
    defineElement(name, (host, given) => {
      options.push(given);
      return mount(host, given, tools.dependencies);
    });
    await settle();
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      services: { search },
      layers: [],
      tools: ["search"],
      label: "Depots",
    });
    expect(Object.hasOwn(element, "services")).toBe(false);
  });
});

describe("a bare element", () => {
  it("draws a map in itself with no option passed, and replaces what it held", async () => {
    const test = setup();
    const element = make(test);
    element.append("Your browser could not draw this map.");
    document.body.append(element);
    await settle();
    expect(test.mountFn).toHaveBeenCalledTimes(1);
    expect(test.mountFn.mock.calls[0]?.[0]).toBe(element);
    expect(test.options[0]).toEqual({});
    await element.map?.ready;
    expect(element.textContent).not.toContain("could not draw");
    expect(element.querySelector("[data-map-host]")).not.toBeNull();
  });

  it("holds its handle in map, and nothing before it has mounted", async () => {
    const test = setup();
    const element = make(test);
    expect(element.map).toBeUndefined();
    document.body.append(element);
    expect(element.map).toBeUndefined();
    await settle();
    expect(element.map).toBe(test.handles[0]);
  });

  it("writes nothing it was given back to an attribute", async () => {
    const test = setup();
    const element = make(test, { latitude: "10", zoom: "4" });
    document.body.append(element);
    await settle();
    await element.map?.ready;
    element.map?.setView({ zoom: 9 }, { animate: false });
    element.view = { center: { lat: 1, lng: 2 }, zoom: 3, bearing: 0 };
    expect(element.getAttribute("latitude")).toBe("10");
    expect(element.getAttribute("zoom")).toBe("4");
    expect(element.hasAttribute("longitude")).toBe(false);
    expect(element.hasAttribute("bearing")).toBe(false);
    expect(element.hasAttribute("basemap")).toBe(false);
  });
});

describe("attributes read when the element connects", () => {
  it("passes the label, language, tools, basemap, theme and view to the map", async () => {
    const test = setup();
    const element = make(test, {
      label: "Depots",
      language: "en-GB",
      tools: "measure  settings",
      basemap: "dark",
      theme: "dark",
      latitude: "-33.9",
      longitude: "18.4",
      zoom: "9",
      bearing: "90",
    });
    document.body.append(element);
    await settle();
    expect(test.options[0]).toEqual({
      label: "Depots",
      language: "en-GB",
      tools: ["measure", "settings"],
      basemap: "dark",
      theme: "dark",
      view: { center: { lat: -33.9, lng: 18.4 }, zoom: 9, bearing: 90 },
    });
  });

  it("fills a view from the world view when only part of it is given", async () => {
    const test = setup();
    const element = make(test, { zoom: "7" });
    document.body.append(element);
    await settle();
    expect(test.options[0]?.view).toEqual({
      center: { lat: 20, lng: 0 },
      zoom: 7,
      bearing: 0,
    });
  });

  it("reports an unusable value as mapcairn-error and does not throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const test = setup();
    const element = make(test, { tools: "warp-drive" });
    const seen = vi.fn();
    element.addEventListener("mapcairn-error", seen);
    document.body.append(element);
    await settle();
    expect(seen).toHaveBeenCalledTimes(1);
    const error = seen.mock.calls[0]?.[0].detail as MountMapError;
    expect(error).toBeInstanceOf(MountMapError);
    expect(error.message).toContain('"warp-drive" is not a tool');
    expect(console.error).toHaveBeenCalledWith(error.message);
    expect(element.map).toBeUndefined();
  });
});

describe("attributes that change after the map is drawn", () => {
  async function drawn(attributes: Record<string, string> = {}) {
    const test = setup();
    const element = make(test, attributes);
    document.body.append(element);
    await settle();
    await element.map?.ready;
    return { test, element, handle: test.handles[0] as MapHandle };
  }

  it("moves the map when a view attribute changes, keeping the rest of the view", async () => {
    const { element, handle } = await drawn({
      latitude: "10",
      longitude: "20",
    });
    element.setAttribute("zoom", "6");
    expect(handle.setView).toHaveBeenCalledWith({
      center: { lat: 10, lng: 20 },
      zoom: 6,
      bearing: 0,
    });
    element.setAttribute("latitude", "11");
    expect(handle.setView).toHaveBeenLastCalledWith({
      center: { lat: 11, lng: 20 },
      zoom: 6,
      bearing: 0,
    });
  });

  it("does nothing for a view the map already has", async () => {
    const { element, handle } = await drawn({
      latitude: "10",
      longitude: "20",
    });
    element.setAttribute("latitude", "10");
    expect(handle.setView).not.toHaveBeenCalled();
  });

  it("changes the basemap and the theme, and treats a removed theme as the system's", async () => {
    const { element, handle } = await drawn({ theme: "dark" });
    element.setAttribute("basemap", "osm");
    expect(handle.update).toHaveBeenLastCalledWith({ basemap: "osm" });
    element.setAttribute("theme", "light");
    expect(handle.update).toHaveBeenLastCalledWith({ theme: "light" });
    element.removeAttribute("theme");
    expect(handle.update).toHaveBeenLastCalledWith({ theme: "system" });
  });

  it("leaves a removed basemap as it is", async () => {
    const { element, handle } = await drawn({ basemap: "dark" });
    element.removeAttribute("basemap");
    expect(handle.update).not.toHaveBeenCalled();
  });

  it("does not mount again, move or change anything for label, language or tools", async () => {
    const { test, element, handle } = await drawn();
    element.setAttribute("label", "Other");
    element.setAttribute("language", "af");
    element.setAttribute("tools", "measure");
    await settle();
    expect(test.mountFn).toHaveBeenCalledTimes(1);
    expect(handle.setView).not.toHaveBeenCalled();
    expect(handle.update).not.toHaveBeenCalled();
    expect(handle.destroy).not.toHaveBeenCalled();
  });

  it("reports a view attribute that is not a number, and keeps the map where it is", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { element, handle } = await drawn();
    const seen = vi.fn();
    element.addEventListener("mapcairn-error", seen);
    element.setAttribute("zoom", "far");
    expect(handle.setView).not.toHaveBeenCalled();
    const error = seen.mock.calls[0]?.[0].detail as MountMapError;
    expect(error.message).toBe(
      'The zoom attribute must be a number, for example zoom="5".',
    );
  });

  it("reports a basemap the map does not offer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { element } = await drawn();
    const seen = vi.fn();
    element.addEventListener("mapcairn-error", seen);
    element.setAttribute("basemap", "nowhere");
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("the view property and the view attributes", () => {
  it("takes the latest write before the map is drawn, whichever it came from", async () => {
    const test = setup();
    const element = make(test, { zoom: "3", latitude: "5" });
    element.view = { center: { lat: 40, lng: 41 }, zoom: 8, bearing: 10 };
    element.setAttribute("zoom", "9");
    document.body.append(element);
    await settle();
    expect(test.options[0]?.view).toEqual({
      center: { lat: 40, lng: 41 },
      zoom: 9,
      bearing: 10,
    });
  });

  it("lets the property win over an earlier attribute", async () => {
    const test = setup();
    const element = make(test, { zoom: "3" });
    element.view = { center: { lat: 1, lng: 2 }, zoom: 8, bearing: 0 };
    document.body.append(element);
    await settle();
    expect(test.options[0]?.view?.zoom).toBe(8);
  });

  it("moves a drawn map, and reads back the view the map has", async () => {
    const test = setup();
    const element = make(test);
    document.body.append(element);
    await settle();
    await element.map?.ready;
    element.view = { center: { lat: 3, lng: 4 }, zoom: 5, bearing: 6 };
    expect(test.handles[0]?.setView).toHaveBeenCalledWith({
      center: { lat: 3, lng: 4 },
      zoom: 5,
      bearing: 6,
    });
    expect(element.view).toEqual(test.handles[0]?.getView());
  });
});

describe("data properties", () => {
  const search: SearchProvider = {
    search: async () => [],
    reverse: async () => null,
  };

  it("mount once with everything set before or in the tick of connecting", async () => {
    const test = setup();
    const element = make(test, { tools: "search" });
    element.services = { search };
    document.body.append(element);
    element.layers = [];
    element.basemaps = undefined;
    element.languages = [];
    await settle();
    expect(test.mountFn).toHaveBeenCalledTimes(1);
    expect(test.options[0]).toMatchObject({
      services: { search },
      layers: [],
      languages: [],
      tools: ["search"],
    });
  });

  it("mount again once, however many are set in one tick, at the view the map has", async () => {
    const test = setup();
    const element = make(test);
    document.body.append(element);
    await settle();
    await element.map?.ready;
    element.map?.setView({ zoom: 6 }, { animate: false });
    await vi.waitFor(() => expect(element.view?.zoom).toBe(6));
    element.services = { search };
    element.layers = [];
    element.languages = [];
    await settle();
    expect(test.mountFn).toHaveBeenCalledTimes(2);
    expect(test.handles[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(test.options[1]?.view?.zoom).toBe(6);
    expect(test.options[1]?.services).toEqual({ search });
  });

  it("try again after a mount failed, once the page changes what it gave", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    names += 1;
    const name = `test-retry-${names}`;
    const stub = {
      getView: () => ({ center: { lat: 0, lng: 0 }, zoom: 1, bearing: 0 }),
      on: () => () => {},
      destroy: () => {},
    } as unknown as MapHandle;
    const mountFn = vi.fn((_element: HTMLElement, options: MountMapOptions) => {
      if (options.services === undefined) {
        throw new MountMapError("invalid-option", "Pass services.");
      }
      return stub;
    });
    defineElement(name, mountFn);
    const element = document.createElement(name) as MapCairnMapElement;
    document.body.append(element);
    await settle();
    expect(element.map).toBeUndefined();
    element.services = { search };
    await settle();
    expect(element.map).toBe(stub);
    expect(mountFn).toHaveBeenCalledTimes(2);
  });

  it("do not mount an element that is not in the page", async () => {
    const test = setup();
    const element = make(test);
    element.services = { search };
    await settle();
    expect(test.mountFn).not.toHaveBeenCalled();
  });

  it("do nothing when the same value is set again, so a re-render does not draw the map again", async () => {
    const test = setup();
    const element = make(test);
    const services = { search };
    const layers: MountMapOptions["layers"] = [];
    element.services = services;
    element.layers = layers;
    document.body.append(element);
    await settle();
    element.services = services;
    element.layers = layers;
    await settle();
    expect(test.mountFn).toHaveBeenCalledTimes(1);
  });

  it("read back what was set", () => {
    const test = setup();
    const element = make(test);
    element.services = { search };
    element.layers = [];
    element.basemaps = [];
    element.languages = [];
    expect(element.services).toEqual({ search });
    expect(element.layers).toEqual([]);
    expect(element.basemaps).toEqual([]);
    expect(element.languages).toEqual([]);
  });
});

describe("leaving and returning", () => {
  it("removes the map when the element leaves the page, in a microtask", async () => {
    const test = setup();
    const element = make(test);
    document.body.append(element);
    await settle();
    await element.map?.ready;
    element.remove();
    expect(test.handles[0]?.destroy).not.toHaveBeenCalled();
    await settle();
    expect(test.handles[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(element.map).toBeUndefined();
    expect(element.childElementCount).toBe(0);
    expect(element.hasAttribute("data-mapcairn")).toBe(false);
  });

  it("keeps the map when the element is moved in one tick", async () => {
    const test = setup();
    const element = make(test);
    const other = document.createElement("div");
    document.body.append(element, other);
    await settle();
    await element.map?.ready;
    other.append(element);
    await settle();
    expect(test.handles[0]?.destroy).not.toHaveBeenCalled();
    expect(test.mountFn).toHaveBeenCalledTimes(1);
    expect(element.map).toBe(test.handles[0]);
  });

  it("draws again at the view it left, when it comes back later", async () => {
    const test = setup();
    const element = make(test, { zoom: "3" });
    document.body.append(element);
    await settle();
    await element.map?.ready;
    element.map?.setView({ zoom: 8 }, { animate: false });
    await vi.waitFor(() => expect(element.map?.getView().zoom).toBe(8));
    element.remove();
    await settle();
    document.body.append(element);
    await settle();
    expect(test.mountFn).toHaveBeenCalledTimes(2);
    expect(test.options[1]?.view?.zoom).toBe(8);
  });

  it("does not mount a map for an element removed in the tick it was added", async () => {
    const test = setup();
    const element = make(test);
    document.body.append(element);
    element.remove();
    await settle();
    expect(test.mountFn).not.toHaveBeenCalled();
  });
});

describe("events", () => {
  /** An element over a handle that only records who listens, so a test can send each event itself. */
  function listening() {
    names += 1;
    const name = `test-events-${names}`;
    const listeners = new Map<string, (payload: unknown) => void>();
    const stub = {
      ready: Promise.resolve(),
      getView: () => ({ center: { lat: 0, lng: 0 }, zoom: 1, bearing: 0 }),
      setView: () => {},
      update: () => {},
      destroy: () => listeners.clear(),
      on: (type: string, listener: (payload: unknown) => void) => {
        listeners.set(type, listener);
        return () => listeners.delete(type);
      },
    } as unknown as MapHandle;
    defineElement(name, () => stub);
    const element = document.createElement(name) as MapCairnMapElement;
    const parent = document.createElement("section");
    document.body.append(parent);
    parent.append(element);
    return { element, parent, listeners };
  }

  it("sends each map event under its own name, bubbling and composed, with the payload in detail", async () => {
    const { parent, listeners } = listening();
    await settle();
    const pairs: [string, string, unknown][] = [
      ["viewchange", "mapcairn-view-change", { zoom: 3 }],
      ["click", "mapcairn-click", { lat: 5, lng: 6 }],
      ["featuretap", "mapcairn-feature-tap", { layerId: "a" }],
      ["error", "mapcairn-error", new Error("engine")],
    ];
    for (const [type, eventName, payload] of pairs) {
      const seen = vi.fn();
      parent.addEventListener(eventName, seen);
      listeners.get(type)?.(payload);
      expect(seen, eventName).toHaveBeenCalledTimes(1);
      const event = seen.mock.calls[0]?.[0] as CustomEvent;
      expect(event).toBeInstanceOf(CustomEvent);
      expect(event.detail).toBe(payload);
      expect(event.bubbles).toBe(true);
      expect(event.composed).toBe(true);
    }
  });

  it("forwards what the real map reports", async () => {
    const test = setup();
    const element = make(test);
    document.body.append(element);
    await settle();
    await element.map?.ready;
    const moved = vi.fn();
    const clicked = vi.fn();
    element.addEventListener("mapcairn-view-change", moved);
    element.addEventListener("mapcairn-click", clicked);
    test.adapters[0]?.setView({ zoom: 6 });
    test.adapters[0]?.simulateClick({ lat: 3, lng: 4 });
    await vi.waitFor(() => expect(moved).toHaveBeenCalled());
    expect(moved.mock.calls.at(-1)?.[0].detail.zoom).toBe(6);
    expect(clicked.mock.calls[0]?.[0].detail).toEqual({ lat: 3, lng: 4 });
  });

  it("stops sending when the element leaves the page", async () => {
    const { element, listeners } = listening();
    await settle();
    const seen = vi.fn();
    element.addEventListener("mapcairn-click", seen);
    element.remove();
    await settle();
    expect(listeners.has("click")).toBe(false);
  });
});

describe("two elements on one page", () => {
  it("keep their own views, and removing one leaves the other drawing", async () => {
    const test = setup();
    const first = make(test, { label: "First", zoom: "3" });
    const second = make(test, { label: "Second", zoom: "5" });
    document.body.append(first, second);
    await settle();
    await Promise.all([first.map?.ready, second.map?.ready]);
    first.map?.setView({ zoom: 7 }, { animate: false });
    await vi.waitFor(() => expect(first.map?.getView().zoom).toBe(7));
    expect(second.map?.getView().zoom).toBe(5);
    first.remove();
    await settle();
    expect(first.childElementCount).toBe(0);
    expect(second.querySelector("[data-map-host]")).not.toBeNull();
    expect(second.map).toBeDefined();
  });
});
