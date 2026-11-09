import {
  AUTO_BASEMAP_ID,
  createFakeServices,
  FakeDevicePreferences,
  MemorySettingsStore,
  StaticLayerRegistry,
} from "@karta/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { SheetContent, type SheetContentProps } from "./SheetContent";

interface Options {
  readonly props?: Partial<SheetContentProps>;
  readonly layers?: { id: string; name: string }[];
  readonly reducedMotion?: boolean;
  readonly theme?: "system" | "light" | "dark";
}

function tree(
  services: ReturnType<typeof createFakeServices>,
  props: SheetContentProps,
) {
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <h2>Map options</h2>
        <SheetContent {...props} />
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
  it("lists Basemap, Pin, Settings and Help in order when there are no layers", () => {
    renderContent();
    const content = screen.getByTestId("sheet-content");
    const headings = within(content)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Basemap", "Pin", "Settings", "Help"]);
    expect(screen.queryByRole("heading", { name: "Data" })).toBeNull();
  });

  it("adds Data between Pin and Settings when the host has layers", () => {
    renderContent({ layers: [{ id: "rivers", name: "Rivers" }] });
    const headings = within(screen.getByTestId("sheet-content"))
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Basemap", "Pin", "Data", "Settings", "Help"]);
  });

  it("keeps the section headings at h3, below the sheet's h2", () => {
    renderContent();
    const levels = within(screen.getByTestId("sheet-content"))
      .getAllByRole("heading")
      .map((heading) => Number(heading.tagName.slice(1)));
    expect(Math.min(...levels)).toBe(3);
    expect(Math.max(...levels)).toBe(4);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Map options",
    );
  });

  it("makes each section a named region", () => {
    renderContent({ layers: [{ id: "rivers", name: "Rivers" }] });
    for (const name of ["Basemap", "Pin", "Data", "Settings", "Help"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });
});

describe("SheetContent basemap", () => {
  it("passes the stored basemap to the picker", () => {
    renderContent({ props: { basemapId: "osm" } });
    expect(screen.getByRole("radio", { name: "Streets" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Match the map to the theme" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("reports a chosen basemap", () => {
    const { onBasemapChange } = renderContent();
    fireEvent.click(screen.getByRole("radio", { name: "Streets" }));
    expect(onBasemapChange).toHaveBeenCalledWith("osm");
  });

  it("turns the match switch on when the stored id is auto, and marks the resolved basemap", () => {
    renderContent({ props: { basemapId: AUTO_BASEMAP_ID }, theme: "light" });
    expect(
      screen.getByRole("switch", { name: "Match the map to the theme" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Positron" })).toBeChecked();
  });

  it("marks the dark basemap for auto in a dark theme", () => {
    renderContent({ props: { basemapId: AUTO_BASEMAP_ID }, theme: "dark" });
    const picker = screen.getByRole("radiogroup", { name: "Basemap" });
    expect(within(picker).getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("stores auto when the match switch is turned on", () => {
    const { onBasemapChange } = renderContent();
    fireEvent.click(
      screen.getByRole("switch", { name: "Match the map to the theme" }),
    );
    expect(onBasemapChange).toHaveBeenCalledWith(AUTO_BASEMAP_ID);
  });

  it("keeps the basemap on screen when the match switch is turned off", () => {
    const { onBasemapChange } = renderContent({
      props: { basemapId: AUTO_BASEMAP_ID },
      theme: "dark",
    });
    fireEvent.click(
      screen.getByRole("switch", { name: "Match the map to the theme" }),
    );
    expect(onBasemapChange).toHaveBeenCalledWith("dark");
  });

  it("pins the marked basemap when its tile is clicked during matching", () => {
    const { onBasemapChange } = renderContent({
      props: { basemapId: AUTO_BASEMAP_ID },
      theme: "light",
    });
    fireEvent.click(screen.getByRole("radio", { name: "Positron" }));
    expect(onBasemapChange).toHaveBeenCalledWith("positron");
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
    renderContent({ props: { privacyHref: "/af/privacy" } });
    expect(
      screen.getByRole("link", { name: "Read the privacy policy" }),
    ).toHaveAttribute("href", "/af/privacy");
  });

  it("uses /privacy when none is given", () => {
    renderContent();
    expect(
      screen.getByRole("link", { name: "Read the privacy policy" }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("lists the rotation shortcuts in Help", () => {
    renderContent();
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

  it("focuses the Data heading when layers exist", () => {
    renderContent({
      props: { section: "data" },
      layers: [{ id: "rivers", name: "Rivers" }],
    });
    expect(heading("Data")).toHaveFocus();
  });

  it("does nothing for the Data section when there are no layers", () => {
    renderContent({ props: { section: "data" } });
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.body).toHaveFocus();
  });

  it("moves focus off a section and back to none without error", () => {
    const { update } = renderContent({ props: { section: "pin" } });
    update({ section: undefined });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
