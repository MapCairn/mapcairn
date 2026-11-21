// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  BASEMAPS,
  type BasemapDefinition,
  createBasemapCatalogue,
  createFakeServices,
  FAKE_VECTOR_BASEMAP,
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
    expect(hook.result.current.failure?.name).toBe("basemap.osm.name");
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

/** A basemap that only a host would offer. */
const HOSTED_BASEMAP: BasemapDefinition = {
  ...FAKE_VECTOR_BASEMAP,
  id: "fake-hosted",
  name: "Fake hosted",
};

describe("useBasemapChoice with a host's basemap", () => {
  const catalogue = createBasemapCatalogue([...BASEMAPS, HOSTED_BASEMAP]);

  function setupHosted(stored: string, linked?: string) {
    const services = createFakeServices({ basemaps: catalogue });
    services.fakes.settings.set({ basemapId: stored });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ServicesProvider services={services}>{children}</ServicesProvider>
    );
    const hook = renderHook(() => useBasemapChoice(linked), { wrapper });
    return { services, hook };
  }

  it("resolves a host basemap by id, saved or linked", () => {
    expect(setupHosted("fake-hosted").hook.result.current.basemap.id).toBe(
      "fake-hosted",
    );
    expect(
      setupHosted("positron", "fake-hosted").hook.result.current.basemap.id,
    ).toBe("fake-hosted");
  });

  it("falls back to the host's default for a removed id", () => {
    expect(setupHosted("maptoolkit-dark").hook.result.current.basemap.id).toBe(
      "bright",
    );
  });

  it("settles on the last of two choices made before the first has loaded", () => {
    const { services, hook } = setupHosted("bright");
    act(() => hook.result.current.choose("fake-hosted"));
    act(() => hook.result.current.choose("positron"));
    expect(hook.result.current.basemap.id).toBe("positron");

    act(() => hook.result.current.applied(basemap("positron")));
    expect(services.fakes.settings.get().basemapId).toBe("positron");
  });

  it("falls back to the basemap drawn before, once a basemap that changed elsewhere has loaded and then proves to be down", () => {
    const { services, hook } = setupHosted("positron");
    act(() => services.fakes.settings.set({ basemapId: "fake-hosted" }));
    expect(hook.result.current.basemap.id).toBe("fake-hosted");
    // No local choice is pending, but the map still reports what loaded.
    act(() => hook.result.current.applied(HOSTED_BASEMAP));
    act(() => hook.result.current.unavailableNow(HOSTED_BASEMAP));
    // Positron was drawn before, and is not the default, so it is the
    // drawn-before basemap that comes back.
    expect(hook.result.current.basemap.id).toBe("positron");
    expect(hook.result.current.failure).toEqual({
      id: "fake-hosted",
      name: "Fake hosted",
      kept: basemap("positron"),
      unavailable: true,
    });
  });

  it("names the host basemap that failed to load, and saves nothing", () => {
    const { services, hook } = setupHosted("bright");
    act(() => hook.result.current.choose("fake-hosted"));
    act(() =>
      hook.result.current.failed(
        new Error("404"),
        HOSTED_BASEMAP,
        basemap("bright"),
      ),
    );
    expect(hook.result.current.basemap.id).toBe("bright");
    expect(hook.result.current.failure?.name).toBe("Fake hosted");
    expect(services.fakes.settings.get().basemapId).toBe("bright");
  });

  it("takes what the map says it kept as the basemap to draw, even if the one it kept was never reported as loaded", () => {
    const { hook } = setupHosted("bright");
    act(() => hook.result.current.choose("fake-hosted"));
    act(() => hook.result.current.choose("positron"));
    // The engine kept the host basemap, whose own load went unreported
    // because a newer choice superseded it.
    act(() =>
      hook.result.current.failed(
        new Error("404"),
        basemap("positron"),
        HOSTED_BASEMAP,
      ),
    );
    expect(hook.result.current.basemap.id).toBe("fake-hosted");
  });
});

