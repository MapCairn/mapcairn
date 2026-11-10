import {
  BASEMAPS,
  type BasemapDefinition,
  createBasemapCatalogue,
  createFakeServices,
  FAKE_CREDITED_BASEMAP,
  getBasemap,
  MapEngineError,
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

describe("useBasemapChoice with a basemap that has terms", () => {
  const catalogue = createBasemapCatalogue([
    ...BASEMAPS,
    FAKE_CREDITED_BASEMAP,
  ]);

  function setupCredited(stored: string, linked?: string) {
    const services = createFakeServices({ basemaps: catalogue });
    services.fakes.settings.set({ basemapId: stored });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ServicesProvider services={services}>{children}</ServicesProvider>
    );
    const hook = renderHook(() => useBasemapChoice(linked), { wrapper });
    return { services, hook };
  }

  const ids = (hook: ReturnType<typeof setupCredited>["hook"]) =>
    hook.result.current.inUse.map((item) => item.id);

  it("resolves a host basemap by id, saved or linked", () => {
    expect(setupCredited("fake-credited").hook.result.current.basemap.id).toBe(
      "fake-credited",
    );
    expect(
      setupCredited("positron", "fake-credited").hook.result.current.basemap.id,
    ).toBe("fake-credited");
  });

  it("falls back to the host's default for the removed dark id", () => {
    expect(setupCredited("dark").hook.result.current.basemap.id).toBe(
      "liberty",
    );
  });

  it("has only the shown basemap in use when nothing is loading", () => {
    expect(ids(setupCredited("fake-credited").hook)).toEqual(["fake-credited"]);
    expect(ids(setupCredited("liberty").hook)).toEqual(["liberty"]);
  });

  it("keeps a basemap in use while another is requested over it, until the new one has loaded", () => {
    const { hook } = setupCredited("fake-credited");
    act(() => hook.result.current.choose("liberty"));
    expect(hook.result.current.basemap.id).toBe("liberty");
    expect(ids(hook)).toEqual(["liberty", "fake-credited"]);

    act(() => hook.result.current.applied(basemap("liberty")));
    expect(ids(hook)).toEqual(["liberty"]);
  });

  it("puts a requested basemap in use as soon as it is asked for, before it has loaded", () => {
    const { hook } = setupCredited("liberty");
    act(() => hook.result.current.choose("fake-credited"));
    expect(ids(hook)).toEqual(["fake-credited", "liberty"]);
    act(() => hook.result.current.applied(FAKE_CREDITED_BASEMAP));
    expect(ids(hook)).toEqual(["fake-credited"]);
  });

  it("keeps the credited basemap in use when the swap away from it fails", () => {
    const { hook } = setupCredited("fake-credited");
    act(() => hook.result.current.choose("liberty"));
    act(() =>
      hook.result.current.failed(
        new Error("404"),
        basemap("liberty"),
        FAKE_CREDITED_BASEMAP,
      ),
    );
    expect(ids(hook)).toEqual(["fake-credited"]);
  });
});

describe("useBasemapChoice drawn basemap", () => {
  const catalogue = createBasemapCatalogue([
    ...BASEMAPS,
    FAKE_CREDITED_BASEMAP,
  ]);

  function setupCredited(stored: string) {
    const services = createFakeServices({ basemaps: catalogue });
    services.fakes.settings.set({ basemapId: stored });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ServicesProvider services={services}>{children}</ServicesProvider>
    );
    const hook = renderHook(() => useBasemapChoice(undefined), { wrapper });
    return { services, hook };
  }

  const ids = (hook: ReturnType<typeof setupCredited>["hook"]) =>
    hook.result.current.inUse.map((item) => item.id);

  it("follows a saved basemap that changes elsewhere, such as another tab, once the map has drawn it", () => {
    const { services, hook } = setupCredited("liberty");
    act(() => services.fakes.settings.set({ basemapId: "fake-credited" }));
    expect(hook.result.current.basemap.id).toBe("fake-credited");
    // Until the swap loads, the old basemap is still on screen.
    expect(ids(hook)).toEqual(["fake-credited", "liberty"]);

    // No local choice is pending, but the map still reports what loaded.
    act(() => hook.result.current.applied(FAKE_CREDITED_BASEMAP));
    expect(ids(hook)).toEqual(["fake-credited"]);

    // A later choice then starts from the basemap that is really drawn.
    act(() => hook.result.current.choose("liberty"));
    expect(ids(hook)).toEqual(["liberty", "fake-credited"]);
    act(() => hook.result.current.applied(basemap("liberty")));
    expect(ids(hook)).toEqual(["liberty"]);
  });

  it("settles on the last of two choices made before the first has loaded", () => {
    const { services, hook } = setupCredited("liberty");
    act(() => hook.result.current.choose("fake-credited"));
    act(() => hook.result.current.choose("positron"));
    expect(ids(hook)).toEqual(["positron", "liberty"]);

    act(() => hook.result.current.applied(basemap("positron")));
    expect(ids(hook)).toEqual(["positron"]);
    expect(services.fakes.settings.get().basemapId).toBe("positron");
  });

  it("is drawn by whatever loaded, even if the earlier choice did report first", () => {
    const { hook } = setupCredited("liberty");
    act(() => hook.result.current.choose("fake-credited"));
    act(() => hook.result.current.choose("positron"));
    act(() => hook.result.current.applied(FAKE_CREDITED_BASEMAP));
    expect(ids(hook)).toEqual(["positron", "fake-credited"]);
    act(() => hook.result.current.applied(basemap("positron")));
    expect(ids(hook)).toEqual(["positron"]);
  });

  it("keeps the credit off when the swap to the credited basemap fails", () => {
    const { services, hook } = setupCredited("liberty");
    act(() => hook.result.current.choose("fake-credited"));
    expect(ids(hook)).toEqual(["fake-credited", "liberty"]);
    act(() =>
      hook.result.current.failed(
        new Error("404"),
        FAKE_CREDITED_BASEMAP,
        basemap("liberty"),
      ),
    );
    expect(ids(hook)).toEqual(["liberty"]);
    expect(hook.result.current.failure?.name).toBe("Fake credited");
    expect(services.fakes.settings.get().basemapId).toBe("liberty");
  });

  it("takes what the map says it kept as what is drawn, even if it was never reported as loaded", () => {
    const { hook } = setupCredited("liberty");
    act(() => hook.result.current.choose("fake-credited"));
    act(() => hook.result.current.choose("positron"));
    // The engine kept the credited basemap, whose own load went unreported
    // because a newer choice superseded it.
    act(() =>
      hook.result.current.failed(
        new Error("404"),
        basemap("positron"),
        FAKE_CREDITED_BASEMAP,
      ),
    );
    expect(ids(hook)).toEqual(["fake-credited"]);
  });
});

