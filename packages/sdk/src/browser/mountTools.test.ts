// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  LocationError,
  type LocationProvider,
  SAMPLE_TILE_LAYER,
  SearchError,
  type SearchProvider,
  type SearchResult,
} from "@mapcairn/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MountMapError } from "./MountMapError";
import {
  button,
  container,
  destroyMounted,
  drawn,
  harness,
  mountOn,
} from "./testSupport";

afterEach(destroyMounted);

const PLACE: SearchResult = {
  id: "ben",
  label: "Ben Nevis",
  centre: { lat: 56.8, lng: -5 },
};

function searchProvider(results: readonly SearchResult[] = [PLACE]) {
  return {
    search: vi.fn<SearchProvider["search"]>(() => Promise.resolve(results)),
    reverse: vi.fn(() => Promise.resolve(null)),
  } as SearchProvider & { search: ReturnType<typeof vi.fn> };
}

function locationProvider(): LocationProvider {
  return {
    locate: vi.fn(() =>
      Promise.resolve({
        position: { lat: 51.5, lng: -0.12 },
        accuracyMetres: 30,
        timestamp: 0,
      }),
    ),
    watch: vi.fn(() => () => {}),
  } as unknown as LocationProvider;
}

function typeInto(input: HTMLInputElement, text: string): void {
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  set?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function field(element: HTMLElement): Promise<HTMLInputElement> {
  return vi.waitFor(() => {
    const found = element.querySelector<HTMLInputElement>('[role="combobox"]');
    expect(found).not.toBeNull();
    return found as HTMLInputElement;
  });
}

function enter(input: HTMLInputElement): void {
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
}

describe("no tools", () => {
  it("shows none of them, whatever providers the page wrote", async () => {
    const element = container();
    await drawn(
      mountOn(element, harness(), {
        services: { search: searchProvider(), location: locationProvider() },
      }),
    );
    expect(element.querySelector('[role="search"]')).toBeNull();
    expect(
      element.querySelector('[role="dialog"], [data-testid="sheet"]'),
    ).toBeNull();
    for (const name of [
      "Map options",
      "Measure distance and area",
      "Locate me",
      "Settings",
    ]) {
      expect(element.querySelector(`button[aria-label="${name}"]`)).toBeNull();
    }
  });
});

describe("the search tool", () => {
  it("appears when the page supplies a provider, and finds places through it", async () => {
    const provider = searchProvider();
    const element = container();
    const handle = mountOn(element, harness(), {
      tools: ["search"],
      services: { search: provider },
    });
    await drawn(handle);
    const input = await field(element);
    typeInto(input, "Ben");
    enter(input);
    await vi.waitFor(() => expect(provider.search).toHaveBeenCalled());
    expect(provider.search.mock.calls[0]?.[0]).toBe("Ben");
    const option = await vi.waitFor(() => {
      const found = element.querySelector<HTMLElement>('[role="option"]');
      expect(found?.textContent).toContain("Ben Nevis");
      return found as HTMLElement;
    });
    option.click();
    await vi.waitFor(() =>
      expect(handle.getView().center).toEqual(PLACE.centre),
    );
  });

  it("shows the search status when the page's provider throws a SearchError", async () => {
    const provider = searchProvider();
    provider.search.mockRejectedValue(new SearchError("offline"));
    const element = container();
    await drawn(
      mountOn(element, harness(), {
        tools: ["search"],
        services: { search: provider },
      }),
    );
    const input = await field(element);
    typeInto(input, "Ben");
    enter(input);
    await vi.waitFor(() =>
      expect(element.textContent).toContain(
        "Search is unavailable right now. Please try again.",
      ),
    );
  });

  it("is left out, with one warning that names the fix, when the page wrote no provider", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const element = container();
    await drawn(mountOn(element, harness(), { tools: ["search"] }));
    expect(element.querySelector('[role="search"]')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'tools: "search" needs a search provider, so it is not shown. Pass services.search, or remove "search" from tools.',
    );
  });

  it("refuses an unknown tool, and leaves the element free for another try", () => {
    const element = container();
    expect(() =>
      mountOn(element, harness(), { tools: ["searh" as never] }),
    ).toThrow(MountMapError);
    expect(element.hasAttribute("data-mapcairn")).toBe(false);
    expect(element.childNodes).toHaveLength(0);
  });
});