describe("useBasemapChoice when the map cannot start on a basemap", () => {
  const catalogue = createBasemapCatalogue([...BASEMAPS, HOSTED_BASEMAP]);

  function setupHosted(stored: string, linked?: string) {
    const services = createFakeServices({ basemaps: catalogue });
    services.fakes.settings.set({ basemapId: stored });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ServicesProvider services={services}>{children}</ServicesProvider>
    );
    const hook = renderHook(() => useBasemapChoice(linked), { wrapper });
    return { services, hook };
  }

  const loadFailed = new MapEngineError("load-failed");

  it("falls back to the default and names the basemap that failed", () => {
    const { services, hook } = setupHosted("fake-hosted");
    act(() => hook.result.current.mountFailed(loadFailed, HOSTED_BASEMAP));
    expect(hook.result.current.basemap.id).toBe("bright");
    expect(hook.result.current.failure).toEqual({
      id: "fake-hosted",
      name: "Fake hosted",
      kept: basemap("bright"),
      atMount: true,
    });
    // Nothing is saved by a failure.
    expect(services.fakes.settings.get().basemapId).toBe("fake-hosted");
  });

  it("saves the default when the person goes back, so the next start no longer asks for the failed basemap", () => {
    const { services, hook } = setupHosted("fake-hosted");
    act(() => hook.result.current.mountFailed(loadFailed, HOSTED_BASEMAP));
    act(() => hook.result.current.goBack());
    expect(hook.result.current.failure).toBeNull();
    expect(hook.result.current.choice).toBe("bright");
    expect(hook.result.current.basemap.id).toBe("bright");
    expect(services.fakes.settings.get().basemapId).toBe("bright");
  });

  it("does the same for a basemap named by a link, which it then stops using", () => {
    const { hook } = setupHosted("positron", "fake-hosted");
    expect(hook.result.current.basemap.id).toBe("fake-hosted");
    act(() => hook.result.current.mountFailed(loadFailed, HOSTED_BASEMAP));
    act(() => hook.result.current.goBack());
    expect(hook.result.current.savedChoice).toBe("bright");
  });

  it("leaves a failure of the default basemap, or of the engine itself, alone", () => {
    const { hook } = setupHosted("bright");
    act(() => hook.result.current.mountFailed(loadFailed, basemap("bright")));
    expect(hook.result.current.failure).toBeNull();
    const hosted = setupHosted("fake-hosted");
    act(() =>
      hosted.hook.result.current.mountFailed(
        new MapEngineError("webgl-unavailable"),
        HOSTED_BASEMAP,
      ),
    );
    act(() =>
      hosted.hook.result.current.mountFailed(
        new MapEngineError("stopped"),
        HOSTED_BASEMAP,
      ),
    );
    expect(hosted.hook.result.current.failure).toBeNull();
    expect(hosted.hook.result.current.basemap.id).toBe("fake-hosted");
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
      name: "basemap.osm.name",
      kept: liberty,
      unavailable: true,
    });
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
      name: "basemap.bright.name",
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
    expect(services.fakes.settings.get().basemapId).toBeNull();
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

describe("useBasemapChoice follows the theme until a basemap is chosen", () => {
  function setupFor(
    theme: "light" | "dark",
    options: {
      readonly stored?: string | null;
      readonly linked?: string;
      readonly themeChoice?: "system" | "light" | "dark";
    } = {},
  ) {
    const services = createFakeServices();
    services.fakes.theme.setSystemTheme(theme);
    if (options.stored !== undefined && options.stored !== null) {
      services.fakes.settings.set({ basemapId: options.stored });
    }
    if (options.themeChoice !== undefined) {
      services.fakes.settings.set({ theme: options.themeChoice });
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ServicesProvider services={services}>{children}</ServicesProvider>
    );
    const hook = renderHook(() => useBasemapChoice(options.linked), {
      wrapper,
    });
    return { services, hook };
  }

  it("shows Bright to a first visit in the light theme and Fiord in the dark theme, saving nothing", () => {
    const light = setupFor("light");
    expect(light.hook.result.current.basemap.id).toBe("bright");
    expect(light.hook.result.current.choice).toBe("bright");
    expect(light.services.fakes.settings.get().basemapId).toBeNull();

    const dark = setupFor("dark");
    expect(dark.hook.result.current.basemap.id).toBe("fiord");
    expect(dark.hook.result.current.choice).toBe("fiord");
    expect(dark.hook.result.current.savedChoice).toBe("fiord");
    expect(dark.services.fakes.settings.get().basemapId).toBeNull();
  });

  it("follows the system theme when the theme setting is System, and the chosen theme when it is not", () => {
    expect(
      setupFor("dark", { themeChoice: "light" }).hook.result.current.basemap.id,
    ).toBe("bright");
    expect(
      setupFor("light", { themeChoice: "dark" }).hook.result.current.basemap.id,
    ).toBe("fiord");
  });

  it("switches the default when the theme changes, live, for a visitor who never chose", () => {
    const { services, hook } = setupFor("light");
    expect(hook.result.current.basemap.id).toBe("bright");
    act(() => services.fakes.theme.setSystemTheme("dark"));
    expect(hook.result.current.basemap.id).toBe("fiord");
    expect(hook.result.current.choice).toBe("fiord");
    act(() => services.fakes.settings.set({ theme: "light" }));
    expect(hook.result.current.basemap.id).toBe("bright");
    expect(services.fakes.settings.get().basemapId).toBeNull();
  });

  it("keeps a chosen basemap when the theme changes, even the default's own id", () => {
    const picked = setupFor("light", { stored: "liberty" });
    act(() => picked.services.fakes.theme.setSystemTheme("dark"));
    expect(picked.hook.result.current.basemap.id).toBe("liberty");

    const brightPicked = setupFor("light", { stored: "bright" });
    act(() => brightPicked.services.fakes.theme.setSystemTheme("dark"));
    expect(brightPicked.hook.result.current.basemap.id).toBe("bright");
  });

  it("keeps the basemap chosen in this visit across a theme change and a reload", () => {
    const { services, hook } = setupFor("dark");
    act(() => hook.result.current.choose("bright"));
    act(() => hook.result.current.applied(basemap("bright")));
    expect(services.fakes.settings.get().basemapId).toBe("bright");
    act(() => services.fakes.theme.setSystemTheme("light"));
    act(() => services.fakes.theme.setSystemTheme("dark"));
    expect(hook.result.current.basemap.id).toBe("bright");

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ServicesProvider services={services}>{children}</ServicesProvider>
    );
    const reloaded = renderHook(() => useBasemapChoice(undefined), {
      wrapper,
    });
    expect(reloaded.result.current.basemap.id).toBe("bright");
  });

  it("gives a link's basemap to a viewer in either theme, and a link with none the viewer's default", () => {
    expect(
      setupFor("dark", { linked: "bright" }).hook.result.current.basemap.id,
    ).toBe("bright");
    expect(
      setupFor("light", { linked: "fiord" }).hook.result.current.basemap.id,
    ).toBe("fiord");
    expect(
      setupFor("dark", { linked: undefined }).hook.result.current.basemap.id,
    ).toBe("fiord");
  });

  it("treats a retired or unknown saved or linked id as no choice, so the theme's default shows", () => {
    for (const id of ["auto", "maptoolkit-dark", "retired-basemap"]) {
      expect(
        setupFor("dark", { stored: id }).hook.result.current.basemap.id,
        id,
      ).toBe("fiord");
      expect(
        setupFor("dark", { linked: id }).hook.result.current.basemap.id,
        id,
      ).toBe("fiord");
      expect(
        setupFor("light", { stored: id }).hook.result.current.basemap.id,
        id,
      ).toBe("bright");
    }
  });

  it("falls back to the theme's default, not Bright, when a basemap cannot start the map", () => {
    const dark = setupFor("dark", { stored: "liberty" });
    act(() =>
      dark.hook.result.current.mountFailed(
        new MapEngineError("load-failed"),
        basemap("liberty"),
      ),
    );
    expect(dark.hook.result.current.basemap.id).toBe("fiord");
  });

  it("falls back to the theme's default when every tile of a basemap fails", () => {
    const dark = setupFor("dark", { stored: "liberty" });
    act(() => dark.hook.result.current.unavailableNow(basemap("liberty")));
    expect(dark.hook.result.current.basemap.id).toBe("fiord");
  });

  it("does not turn a follower into a chooser when the default's own provider is down and the person goes back", () => {
    const { services, hook } = setupFor("dark");
    act(() => hook.result.current.unavailableNow(basemap("fiord")));
    act(() => hook.result.current.goBack());
    expect(services.fakes.settings.get().basemapId).toBeNull();
    act(() => services.fakes.theme.setSystemTheme("light"));
    expect(hook.result.current.basemap.id).toBe("bright");
  });

  it("puts a follower back to following when the basemap it chose proves to be down", () => {
    const { services, hook } = setupFor("dark");
    act(() => hook.result.current.choose("osm"));
    act(() => hook.result.current.applied(basemap("osm")));
    act(() => hook.result.current.unavailableNow(basemap("osm")));
    expect(services.fakes.settings.get().basemapId).toBeNull();
  });

  it("saves the basemap shown when its own tile is pressed, so a follower becomes a chooser and the choice stays", () => {
    const { services, hook } = setupFor("dark");
    act(() => hook.result.current.choose("fiord"));
    expect(services.fakes.settings.get().basemapId).toBe("fiord");
    act(() => services.fakes.theme.setSystemTheme("light"));
    expect(hook.result.current.basemap.id).toBe("fiord");
  });

  it("keeps the choice saved before when the shown, already saved basemap is pressed again", () => {
    const { services, hook } = setupFor("light", { stored: "positron" });
    act(() => hook.result.current.choose("osm"));
    act(() => hook.result.current.applied(basemap("osm")));
    act(() => hook.result.current.choose("osm"));
    act(() => hook.result.current.unavailableNow(basemap("osm")));
    expect(services.fakes.settings.get().basemapId).toBe("positron");
  });
});
