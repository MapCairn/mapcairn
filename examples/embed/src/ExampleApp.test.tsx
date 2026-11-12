import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExampleApp } from "./ExampleApp";

afterEach(() => {
  cleanup();
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