describe("the locate tool", () => {
  it("appears with a provider, asks it only when pressed, and moves the map to the fix", async () => {
    const provider = locationProvider();
    const element = container();
    const handle = mountOn(element, harness(), {
      tools: ["locate"],
      services: { location: provider },
    });
    await drawn(handle);
    const locate = await button(element, "Locate me");
    expect(provider.locate).not.toHaveBeenCalled();
    locate.click();
    await vi.waitFor(() => expect(provider.locate).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(handle.getView().center.lat).toBeCloseTo(51.5, 1),
    );
    expect(handle.getView().center.lng).toBeCloseTo(-0.12, 1);
  });

  it("fits a very coarse fix to a capped circle, at the closest zoom and with padding", async () => {
    const provider = locationProvider();
    (provider.locate as ReturnType<typeof vi.fn>).mockResolvedValue({
      position: { lat: 51.5, lng: -0.12 },
      accuracyMetres: 1_000_000,
      timestamp: 0,
    });
    const tools = harness();
    const element = container();
    await drawn(
      mountOn(element, tools, {
        tools: ["locate"],
        services: { location: provider },
      }),
    );
    const fit = vi.spyOn(
      tools.adapters[0] as unknown as {
        fitBounds: (...args: unknown[]) => void;
      },
      "fitBounds",
    );
    (await button(element, "Locate me")).click();
    await vi.waitFor(() => expect(fit).toHaveBeenCalledTimes(1));
    const [bounds, options] = fit.mock.calls[0] as unknown as [
      { south: number; west: number; north: number; east: number },
      { maxZoom: number; padding: { top: number } },
    ];
    expect(bounds.north - bounds.south).toBeLessThan(1);
    expect(bounds.north - bounds.south).toBeGreaterThan(0.3);
    expect(options.maxZoom).toBe(15);
    expect(options.padding.top).toBe(32);
  });

  it("says why in the page when the provider fails, with a way to try again", async () => {
    const provider = locationProvider();
    (provider.locate as ReturnType<typeof vi.fn>).mockRejectedValue(
      new LocationError("denied"),
    );
    const element = container();
    await drawn(
      mountOn(element, harness(), {
        tools: ["locate"],
        services: { location: provider },
      }),
    );
    (await button(element, "Locate me")).click();
    await vi.waitFor(() =>
      expect(
        [...element.querySelectorAll('[role="alert"]')].map(
          (node) => node.textContent,
        ),
      ).toContainEqual(expect.stringContaining("Location access is blocked")),
    );
    const retry = [...element.querySelectorAll<HTMLElement>("button")].find(
      (node) => node.textContent?.trim() === "Try again",
    );
    retry?.click();
    await vi.waitFor(() => expect(provider.locate).toHaveBeenCalledTimes(2));
  });

  it("is left out, with one warning that names the fix, when the page wrote no provider", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const element = container();
    await drawn(mountOn(element, harness(), { tools: ["locate"] }));
    expect(element.querySelector('button[aria-label="Locate me"]')).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      'tools: "locate" needs a location provider, so it is not shown. Pass services.location, or remove "locate" from tools.',
    );
  });

  it("is not there when the tool is not named, even with a provider", async () => {
    const element = container();
    await drawn(
      mountOn(element, harness(), {
        tools: ["measure"],
        services: { location: locationProvider() },
      }),
    );
    expect(element.querySelector('button[aria-label="Locate me"]')).toBeNull();
    expect(
      element.querySelector('button[aria-label="Measure distance and area"]'),
    ).not.toBeNull();
  });
});

describe("the measure tool", () => {
  it("measures from clicks on the map, still reports each click and ends with Done", async () => {
    const tools = harness();
    const element = container();
    const handle = mountOn(element, tools, { tools: ["measure"] });
    const clicks: unknown[] = [];
    handle.on("click", (position) => clicks.push(position));
    await drawn(handle);
    (await button(element, "Measure distance and area")).click();
    await vi.waitFor(() =>
      expect(
        element.querySelector(
          '[role="toolbar"], [data-testid="measure-toolbar"]',
        ),
      ).not.toBeNull(),
    );
    tools.adapters[0]?.simulateClick({ lat: 10, lng: 10 });
    tools.adapters[0]?.simulateClick({ lat: 10, lng: 11 });
    await vi.waitFor(() => expect(element.textContent).toMatch(/km/));
    expect(clicks).toHaveLength(2);
  });
});

