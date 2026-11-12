// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeDevicePreferences,
  type LayerDefinition,
  MemorySettingsStore,
  SAMPLE_FEED_LAYER,
  StaticLayerRegistry,
} from "@mapcairn/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDataLayers } from "../../layers";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { SheetContent, type SheetContentProps } from "./SheetContent";

interface Options {
  readonly props?: Partial<SheetContentProps>;
  readonly layers?: LayerDefinition[];
  readonly reducedMotion?: boolean;
  readonly theme?: "system" | "light" | "dark";
}

/** The sheet content with the data layers the services register. */
function WithLayers(props: SheetContentProps) {
  const layers = useDataLayers();
  return <SheetContent {...props} layers={layers} />;
}

function tree(
  services: ReturnType<typeof createFakeServices>,
  props: SheetContentProps,
) {
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <h2>Map options</h2>
        <WithLayers {...props} />
      </LiveRegionProvider>
    </ServicesProvider>
  );
}

function renderContent({
  props,
  layers = [],
  reducedMotion = false,
  theme = "light",
}: Options = {}) {
  const onBasemapChange = vi.fn();
  const onDropPin = vi.fn();
  const services = createFakeServices({
    layers: new StaticLayerRegistry(layers),
    settings: new MemorySettingsStore({ initial: { theme } }),
    preferences: new FakeDevicePreferences({ reducedMotion }),
  });
  const base: SheetContentProps = {
    basemapId: "liberty",
    onBasemapChange,
    hasPin: false,
    onDropPin,
    ...props,
  };
  const view = render(tree(services, base));
  return {
    ...view,
    onBasemapChange,
    onDropPin,
    update: (next: Partial<SheetContentProps>) =>
      view.rerender(tree(services, { ...base, ...next })),
  };
}

