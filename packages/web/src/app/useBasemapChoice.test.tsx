import {
  type BasemapDefinition,
  createFakeServices,
  getBasemap,
} from "@karta/core";
import { ServicesProvider } from "@karta/map";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useBasemapChoice } from "./useBasemapChoice";

function basemap(id: string): BasemapDefinition {
  const found = getBasemap(id);
  if (!found) {
    throw new Error(`No basemap ${id}`);
  }
  return found;
}

function setup(
  stored: string | null = "positron",
  linked: string | undefined = undefined,
) {
  const services = createFakeServices();
  if (stored !== null) {
    services.fakes.settings.set({ basemapId: stored });
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  const hook = renderHook(() => useBasemapChoice(linked), { wrapper });
  return { services, hook };
}

describe("useBasemapChoice", () => {
  it("shows Liberty when nothing is saved or linked", () => {
    const { hook } = setup(null);
    expect(hook.result.current.choice).toBe("liberty");
    expect(hook.result.current.savedChoice).toBe("liberty");
    expect(hook.result.current.basemap.id).toBe("liberty");
  });

  it("treats a saved auto or dark choice from an earlier version as Liberty, without saving anything", () => {
    const { services, hook } = setup("auto");
    expect(setup("dark").hook.result.current.basemap.id).toBe("liberty");
    expect(hook.result.current.choice).toBe("liberty");
    expect(hook.result.current.savedChoice).toBe("liberty");
    expect(hook.result.current.basemap.id).toBe("liberty");
    expect(services.fakes.settings.get().basemapId).toBe("auto");
  });

  it("treats a linked auto, dark or retired basemap as Liberty", () => {
    for (const linked of ["auto", "dark", "retired-basemap"]) {
      const { hook } = setup("positron", linked);
      expect(hook.result.current.savedChoice).toBe("liberty");
      expect(hook.result.current.basemap.id).toBe("liberty");
    }
  });

  it("keeps an explicit saved choice and a linked one", () => {
    expect(setup("positron").hook.result.current.basemap.id).toBe("positron");
    expect(setup("positron", "osm").hook.result.current.basemap.id).toBe("osm");
  });

  it("saves Liberty at once when it is chosen over a saved auto choice", () => {
    const { services, hook } = setup("auto");
    act(() => hook.result.current.choose("liberty"));
    expect(services.fakes.settings.get().basemapId).toBe("liberty");
  });

  it("saves a choice only once it has loaded", () => {
    const { services, hook } = setup();
    act(() => hook.result.current.choose("osm"));
    expect(hook.result.current.choice).toBe("osm");
    expect(hook.result.current.basemap.id).toBe("osm");
    expect(hook.result.current.savedChoice).toBe("positron");
    expect(services.fakes.settings.get().basemapId).toBe("positron");

    act(() => hook.result.current.applied(basemap("osm")));
    expect(services.fakes.settings.get().basemapId).toBe("osm");
    expect(hook.result.current.savedChoice).toBe("osm");
  });

  it("does not save a basemap chosen again while its swap is still loading", () => {
    const { services, hook } = setup();
    act(() => hook.result.current.choose("osm"));
    act(() => hook.result.current.choose("osm"));
    expect(services.fakes.settings.get().basemapId).toBe("positron");
  });

  it("ignores a loaded basemap it did not ask for", () => {
    const { services, hook } = setup();
    act(() => hook.result.current.choose("osm"));
    act(() => hook.result.current.applied(basemap("liberty")));
    expect(services.fakes.settings.get().basemapId).toBe("positron");
    expect(hook.result.current.choice).toBe("osm");
  });

  it("draws the kept basemap after a failure, and goes back to the saved choice", () => {
    const { services, hook } = setup();
    const positron = hook.result.current.basemap;
    act(() => hook.result.current.choose("osm"));
    act(() =>
      hook.result.current.failed(new Error("404"), basemap("osm"), positron),
    );
    expect(hook.result.current.failure?.name).toBe("Streets");
    expect(hook.result.current.basemap).toBe(positron);
    expect(hook.result.current.choice).toBe("osm");

    act(() => hook.result.current.goBack());
    expect(hook.result.current.failure).toBeNull();
    expect(hook.result.current.choice).toBe("positron");
    expect(hook.result.current.basemap.id).toBe("positron");
    expect(services.fakes.settings.get().basemapId).toBe("positron");
  });
});