describe("the measure tool's focus", () => {
  it("returns to Measure when the toolbar is done", async () => {
    const element = container();
    await drawn(mountOn(element, harness(), { tools: ["measure"] }));
    const measure = await button(element, "Measure distance and area");
    measure.focus();
    measure.click();
    const done = await vi.waitFor(() => {
      const found = [...element.querySelectorAll<HTMLElement>("button")].find(
        (node) => node.textContent?.trim() === "Done",
      );
      expect(found).toBeDefined();
      return found as HTMLElement;
    });
    done.click();
    await vi.waitFor(() => expect(document.activeElement).toBe(measure));
  });
});

describe("search, pin and measure from the centre", () => {
  it("fits a result that has an extent", async () => {
    const provider = searchProvider([
      { ...PLACE, bounds: { south: 56, west: -6, north: 57, east: -4 } },
    ]);
    const element = container();
    const tools = harness();
    await drawn(
      mountOn(element, tools, {
        tools: ["search"],
        services: { search: provider },
      }),
    );
    const fit = vi.spyOn(
      tools.adapters[0] as unknown as {
        fitBounds: (...args: unknown[]) => void;
      },
      "fitBounds",
    );
    const input = await field(element);
    typeInto(input, "Ben");
    enter(input);
    const option = await vi.waitFor(() => {
      const found = element.querySelector<HTMLElement>('[role="option"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    option.click();
    await vi.waitFor(() => expect(fit).toHaveBeenCalledTimes(1));
  });

  it("drops a pin from the sheet", async () => {
    const element = container();
    await drawn(mountOn(element, harness(), { tools: ["map-options"] }));
    (await button(element, "Map options")).click();
    const drop = await vi.waitFor(() => {
      const found = element.querySelector<HTMLElement>(
        '[data-testid="drop-pin-button"]',
      );
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    drop.click();
    await vi.waitFor(() =>
      expect(
        element.querySelector('[data-testid="pin-marker"]'),
      ).not.toBeNull(),
    );
  });

  it("adds a measure point at the centre of the map", async () => {
    const element = container();
    await drawn(mountOn(element, harness(), { tools: ["measure"] }));
    (await button(element, "Measure distance and area")).click();
    const add = await vi.waitFor(() => {
      const found = element.querySelector<HTMLElement>(
        '[data-testid="measure-add-point"]',
      );
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    const undoBefore = element.querySelector<HTMLButtonElement>(
      '[data-testid="measure-undo"]',
    );
    expect(undoBefore?.getAttribute("aria-disabled")).toBe("true");
    add.click();
    await vi.waitFor(() =>
      expect(
        element
          .querySelector<HTMLButtonElement>('[data-testid="measure-undo"]')
          ?.getAttribute("aria-disabled"),
      ).toBeNull(),
    );
  });
});

describe("the buttons that open and close", () => {
  it("close the sheet when pressed again", async () => {
    const element = container();
    await drawn(mountOn(element, harness(), { tools: ["map-options"] }));
    const opener = await button(element, "Map options");
    opener.click();
    await vi.waitFor(() =>
      expect(opener.getAttribute("aria-expanded")).toBe("true"),
    );
    opener.click();
    await vi.waitFor(() =>
      expect(opener.getAttribute("aria-expanded")).toBe("false"),
    );
  });

  it("end measuring when Measure is pressed again", async () => {
    const element = container();
    await drawn(mountOn(element, harness(), { tools: ["measure"] }));
    const measure = await button(element, "Measure distance and area");
    measure.click();
    await vi.waitFor(() =>
      expect(
        element.querySelector('[data-testid="measure-toolbar"]'),
      ).not.toBeNull(),
    );
    measure.click();
    await vi.waitFor(() =>
      expect(
        element.querySelector('[data-testid="measure-toolbar"]'),
      ).toBeNull(),
    );
  });
});

describe("the sheet", () => {
  it("opens with the basemaps, and a basemap picked there outlasts a theme change", async () => {
    const tools = harness();
    const element = container();
    const handle = mountOn(element, tools, { tools: ["map-options"] });
    await drawn(handle);
    const opener = await button(element, "Map options");
    opener.click();
    const radios = await vi.waitFor(() => {
      const found = element.querySelectorAll<HTMLInputElement>(
        '[role="radiogroup"] input[type="radio"]',
      );
      expect(found.length).toBeGreaterThan(1);
      return [...found];
    });
    const other = radios.find((radio) => !radio.checked) as HTMLInputElement;
    other.click();
    await vi.waitFor(() => {
      expect(tools.adapters[0]?.setBasemap).toHaveBeenCalledWith(
        expect.objectContaining({ id: other.value }),
      );
    });
    handle.update({ theme: "dark" });
    await vi.waitFor(() =>
      expect(
        element.querySelector<HTMLInputElement>(`input[value="${other.value}"]`)
          ?.checked,
      ).toBe(true),
    );
  });

  it("is named by the catalogue and by the map's label", async () => {
    const element = container();
    await drawn(
      mountOn(element, harness(), { tools: ["map-options"], label: "North" }),
    );
    (await button(element, "Map options")).click();
    await vi.waitFor(() =>
      expect(element.textContent).toContain("Map options (North)"),
    );
  });

  it("returns focus to the button that opened it when it closes", async () => {
    const element = container();
    await drawn(
      mountOn(element, harness(), { tools: ["settings", "map-options"] }),
    );
    const opener = await button(element, "Settings");
    opener.focus();
    opener.click();
    const close = await button(element, "Close");
    close.click();
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("closes on Escape and returns focus to the button that opened it, for each sheet", async () => {
    for (const name of ["Map options", "Settings"]) {
      const element = container();
      const handle = mountOn(element, harness(), {
        tools: ["map-options", "settings"],
      });
      await drawn(handle);
      const opener = await button(element, name);
      opener.focus();
      opener.click();
      const content = await vi.waitFor(() => {
        const found = element.querySelector<HTMLElement>(
          '[data-testid="sheet-content"]',
        );
        expect(found, name).not.toBeNull();
        return found as HTMLElement;
      });
      content.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await vi.waitFor(() => expect(document.activeElement).toBe(opener));
      handle.destroy();
    }
  });

  it("lists the layers the page gave, without the reference site's own introduction", async () => {
    const element = container();
    await drawn(
      mountOn(element, harness(), {
        tools: ["map-options"],
        layers: [SAMPLE_TILE_LAYER],
      }),
    );
    (await button(element, "Map options")).click();
    await vi.waitFor(() =>
      expect(element.textContent).toContain(String(SAMPLE_TILE_LAYER.name)),
    );
    expect(element.textContent).not.toContain(
      "Open data from public providers",
    );
  });

  it("has no layers section when the page gave no layers", async () => {
    const element = container();
    await drawn(mountOn(element, harness(), { tools: ["map-options"] }));
    (await button(element, "Map options")).click();
    await vi.waitFor(() =>
      expect(
        element.querySelector('[data-testid="sheet-content"]'),
      ).not.toBeNull(),
    );
    expect(
      element.querySelector('[data-testid="sheet-section-layers"]'),
    ).toBeNull();
  });

  it("does not show, or load, layers when the sheet is not a tool, and does not throw", async () => {
    const load = vi.fn(() => Promise.resolve([SAMPLE_TILE_LAYER]));
    const element = container();
    await drawn(
      mountOn(element, harness(), { tools: ["measure"], layers: load }),
    );
    expect(
      element.querySelector('[data-testid="sheet-section-layers"]'),
    ).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});

describe("Settings and Help on a mounted map", () => {
  async function openSettings(tools: readonly ("search" | "settings")[]) {
    const element = container();
    await drawn(
      mountOn(element, harness(), {
        tools,
        services: { search: searchProvider() },
      }),
    );
    (await button(element, "Settings")).click();
    await vi.waitFor(() =>
      expect(
        element.querySelector('[data-testid="sheet-section-help"]'),
      ).not.toBeNull(),
    );
    return element;
  }

  it("shows no privacy link or reference to a policy the page does not have", async () => {
    const element = await openSettings(["settings"]);
    expect(element.textContent).not.toContain("Read the privacy policy");
    expect(element.querySelector('a[href="/privacy"]')).toBeNull();
    expect(element.textContent).not.toContain("privacy policy");
  });

  it("leaves the Search and coordinate help out without the search tool", async () => {
    const element = await openSettings(["settings"]);
    expect(element.querySelector('[data-testid="help-search"]')).toBeNull();
    expect(element.textContent).not.toContain("MGRS");
    expect(
      element.querySelector('[data-testid="help-keyboard"]'),
    ).not.toBeNull();
  });

  it("describes Search and the coordinate formats with the search tool", async () => {
    const element = await openSettings(["search", "settings"]);
    expect(
      element.querySelector('[data-testid="help-search"]')?.textContent,
    ).toContain("MGRS");
  });
});