describe("SheetContent structure", () => {
  const sectionHeadings = () =>
    within(screen.getByTestId("sheet-content"))
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);

  it("lists Basemap, Pin and Save image in order when there are no layers", () => {
    renderContent();
    expect(sectionHeadings()).toEqual(["Basemap", "Pin", "Save image"]);
    expect(screen.queryByRole("heading", { name: "Layers" })).toBeNull();
  });

  it("adds Layers between Pin and Save image when the host has layers", () => {
    renderContent({ layers: [SAMPLE_FEED_LAYER] });
    expect(sectionHeadings()).toEqual([
      "Basemap",
      "Pin",
      "Layers",
      "Save image",
    ]);
  });

  it("shows only Settings and Help for the settings and help sections", () => {
    for (const section of ["settings", "help"] as const) {
      const { unmount } = renderContent({
        props: { section },
        layers: [SAMPLE_FEED_LAYER],
      });
      expect(sectionHeadings()).toEqual(["Settings", "Help"]);
      unmount();
    }
  });

  it("shows no Settings or Help for any other section", () => {
    for (const section of ["basemap", "pin", "layers", "shapes"] as const) {
      const { unmount } = renderContent({
        props: { section },
        layers: [SAMPLE_FEED_LAYER],
      });
      expect(sectionHeadings()).not.toContain("Settings");
      expect(sectionHeadings()).not.toContain("Help");
      expect(sectionHeadings()).toContain("Basemap");
      unmount();
    }
  });

  it("swaps the groups when the section moves between them", () => {
    const { update } = renderContent({ props: { section: "basemap" } });
    update({ section: "settings" });
    expect(sectionHeadings()).toEqual(["Settings", "Help"]);
    expect(screen.getByRole("heading", { name: "Settings" })).toHaveFocus();
    update({ section: "basemap" });
    expect(sectionHeadings()).toEqual(["Basemap", "Pin", "Save image"]);
    expect(screen.getByRole("heading", { name: "Basemap" })).toHaveFocus();
  });

  it("keeps the section headings at h3, with subheadings no deeper than h4", () => {
    // Help has h4 subheadings; the options sections have none.
    const deepest = { basemap: 3, help: 4 } as const;
    for (const section of ["basemap", "help"] as const) {
      const { unmount } = renderContent({ props: { section } });
      const levels = within(screen.getByTestId("sheet-content"))
        .getAllByRole("heading")
        .map((heading) => Number(heading.tagName.slice(1)));
      expect(Math.min(...levels)).toBe(3);
      expect(Math.max(...levels)).toBe(deepest[section]);
      unmount();
    }
  });

  it("makes each section a named region", () => {
    const { unmount } = renderContent({ layers: [SAMPLE_FEED_LAYER] });
    for (const name of ["Basemap", "Pin", "Layers", "Save image"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    unmount();
    renderContent({ props: { section: "settings" } });
    for (const name of ["Settings", "Help"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });
});

describe("SheetContent basemap", () => {
  it("passes the stored basemap to the picker", () => {
    renderContent({ props: { basemapId: "osm" } });
    expect(screen.getByRole("radio", { name: "Streets" })).toBeChecked();
  });

  it("reports a chosen basemap", () => {
    const { onBasemapChange } = renderContent();
    fireEvent.click(screen.getByRole("radio", { name: "Streets" }));
    expect(onBasemapChange).toHaveBeenCalledWith("osm");
  });

  it("keeps the chosen basemap in a dark theme, with no switch to match the map to the theme", () => {
    renderContent({ props: { basemapId: "liberty" }, theme: "dark" });
    expect(screen.getByRole("radio", { name: "Liberty" })).toBeChecked();
    expect(screen.queryByRole("switch", { name: /match the map/i })).toBeNull();
  });

  it("shows the retired auto choice as Bright in either theme", () => {
    for (const theme of ["light", "dark"] as const) {
      const { unmount } = renderContent({
        props: { basemapId: "auto" },
        theme,
      });
      expect(screen.getByRole("radio", { name: "Bright" })).toBeChecked();
      unmount();
    }
  });
});

describe("SheetContent pin, settings and help", () => {
  it("wires the pin button and note", () => {
    const { onDropPin, update } = renderContent();
    fireEvent.click(
      screen.getByRole("button", { name: "Drop pin at map centre" }),
    );
    expect(onDropPin).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("A pin is on the map.")).toBeNull();
    update({ hasPin: true });
    expect(screen.getByText("A pin is on the map.")).toBeInTheDocument();
  });

  it("renders the pin card inside the Pin section", () => {
    renderContent({
      props: { hasPin: true, pinCard: <div data-testid="pin-card">Card</div> },
    });
    expect(
      within(screen.getByRole("region", { name: "Pin" })).getByTestId(
        "pin-card",
      ),
    ).toBeInTheDocument();
  });

  it("passes the privacy address to Settings", () => {
    renderContent({
      props: { section: "settings", privacyHref: "/af/privacy" },
    });
    expect(
      screen.getByRole("link", { name: "Read the privacy policy" }),
    ).toHaveAttribute("href", "/af/privacy");
  });

  it("passes the host's privacy note to Settings", () => {
    renderContent({
      props: { section: "settings", privacyNote: "Host privacy note." },
    });
    expect(screen.getByTestId("settings-privacy-note")).toHaveTextContent(
      "Host privacy note.",
    );
  });

  it("uses /privacy when none is given", () => {
    renderContent({ props: { section: "settings" } });
    expect(
      screen.getByRole("link", { name: "Read the privacy policy" }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("lists the rotation shortcuts in Help", () => {
    renderContent({ props: { section: "help" } });
    expect(screen.getByText("Rotate the map")).toBeInTheDocument();
  });
});

describe("SheetContent section focus", () => {
  let scrollIntoView: ReturnType<typeof vi.fn>;
  const original = Element.prototype.scrollIntoView;

  beforeEach(() => {
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as never;
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  const heading = (name: string) =>
    screen.getByRole("heading", { name, level: 3 });

  it("does nothing without a section", () => {
    renderContent();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.body).toHaveFocus();
  });

  it("focuses and scrolls to the section it opens on", () => {
    renderContent({ props: { section: "settings" } });
    expect(heading("Settings")).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(heading("Settings"));
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("scrolls without animation under reduced motion", () => {
    renderContent({ props: { section: "help" }, reducedMotion: true });
    expect(heading("Help")).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "auto",
    });
  });

  it("moves to a new section when the prop changes", () => {
    const { update } = renderContent({ props: { section: "basemap" } });
    expect(heading("Basemap")).toHaveFocus();
    update({ section: "pin" });
    expect(heading("Pin")).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView.mock.contexts[1]).toBe(heading("Pin"));
  });

  it("does not steal focus again on a re-render with the same section", () => {
    const { update } = renderContent({ props: { section: "help" } });
    (document.activeElement as HTMLElement).blur();
    update({ hasPin: true });
    expect(document.body).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("focuses the Layers heading when layers exist", () => {
    renderContent({
      props: { section: "layers" },
      layers: [SAMPLE_FEED_LAYER],
    });
    expect(heading("Layers")).toHaveFocus();
  });

  it("does nothing for the Layers section when there are no layers", () => {
    renderContent({ props: { section: "layers" } });
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.body).toHaveFocus();
  });

  it("moves focus off a section and back to none without error", () => {
    const { update } = renderContent({ props: { section: "pin" } });
    update({ section: undefined });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
