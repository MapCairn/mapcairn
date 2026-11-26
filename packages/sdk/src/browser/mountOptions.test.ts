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
        tools: ["layers"],
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
      mountOn(element, harness(), { tools: ["layers"], layers: load }),
    );
    await openMapOptions(element);
    await layerSwitch(element, SAMPLE_TILE_LAYER.id);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("report a definition a function returned that is not valid, through the error event, and show the rest", async () => {
    const element = container();
    const broken = { ...SAMPLE_TILE_LAYER, id: "broken", name: 3 };
    const handle = mountOn(element, harness(), {
      tools: ["layers"],
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
      tools: ["layers"],
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
      mountOn(element, harness(), { tools: ["layers"], layers: [broken] }),
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
        tools: ["layers"],
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
    await vi.waitFor(() => expect(source.requests.length).toBeGreaterThan(0));
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
  });

  it("report a tap on a feature as a featuretap event, and not while measuring", async () => {
    const source = sourceWithFeatures();
    const tools = harness();
    const element = container();
    const handle = mountOn(element, tools, {
      tools: ["layers", "measure"],
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
        tools: ["basemaps", "settings"],
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
        tools: ["basemaps", "settings"],
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

describe("a map with every tool", () => {
  const everything = (source: FakeLayerSource) => ({
    tools: [
      "search",
      "basemaps",
      "layers",
      "measure",
      "settings",
      "locate",
    ] as const,
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

  it("calls no stand-in port while the tools are drawn and used", async () => {
    const calls: string[] = [];
    const failing = <T extends object>(name: string): T =>
      new Proxy({} as T, {
        get: (_target, property) => {
          calls.push(`${name}.${String(property)}`);
          return () => {
            throw new Error(`${name}.${String(property)} was called`);
          };
        },
      });
    const tools = harness();
    const element = container();
    const options = everything(sourceWithFeatures());
    const handle = remember(
      mount(element, options as never, {
        ...tools.dependencies,
        decorateServices: (services: Services): Services => ({
          ...services,
          clipboard: failing("clipboard"),
          fileOpener: failing("fileOpener"),
        }),
      }),
    );
    await drawn(handle);
    await openMapOptions(element);
    (await layerSwitch(element, SAMPLE_TILE_LAYER.id)).click();
    (await button(element, "Close")).click();
    (await button(element, "Settings")).click();
    await vi.waitFor(() =>
      expect(
        element.querySelector('[data-testid="sheet-content"]'),
      ).not.toBeNull(),
    );
    (await button(element, "Measure distance and area")).click();
    expect(calls).toEqual([]);
  });

  it("keeps two maps' tools apart", async () => {
    const tools = harness();
    const first = container();
    const second = container();
    const one = mountOn(first, tools, { tools: ["basemaps"], label: "One" });
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
