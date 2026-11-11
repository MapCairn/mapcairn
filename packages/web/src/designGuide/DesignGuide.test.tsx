import {
  createFakeServices,
  FakeDevicePreferences,
  type FakeServices,
} from "@mapcairn/core";
import {
  LiveRegionProvider,
  ServicesProvider,
  TooltipProvider,
} from "@mapcairn/map";
import { tokenValues } from "@mapcairn/theme";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { APP_ICONS } from "./appIcons";
import {
  COMPONENT_NAMES,
  DESIGN_GUIDE_MARKER,
  DesignGuide,
  GUIDE_SECTIONS,
} from "./DesignGuide";
import type { FontGateResult } from "./fontGate";
import { CONTRAST_PAIRS } from "./guideData";

vi.setConfig({ testTimeout: 20_000 });

const loaded = (): Promise<FontGateResult> =>
  Promise.resolve({ loaded: true, reason: "" });

function providers(services: FakeServices, children: ReactNode) {
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
}

async function renderGuide(
  checkFont: () => Promise<FontGateResult> = loaded,
): Promise<FakeServices> {
  const services = createFakeServices({
    preferences: new FakeDevicePreferences({ finePointer: true }),
  });
  render(providers(services, <DesignGuide checkFont={checkFont} />));
  await act(async () => {
    await Promise.resolve();
  });
  return services;
}

