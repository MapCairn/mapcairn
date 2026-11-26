// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  BASEMAPS,
  createFakeMapAdapterFactory,
  MapEngineError,
  type Services,
} from "@mapcairn/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MountMapError } from "./MountMapError";
import { mount } from "./mount";
import {
  button,
  container,
  destroyMounted,
  drawn,
  harness,
  mountOn,
  remember,
} from "./testSupport";

afterEach(destroyMounted);

describe("mount with no options", () => {
  it("draws a map with the zoom, the compass, the credits and the scale", async () => {
    const tools = harness();
    const element = container();
    await drawn(mountOn(element, tools));
    expect(tools.adapters).toHaveLength(1);
    expect(element.querySelector("[data-map-host]")).not.toBeNull();
    expect(
      element.querySelector('[role="group"][aria-label="Zoom controls"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('button[aria-label="Map credits"]'),
    ).not.toBeNull();
  });

  it("shows only the buttons it has a handler for", async () => {
    const element = container();
    await drawn(mountOn(element, harness()));
    for (const name of [
      "Map options",
      "Measure distance and area",
      "Locate me",
      "Settings",
    ]) {
      expect(element.querySelector(`button[aria-label="${name}"]`)).toBeNull();
    }
    expect(
      element.querySelector('[role="group"][aria-label="Map controls"]'),
    ).toBeNull();
  });

  it("leaves the page's main landmark to the page", async () => {
    const element = container();
    await drawn(mountOn(element, harness()));
    expect(element.querySelector("main")).toBeNull();
  });

  it("starts on a view of the world and writes the theme and the marker on its element only", async () => {
    const element = container();
    const handle = mountOn(element, harness());
    await drawn(handle);
    expect(handle.getView().zoom).toBeLessThan(4);
    expect(element.getAttribute("data-theme")).toBe("light");
    expect(element.hasAttribute("data-mapcairn")).toBe(true);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});

describe("two maps on one page", () => {
  it("keep their own state, regions and ids", async () => {
    const tools = harness();
    const first = container();
    const second = container();
    const one = mountOn(first, tools, { label: "North" });
    const two = mountOn(second, tools, { label: "South" });
    await Promise.all([drawn(one), drawn(two)]);
    const [a, b] = tools.adapters;
    a?.setView({ zoom: 7 });
    expect(one.getView().zoom).toBe(7);
    expect(two.getView().zoom).not.toBe(7);
    expect(first.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(second.querySelectorAll('[role="status"]')).toHaveLength(1);
    const prefixesIn = (element: HTMLElement) =>
      new Set(
        [...element.querySelectorAll("[id]")].map(
          (node) => /^_?(mc\d+[a-z0-9]*-)/.exec(node.id)?.[1] ?? node.id,
        ),
      );
    // Every id in a map carries that map's own prefix, so a second copy of the
    // bundle, or the page's own React, cannot make the same id twice.
    const [prefixA, prefixB] = [prefixesIn(first), prefixesIn(second)];
    expect(prefixA.size).toBe(1);
    expect(prefixB.size).toBe(1);
    expect([...prefixA][0]).toMatch(/^mc\d+[a-z0-9]*-$/);
    expect([...prefixA][0]).not.toBe([...prefixB][0]);
    expect(b).toBeDefined();
  });

  it("keep working when the other is destroyed", async () => {
    const tools = harness();
    const one = mountOn(container(), tools, { label: "One" });
    const two = mountOn(container(), tools, { label: "Two" });
    await Promise.all([drawn(one), drawn(two)]);
    one.destroy();
    tools.adapters[1]?.setView({ zoom: 5 });
    expect(two.getView().zoom).toBe(5);
  });

  it("warn once, through the console, about a second map with no label", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tools = harness();
    mountOn(container(), tools);
    expect(warn).not.toHaveBeenCalled();
    mountOn(container(), tools);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("label");
  });
});

describe("destroy", () => {
  it("empties the element, removes what the mount set and destroys the adapter once", async () => {
    const tools = harness();
    const element = container();
    element.className = "page-class";
    const handle = mountOn(element, tools);
    await drawn(handle);
    handle.destroy();
    expect(element.childNodes).toHaveLength(0);
    expect(element.hasAttribute("data-theme")).toBe(false);
    expect(element.hasAttribute("data-mapcairn")).toBe(false);
    expect(element.className).toBe("page-class");
    expect(tools.adapters[0]?.destroyed).toBe(true);
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(0);
  });

  it("leaves no listener on the document or the window, and no timer", async () => {
    const added: string[] = [];
    const removed: string[] = [];
    const track = (target: EventTarget, name: string) => {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      vi.spyOn(target, "addEventListener").mockImplementation(
        (
          type: string,
          listener: EventListenerOrEventListenerObject | null,
          options?: boolean | AddEventListenerOptions,
        ) => {
          added.push(`${name}:${type}`);
          add(type, listener, options);
        },
      );
      vi.spyOn(target, "removeEventListener").mockImplementation(
        (
          type: string,
          listener: EventListenerOrEventListenerObject | null,
          options?: boolean | AddEventListenerOptions,
        ) => {
          removed.push(`${name}:${type}`);
          remove(type, listener, options);
        },
      );
    };
    track(document, "document");
    track(window, "window");
    vi.useFakeTimers();
    try {
      const handle = mount(container(), {}, harness().dependencies);
      await vi.advanceTimersByTimeAsync(0);
      handle.destroy();
      await vi.advanceTimersByTimeAsync(0);
      // React DOM listens for `selectionchange` once for each document and never
      // lets go of it, whichever roots come and go. That is one listener for the
      // page, not one for each map, and nothing of this package's.
      const kept = new Set(["document:selectionchange"]);
      for (const entry of new Set(added)) {
        if (!kept.has(entry)) {
          expect(removed, entry).toContain(entry);
        }
      }
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is safe to call twice, and later calls do nothing", async () => {
    const tools = harness();
    const handle = mountOn(container(), tools);
    await drawn(handle);
    handle.setView({ zoom: 6 });
    handle.destroy();
    handle.destroy();
    const last = handle.getView();
    expect(last.zoom).toBe(6);
    handle.setView({ zoom: 9 });
    handle.update({ theme: "dark" });
    expect(handle.getView()).toEqual(last);
    const listener = vi.fn();
    handle.on("viewchange", listener)();
    expect(tools.adapters).toHaveLength(1);
  });

  it("rejects ready with a destroyed error when it comes before the engine is drawing", async () => {
    const tools = harness();
    const handle = mountOn(container(), tools);
    const outcome = handle.ready.then(
      () => "ready",
      (reason: unknown) => reason,
    );
    handle.destroy();
    // A promise that never settles must fail this test by assertion, not by timeout.
    const error = await Promise.race([
      outcome,
      new Promise((resolve) => setTimeout(() => resolve("still pending"), 100)),
    ]);
    expect(error).toBeInstanceOf(MountMapError);
    expect((error as MountMapError).kind).toBe("destroyed");
  });

  it("raises no unhandled rejection for a handle nobody awaits", async () => {
    // Vitest fails the run on an unhandled rejection, so reaching the end is the proof.
    const handle = mountOn(container(), harness());
    handle.destroy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(handle.getView().zoom).toBeLessThan(4);
  });

  it("lets the element hold a new map afterwards", async () => {
    const element = container();
    const handle = mountOn(element, harness());
    handle.destroy();
    const again = mountOn(element, harness());
    await drawn(again);
    expect(element.querySelector("[data-map-host]")).not.toBeNull();
  });
});

describe("the handle", () => {
  it("moves the map and reports where it is", async () => {
    const tools = harness();
    const handle = mountOn(container(), tools);
    await drawn(handle);
    handle.setView({ center: { lat: 10, lng: 20 }, zoom: 6 });
    expect(handle.getView().center).toEqual({ lat: 10, lng: 20 });
    expect(handle.getView().zoom).toBe(6);
  });

  it("applies a move asked for before the engine is drawing once it is", async () => {
    const handle = mountOn(container(), harness());
    handle.setView({ zoom: 5 });
    await drawn(handle);
    await vi.waitFor(() => expect(handle.getView().zoom).toBe(5));
  });

  it("starts where it was told", async () => {
    const tools = harness();
    const handle = mountOn(container(), tools, {
      view: { center: { lat: 51, lng: -0.1 }, zoom: 9, bearing: 0 },
    });
    await drawn(handle);
    expect(handle.getView().center).toEqual({ lat: 51, lng: -0.1 });
  });

  it("switches the theme on its element", async () => {
    const element = container();
    const handle = mountOn(element, harness(), { theme: "light" });
    await drawn(handle);
    handle.update({ theme: "dark" });
    await vi.waitFor(() =>
      expect(element.getAttribute("data-theme")).toBe("dark"),
    );
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("starts on the basemap it is given, and switches", async () => {
    const tools = harness();
    const handle = mountOn(container(), tools, {
      basemaps: [
        { ...BASEMAPS[0], id: "plain" },
        { ...BASEMAPS[1], id: "other" },
      ] as never,
      basemap: "other",
    });
    await drawn(handle);
    const adapter = tools.adapters[0];
    if (adapter === undefined) {
      throw new Error("No adapter was built.");
    }
    expect(vi.mocked(adapter.mount).mock.calls[0]?.[1].basemap.id).toBe(
      "other",
    );
    handle.update({ basemap: "plain" });
    await vi.waitFor(() =>
      expect(vi.mocked(adapter.setBasemap).mock.calls.at(-1)?.[0].id).toBe(
        "plain",
      ),
    );
  });
});

describe("events", () => {
  it("reports a view change and stops when the listener is removed", async () => {
    const tools = harness();
    const handle = mountOn(container(), tools);
    await drawn(handle);
    const listener = vi.fn();
    const off = handle.on("viewchange", listener);
    tools.adapters[0]?.setView({ zoom: 6 });
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(listener.mock.calls.at(-1)?.[0].zoom).toBe(6);
    off();
    listener.mockClear();
    tools.adapters[0]?.setView({ zoom: 7 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listener).not.toHaveBeenCalled();
  });

  it("reports a click as a position", async () => {
    const tools = harness();
    const handle = mountOn(container(), tools);
    await drawn(handle);
    const listener = vi.fn();
    handle.on("click", listener);
    tools.adapters[0]?.simulateClick({ lat: 3, lng: 4 });
    await vi.waitFor(() =>
      expect(listener).toHaveBeenCalledWith({ lat: 3, lng: 4 }),
    );
  });

  it("rejects ready and emits an error when the engine cannot start", async () => {
    const tools = harness((onCreate) => () => {
      const adapter = createFakeMapAdapterFactory(onCreate)();
      (adapter as unknown as { mount: () => Promise<void> }).mount = () =>
        Promise.reject(new MapEngineError("webgl-unavailable"));
      return adapter;
    });
    const handle = mountOn(container(), tools);
    const listener = vi.fn();
    handle.on("error", listener);
    await expect(handle.ready).rejects.toBeInstanceOf(MapEngineError);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
  });
});

describe("what it refuses, and says how to fix", () => {
  it("a second map on one element", () => {
    const element = container();
    mountOn(element, harness());
    expect(() => mountOn(element, harness())).toThrow(
      /already holds a map\. Call destroy\(\) on its handle first\./,
    );
  });

  it("a worker on another origin", () => {
    expect(() =>
      mountOn(container(), harness(), {
        workerUrl: "https://cdn.example/browser-worker.js",
      }),
    ).toThrow(
      /workerUrl must be on this page's origin\. Leave workerUrl out to use the bundle's own worker\./,
    );
  });

  it("a worker on this origin, or a blob that this origin made", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const tools = harness();
    mountOn(container(), tools, { workerUrl: "/files/browser-worker.js" });
    mountOn(container(), tools, {
      workerUrl: "blob:http://localhost:3000/abc",
    });
    expect(tools.workerUrls[0]).toBe(
      new URL("/files/browser-worker.js", document.baseURI).href,
    );
    expect(tools.workerUrls[1]).toBe("blob:http://localhost:3000/abc");
  });

  it.each([
    ["another port", "http://localhost:3001/browser-worker.js"],
    [
      "the same host on another scheme",
      "https://localhost:3000/browser-worker.js",
    ],
    ["a blob from another origin", "blob:https://cdn.example/abc"],
    [
      "a protocol-relative address on another host",
      "//cdn.example/browser-worker.js",
    ],
  ])("a worker on %s", (_name, workerUrl) => {
    expect(() => mountOn(container(), harness(), { workerUrl })).toThrow(
      /workerUrl must be on this page's origin/,
    );
  });

  it("a basemap that is not offered", () => {
    expect(() =>
      mountOn(container(), harness(), { basemap: "nowhere" }),
    ).toThrow(/basemap "nowhere" is not offered\. Use one of: /);
  });

  it("a view that is not a view", () => {
    expect(() =>
      mountOn(container(), harness(), {
        view: { center: { lat: 200, lng: 0 }, zoom: 2, bearing: 0 },
      }),
    ).toThrow(/view\.center\.lat/);
  });

  it("a theme that is not one", () => {
    expect(() =>
      mountOn(container(), harness(), { theme: "blue" as never }),
    ).toThrow(/theme must be "light", "dark" or "system"/);
  });

  it("an element that is not an element", () => {
    expect(() => mount(null as never, {}, harness().dependencies)).toThrow(
      MountMapError,
    );
  });

  it("updates to a basemap that is not offered", async () => {
    const handle = mountOn(container(), harness());
    await drawn(handle);
    expect(() => handle.update({ basemap: "nowhere" })).toThrow(MountMapError);
  });

  it("warns once about an element with no height", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mountOn(container(0), harness(), { label: "Flat" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      "Give it a height in CSS.",
    );
  });
});

describe("the services it builds", () => {
  it("hands every stand-in the interface never calls an object that fails on any call", async () => {
    const calls: string[] = [];
    const tools = harness();
    const handle = mount(
      container(),
      {},
      {
        ...tools.dependencies,
        decorateServices: (services: Services): Services => {
          const failing = <T extends object>(name: string): T =>
            new Proxy({} as T, {
              get: (_target, property) => {
                calls.push(`${name}.${String(property)}`);
                return () => {
                  throw new Error(`${name}.${String(property)} was called`);
                };
              },
            });
          return {
            ...services,
            clipboard: failing("clipboard"),
            fileSaver: failing("fileSaver"),
            layerSource: failing("layerSource"),
            location: failing("location"),
            search: failing("search"),
          };
        },
      },
    );
    remember(handle);
    await drawn(handle);
    expect(calls).toEqual([]);
  });

  it("passes the page's own providers through", async () => {
    const search = { search: vi.fn() };
    let seen: Services | undefined;
    const tools = harness();
    const handle = mount(
      container(),
      { services: { search: search as never } },
      {
        ...tools.dependencies,
        decorateServices: (services: Services) => {
          seen = services;
          return services;
        },
      },
    );
    remember(handle);
    await drawn(handle);
    expect(seen?.search).toBe(search);
  });
});

describe("the controls", () => {
  it("zoom the map through the adapter", async () => {
    const tools = harness();
    const element = container();
    const handle = mountOn(element, tools);
    await drawn(handle);
    const before = handle.getView().zoom;
    // The interface hands the adapter to its controls a moment after it is drawing.
    await vi.waitFor(async () => {
      (await button(element, "Zoom in")).click();
      expect(handle.getView().zoom).toBeGreaterThan(before);
    });
    const zoomedIn = handle.getView().zoom;
    (await button(element, "Zoom out")).click();
    await vi.waitFor(() =>
      expect(handle.getView().zoom).toBeLessThan(zoomedIn),
    );
  });

  it("turn the map back to north from the compass", async () => {
    const tools = harness();
    const element = container();
    const handle = mountOn(element, tools);
    await drawn(handle);
    handle.setView({ bearing: 90 });
    await vi.waitFor(async () => {
      (await button(element, "Reset bearing to north")).click();
      expect(handle.getView().bearing).toBe(0);
    });
  });
});

describe("options that are not usable", () => {
  it.each([
    [{ label: 3 as never }, /label must be text/],
    [
      { view: { center: { lat: 0, lng: 999 }, zoom: 1, bearing: 0 } },
      /view\.center\.lng/,
    ],
    [
      {
        view: { center: { lat: 0, lng: 0 }, zoom: "far" as never, bearing: 0 },
      },
      /view\.zoom/,
    ],
    [
      { view: { center: { lat: 0, lng: 0 }, zoom: 1, bearing: 400 } },
      /view\.bearing/,
    ],
    [{ workerUrl: "http://[bad" }, /workerUrl must be an address/],
  ])("%j", (options, message) => {
    expect(() => mountOn(container(), harness(), options)).toThrow(message);
  });

  it("an options value that is not an object", () => {
    expect(() => mountOn(container(), harness(), 4 as never)).toThrow(
      /options must be an object/,
    );
  });

  it("basemaps that name an id twice, or none", () => {
    const one = { ...BASEMAPS[0], id: "same" };
    expect(() =>
      mountOn(container(), harness(), { basemaps: [one, one] as never }),
    ).toThrow(/basemaps: .*used twice/);
    expect(() => mountOn(container(), harness(), { basemaps: [] })).toThrow(
      /basemaps: /,
    );
  });

  it("an empty label, which is no label", async () => {
    const element = container();
    mountOn(element, harness(), { label: "" });
    expect(element.getAttribute("data-mapcairn")).toBe("unlabelled");
  });
});

describe("the suggestion provider", () => {
  it("passes through to the services", async () => {
    let seen: Services | undefined;
    const suggestions = { suggest: vi.fn() };
    const handle = mount(
      container(),
      { services: { suggestions: suggestions as never } },
      {
        ...harness().dependencies,
        decorateServices: (services: Services) => {
          seen = services;
          return services;
        },
      },
    );
    remember(handle);
    await drawn(handle);
    expect(seen?.suggestions).toBe(suggestions);
  });
});

describe("after a destroy that came before the engine", () => {
  it("moves nothing for a move asked for first", async () => {
    const tools = harness();
    const handle = mountOn(container(), tools);
    handle.setView({ zoom: 9 });
    handle.destroy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(handle.getView().zoom).toBeLessThan(4);
  });
});

/** A `matchMedia` whose dark query the test flips, and whose listeners it can see. */
function stubColourScheme(initial: "light" | "dark") {
  let dark = initial === "dark";
  const lists: {
    query: string;
    added: EventListenerOrEventListenerObject[];
    removed: EventListenerOrEventListenerObject[];
    listeners: Set<EventListenerOrEventListenerObject>;
  }[] = [];
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    const entry = {
      query,
      added: [] as EventListenerOrEventListenerObject[],
      removed: [] as EventListenerOrEventListenerObject[],
      listeners: new Set<EventListenerOrEventListenerObject>(),
    };
    lists.push(entry);
    return {
      media: query,
      get matches() {
        return query.includes("dark") && dark;
      },
      addEventListener: (
        _type: string,
        listener: EventListenerOrEventListenerObject,
      ) => {
        entry.added.push(listener);
        entry.listeners.add(listener);
      },
      removeEventListener: (
        _type: string,
        listener: EventListenerOrEventListenerObject,
      ) => {
        entry.removed.push(listener);
        entry.listeners.delete(listener);
      },
    } as unknown as MediaQueryList;
  });
  return {
    lists,
    setDark(next: boolean) {
      dark = next;
      for (const entry of lists) {
        for (const listener of [...entry.listeners]) {
          (listener as EventListener)(new Event("change"));
        }
      }
    },
  };
}

describe("the theme", () => {
  it("follows the device's colour scheme by default, and its changes", async () => {
    const scheme = stubColourScheme("dark");
    const element = container();
    const handle = mountOn(element, harness());
    await drawn(handle);
    expect(element.getAttribute("data-theme")).toBe("dark");
    scheme.setDark(false);
    await vi.waitFor(() =>
      expect(element.getAttribute("data-theme")).toBe("light"),
    );
    scheme.setDark(true);
    await vi.waitFor(() =>
      expect(element.getAttribute("data-theme")).toBe("dark"),
    );
  });

  it("does not follow the device when the page chose a theme", async () => {
    const scheme = stubColourScheme("dark");
    const element = container();
    const handle = mountOn(element, harness(), { theme: "light" });
    await drawn(handle);
    scheme.setDark(true);
    expect(element.getAttribute("data-theme")).toBe("light");
  });

  it("stops listening for the device's colour scheme when the map is destroyed", async () => {
    const scheme = stubColourScheme("light");
    const handle = mountOn(container(), harness());
    await drawn(handle);
    const dark = scheme.lists.filter((entry) =>
      entry.query.includes("color-scheme"),
    );
    expect(dark.length).toBeGreaterThan(0);
    expect(dark.some((entry) => entry.added.length > 0)).toBe(true);
    handle.destroy();
    for (const entry of dark) {
      expect(entry.removed).toEqual(entry.added);
      expect(entry.listeners.size).toBe(0);
    }
  });

  it("is each map's own: one map's choice reaches no other", async () => {
    stubColourScheme("light");
    const first = container();
    const second = container();
    const a = mountOn(first, harness(), { theme: "light", label: "A" });
    await drawn(a);
    const b = mountOn(second, harness(), { theme: "dark", label: "B" });
    await drawn(b);
    expect(first.getAttribute("data-theme")).toBe("light");
    expect(second.getAttribute("data-theme")).toBe("dark");
    a.update({ theme: "dark" });
    await vi.waitFor(() =>
      expect(first.getAttribute("data-theme")).toBe("dark"),
    );
    b.update({ theme: "light" });
    await vi.waitFor(() =>
      expect(second.getAttribute("data-theme")).toBe("light"),
    );
    expect(first.getAttribute("data-theme")).toBe("dark");
  });
});

describe("setView with a view that is not one", () => {
  it.each([
    [{ zoom: Number.NaN }, /view\.zoom/],
    [{ zoom: "far" }, /view\.zoom/],
    [{ bearing: 360 }, /view\.bearing/],
    [{ center: { lat: 95, lng: 0 } }, /view\.center\.lat/],
    [{ center: { lat: 0 } }, /view\.center\.lng/],
    [{ center: null }, /view\.center\.lat/],
    [null, /view must be an object/],
  ])(
    "%j is refused at once, before the map is drawing and after",
    async (view, message) => {
      const tools = harness();
      const handle = mountOn(container(), tools);
      expect(() => handle.setView(view as never)).toThrow(message);
      await drawn(handle);
      expect(() => handle.setView(view as never)).toThrow(message);
      expect(handle.getView().zoom).toBeLessThan(4);
    },
  );

  it("accepts any one field, and none", async () => {
    const handle = mountOn(container(), harness());
    await drawn(handle);
    handle.setView({});
    handle.setView({ bearing: 0 });
    handle.setView({ center: { lat: 1, lng: 2 }, zoom: 4 });
    expect(handle.getView().zoom).toBe(4);
  });

  it("does nothing, and does not throw, after destroy", async () => {
    const handle = mountOn(container(), harness());
    await drawn(handle);
    handle.destroy();
    expect(() => handle.setView({ zoom: Number.NaN })).not.toThrow();
  });
});
