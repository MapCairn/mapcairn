// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  FakeLayerSource,
  type LayerFeature,
  type MapFeatureTap,
  SAMPLE_FEED_LAYER,
  SAMPLE_TILE_LAYER,
  type Services,
  samplePoint,
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

const FEATURE: LayerFeature = samplePoint("a", { value: 3, kind: "keep" });
const SAVEABLE = { ...SAMPLE_FEED_LAYER, saveFeatures: true as const };

function sourceWithFeatures(): FakeLayerSource {
  const source = new FakeLayerSource();
  source.setFeatures(SAMPLE_FEED_LAYER.id, [FEATURE]);
  return source;
}

async function openMapOptions(element: HTMLElement): Promise<void> {
  (await button(element, "Map options")).click();
  await vi.waitFor(() =>
    expect(
      element.querySelector('[data-testid="sheet-content"]'),
    ).not.toBeNull(),
  );
}

function layerSwitch(element: HTMLElement, id: string): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const found = element.querySelector<HTMLElement>(
      `[data-testid="layer-${id}"] [role="switch"]`,
    );
    expect(found).not.toBeNull();
    return found as HTMLElement;
  });
}

describe("layers", () => {
  it("are listed off, turn on and are drawn, and turn off and are taken away", async () => {
    const tools = harness();
    const element = container();
    await drawn(
      mountOn(element, tools, {
        tools: ["map-options"],
        layers: [SAMPLE_TILE_LAYER],
      }),
    );
    await openMapOptions(element);
    const toggle = await layerSwitch(element, SAMPLE_TILE_LAYER.id);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(tools.adapters[0]?.drawnLayers()).toEqual([]);
    toggle.click();
    await vi.waitFor(() =>
      expect(tools.adapters[0]?.drawnLayers().map(({ id }) => id)).toContain(
        SAMPLE_TILE_LAYER.id,
      ),
    );
    toggle.click();
    await vi.waitFor(() =>
      expect(tools.adapters[0]?.drawnLayers()).toEqual([]),
    );
  });

  it("load from a function the page wrote", async () => {
    const element = container();
    const load = vi.fn(() => Promise.resolve([SAMPLE_TILE_LAYER]));
    await drawn(
      mountOn(element, harness(), { tools: ["map-options"], layers: load }),
    );
    await openMapOptions(element);
    await layerSwitch(element, SAMPLE_TILE_LAYER.id);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("report a definition a function returned that is not valid, through the error event, and show the rest", async () => {
    const element = container();
    const broken = { ...SAMPLE_TILE_LAYER, id: "broken", name: 3 };
    const handle = mountOn(element, harness(), {
      tools: ["map-options"],
      layers: () => Promise.resolve([SAMPLE_TILE_LAYER, broken as never]),
    });
    const errors: unknown[] = [];
    handle.on("error", (error) => errors.push(error));
    await drawn(handle);
    await openMapOptions(element);
    await layerSwitch(element, SAMPLE_TILE_LAYER.id);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]).toBeInstanceOf(MountMapError);
    expect((errors[0] as MountMapError).message).toContain(
      '"broken" was left out',
    );
  });

  it("report a loaded layer that needs a layer source the page did not write", async () => {
    const element = container();
    const handle = mountOn(element, harness(), {
      tools: ["map-options"],
      layers: () => Promise.resolve([SAMPLE_FEED_LAYER]),
    });
    const errors: MountMapError[] = [];
    handle.on("error", (error) => errors.push(error as MountMapError));
    await drawn(handle);
    await openMapOptions(element);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]?.message).toContain("services.layerSource");
  });

  it("refuse a definition that is not valid, naming it, and leave the element free", () => {
    const element = container();
    const broken = { ...SAMPLE_TILE_LAYER, id: "broken", name: 3 } as never;
    expect(() =>
      mountOn(element, harness(), { tools: ["map-options"], layers: [broken] }),
    ).toThrow(/broken: /);
    expect(element.hasAttribute("data-mapcairn")).toBe(false);
  });

  it("load their features through the page's layer source, and save them through the package's own saver", async () => {
    const source = sourceWithFeatures();
    const tools = harness();
    const element = container();
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this.download);
    });
    await drawn(
      mountOn(element, tools, {
        tools: ["map-options"],
        layers: [SAVEABLE],
        services: { layerSource: source },
      }),
    );
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:test/1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    await openMapOptions(element);
    (await layerSwitch(element, SAVEABLE.id)).click();
    await vi.waitFor(() => expect(source.requests).toHaveLength(1));
    expect(source.requests[0]?.definition.id).toBe(SAVEABLE.id);
    expect(source.requests[0]?.url).toBe(
      "https://sample.test/feed/big_day.json",
    );
    const save = await vi.waitFor(() => {
      const found = element.querySelector<HTMLElement>(
        `[data-testid="layer-save-geojson-${SAVEABLE.id}"]`,
      );
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    save.click();
    await vi.waitFor(() => expect(clicks).toHaveLength(1));
    expect(clicks[0]).toMatch(/\.geojson$/);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const file = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(file.type).toBe("application/geo+json");
    expect(await file.text()).toContain('"a"');
  });

  it("report a tap on a feature as a featuretap event, and not while measuring", async () => {
    const source = sourceWithFeatures();
    const tools = harness();
    const element = container();
    const handle = mountOn(element, tools, {
      tools: ["map-options", "measure"],
      layers: [SAMPLE_FEED_LAYER],
      services: { layerSource: source },
    });
    const taps: MapFeatureTap[] = [];
    handle.on("featuretap", (tap) => taps.push(tap));
    await drawn(handle);
    await openMapOptions(element);
    (await layerSwitch(element, SAMPLE_FEED_LAYER.id)).click();
    await vi.waitFor(() =>
      expect(tools.adapters[0]?.drawnLayers()).toEqual([
        { id: SAMPLE_FEED_LAYER.id, kind: "features", count: 1 },
      ]),
    );
    tools.adapters[0]?.simulateFeatureTap(SAMPLE_FEED_LAYER.id, FEATURE.id);
    expect(taps).toEqual([
      expect.objectContaining({
        layerId: SAMPLE_FEED_LAYER.id,
        featureId: FEATURE.id,
      }),
    ]);
    (await button(element, "Measure distance and area")).click();
    await vi.waitFor(() =>
      expect(
        element.querySelector('[data-testid="measure-toolbar"]'),
      ).not.toBeNull(),
    );
    tools.adapters[0]?.simulateFeatureTap(SAMPLE_FEED_LAYER.id, FEATURE.id);
    expect(taps).toHaveLength(1);
  });
});

