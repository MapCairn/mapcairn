import {
  BASEMAPS,
  createFakeServices,
  FakeDevicePreferences,
  MemorySettingsStore,
  type Settings,
} from "@karta/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { BasemapPicker, type BasemapPickerProps } from "./BasemapPicker";

function renderPicker(
  props: Partial<BasemapPickerProps> = {},
  device: { saveData?: boolean; settings?: Partial<Settings> } = {},
) {
  const onChange = vi.fn();
  const services = createFakeServices({
    preferences: new FakeDevicePreferences({ saveData: device.saveData }),
    settings: new MemorySettingsStore({ initial: device.settings }),
  });
  const view = render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <BasemapPicker value="positron" onChange={onChange} {...props} />
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  return { ...view, onChange };
}

const radio = (name: string) => screen.getByRole("radio", { name });

describe("BasemapPicker", () => {
  it("is a radio group named Basemap with one radio per built-in basemap", () => {
    renderPicker();
    const group = screen.getByRole("radiogroup", { name: "Basemap" });
    expect(group).toBe(screen.getByTestId("basemap-picker"));
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((item) => item.getAttribute("value"))).toEqual(
      BASEMAPS.map((basemap) => basemap.id),
    );
  });

  it("names each radio by its visible basemap name", () => {
    renderPicker();
    for (const basemap of BASEMAPS) {
      expect(radio(basemap.name)).toBeInTheDocument();
      expect(
        within(screen.getByTestId(`basemap-option-${basemap.id}`)).getByText(
          basemap.name,
        ),
      ).toBeVisible();
    }
  });

  it("puts every radio in one native group, so the browser handles the arrow keys", () => {
    renderPicker();
    const names = new Set(
      screen.getAllByRole("radio").map((item) => item.getAttribute("name")),
    );
    expect(names.size).toBe(1);
    expect([...names][0]).toBeTruthy();
  });

  it("checks only the stored basemap", () => {
    renderPicker({ value: "liberty" });
    expect(radio("Liberty")).toBeChecked();
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
  });

  it("shows the selection with a badge as well as the outline", () => {
    renderPicker({ value: "liberty" });
    expect(screen.getByTestId("basemap-selected-liberty")).toBeInTheDocument();
    expect(screen.queryByTestId("basemap-selected-positron")).toBeNull();
    const selectedThumb = screen.getByTestId(
      "basemap-selected-liberty",
    ).parentElement;
    const otherThumb = screen
      .getByTestId("basemap-option-positron")
      .querySelector("span");
    expect(selectedThumb?.className).not.toBe(otherThumb?.className);
  });

  it("falls back to Liberty, the default basemap, for an unknown id", () => {
    renderPicker({ value: "nowhere" });
    expect(radio("Liberty")).toBeChecked();
  });

  it("falls back to Liberty for the retired auto choice", () => {
    renderPicker({ value: "auto" });
    expect(radio("Liberty")).toBeChecked();
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
  });

  it("offers no dark basemap", () => {
    renderPicker();
    expect(screen.queryByRole("radio", { name: "Dark" })).toBeNull();
  });

  it("offers no switch to match the map to the theme", () => {
    renderPicker();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText(/match the map/i)).toBeNull();
  });

  it("calls onChange with the id when another tile is chosen", () => {
    const { onChange } = renderPicker();
    fireEvent.click(radio("Streets"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("osm");
  });

  it("calls onChange once when the keyboard selects the next radio", () => {
    const { onChange } = renderPicker();
    // A browser answers an arrow key on a radio group by focusing the next
    // radio and clicking it. Happy DOM has no such behaviour, so this plays
    // the click that the arrow key produces.
    const next = radio("Liberty");
    next.focus();
    fireEvent.click(next);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("liberty");
  });

  it("does not call onChange when the selected tile is clicked", () => {
    const { onChange } = renderPicker();
    fireEvent.click(radio("Positron"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("announces the new basemap politely", () => {
    renderPicker();
    fireEvent.click(radio("Streets"));
    expect(screen.getByTestId("live-region-polite")).toHaveTextContent(
      "Basemap changed to Streets",
    );
  });

  describe("previews", () => {
    it("gives each preview an empty alt, intrinsic size and lazy loading", () => {
      renderPicker();
      for (const basemap of BASEMAPS) {
        const image = screen
          .getByTestId(`basemap-option-${basemap.id}`)
          .querySelector("img");
        expect(image).not.toBeNull();
        expect(image?.getAttribute("alt")).toBe("");
        expect(image?.getAttribute("src")).toBe(basemap.thumbnail);
        expect(image?.getAttribute("width")).toBe("160");
        expect(image?.getAttribute("height")).toBe("120");
        expect(image?.getAttribute("loading")).toBe("lazy");
        expect(image?.getAttribute("decoding")).toBe("async");
        expect(image?.hasAttribute("style")).toBe(false);
      }
    });

    it("removes a preview that fails to load and keeps the tile, name and radio", () => {
      renderPicker();
      const tile = screen.getByTestId("basemap-option-liberty");
      const image = tile.querySelector("img");
      expect(image).not.toBeNull();
      fireEvent.error(image as HTMLImageElement);
      expect(tile.querySelector("img")).toBeNull();
      expect(within(tile).getByText("Liberty")).toBeVisible();
      expect(radio("Liberty")).toBeInTheDocument();
      expect(
        screen.getByTestId("basemap-option-positron").querySelector("img"),
      ).not.toBeNull();
    });

    it("keeps the selection badge on a selected tile whose preview failed", () => {
      renderPicker({ value: "liberty" });
      const tile = screen.getByTestId("basemap-option-liberty");
      fireEvent.error(tile.querySelector("img") as HTMLImageElement);
      expect(
        screen.getByTestId("basemap-selected-liberty"),
      ).toBeInTheDocument();
    });
  });
});

describe("BasemapPicker in Save data mode", () => {
  it("shows a thumbnail for every basemap when Save data is off", () => {
    const { container } = renderPicker();
    expect(container.querySelectorAll("img")).toHaveLength(BASEMAPS.length);
    expect(screen.queryByTestId("basemap-data-note-osm")).toBeNull();
  });

  it("requests no thumbnail and keeps every name, radio and the selection badge", () => {
    const { container } = renderPicker(
      { value: "liberty" },
      { saveData: true },
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    for (const basemap of BASEMAPS) {
      expect(
        screen.getByRole("radio", { name: new RegExp(`^${basemap.name}`) }),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`basemap-swatch-${basemap.id}`),
      ).toBeInTheDocument();
    }
    expect(radio("Liberty")).toBeChecked();
    expect(screen.getByTestId("basemap-selected-liberty")).toBeInTheDocument();
  });

  it("notes that the raster basemap uses more data, and no other", () => {
    renderPicker({}, { saveData: true });
    const note = screen.getByTestId("basemap-data-note-osm");
    expect(note).toHaveTextContent("Uses more data");
    expect(
      screen.getByRole("radio", { name: "Streets Uses more data" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("basemap-data-note-liberty")).toBeNull();
    expect(screen.queryByTestId("basemap-data-note-positron")).toBeNull();
  });

  it("still chooses a basemap, including the one that uses more data", () => {
    const { onChange } = renderPicker({}, { saveData: true });
    fireEvent.click(screen.getByRole("radio", { name: /^Streets/ }));
    expect(onChange).toHaveBeenCalledWith("osm");
  });

  it("swaps previews for swatches, and back, as the setting changes", () => {
    const settings = new MemorySettingsStore();
    const services = createFakeServices({ settings });
    const { container } = render(
      <ServicesProvider services={services}>
        <LiveRegionProvider>
          <BasemapPicker value="liberty" onChange={vi.fn()} />
        </LiveRegionProvider>
      </ServicesProvider>,
    );
    expect(container.querySelectorAll("img")).toHaveLength(BASEMAPS.length);
    act(() => settings.set({ saveData: true }));
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByTestId("basemap-swatch-liberty")).toBeInTheDocument();
    act(() => settings.set({ saveData: false }));
    expect(container.querySelectorAll("img")).toHaveLength(BASEMAPS.length);
    expect(screen.queryByTestId("basemap-swatch-liberty")).toBeNull();
  });

  it("follows an explicit choice over the device signal", () => {
    const off = renderPicker(
      {},
      { saveData: true, settings: { saveData: false } },
    );
    expect(off.container.querySelectorAll("img")).toHaveLength(BASEMAPS.length);
    off.unmount();
    const on = renderPicker(
      {},
      { saveData: false, settings: { saveData: true } },
    );
    expect(on.container.querySelectorAll("img")).toHaveLength(0);
  });
});