describe("DesignGuide", () => {
  it("has one h1, a main landmark and a navigation landmark", async () => {
    await renderGuide();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "On this page" }),
    ).toBeInTheDocument();
  });

  it("links to every section from the nav, and each section has its heading", async () => {
    await renderGuide();
    const nav = screen.getByRole("navigation", { name: "On this page" });
    for (const section of GUIDE_SECTIONS) {
      expect(
        within(nav).getByRole("link", { name: section.title }),
      ).toHaveAttribute("href", `#${section.id}`);
      const region = screen.getByRole("region", { name: section.title });
      expect(region).toHaveAttribute("id", section.id);
      expect(
        within(region).getByRole("heading", { level: 2, name: section.title }),
      ).toBeInTheDocument();
    }
  });

  it("renders the marker the build check looks for", async () => {
    await renderGuide();
    expect(DESIGN_GUIDE_MARKER).toBe("MAPCAIRN_DESIGN_GUIDE_MARKER");
    expect(screen.getByRole("main")).toHaveAttribute(
      "data-design-guide",
      DESIGN_GUIDE_MARKER,
    );
  });

  it("shows every colour role with light and dark hex values", async () => {
    await renderGuide();
    const colour = screen.getByRole("region", { name: "Colour" });
    for (const role of tokenValues.colourRoleNames) {
      expect(within(colour).getByTestId(`colour-${role}`)).toHaveTextContent(
        role,
      );
    }
    expect(within(colour).getAllByText(/^#[0-9a-f]{6,8}$/).length).toBe(
      tokenValues.colourRoleNames.length * 2,
    );
  });

  it("lists every contrast pair, all passing", async () => {
    await renderGuide();
    const table = screen.getByRole("table", { name: /contrast/i });
    // One header row plus one row per pair.
    expect(within(table).getAllByRole("row")).toHaveLength(
      CONTRAST_PAIRS.length + 1,
    );
    expect(within(table).queryByText(/Fail/)).toBeNull();
    expect(within(table).getAllByText(/Pass/).length).toBe(
      CONTRAST_PAIRS.length * 2,
    );
  });

  it("shows the type scale, spacing, radii, elevation, motion and z layers from the tokens", async () => {
    await renderGuide();
    const type = screen.getByRole("region", { name: "Type" });
    for (const name of Object.keys(tokenValues.typeScale)) {
      expect(within(type).getByTestId(`type-${name}`)).toBeInTheDocument();
    }
    const spacing = screen.getByRole("region", { name: "Spacing" });
    for (const value of Object.values(tokenValues.space)) {
      expect(within(spacing).getAllByText(value).length).toBeGreaterThan(0);
    }
    const radii = screen.getByRole("region", { name: "Radii" });
    for (const name of Object.keys(tokenValues.radius)) {
      expect(within(radii).getByText(name)).toBeInTheDocument();
    }
    const elevation = screen.getByRole("region", { name: "Elevation" });
    expect(within(elevation).getByText("floating")).toBeInTheDocument();
    expect(within(elevation).getByText("sheet")).toBeInTheDocument();
    const motion = screen.getByRole("region", { name: "Motion" });
    for (const value of Object.values(tokenValues.motion.duration)) {
      expect(within(motion).getByText(value)).toBeInTheDocument();
    }
    const layers = screen.getByRole("region", { name: "Z layers" });
    expect(
      within(layers)
        .getAllByRole("listitem")
        .map((item) => item.dataset.layer),
    ).toEqual([...tokenValues.zLayerOrder]);
  });

  it("shows the brand mark and name, the mark decorative", async () => {
    await renderGuide();
    const brand = screen.getByRole("region", { name: "Brand" });
    expect(within(brand).getAllByTestId("brand-mark").length).toBeGreaterThan(
      0,
    );
    expect(within(brand).getAllByTestId("brand-name").length).toBeGreaterThan(
      0,
    );
    for (const mark of within(brand).getAllByTestId("brand-mark")) {
      expect(mark).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("draws every icon the app uses, with its name", async () => {
    await renderGuide();
    const icons = screen.getByRole("region", { name: "Icons" });
    for (const name of Object.keys(APP_ICONS)) {
      expect(within(icons).getByText(name)).toBeInTheDocument();
    }
  });

  it("demonstrates every primitive under its own heading", async () => {
    await renderGuide();
    const components = screen.getByRole("region", { name: "Components" });
    for (const name of COMPONENT_NAMES) {
      expect(
        within(components).getByRole("heading", { level: 3, name }),
      ).toBeInTheDocument();
    }
    expect(
      within(components).getByRole("button", { name: "Measure" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(components).getByRole("button", { name: "Undo last point" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(within(components).getByRole("alert")).toBeInTheDocument();
    expect(
      within(components).getAllByRole("switch").length,
    ).toBeGreaterThanOrEqual(3);
    expect(within(components).getAllByRole("slider").length).toBe(2);
  });

  it("toggles the demo controls that hold state", async () => {
    await renderGuide();
    const chip = screen.getByRole("button", { name: "Satellite" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    const toggle = screen.getByRole("button", { name: "Measure" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    const streets = screen.getByRole("button", { name: "Streets" });
    fireEvent.click(streets);
    expect(streets).toHaveAttribute("aria-pressed", "false");
  });

  it("moves the current choice between list rows", async () => {
    await renderGuide();
    const positron = screen.getByRole("button", { name: /Positron/ });
    const liberty = screen.getByRole("button", { name: /Liberty/ });
    expect(positron).toHaveAttribute("aria-current", "true");
    fireEvent.click(liberty);
    expect(liberty).toHaveAttribute("aria-current", "true");
    expect(positron).not.toHaveAttribute("aria-current");
    fireEvent.click(positron);
    expect(positron).toHaveAttribute("aria-current", "true");
  });

  it("keeps the demo messages on the page when dismissed", async () => {
    await renderGuide();
    const components = screen.getByRole("region", { name: "Components" });
    for (const dismiss of within(components).getAllByRole("button", {
      name: "Dismiss",
    })) {
      fireEvent.click(dismiss);
    }
    expect(within(components).getByRole("alert")).toHaveTextContent(
      "Search is not responding.",
    );
    expect(within(components).getAllByRole("status")).toHaveLength(2);
  });

  it("sets the theme through the theme service", async () => {
    const services = await renderGuide();
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    fireEvent.click(within(group).getByRole("radio", { name: "Dark" }));
    expect(services.settings.get().theme).toBe("dark");
    expect(services.fakes.theme.appliedTheme).toBe("dark");
  });

  it("reports the font as loaded, visibly and as data", async () => {
    await renderGuide();
    const gate = screen.getByTestId("font-gate");
    expect(gate).toHaveAttribute("data-font-loaded", "true");
    expect(gate).toHaveTextContent("IBM Plex Sans loaded");
  });

  it("reports a font that did not load", async () => {
    await renderGuide(() =>
      Promise.resolve({ loaded: false, reason: "Weight 600 is not loaded." }),
    );
    const gate = screen.getByTestId("font-gate");
    expect(gate).toHaveAttribute("data-font-loaded", "false");
    expect(gate).toHaveTextContent("IBM Plex Sans did not load");
    expect(gate).toHaveTextContent("Weight 600 is not loaded.");
  });
});

describe("DesignGuide on the server", () => {
  const html = renderToString(
    providers(
      createFakeServices(),
      <DesignGuide checkFont={() => new Promise(() => undefined)} />,
    ),
  );

  it("renders with no style attributes, which the CSP would block", () => {
    expect(html).not.toMatch(/\sstyle=/);
  });

  it("renders the sections and the font check as pending", () => {
    for (const section of GUIDE_SECTIONS) {
      expect(html).toContain(`id="${section.id}"`);
    }
    expect(html).toContain('data-font-loaded="pending"');
  });
});