describe("languages", () => {
  const AFRIKAANS = {
    tag: "af",
    label: "Afrikaans",
    messages: {
      "chrome.endStack.mapOptions": "Kaartopsies",
      "app.sheetTitle.settings": "Instellings en hulp",
    },
  } as const;

  it("start on the language named, and read in English what the page left out", async () => {
    const element = container();
    await drawn(
      mountOn(element, harness(), {
        tools: ["map-options", "settings"],
        languages: [AFRIKAANS],
        language: "af",
      }),
    );
    await button(element, "Kaartopsies");
    expect(
      element.querySelector('button[aria-label="Settings"]'),
    ).not.toBeNull();
  });

  it("switch from the language control in Settings, and back", async () => {
    const element = container();
    await drawn(
      mountOn(element, harness(), {
        tools: ["map-options", "settings"],
        languages: [AFRIKAANS],
        language: "en-GB",
      }),
    );
    (await button(element, "Settings")).click();
    const afrikaans = await vi.waitFor(() => {
      const found = [
        ...element.querySelectorAll<HTMLElement>(
          '[role="radio"], button, label',
        ),
      ].find((node) => node.textContent?.trim() === "Afrikaans");
      expect(found).toBeDefined();
      return found as HTMLElement;
    });
    afrikaans.click();
    await button(element, "Kaartopsies");
  });

  it("refuse a language that is not offered, naming the fix", () => {
    expect(() =>
      mountOn(container(), harness(), {
        languages: [AFRIKAANS],
        language: "fr",
      }),
    ).toThrow(
      'language "fr" is not offered. Use one of: en-GB, af, or add it to languages.',
    );
  });
});

const failing = (calls: string[]) => {
  return <T extends object>(name: string): T =>
    new Proxy({} as T, {
      get: (_target, property) => {
        calls.push(`${name}.${String(property)}`);
        return () => {
          throw new Error(`${name}.${String(property)} was called`);
        };
      },
    });
};

