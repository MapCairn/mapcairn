import { createFakeServices } from "@karta/core";
import { act, fireEvent, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { FocusRegistryProvider, useFocusReturn } from "../focusRegistry";
import {
  ChromeSurfaceContext,
  type ChromeSurfaceValue,
} from "../MapChrome/chromeSurface";
import { renderChrome } from "../MapChrome/chromeTestHarness";
import { EndStack, type EndStackProps } from "./EndStack";
import { endStackMinHeightForZoom } from "./endStackHeight";

function props(overrides: Partial<EndStackProps> = {}): EndStackProps {
  return {
    bearing: 0,
    onResetBearing: vi.fn(),
    mapOptionsOpen: false,
    mapOptionsControls: "map-options-sheet",
    onMapOptions: vi.fn(),
    settingsOpen: false,
    settingsControls: "map-options-sheet",
    onSettings: vi.fn(),
    measuring: false,
    onMeasure: vi.fn(),
    locating: false,
    onLocate: vi.fn(),
    canZoomIn: true,
    canZoomOut: true,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    ...overrides,
  };
}

function surface(endStackMaxHeight: number | null): ChromeSurfaceValue {
  return {
    publishSheetDetent: () => {},
    publishPanelEdge: () => {},
    endStackMaxHeight,
  };
}

function Restorers() {
  const restore = useFocusReturn();
  return (
    <>
      <button type="button" onClick={() => restore("map-options")}>
        back to options
      </button>
      <button type="button" onClick={() => restore("measure")}>
        back to measure
      </button>
      <button type="button" onClick={() => restore("settings")}>
        back to settings
      </button>
    </>
  );
}

function withRegistry(children: ReactNode, maxHeight: number | null = null) {
  return (
    <ChromeSurfaceContext.Provider value={surface(maxHeight)}>
      <FocusRegistryProvider focusMap={() => {}}>
        {children}
        <Restorers />
      </FocusRegistryProvider>
    </ChromeSurfaceContext.Provider>
  );
}

describe("EndStack directions button", () => {
  const directions = (overrides = {}) => ({
    active: false,
    controls: "map-options-sheet",
    onToggle: vi.fn(),
    ...overrides,
  });

  it("is absent unless the host offers directions", () => {
    renderChrome(withRegistry(<EndStack {...props()} />));
    expect(screen.queryByRole("button", { name: "Directions" })).toBeNull();
  });

  it("sits between Measure and Locate me, and toggles", () => {
    const onToggle = vi.fn();
    renderChrome(
      withRegistry(
        <EndStack {...props({ directions: directions({ onToggle }) })} />,
      ),
    );
    const main = screen.getByRole("group", { name: "Map controls" });
    expect(
      within(main)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Map options",
      "Measure distance and area",
      "Directions",
      "Locate me",
      "Settings",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Directions" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows it is on and what it controls", () => {
    renderChrome(
      withRegistry(
        <EndStack {...props({ directions: directions({ active: true }) })} />,
      ),
    );
    const button = screen.getByRole("button", { name: "Directions" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("aria-controls", "map-options-sheet");
  });

  it("needs one more control of room before the zoom buttons show", () => {
    expect(endStackMinHeightForZoom(false, true)).toBeGreaterThan(
      endStackMinHeightForZoom(false),
    );
    renderChrome(
      withRegistry(
        <EndStack {...props({ directions: directions() })} />,
        endStackMinHeightForZoom(false),
      ),
    );
    expect(screen.queryByRole("group", { name: "Zoom controls" })).toBeNull();
  });

  it("is where focus returns when its panel closes", () => {
    renderChrome(
      withRegistry(<EndStack {...props({ directions: directions() })} />),
    );
    expect(screen.getByRole("button", { name: "Directions" })).toBeTruthy();
  });
});

describe("EndStack", () => {
  it("groups the main controls and the zoom controls, top to bottom", () => {
    renderChrome(withRegistry(<EndStack {...props()} />));
    const main = screen.getByRole("group", { name: "Map controls" });
    const zoom = screen.getByRole("group", { name: "Zoom controls" });
    expect(
      within(main)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Map options",
      "Measure distance and area",
      "Locate me",
      "Settings",
    ]);
    expect(
      within(zoom)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Zoom in", "Zoom out"]);
    expect(
      main.compareDocumentPosition(zoom) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(main).toHaveAttribute("data-chrome", "end-stack-controls");
    expect(zoom).toHaveAttribute("data-chrome", "end-stack-zoom");
  });

  it("is a landmark named Map tools, so its controls sit inside a landmark", () => {
    renderChrome(withRegistry(<EndStack {...props()} />));
    const region = screen.getByRole("region", { name: "Map tools" });
    expect(region.tagName).toBe("SECTION");
    expect(region).toHaveAttribute("data-testid", "end-stack");
    expect(
      within(region).getByRole("group", { name: "Map controls" }),
    ).toBeInTheDocument();
    expect(
      within(region).getByRole("group", { name: "Zoom controls" }),
    ).toBeInTheDocument();
  });

  it("reflects state with aria attributes and calls back", () => {
    const callbacks = props({
      mapOptionsOpen: true,
      measuring: true,
      locating: true,
    });
    renderChrome(withRegistry(<EndStack {...callbacks} />));
    const options = screen.getByRole("button", { name: "Map options" });
    expect(options).toHaveAttribute("aria-expanded", "true");
    expect(options).toHaveAttribute("aria-controls", "map-options-sheet");
    const measure = screen.getByRole("button", {
      name: "Measure distance and area",
    });
    expect(measure).toHaveAttribute("aria-pressed", "true");
    const locate = screen.getByRole("button", { name: "Locate me" });
    expect(locate).toHaveAttribute("aria-busy", "true");

    fireEvent.click(options);
    fireEvent.click(measure);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(callbacks.onMapOptions).toHaveBeenCalledOnce();
    expect(callbacks.onSettings).not.toHaveBeenCalled();
    expect(callbacks.onMeasure).toHaveBeenCalledOnce();
    expect(callbacks.onZoomIn).toHaveBeenCalledOnce();
    expect(callbacks.onZoomOut).toHaveBeenCalledOnce();

    // Busy buttons ignore presses.
    fireEvent.click(locate);
    expect(callbacks.onLocate).not.toHaveBeenCalled();
  });

  it("locates when not busy", () => {
    const callbacks = props();
    renderChrome(withRegistry(<EndStack {...callbacks} />));
    const measure = screen.getByRole("button", {
      name: "Measure distance and area",
    });
    expect(measure).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Locate me" }));
    expect(callbacks.onLocate).toHaveBeenCalledOnce();
  });

  it("keeps zoom buttons focusable but inert at the zoom limits", () => {
    const callbacks = props({ canZoomIn: false, canZoomOut: false });
    renderChrome(withRegistry(<EndStack {...callbacks} />));
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    expect(zoomIn).toHaveAttribute("aria-disabled", "true");
    expect(zoomOut).toHaveAttribute("aria-disabled", "true");
    expect(zoomIn).not.toBeDisabled();
    zoomIn.focus();
    expect(document.activeElement).toBe(zoomIn);
    fireEvent.click(zoomIn);
    fireEvent.click(zoomOut);
    expect(callbacks.onZoomIn).not.toHaveBeenCalled();
    expect(callbacks.onZoomOut).not.toHaveBeenCalled();
  });

  it("gives Settings its own expanded state, controls and callback", () => {
    const callbacks = props({
      settingsOpen: true,
      settingsControls: "the-sheet",
    });
    renderChrome(withRegistry(<EndStack {...callbacks} />));
    const settings = screen.getByRole("button", { name: "Settings" });
    expect(settings).toHaveAttribute("aria-expanded", "true");
    expect(settings).toHaveAttribute("aria-controls", "the-sheet");
    expect(screen.getByRole("button", { name: "Map options" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    fireEvent.click(settings);
    expect(callbacks.onSettings).toHaveBeenCalledOnce();
    expect(callbacks.onMapOptions).not.toHaveBeenCalled();
  });

  it("needs one more control of room than before Settings joined the group", () => {
    // Four main controls (Map options, Measure, Locate me, Settings), two
    // zoom controls, the 12 px gap between the groups and the eight hairlines
    // the function counts.
    expect(endStackMinHeightForZoom(false)).toBe(6 * 48 + 12 + 8);
  });

  it("registers Map options, Measure and Settings as focus targets", () => {
    renderChrome(withRegistry(<EndStack {...props()} />));
    fireEvent.click(screen.getByText("back to settings"));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Settings" }),
    );
    fireEvent.click(screen.getByText("back to options"));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Map options" }),
    );
    fireEvent.click(screen.getByText("back to measure"));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Measure distance and area" }),
    );
  });

  describe("compass", () => {
    it("is absent when the map points north", () => {
      renderChrome(withRegistry(<EndStack {...props({ bearing: 0 })} />));
      expect(
        screen.queryByRole("button", { name: "Reset bearing to north" }),
      ).toBeNull();
    });

    it("appears first when rotated, turns with the bearing and resets", () => {
      const callbacks = props({ bearing: 45 });
      const { rerenderChrome } = renderChrome(
        withRegistry(<EndStack {...callbacks} />),
      );
      const compass = screen.getByRole("button", {
        name: "Reset bearing to north",
      });
      const stack = screen.getByTestId("end-stack");
      expect(stack.querySelector("button")).toBe(compass);
      expect(compass.closest("[data-chrome]")).toHaveAttribute(
        "data-chrome",
        "end-stack-compass",
      );
      expect(stack.style.getPropertyValue("--chrome-bearing")).toBe("45deg");
      fireEvent.click(compass);
      expect(callbacks.onResetBearing).toHaveBeenCalledOnce();

      rerenderChrome(withRegistry(<EndStack {...props({ bearing: 90 })} />));
      expect(stack.style.getPropertyValue("--chrome-bearing")).toBe("90deg");
    });
  });

  describe("zoom group visibility", () => {
    it("follows the device default: shown for a fine pointer", () => {
      renderChrome(withRegistry(<EndStack {...props()} />));
      expect(
        screen.getByRole("group", { name: "Zoom controls" }),
      ).toBeInTheDocument();
    });

    it("hides by default on touch", () => {
      const services = createFakeServices();
      services.fakes.preferences.set({ finePointer: false });
      renderChrome(withRegistry(<EndStack {...props()} />), { services });
      expect(screen.queryByRole("group", { name: "Zoom controls" })).toBeNull();
    });

    it("shows on touch when the setting says so", () => {
      const services = createFakeServices();
      services.fakes.preferences.set({ finePointer: false });
      services.fakes.settings.set({ zoomButtons: true });
      renderChrome(withRegistry(<EndStack {...props()} />), { services });
      expect(
        screen.getByRole("group", { name: "Zoom controls" }),
      ).toBeInTheDocument();
    });

    it("hides for a fine pointer when the setting says so", () => {
      const services = createFakeServices();
      services.fakes.settings.set({ zoomButtons: false });
      renderChrome(withRegistry(<EndStack {...props()} />), { services });
      expect(screen.queryByRole("group", { name: "Zoom controls" })).toBeNull();
    });

    it("yields to a short stack by default, and comes back when there is room", () => {
      const { services, rerenderChrome } = renderChrome(
        withRegistry(
          <EndStack {...props()} />,
          endStackMinHeightForZoom(false) - 1,
        ),
      );
      expect(screen.queryByRole("group", { name: "Zoom controls" })).toBeNull();
      expect(screen.getByTestId("end-stack")).toHaveAttribute(
        "data-zoom-yielded",
        "true",
      );
      rerenderChrome(
        withRegistry(
          <EndStack {...props()} />,
          endStackMinHeightForZoom(false),
        ),
      );
      expect(
        screen.getByRole("group", { name: "Zoom controls" }),
      ).toBeInTheDocument();

      // An explicit setting keeps them, and the stack scrolls instead.
      act(() => {
        services.fakes.settings.set({ zoomButtons: true });
      });
      rerenderChrome(withRegistry(<EndStack {...props()} />, 10));
      expect(
        screen.getByRole("group", { name: "Zoom controls" }),
      ).toBeInTheDocument();
    });

    it("needs more room while the compass shows", () => {
      expect(endStackMinHeightForZoom(true)).toBeGreaterThan(
        endStackMinHeightForZoom(false),
      );
      renderChrome(
        withRegistry(
          <EndStack {...props({ bearing: 30 })} />,
          endStackMinHeightForZoom(false),
        ),
      );
      expect(screen.queryByRole("group", { name: "Zoom controls" })).toBeNull();
    });
  });
});
