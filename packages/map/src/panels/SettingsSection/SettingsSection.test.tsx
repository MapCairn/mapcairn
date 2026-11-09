import {
  createFakeServices,
  FakeDevicePreferences,
  MemorySettingsStore,
  type Settings,
} from "@karta/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { SettingsSection, type SettingsSectionProps } from "./SettingsSection";

interface Options {
  readonly finePointer?: boolean;
  readonly persistent?: boolean;
  readonly initial?: Partial<Settings>;
  readonly props?: SettingsSectionProps;
}

function renderSettings({
  finePointer = true,
  persistent = true,
  initial,
  props,
}: Options = {}) {
  const settings = new MemorySettingsStore({ persistent, initial });
  const preferences = new FakeDevicePreferences({ finePointer });
  const services = createFakeServices({ settings, preferences });
  const view = render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <SettingsSection {...props} />
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  return { ...view, settings, preferences, services };
}

const zoomSwitch = () =>
  screen.getByRole("switch", { name: "Show zoom buttons" });

describe("SettingsSection heading", () => {
  it("is a region named Settings with an h3 by default", () => {
    renderSettings();
    expect(screen.getByRole("region", { name: "Settings" })).toBe(
      screen.getByTestId("sheet-section-settings"),
    );
    expect(
      screen.getByRole("heading", { name: "Settings", level: 3 }),
    ).toBeInTheDocument();
  });

  it("uses the given level, with Privacy one level below", () => {
    renderSettings({ props: { headingLevel: 4 } });
    expect(
      screen.getByRole("heading", { name: "Settings", level: 4 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Privacy", level: 5 }),
    ).toBeInTheDocument();
  });

  it("puts Privacy under an h4 in the default sheet outline", () => {
    renderSettings();
    expect(
      screen.getByRole("heading", { name: "Privacy", level: 4 }),
    ).toBeInTheDocument();
  });
});

describe("theme", () => {
  it("is a radio group named Theme with System, Light and Dark", () => {
    renderSettings();
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    for (const name of ["System", "Light", "Dark"]) {
      expect(within(group).getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(screen.getByTestId("theme-option-system")).toBeInTheDocument();
    expect(screen.getByTestId("theme-option-light")).toBeInTheDocument();
    expect(screen.getByTestId("theme-option-dark")).toBeInTheDocument();
  });

  it("shows the stored choice as selected", () => {
    renderSettings({ initial: { theme: "dark" } });
    expect(screen.getByTestId("theme-option-dark")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("theme-option-system")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("stores the choice and applies it to the document", () => {
    const { settings, services } = renderSettings();
    fireEvent.click(screen.getByTestId("theme-option-dark"));
    expect(settings.get().theme).toBe("dark");
    expect(services.fakes.theme.appliedTheme).toBe("dark");
    expect(screen.getByTestId("theme-option-dark")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

describe("units", () => {
  it("is a radio group named Units with Metric and Imperial", () => {
    renderSettings();
    const group = screen.getByRole("radiogroup", { name: "Units" });
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByTestId("units-option-metric")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("stores the choice", () => {
    const { settings } = renderSettings();
    fireEvent.click(screen.getByTestId("units-option-imperial"));
    expect(settings.get().units).toBe("imperial");
    expect(screen.getByTestId("units-option-imperial")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("shows the stored units", () => {
    renderSettings({ initial: { units: "imperial" } });
    expect(screen.getByTestId("units-option-imperial")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

describe("zoom buttons", () => {
  it("is a switch with the explanation as its description", () => {
    renderSettings();
    expect(zoomSwitch()).toBe(screen.getByTestId("zoom-buttons-switch"));
    expect(zoomSwitch()).toHaveAccessibleDescription(
      "On by default with a mouse, off on touch screens.",
    );
  });

  it("is on by default with a fine pointer", () => {
    renderSettings({ finePointer: true });
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "true");
  });

  it("is off by default on touch", () => {
    renderSettings({ finePointer: false });
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("follows the device default live while nothing is stored", () => {
    const { preferences } = renderSettings({ finePointer: true });
    act(() => preferences.set({ finePointer: false }));
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("stores an explicit true when turned on, and keeps it on every device", () => {
    const { settings, preferences } = renderSettings({ finePointer: false });
    fireEvent.click(zoomSwitch());
    expect(settings.get().zoomButtons).toBe(true);
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "true");
    act(() => preferences.set({ finePointer: true }));
    act(() => preferences.set({ finePointer: false }));
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "true");
  });

  it("stores an explicit false when turned off with a fine pointer", () => {
    const { settings } = renderSettings({ finePointer: true });
    fireEvent.click(zoomSwitch());
    expect(settings.get().zoomButtons).toBe(false);
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("shows a stored false even with a fine pointer", () => {
    renderSettings({ finePointer: true, initial: { zoomButtons: false } });
    expect(zoomSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("is toggled by clicking its label", () => {
    const { settings } = renderSettings({ finePointer: false });
    fireEvent.click(screen.getByText("Show zoom buttons"));
    expect(settings.get().zoomButtons).toBe(true);
  });
});

describe("persistence note", () => {
  it("is absent when settings are remembered", () => {
    renderSettings({ persistent: true });
    expect(
      screen.queryByText("Changes will not be remembered on this device."),
    ).toBeNull();
  });

  it("is visible text with an icon when storage is blocked", () => {
    renderSettings({ persistent: false });
    const note = screen.getByText(
      "Changes will not be remembered on this device.",
    );
    expect(note).toBeVisible();
    expect(note.tagName).toBe("P");
    expect(note.querySelector("svg")).not.toBeNull();
    expect(note.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("is not a live region", () => {
    renderSettings({ persistent: false });
    const note = screen.getByTestId("settings-not-saved");
    expect(note.hasAttribute("aria-live")).toBe(false);
    expect(note.hasAttribute("role")).toBe(false);
  });
});

describe("privacy", () => {
  it("states what the app does and does not do", () => {
    renderSettings();
    expect(
      screen.getByText(
        "Karta has no accounts, sets no cookies and counts page views without tracking you. Map tiles come from the map provider you choose. Searching sends your query to OpenStreetMap's Nominatim service, and Look up address on a pin sends the pin's position, to about 11 m, to the same service. Nothing is sent to it until you do one of those. A data layer contacts its provider only while it is on. Your settings stay on this device.",
      ),
    ).toBeInTheDocument();
  });

  it("links to /privacy by default", () => {
    renderSettings();
    expect(
      screen.getByRole("link", { name: "Read the privacy policy" }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("links to the given address", () => {
    renderSettings({ props: { privacyHref: "/en/privacy" } });
    expect(
      screen.getByRole("link", { name: "Read the privacy policy" }),
    ).toHaveAttribute("href", "/en/privacy");
  });
});

describe("markup rules", () => {
  it("sets no style attribute of its own", () => {
    renderSettings({ persistent: false });
    const region = screen.getByTestId("sheet-section-settings");
    // Radix puts `outline: none` on the segmented control groups through its
    // roving focus. That comes from the primitive, not from this section.
    expect(
      region.querySelectorAll("[style]:not([role='radiogroup'])"),
    ).toHaveLength(0);
  });

  it("hides the visible Theme and Units labels from assistive technology, since the groups carry the names", () => {
    renderSettings();
    const region = screen.getByTestId("sheet-section-settings");
    const hidden = [...region.querySelectorAll('p[aria-hidden="true"]')].map(
      (item) => item.textContent,
    );
    expect(hidden).toEqual(["Theme", "Units"]);
  });
});