describe("useBasemapChoice when the map cannot start on a basemap", () => {
  const catalogue = createBasemapCatalogue([
    ...BASEMAPS,
    FAKE_CREDITED_BASEMAP,
  ]);

  function setupCredited(stored: string, linked?: string) {
    const services = createFakeServices({ basemaps: catalogue });
    services.fakes.settings.set({ basemapId: stored });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ServicesProvider services={services}>{children}</ServicesProvider>
    );
    const hook = renderHook(() => useBasemapChoice(linked), { wrapper });
    return { services, hook };
  }

  const loadFailed = new MapEngineError("load-failed");

  it("falls back to the default, names the basemap that failed and puts its credit and image block down", () => {
    const { services, hook } = setupCredited("fake-credited");
    act(() =>
      hook.result.current.mountFailed(loadFailed, FAKE_CREDITED_BASEMAP),
    );
    expect(hook.result.current.basemap.id).toBe("liberty");
    expect(hook.result.current.failure).toEqual({
      name: "Fake credited",
      kept: basemap("liberty"),
      atMount: true,
    });
    expect(hook.result.current.inUse.map((item) => item.id)).toEqual([
      "liberty",
    ]);
    // Nothing is saved by a failure.
    expect(services.fakes.settings.get().basemapId).toBe("fake-credited");
  });

  it("saves the default when the person goes back, so the next start no longer asks for the failed basemap", () => {
    const { services, hook } = setupCredited("fake-credited");
    act(() =>
      hook.result.current.mountFailed(loadFailed, FAKE_CREDITED_BASEMAP),
    );
    act(() => hook.result.current.goBack());
    expect(hook.result.current.failure).toBeNull();
    expect(hook.result.current.choice).toBe("liberty");
    expect(hook.result.current.basemap.id).toBe("liberty");
    expect(services.fakes.settings.get().basemapId).toBe("liberty");
  });

  it("does the same for a basemap named by a link, which it then stops using", () => {
    const { hook } = setupCredited("positron", "fake-credited");
    expect(hook.result.current.basemap.id).toBe("fake-credited");
    act(() =>
      hook.result.current.mountFailed(loadFailed, FAKE_CREDITED_BASEMAP),
    );
    act(() => hook.result.current.goBack());
    expect(hook.result.current.savedChoice).toBe("liberty");
  });

  it("leaves a failure of the default basemap, or of the engine itself, alone", () => {
    const { hook } = setupCredited("liberty");
    act(() => hook.result.current.mountFailed(loadFailed, basemap("liberty")));
    expect(hook.result.current.failure).toBeNull();
    const credited = setupCredited("fake-credited");
    act(() =>
      credited.hook.result.current.mountFailed(
        new MapEngineError("webgl-unavailable"),
        FAKE_CREDITED_BASEMAP,
      ),
    );
    act(() =>
      credited.hook.result.current.mountFailed(
        new MapEngineError("stopped"),
        FAKE_CREDITED_BASEMAP,
      ),
    );
    expect(credited.hook.result.current.failure).toBeNull();
    expect(credited.hook.result.current.basemap.id).toBe("fake-credited");
  });
});
