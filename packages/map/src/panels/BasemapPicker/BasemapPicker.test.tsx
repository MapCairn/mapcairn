import { AUTO_BASEMAP_ID, BASEMAPS, createFakeServices } from "@karta/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { BasemapPicker, type BasemapPickerProps } from "./BasemapPicker";

function renderPicker(props: Partial<BasemapPickerProps> = {}) {
  const onChange = vi.fn();
  const onThemeMatchChange = vi.fn();
  const view = render(
    <ServicesProvider services={createFakeServices()}>
      <LiveRegionProvider>
        <BasemapPicker
          value="positron"
          onChange={onChange}
          themeMatch={false}
          onThemeMatchChange={onThemeMatchChange}
          {...props}
        />
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  return { ...view, onChange, onThemeMatchChange };
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

  it("falls back to the default basemap for an unknown id", () => {
    renderPicker({ value: "nowhere" });
    expect(radio("Positron")).toBeChecked();
  });

  it("falls back to the default basemap when the stored id is auto but the picker is not matching", () => {
    renderPicker({ value: AUTO_BASEMAP_ID });
    expect(radio("Positron")).toBeChecked();
  });

  it("calls onChange with the id when another tile is chosen", () => {
    const { onChange } = renderPicker();
    fireEvent.click(radio("Satellite"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("satellite");
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

  it("does not call onChange when the selected tile is clicked and the map does not follow the theme", () => {
    const { onChange } = renderPicker();
    fireEvent.click(radio("Positron"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("announces the new basemap politely", () => {
    renderPicker();
    fireEvent.click(radio("Topographic"));
    expect(screen.getByTestId("live-region-polite")).toHaveTextContent(
      "Basemap changed to Topographic",
    );
  });

  describe("while the map follows the theme", () => {
    it("marks the basemap that is on screen", () => {
      renderPicker({
        value: AUTO_BASEMAP_ID,
        themeMatch: true,
        activeBasemapId: "dark",
      });
      expect(radio("Dark")).toBeChecked();
      expect(screen.getByTestId("basemap-selected-dark")).toBeInTheDocument();
    });

    it("marks the stored basemap when no active id is given", () => {
      renderPicker({ value: "topo", themeMatch: true });
      expect(radio("Topographic")).toBeChecked();
    });

    it("lets a click on the marked tile pin that basemap", () => {
      const { onChange } = renderPicker({
        value: AUTO_BASEMAP_ID,
        themeMatch: true,
        activeBasemapId: "dark",
      });
      fireEvent.click(radio("Dark"));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("dark");
    });

    it("calls onChange once, not twice, when a different tile is chosen", () => {
      const { onChange } = renderPicker({
        value: AUTO_BASEMAP_ID,
        themeMatch: true,
        activeBasemapId: "dark",
      });
      fireEvent.click(radio("Satellite"));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("satellite");
    });
  });

  describe("the match switch", () => {
    it("is a switch named Match the map to the theme", () => {
      renderPicker();
      const control = screen.getByRole("switch", {
        name: "Match the map to the theme",
      });
      expect(control).toHaveAttribute("aria-checked", "false");
      expect(control).toBe(screen.getByTestId("basemap-theme-match"));
    });

    it("reflects themeMatch", () => {
      renderPicker({ themeMatch: true });
      expect(screen.getByRole("switch")).toHaveAttribute(
        "aria-checked",
        "true",
      );
    });

    it("reports the next state when toggled", () => {
      const { onThemeMatchChange } = renderPicker();
      fireEvent.click(screen.getByRole("switch"));
      expect(onThemeMatchChange).toHaveBeenCalledTimes(1);
      expect(onThemeMatchChange).toHaveBeenLastCalledWith(true);
    });

    it("reports false when toggled off", () => {
      const { onThemeMatchChange } = renderPicker({ themeMatch: true });
      fireEvent.click(screen.getByRole("switch"));
      expect(onThemeMatchChange).toHaveBeenLastCalledWith(false);
    });
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
