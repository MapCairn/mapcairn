// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { BASEMAPS } from "@mapcairn/core";
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

const warn = vi.spyOn(console, "warn");

beforeEach(() => {
  warn.mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  warn.mockReset();
  document.documentElement.removeAttribute("data-theme");
});

describe("ExampleApp", () => {
  it("mounts the map region and its chrome from the SDK's entry points", async () => {
    render(<ExampleApp />);

    expect(screen.getByRole("region", { name: "Map" })).toBeTruthy();
    expect(
      await screen.findByRole("combobox", { name: "Search places" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Map credits" })).toBeTruthy();
  });

  it("finds a place through the scripted search", async () => {
    render(<ExampleApp />);

    fireEvent.change(
      await screen.findByRole("combobox", { name: "Search places" }),
      { target: { value: "Cairn" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(
      await screen.findByRole("option", { name: /Example cairn/ }),
    ).toBeTruthy();
  });

  it("offers its own layer in Map options and loads it from the fake source", async () => {
    render(<ExampleApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Map options" }));
    const layers = await screen.findByRole("region", { name: "Layers" });
    fireEvent.click(within(layers).getByRole("switch", { name: /Cairns/ }));

    expect(await within(layers).findByText(/3 shown/)).toBeTruthy();
  });

  it("offers the layers its mapper made from the sample server's metadata, and loads one from the fake source", async () => {
    render(<ExampleApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Map options" }));
    const layers = await screen.findByRole("region", { name: "Layers" });
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
    render(<ExampleApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Map options" }));
    const layers = await screen.findByRole("region", { name: "Layers" });
    await within(layers).findByRole("switch", { name: /Mountain huts/ });

    expect(
      within(layers).queryByRole("switch", { name: /Survey notes/ }),
    ).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "Layer survey-notes was left out: source.fields.title: is required; card.title: {title} is not a field",
    );
  });

  it("offers the SDK's basemaps as plain swatches, because the SDK names no preview image", async () => {
    render(<ExampleApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Map options" }));
    const picker = await screen.findByRole("radiogroup", { name: "Basemap" });

    expect(within(picker).getAllByRole("radio")).toHaveLength(BASEMAPS.length);
    expect(picker.querySelectorAll("img")).toHaveLength(0);
    expect(within(picker).getByTestId("basemap-swatch-bright")).toBeTruthy();
  });

  it("registers a WebMCP tool that turns the layer on", async () => {
    const tools = new Map<string, () => Promise<unknown>>();
    document.modelContext = {
      registerTool: async (tool) => {
        tools.set(tool.name, () => tool.execute({}));
      },
    };
    try {
      render(<ExampleApp />);
      await waitFor(() => expect(tools.has("show-cairns")).toBe(true));

      await act(() => tools.get("show-cairns")?.());

      fireEvent.click(screen.getByRole("button", { name: "Map options" }));
      const layers = await screen.findByRole("region", { name: "Layers" });
      expect(await within(layers).findByText(/3 shown/)).toBeTruthy();
    } finally {
      delete document.modelContext;
    }
  });

  it("shows its own privacy note in Settings, with no provider of the reference site named", async () => {
    render(<ExampleApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    const note = await screen.findByTestId("settings-privacy-note");

    expect(note.textContent).toBe(
      "This example runs on the SDK's scripted fakes and sends nothing to any service.",
    );
    expect(document.body.textContent).not.toMatch(/Nominatim/);
  });

  it("applies the theme chosen in Settings to the page", async () => {
    render(<ExampleApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Dark" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
