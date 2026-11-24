// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { BASEMAPS } from "@mapcairn/core";
import type { ModelContextProvider } from "@mapcairn/react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExampleApp } from "./ExampleApp";
import { EXAMPLE_THEMES } from "./exampleThemes";

const warn = vi.spyOn(console, "warn");

beforeEach(() => {
  warn.mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  warn.mockReset();
  document.documentElement.removeAttribute("data-theme");
});

/** Renders the page and returns queries over the first map's wrapper. */
function renderPine() {
  render(<ExampleApp />);
  return within(screen.getByTestId("map-pine"));
}

describe("ExampleApp", () => {
  it("shows two maps, each in a wrapper with its own theme class and its own ids", () => {
    render(<ExampleApp />);

    const wrappers = EXAMPLE_THEMES.map((theme) =>
      screen.getByTestId(theme.className),
    );
    expect(wrappers.map((wrapper) => wrapper.className)).toEqual(
      EXAMPLE_THEMES.map((theme) => expect.stringContaining(theme.className)),
    );
    EXAMPLE_THEMES.forEach((theme, index) => {
      expect(
        wrappers[index]?.querySelector(`#${theme.className}`),
      ).not.toBeNull();
    });
    expect(document.querySelectorAll("[id='map-pine']")).toHaveLength(1);
  });

  it("names each map by its theme, so no two landmarks share a role and name, under one main", async () => {
    const { container } = render(<ExampleApp />);
    const pine = within(screen.getByTestId("map-pine"));
    await pine.findByRole("search", { name: "Search (Pine)" });

    expect(screen.getAllByRole("main")).toHaveLength(1);
    for (const theme of EXAMPLE_THEMES) {
      const wrapper = within(screen.getByTestId(theme.className));
      expect(
        wrapper.getByRole("region", { name: `Map (${theme.title})` }),
      ).toBeTruthy();
      expect(
        wrapper.getByRole("region", { name: `Map tools (${theme.title})` }),
      ).toBeTruthy();
    }
    const landmarks = [
      ...container.querySelectorAll("section[aria-label], [role=search]"),
    ].map(
      (element) =>
        `${element.getAttribute("role") ?? "region"} ${element.getAttribute("aria-label")}`,
    );
    expect(new Set(landmarks).size).toBe(landmarks.length);
  });

  it("mounts the map region and its chrome from the SDK's entry points", async () => {
    const pine = renderPine();

    expect(pine.getByRole("region", { name: "Map (Pine)" })).toBeTruthy();
    expect(
      await pine.findByRole("combobox", { name: "Search places" }),
    ).toBeTruthy();
    expect(pine.getByRole("button", { name: "Zoom in" })).toBeTruthy();
    expect(pine.getByRole("button", { name: "Map credits" })).toBeTruthy();
  });

  it("finds an invented place through the example's own search provider", async () => {
    const pine = renderPine();

    fireEvent.change(
      await pine.findByRole("combobox", { name: "Search places" }),
      { target: { value: "Cairn" } },
    );
    fireEvent.click(pine.getByRole("button", { name: "Search" }));

    // One place matches, so the search goes to it: no list, and the box names it.
    await waitFor(() => {
      expect(
        (
          pine.getByRole("combobox", {
            name: "Search places",
          }) as HTMLInputElement
        ).value,
      ).toMatch(/Cairn Hollow/);
    });
    expect(pine.queryByRole("option")).toBeNull();
  });

  it("says when its search finds nothing", async () => {
    const pine = renderPine();

    fireEvent.change(
      await pine.findByRole("combobox", { name: "Search places" }),
      { target: { value: "Nowhere" } },
    );
    fireEvent.click(pine.getByRole("button", { name: "Search" }));

    expect(await screen.findByText(/No results/)).toBeTruthy();
  });

  it("suggests places as the text is typed, from its own suggestion provider", async () => {
    const pine = renderPine();

    fireEvent.change(
      await pine.findByRole("combobox", { name: "Search places" }),
      { target: { value: "Ben" } },
    );

    expect(
      await pine.findByRole("option", { name: /Ben Placeholder/ }),
    ).toBeTruthy();
  });

  it("offers its own layer in Map options and loads it from the fake source", async () => {
    const pine = renderPine();

    fireEvent.click(await pine.findByRole("button", { name: "Map options" }));
    const layers = await pine.findByRole("region", { name: "Layers" });
    fireEvent.click(within(layers).getByRole("switch", { name: /Cairns/ }));

    expect(await within(layers).findByText(/3 shown/)).toBeTruthy();
  });

  it("offers the layers its mapper made from the sample server's metadata, and loads one from the fake source", async () => {
    const pine = renderPine();

    fireEvent.click(await pine.findByRole("button", { name: "Map options" }));
    const layers = await pine.findByRole("region", { name: "Layers" });
    fireEvent.click(
      await within(layers).findByRole("switch", { name: /Mountain huts/ }),
    );

    expect(await within(layers).findByText(/2 shown/)).toBeTruthy();
    expect(
      within(layers).getByRole("switch", { name: /Rainfall by glen/ }),
    ).toBeTruthy();
    expect(
      within(layers).getByRole("switch", { name: /Snow cover/ }),
    ).toBeTruthy();
  });

  it("leaves out the layer its mapper could not map, and logs the path of each problem", async () => {
    const pine = renderPine();

    fireEvent.click(await pine.findByRole("button", { name: "Map options" }));
    const layers = await pine.findByRole("region", { name: "Layers" });
    await within(layers).findByRole("switch", { name: /Mountain huts/ });

    expect(
      within(layers).queryByRole("switch", { name: /Survey notes/ }),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "Layer survey-notes was left out: source.fields.title: is required; card.title: {title} is not a field",
    );
  });

  it("offers the SDK's basemaps as plain swatches, because the SDK names no preview image", async () => {
    const pine = renderPine();

    fireEvent.click(await pine.findByRole("button", { name: "Map options" }));
    const picker = await pine.findByRole("radiogroup", { name: "Basemap" });

    expect(within(picker).getAllByRole("radio")).toHaveLength(BASEMAPS.length);
    expect(picker.querySelectorAll("img")).toHaveLength(0);
    expect(within(picker).getByTestId("basemap-swatch-bright")).toBeTruthy();
  });

  it("registers a WebMCP tool that turns the layer on", async () => {
    const tools = new Map<string, () => Promise<unknown>>();
    const provider: ModelContextProvider = {
      registerTool: async (tool) => {
        tools.set(tool.name, async () => tool.execute({}));
      },
    };
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: provider,
    });
    try {
      const pine = renderPine();
      await waitFor(() => expect(tools.has("show-cairns-map-pine")).toBe(true));

      await act(() => tools.get("show-cairns-map-pine")?.());

      fireEvent.click(pine.getByRole("button", { name: "Map options" }));
      const layers = await pine.findByRole("region", { name: "Layers" });
      expect(await within(layers).findByText(/3 shown/)).toBeTruthy();
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });

  it("shows its own privacy note in Settings, with no provider of the reference site named", async () => {
    const pine = renderPine();

    fireEvent.click(await pine.findByRole("button", { name: "Settings" }));
    const note = await pine.findByTestId("settings-privacy-note");

    expect(note.textContent).toBe(
      "This example runs on the SDK's scripted fakes. Search looks only at a short list of invented places held in the page, and nothing is sent to any service.",
    );
    expect(document.body.textContent).not.toMatch(/Nominatim/);
  });

  it("applies the theme chosen in Settings to the page", async () => {
    const pine = renderPine();

    fireEvent.click(await pine.findByRole("button", { name: "Settings" }));
    fireEvent.click(await pine.findByRole("radio", { name: "Dark" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("draws the theme's default basemap until one is picked, then keeps the pick", async () => {
    const pine = renderPine();

    fireEvent.click(await pine.findByRole("button", { name: "Settings" }));
    fireEvent.click(await pine.findByRole("radio", { name: "Dark" }));
    fireEvent.click(pine.getByRole("button", { name: "Map options" }));
    const picker = await pine.findByRole("radiogroup", { name: "Basemap" });
    expect(
      (within(picker).getByRole("radio", { name: /Fiord/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);

    fireEvent.click(within(picker).getByRole("radio", { name: /Positron/ }));
    fireEvent.click(pine.getByRole("button", { name: "Settings" }));
    fireEvent.click(await pine.findByRole("radio", { name: "Light" }));
    fireEvent.click(pine.getByRole("button", { name: "Map options" }));
    expect(
      (
        within(
          await pine.findByRole("radiogroup", { name: "Basemap" }),
        ).getByRole("radio", {
          name: /Positron/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });
});
