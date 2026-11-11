import {
  BASEMAPS,
  type BasemapDefinition,
  createBasemapCatalogue,
  createFakeServices,
  FAKE_CREDITED_BASEMAP,
  getBasemap,
  MapEngineError,
} from "@mapcairn/core";
import { ServicesProvider } from "@mapcairn/map";
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
  it("shows Bright when nothing is saved or linked", () => {
    const { hook } = setup(null);
    expect(hook.result.current.choice).toBe("bright");
    expect(hook.result.current.savedChoice).toBe("bright");
    expect(hook.result.current.basemap.id).toBe("bright");
  });

  it("opens a saved or linked dark on Dark", () => {
    expect(setup("dark").hook.result.current.basemap.id).toBe("dark");
    expect(setup("positron", "dark").hook.result.current.basemap.id).toBe(
      "dark",
    );
  });

  it("treats a saved auto or Maptoolkit Dark choice from an earlier version as Bright, without saving anything", () => {
    const { services, hook } = setup("auto");
    expect(setup("maptoolkit-dark").hook.result.current.basemap.id).toBe(
      "bright",
    );
    expect(hook.result.current.choice).toBe("bright");
    expect(hook.result.current.savedChoice).toBe("bright");
    expect(hook.result.current.basemap.id).toBe("bright");
    expect(services.fakes.settings.get().basemapId).toBe("auto");
  });

  it("treats a linked auto, Maptoolkit Dark or retired basemap as Bright", () => {
    for (const linked of ["auto", "maptoolkit-dark", "retired-basemap"]) {
      const { hook } = setup("positron", linked);
      expect(hook.result.current.savedChoice).toBe("bright");
      expect(hook.result.current.basemap.id).toBe("bright");
    }
  });

  it("keeps a saved or linked Liberty on Liberty, now that Bright is the default", () => {
    expect(setup("liberty").hook.result.current.basemap.id).toBe("liberty");
    expect(setup("positron", "liberty").hook.result.current.basemap.id).toBe(
      "liberty",
    );
  });

  it("keeps an explicit saved choice and a linked one", () => {
    expect(setup("positron").hook.result.current.basemap.id).toBe("positron");
    expect(setup("positron", "osm").hook.result.current.basemap.id).toBe("osm");
  });

  it("saves Bright at once when it is chosen over a saved auto choice", () => {
    const { services, hook } = setup("auto");
    act(() => hook.result.current.choose("bright"));
    expect(services.fakes.settings.get().basemapId).toBe("bright");
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
    act(() => hook.result.current.applied(basemap("bright")));
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
    expect(hook.result.current.failure?.id).toBe("osm");
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

  it("falls back to the host's default for a removed id", () => {
    expect(
      setupCredited("maptoolkit-dark").hook.result.current.basemap.id,
    ).toBe("bright");
  });

  it("has only the shown basemap in use when nothing is loading", () => {
    expect(ids(setupCredited("fake-credited").hook)).toEqual(["fake-credited"]);
    expect(ids(setupCredited("bright").hook)).toEqual(["bright"]);
  });

  it("keeps a basemap in use while another is requested over it, until the new one has loaded", () => {
    const { hook } = setupCredited("fake-credited");
    act(() => hook.result.current.choose("bright"));
    expect(hook.result.current.basemap.id).toBe("bright");
    expect(ids(hook)).toEqual(["bright", "fake-credited"]);

    act(() => hook.result.current.applied(basemap("bright")));
    expect(ids(hook)).toEqual(["bright"]);
  });

  it("puts a requested basemap in use as soon as it is asked for, before it has loaded", () => {
    const { hook } = setupCredited("bright");
    act(() => hook.result.current.choose("fake-credited"));
    expect(ids(hook)).toEqual(["fake-credited", "bright"]);
    act(() => hook.result.current.applied(FAKE_CREDITED_BASEMAP));
    expect(ids(hook)).toEqual(["fake-credited"]);
  });

  it("keeps the credited basemap in use when the swap away from it fails", () => {
    const { hook } = setupCredited("fake-credited");
    act(() => hook.result.current.choose("bright"));
    act(() =>
      hook.result.current.failed(
        new Error("404"),
        basemap("bright"),
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
    const { services, hook } = setupCredited("bright");
    act(() => services.fakes.settings.set({ basemapId: "fake-credited" }));
    expect(hook.result.current.basemap.id).toBe("fake-credited");
    // Until the swap loads, the old basemap is still on screen.
    expect(ids(hook)).toEqual(["fake-credited", "bright"]);

    // No local choice is pending, but the map still reports what loaded.
    act(() => hook.result.current.applied(FAKE_CREDITED_BASEMAP));
    expect(ids(hook)).toEqual(["fake-credited"]);

    // A later choice then starts from the basemap that is really drawn.
    act(() => hook.result.current.choose("bright"));
    expect(ids(hook)).toEqual(["bright", "fake-credited"]);
    act(() => hook.result.current.applied(basemap("bright")));
    expect(ids(hook)).toEqual(["bright"]);
  });

  it("settles on the last of two choices made before the first has loaded", () => {
    const { services, hook } = setupCredited("bright");
    act(() => hook.result.current.choose("fake-credited"));
    act(() => hook.result.current.choose("positron"));
    expect(ids(hook)).toEqual(["positron", "bright"]);

    act(() => hook.result.current.applied(basemap("positron")));
    expect(ids(hook)).toEqual(["positron"]);
    expect(services.fakes.settings.get().basemapId).toBe("positron");
  });

  it("is drawn by whatever loaded, even if the earlier choice did report first", () => {
    const { hook } = setupCredited("bright");
    act(() => hook.result.current.choose("fake-credited"));
    act(() => hook.result.current.choose("positron"));
    act(() => hook.result.current.applied(FAKE_CREDITED_BASEMAP));
    expect(ids(hook)).toEqual(["positron", "fake-credited"]);
    act(() => hook.result.current.applied(basemap("positron")));
    expect(ids(hook)).toEqual(["positron"]);
  });

  it("keeps the credit off when the swap to the credited basemap fails", () => {
    const { services, hook } = setupCredited("bright");
    act(() => hook.result.current.choose("fake-credited"));
    expect(ids(hook)).toEqual(["fake-credited", "bright"]);
    act(() =>
      hook.result.current.failed(
        new Error("404"),
        FAKE_CREDITED_BASEMAP,
        basemap("bright"),
      ),
    );
    expect(ids(hook)).toEqual(["bright"]);
    expect(hook.result.current.failure?.name).toBe("Fake credited");
    expect(services.fakes.settings.get().basemapId).toBe("bright");
  });

  it("takes what the map says it kept as what is drawn, even if it was never reported as loaded", () => {
    const { hook } = setupCredited("bright");
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
    expect(hook.result.current.basemap.id).toBe("bright");
    expect(hook.result.current.failure).toEqual({
      id: "fake-credited",
      name: "Fake credited",
      kept: basemap("bright"),
      atMount: true,
    });
    expect(hook.result.current.inUse.map((item) => item.id)).toEqual([
      "bright",
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
    expect(hook.result.current.choice).toBe("bright");
    expect(hook.result.current.basemap.id).toBe("bright");
    expect(services.fakes.settings.get().basemapId).toBe("bright");
  });

  it("does the same for a basemap named by a link, which it then stops using", () => {
    const { hook } = setupCredited("positron", "fake-credited");
    expect(hook.result.current.basemap.id).toBe("fake-credited");
    act(() =>
      hook.result.current.mountFailed(loadFailed, FAKE_CREDITED_BASEMAP),
    );
    act(() => hook.result.current.goBack());
    expect(hook.result.current.savedChoice).toBe("bright");
  });

  it("leaves a failure of the default basemap, or of the engine itself, alone", () => {
    const { hook } = setupCredited("bright");
    act(() => hook.result.current.mountFailed(loadFailed, basemap("bright")));
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

describe("useBasemapChoice when every tile of a basemap fails", () => {
  const streets = basemap("osm");
  const liberty = basemap("liberty");
  const bright = basemap("bright");

  function drawn(
    hook: ReturnType<typeof setup>["hook"],
    loaded: BasemapDefinition,
  ) {
    act(() => hook.result.current.applied(loaded));
  }

  it("marks the basemap unavailable and goes back to the one drawn before it, naming the failure", () => {
    const { hook } = setup("liberty");
    drawn(hook, liberty);
    act(() => hook.result.current.choose("osm"));
    drawn(hook, streets);
    act(() => hook.result.current.unavailableNow(streets));
    expect(hook.result.current.basemap.id).toBe("liberty");
    expect(hook.result.current.failure).toEqual({
      id: "osm",
      name: "Streets",
      kept: liberty,
      unavailable: true,
    });
    expect(hook.result.current.inUse.map((item) => item.id)).toEqual([
      "liberty",
    ]);
  });

  it("falls back to the default when there is no earlier basemap, such as a saved one at start", () => {
    const { hook } = setup("osm");
    act(() => hook.result.current.unavailableNow(streets));
    expect(hook.result.current.basemap.id).toBe("bright");
    expect(hook.result.current.failure?.kept).toBe(bright);
  });

  it("never falls back to a basemap that is itself unavailable", () => {
    const { hook } = setup("liberty");
    drawn(hook, liberty);
    act(() => hook.result.current.choose("osm"));
    drawn(hook, streets);
    act(() => hook.result.current.unavailableNow(liberty));
    act(() => hook.result.current.unavailableNow(streets));
    // Liberty and Streets are both marked, so the default is what is left.
    expect(hook.result.current.basemap.id).toBe("bright");
  });

  it("stays on the basemap, and says so, when nothing else is left to draw", () => {
    const { hook } = setup("bright");
    act(() => hook.result.current.unavailableNow(bright));
    expect(hook.result.current.basemap.id).toBe("bright");
    expect(hook.result.current.failure).toEqual({
      id: "bright",
      name: "Bright",
      kept: bright,
      unavailable: true,
    });
  });

  it("never keeps a basemap chosen in this session that then turned out to be down: the earlier saved one comes back", () => {
    const { services, hook } = setup("liberty");
    drawn(hook, liberty);
    act(() => hook.result.current.choose("osm"));
    // Saved as soon as its style loaded, before any tile had failed.
    drawn(hook, streets);
    expect(services.fakes.settings.get().basemapId).toBe("osm");
    act(() => hook.result.current.unavailableNow(streets));
    expect(services.fakes.settings.get().basemapId).toBe("liberty");
    expect(hook.result.current.savedChoice).toBe("liberty");
    // The picker shows the basemap the map went back to.
    expect(hook.result.current.choice).toBe("liberty");
    act(() => hook.result.current.goBack());
    expect(services.fakes.settings.get().basemapId).toBe("liberty");
    expect(hook.result.current.failure).toBeNull();
  });

  it("restores the earlier choice when the report comes before a render, as the engine can send it straight after the style loaded", () => {
    const { services, hook } = setup("liberty");
    drawn(hook, liberty);
    act(() => hook.result.current.choose("osm"));
    const { applied, unavailableNow } = hook.result.current;
    act(() => {
      applied(streets);
      unavailableNow(streets);
    });
    expect(services.fakes.settings.get().basemapId).toBe("liberty");
  });

  it("restores the earlier saved choice even when the map had to fall back to the default", () => {
    const { services, hook } = setup("liberty");
    act(() => hook.result.current.unavailableNow(liberty));
    act(() => hook.result.current.goBack());
    expect(services.fakes.settings.get().basemapId).toBe("bright");
    act(() => hook.result.current.choose("osm"));
    drawn(hook, streets);
    act(() => hook.result.current.unavailableNow(streets));
    expect(services.fakes.settings.get().basemapId).toBe("bright");
  });

  it("restores the choice saved before it when nothing had been chosen yet", () => {
    const { services, hook } = setup(null);
    act(() => hook.result.current.choose("osm"));
    drawn(hook, streets);
    expect(services.fakes.settings.get().basemapId).toBe("osm");
    act(() => hook.result.current.unavailableNow(streets));
    expect(hook.result.current.savedChoice).toBe("bright");
    expect(services.fakes.settings.get().basemapId).not.toBe("osm");
  });

  it("leaves a long-standing saved choice alone when its provider is down, until the person goes back", () => {
    const { services, hook } = setup("osm");
    act(() => hook.result.current.unavailableNow(streets));
    expect(hook.result.current.basemap.id).toBe("bright");
    expect(services.fakes.settings.get().basemapId).toBe("osm");
    act(() => hook.result.current.goBack());
    expect(services.fakes.settings.get().basemapId).toBe("bright");
  });

  it("leaves a basemap named by a link alone, without saving anything", () => {
    const { services, hook } = setup("positron", "osm");
    act(() => hook.result.current.unavailableNow(streets));
    expect(hook.result.current.basemap.id).toBe("bright");
    expect(services.fakes.settings.get().basemapId).toBe("positron");
  });

  it("restores only for the basemap that was chosen, not for an earlier choice reported late", () => {
    const { services, hook } = setup("liberty");
    drawn(hook, liberty);
    act(() => hook.result.current.choose("osm"));
    drawn(hook, streets);
    act(() => hook.result.current.choose("positron"));
    drawn(hook, basemap("positron"));
    act(() => hook.result.current.unavailableNow(streets));
    expect(services.fakes.settings.get().basemapId).toBe("positron");
    expect(hook.result.current.failure).toBeNull();
  });

  it("names the basemap that failed by id as well as by name", () => {
    const { hook } = setup("liberty");
    drawn(hook, liberty);
    act(() => hook.result.current.choose("osm"));
    drawn(hook, streets);
    act(() => hook.result.current.unavailableNow(streets));
    expect(hook.result.current.failure?.id).toBe("osm");
  });

  it("only marks a basemap that is no longer the one asked for, and does not switch the map", () => {
    const { hook } = setup("liberty");
    drawn(hook, liberty);
    act(() => hook.result.current.unavailableNow(streets));
    expect(hook.result.current.basemap.id).toBe("liberty");
    expect(hook.result.current.failure).toBeNull();
  });

  it("clears the mark once the basemap draws, so a recovered provider is trusted again", () => {
    const { hook } = setup("bright");
    act(() => hook.result.current.unavailableNow(liberty));
    act(() => hook.result.current.choose("liberty"));
    drawn(hook, liberty);
    act(() => hook.result.current.choose("osm"));
    drawn(hook, streets);
    act(() => hook.result.current.unavailableNow(streets));
    // Liberty drew again, so it is a valid place to go back to, not the default.
    expect(hook.result.current.failure?.kept.id).toBe("liberty");
  });
});