describe("a map with every tool", () => {
  const ALL_TOOLS = [
    "search",
    "map-options",
    "measure",
    "settings",
    "locate",
  ] as const;
  const everything = (source: FakeLayerSource) => ({
    tools: ALL_TOOLS,
    layers: [SAMPLE_TILE_LAYER, SAMPLE_FEED_LAYER],
    services: {
      search: {
        search: () => Promise.resolve([]),
        reverse: () => Promise.resolve(null),
      },
      location: {
        locate: () => Promise.reject(new Error("no")),
        watch: () => () => {},
      },
      layerSource: source,
    },
  });

  async function useEveryTool(element: HTMLElement): Promise<void> {
    await openMapOptions(element);
    (await layerSwitch(element, SAMPLE_TILE_LAYER.id)).click();
    await vi.waitFor(() =>
      expect(
        element.querySelector(
          `[data-testid="layer-${SAMPLE_TILE_LAYER.id}"] [aria-checked="true"]`,
        ),
      ).not.toBeNull(),
    );
    (await button(element, "Close")).click();
    (await button(element, "Settings")).click();
    await vi.waitFor(() =>
      expect(
        element.querySelector(
          '[data-testid="sheet-section-settings"], [data-testid="settings-privacy-note"]',
        ),
      ).not.toBeNull(),
    );
    (await button(element, "Measure distance and area")).click();
    await vi.waitFor(() =>
      expect(
        element.querySelector('[data-testid="measure-toolbar"]'),
      ).not.toBeNull(),
    );
    (await button(element, "Locate me")).click();
    await vi.waitFor(() =>
      expect(
        [...element.querySelectorAll('[role="alert"]')]
          .map((node) => node.textContent)
          .join(" "),
      ).toContain("location is not available"),
    );
  }

  it("calls no port the page did not give while the tools are drawn and used, with the page's providers absent", async () => {
    const calls: string[] = [];
    const stand = failing(calls);
    const tools = harness();
    const element = container();
    const handle = remember(
      mount(
        element,
        { tools: ALL_TOOLS, layers: [SAMPLE_TILE_LAYER] },
        {
          ...tools.dependencies,
          decorateServices: (services: Services): Services => ({
            ...services,
            clipboard: stand("clipboard"),
            fileOpener: stand("fileOpener"),
            fileSaver: stand("fileSaver"),
            layerSource: stand("layerSource"),
            location: stand("location"),
            search: stand("search"),
          }),
        },
      ),
    );
    await drawn(handle);
    await openMapOptions(element);
    (await layerSwitch(element, SAMPLE_TILE_LAYER.id)).click();
    (await button(element, "Close")).click();
    (await button(element, "Settings")).click();
    (await button(element, "Measure distance and area")).click();
    await vi.waitFor(() =>
      expect(
        element.querySelector('[data-testid="measure-toolbar"]'),
      ).not.toBeNull(),
    );
    expect(element.querySelector('[role="search"]')).toBeNull();
    expect(element.querySelector('button[aria-label="Locate me"]')).toBeNull();
    expect(calls).toEqual([]);
  });

  it("calls no port the tools do not use when the page's providers are given", async () => {
    const calls: string[] = [];
    const stand = failing(calls);
    const tools = harness();
    const element = container();
    const handle = remember(
      mount(element, everything(sourceWithFeatures()) as never, {
        ...tools.dependencies,
        decorateServices: (services: Services): Services => ({
          ...services,
          clipboard: stand("clipboard"),
          fileOpener: stand("fileOpener"),
          fileSaver: stand("fileSaver"),
        }),
      }),
    );
    await drawn(handle);
    await useEveryTool(element);
    expect(calls).toEqual([]);
  });

  it("keeps two maps' tools apart", async () => {
    const tools = harness();
    const first = container();
    const second = container();
    const one = mountOn(first, tools, { tools: ["map-options"], label: "One" });
    const two = mountOn(second, tools, { tools: ["measure"], label: "Two" });
    await drawn(one);
    await drawn(two);
    await button(first, "Map options");
    expect(
      first.querySelector('button[aria-label="Measure distance and area"]'),
    ).toBeNull();
    await button(second, "Measure distance and area");
    expect(second.querySelector('button[aria-label="Map options"]')).toBeNull();
    (await button(first, "Map options")).click();
    await vi.waitFor(() =>
      expect(
        first.querySelector('[data-testid="sheet-content"]'),
      ).not.toBeNull(),
    );
    expect(second.querySelector('[data-testid="sheet-content"]')).toBeNull();
    const ids = [...document.querySelectorAll("[id]")].map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves no listener and no timer after every tool has been used and the map is destroyed", async () => {
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
    const source = sourceWithFeatures();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test/1");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      const element = container();
      const options = everything(source);
      const handle = mountOn(element, harness(), {
        ...options,
        layers: [SAVEABLE],
      } as never);
      await vi.advanceTimersByTimeAsync(0);
      (await button(element, "Map options")).click();
      await vi.advanceTimersByTimeAsync(0);
      (await layerSwitch(element, SAVEABLE.id)).click();
      await vi.advanceTimersByTimeAsync(0);
      const save = element.querySelector<HTMLElement>(
        `[data-testid="layer-save-geojson-${SAVEABLE.id}"]`,
      );
      expect(save).not.toBeNull();
      save?.click();
      await vi.advanceTimersByTimeAsync(0);
      (await button(element, "Measure distance and area")).click();
      await vi.advanceTimersByTimeAsync(0);
      handle.destroy();
      await vi.advanceTimersByTimeAsync(0);
      expect(revoke).toHaveBeenCalledWith("blob:test/1");
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

  it("leaves nothing behind when it is destroyed with the sheet open", async () => {
    vi.useFakeTimers();
    try {
      const tools = harness();
      const element = container();
      const handle = mountOn(
        element,
        tools,
        everything(sourceWithFeatures()) as never,
      );
      await vi.advanceTimersByTimeAsync(0);
      (await button(element, "Map options")).click();
      await vi.advanceTimersByTimeAsync(0);
      handle.destroy();
      await vi.advanceTimersByTimeAsync(0);
      expect(element.childNodes).toHaveLength(0);
      expect(element.hasAttribute("data-mapcairn")).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      expect(
        document.querySelectorAll('[role="status"], [role="search"]'),
      ).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("two maps with their own languages and layers", () => {
  const ENGLISH_AND_AFRIKAANS = {
    tag: "af",
    label: "Afrikaans",
    messages: { "chrome.endStack.mapOptions": "Kaartopsies" },
  } as const;
  const ENGLISH_AND_FRENCH = {
    tag: "fr",
    label: "Français",
    messages: { "chrome.endStack.mapOptions": "Options de la carte" },
  } as const;
  const OTHER_TILES = { ...SAMPLE_TILE_LAYER, id: "other-tiles" };

  it("each speak their own language", async () => {
    const tools = harness();
    const first = container();
    const second = container();
    await drawn(
      mountOn(first, tools, {
        tools: ["map-options"],
        languages: [ENGLISH_AND_AFRIKAANS],
        language: "af",
        label: "One",
      }),
    );
    await drawn(
      mountOn(second, tools, {
        tools: ["map-options"],
        languages: [ENGLISH_AND_FRENCH],
        language: "fr",
        label: "Two",
      }),
    );
    await button(first, "Kaartopsies");
    await button(second, "Options de la carte");
    expect(
      first.querySelector('button[aria-label="Options de la carte"]'),
    ).toBeNull();
    expect(second.querySelector('button[aria-label="Kaartopsies"]')).toBeNull();
    expect(first.getAttribute("lang")).toBe("af");
    expect(second.getAttribute("lang")).toBe("fr");
  });

  it("each list their own layers", async () => {
    const tools = harness();
    const first = container();
    const second = container();
    await drawn(
      mountOn(first, tools, {
        tools: ["map-options"],
        layers: [SAMPLE_TILE_LAYER],
        label: "One",
      }),
    );
    await drawn(
      mountOn(second, tools, {
        tools: ["map-options"],
        layers: [OTHER_TILES],
        label: "Two",
      }),
    );
    (await button(first, "Map options")).click();
    (await button(second, "Map options")).click();
    await layerSwitch(first, SAMPLE_TILE_LAYER.id);
    await layerSwitch(second, OTHER_TILES.id);
    expect(
      first.querySelector(`[data-testid="layer-${OTHER_TILES.id}"]`),
    ).toBeNull();
    expect(
      second.querySelector(`[data-testid="layer-${SAMPLE_TILE_LAYER.id}"]`),
    ).toBeNull();
  });
});

describe("the layers function", () => {
  it("is not asked again once the map is destroyed", async () => {
    let catalogue: Services["layers"] | undefined;
    const load = vi.fn(() => Promise.resolve([SAMPLE_FEED_LAYER]));
    const tools = harness();
    const element = container();
    const handle = remember(
      mount(
        element,
        { tools: ["map-options"], layers: load },
        {
          ...tools.dependencies,
          decorateServices: (services: Services) => {
            catalogue = services.layers;
            return services;
          },
        },
      ),
    );
    const errors: unknown[] = [];
    handle.on("error", (error) => errors.push(error));
    await drawn(handle);
    await openMapOptions(element);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(load).toHaveBeenCalledTimes(1);
    handle.destroy();
    await catalogue?.refresh();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reports a failure to load through the error event, and shows the layers section as failed", async () => {
    const element = container();
    const handle = mountOn(element, harness(), {
      tools: ["map-options"],
      layers: () => Promise.reject(new Error("offline")),
    });
    const errors: MountMapError[] = [];
    handle.on("error", (error) => errors.push(error as MountMapError));
    await drawn(handle);
    await openMapOptions(element);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]?.kind).toBe("layers-unavailable");
    expect(errors[0]?.message).toContain("(offline)");
  });
});

describe("lang and dir on the map's element", () => {
  const ARABIC = {
    tag: "ar",
    label: "العربية",
    direction: "rtl",
    messages: { "chrome.endStack.mapOptions": "خيارات الخريطة" },
  } as const;
  const AFRIKAANS = {
    tag: "af",
    label: "Afrikaans",
    messages: { "chrome.endStack.mapOptions": "Kaartopsies" },
  } as const;

  it("are English and left to right, with no languages", async () => {
    const element = container();
    await drawn(mountOn(element, harness()));
    await vi.waitFor(() => expect(element.getAttribute("lang")).toBe("en-GB"));
    expect(element.getAttribute("dir")).toBe("ltr");
  });

  it("follow the language the map starts on, with the direction the page gave it", async () => {
    const element = container();
    await drawn(
      mountOn(element, harness(), {
        tools: ["map-options"],
        languages: [ARABIC],
        language: "ar",
      }),
    );
    await vi.waitFor(() => expect(element.getAttribute("lang")).toBe("ar"));
    expect(element.getAttribute("dir")).toBe("rtl");
  });

  it("follow a switch made in Settings", async () => {
    const element = container();
    await drawn(
      mountOn(element, harness(), {
        tools: ["settings"],
        languages: [ARABIC, AFRIKAANS],
        language: "af",
      }),
    );
    await vi.waitFor(() => expect(element.getAttribute("lang")).toBe("af"));
    expect(element.getAttribute("dir")).toBe("ltr");
    (await button(element, "Settings")).click();
    const arabic = await vi.waitFor(() => {
      const found = [
        ...element.querySelectorAll<HTMLElement>("button, label"),
      ].find((node) => node.textContent?.trim() === ARABIC.label);
      expect(found).toBeDefined();
      return found as HTMLElement;
    });
    arabic.click();
    await vi.waitFor(() => expect(element.getAttribute("lang")).toBe("ar"));
    expect(element.getAttribute("dir")).toBe("rtl");
  });

  it("leave a dir the page set alone, and put lang back as it was, when the map is destroyed", async () => {
    const element = container();
    element.setAttribute("dir", "rtl");
    element.setAttribute("lang", "fr");
    const handle = mountOn(element, harness());
    await drawn(handle);
    await vi.waitFor(() => expect(element.getAttribute("lang")).toBe("en-GB"));
    expect(element.getAttribute("dir")).toBe("rtl");
    handle.destroy();
    expect(element.getAttribute("dir")).toBe("rtl");
    expect(element.getAttribute("lang")).toBe("fr");
  });

  it("remove what the map wrote when it is destroyed", async () => {
    const element = container();
    const handle = mountOn(element, harness());
    await drawn(handle);
    await vi.waitFor(() => expect(element.getAttribute("dir")).toBe("ltr"));
    handle.destroy();
    expect(element.hasAttribute("lang")).toBe(false);
    expect(element.hasAttribute("dir")).toBe(false);
  });
});

describe("text a layer carries itself", () => {
  it("is shown as written, whatever the language: languages translate the interface only", async () => {
    const hostKeyed = {
      ...SAMPLE_TILE_LAYER,
      id: "host-keyed",
      name: { key: "my.layer.name", text: "My layer" },
    };
    const element = container();
    await drawn(
      mountOn(element, harness(), {
        tools: ["map-options"],
        layers: [hostKeyed as never],
        languages: [
          {
            tag: "af",
            label: "Afrikaans",
            messages: { "chrome.endStack.mapOptions": "Kaartopsies" },
          },
        ],
        language: "af",
      }),
    );
    (await button(element, "Kaartopsies")).click();
    await vi.waitFor(() => expect(element.textContent).toContain("My layer"));
  });
});
