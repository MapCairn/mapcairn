// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  blurSearch,
  clearPin,
  closeSurface,
  dropPin,
  initialSurfaceState,
  isSettingsSection,
  openSearch,
  openSheet,
  pressEscape,
  type SurfaceAction,
  type SurfaceState,
  setDetent,
  startDirections,
  startDraw,
  startMeasure,
  stopDirections,
  stopMeasure,
  surfaceReducer,
} from "./surface";

function run(...actions: SurfaceAction[]): SurfaceState {
  return actions.reduce(surfaceReducer, initialSurfaceState);
}

describe("initial state", () => {
  it("has no surface, no pin and focus belongs to the map", () => {
    expect(initialSurfaceState).toEqual({
      surface: "none",
      sheetDetent: "half",
      sheetSection: null,
      returnFocusTo: null,
      hasPin: false,
      resumeDraw: false,
      resumeMeasure: false,
    });
  });
});

describe("opening the sheet", () => {
  it("opens at the half detent on the basemap section by default", () => {
    expect(run(openSheet())).toMatchObject({
      surface: "sheet",
      sheetDetent: "half",
      sheetSection: "basemap",
      returnFocusTo: "map-options",
    });
  });

  it("opens the requested section", () => {
    expect(run(openSheet("settings")).sheetSection).toBe("settings");
  });

  it("returns focus to the Settings button for the settings and help sections", () => {
    expect(run(openSheet("settings")).returnFocusTo).toBe("settings");
    expect(run(openSheet("help")).returnFocusTo).toBe("settings");
    expect(run(openSheet("layers")).returnFocusTo).toBe("map-options");
    expect(run(openSheet("shapes")).returnFocusTo).toBe("map-options");
    expect(run(openSheet("pin")).returnFocusTo).toBe("map-options");
  });

  it("switches section without resetting the detent the user chose", () => {
    const state = run(
      openSheet("basemap"),
      setDetent("full"),
      openSheet("layers"),
    );
    expect(state.sheetSection).toBe("layers");
    expect(state.sheetDetent).toBe("full");
    expect(state.returnFocusTo).toBe("map-options");
  });

  it("moves the focus target when the sheet switches between the two groups", () => {
    const toSettings = run(openSheet("basemap"), openSheet("settings"));
    expect(toSettings).toMatchObject({
      sheetSection: "settings",
      returnFocusTo: "settings",
    });
    expect(surfaceReducer(toSettings, openSheet("basemap"))).toMatchObject({
      sheetSection: "basemap",
      returnFocusTo: "map-options",
    });
  });

  it("returns the same state when the open section is requested again", () => {
    const state = run(openSheet("help"));
    expect(surfaceReducer(state, openSheet("help"))).toBe(state);
  });

  it("returns to half when it is reopened after another surface", () => {
    const state = run(
      openSheet(),
      setDetent("full"),
      openSearch(),
      openSheet("layers"),
    );
    expect(state.sheetDetent).toBe("half");
    expect(state.sheetSection).toBe("layers");
  });
});

describe("one surface at a time", () => {
  it("replaces the sheet with search and takes the search focus target", () => {
    expect(run(openSheet(), openSearch())).toMatchObject({
      surface: "search",
      sheetSection: null,
      returnFocusTo: "search",
    });
  });

  it("replaces search with the sheet and takes the map options focus target", () => {
    expect(run(openSearch(), openSheet())).toMatchObject({
      surface: "sheet",
      returnFocusTo: "map-options",
    });
  });

  it("replaces anything with measure", () => {
    expect(run(openSheet(), startMeasure())).toMatchObject({
      surface: "measure",
      sheetSection: null,
      returnFocusTo: "measure",
    });
  });

  it("is idempotent for the surface that is already open", () => {
    const once = run(openSearch());
    expect(surfaceReducer(once, openSearch())).toBe(once);
  });
});

describe("measure", () => {
  it("stops only when measure is the active surface", () => {
    expect(run(startMeasure(), stopMeasure()).surface).toBe("none");
    const search = run(openSearch());
    expect(surfaceReducer(search, stopMeasure())).toBe(search);
  });

  it("keeps the measure focus target after stopping so focus can be restored", () => {
    expect(run(startMeasure(), stopMeasure()).returnFocusTo).toBe("measure");
  });
});

describe("directions", () => {
  it("opens as the one active surface and takes its own focus target", () => {
    expect(run(startDirections())).toMatchObject({
      surface: "directions",
      sheetDetent: "half",
      sheetSection: null,
      returnFocusTo: "directions",
    });
  });

  it("replaces measure, the sheet and search, and is replaced by them", () => {
    expect(run(startMeasure(), startDirections()).surface).toBe("directions");
    expect(run(openSheet(), startDirections()).surface).toBe("directions");
    expect(run(openSearch(), startDirections()).surface).toBe("directions");
    expect(run(startDirections(), startMeasure()).surface).toBe("measure");
    expect(run(startDirections(), openSheet()).surface).toBe("sheet");
  });

  it("is idempotent while it is open", () => {
    const open = run(startDirections());
    expect(surfaceReducer(open, startDirections())).toBe(open);
  });

  it("stops only when directions is the active surface", () => {
    expect(run(startDirections(), stopDirections()).surface).toBe("none");
    const measuring = run(startMeasure());
    expect(surfaceReducer(measuring, stopDirections())).toBe(measuring);
  });

  it("keeps the directions focus target after stopping so focus can be restored", () => {
    expect(run(startDirections(), stopDirections()).returnFocusTo).toBe(
      "directions",
    );
  });

  it("stays active when a pin is dropped, and still records the pin", () => {
    const state = run(startDirections(), dropPin());
    expect(state.surface).toBe("directions");
    expect(state.hasPin).toBe(true);
  });

  it("closes on Escape and leaves the pin", () => {
    const state = run(dropPin(), startDirections(), pressEscape());
    expect(state.surface).toBe("none");
    expect(state.hasPin).toBe(true);
  });
});

describe("pin", () => {
  it("opens the pin card and remembers the pin", () => {
    expect(run(dropPin())).toMatchObject({
      surface: "pin",
      hasPin: true,
      returnFocusTo: "pin",
    });
  });

  it("replaces the sheet with the pin card", () => {
    expect(run(openSheet(), dropPin()).surface).toBe("pin");
  });

  it("keeps measure active while still recording the pin", () => {
    const state = run(startMeasure(), dropPin());
    expect(state.surface).toBe("measure");
    expect(state.hasPin).toBe(true);
    expect(state.returnFocusTo).toBe("measure");
  });

  it("does not change identity when a second pin is dropped on the open card", () => {
    const state = run(dropPin());
    expect(surfaceReducer(state, dropPin())).toBe(state);
  });

  it("keeps the pin when the card is closed", () => {
    const state = run(dropPin(), closeSurface());
    expect(state.surface).toBe("none");
    expect(state.hasPin).toBe(true);
  });

  it("clears the pin and closes its card", () => {
    const state = run(dropPin(), clearPin());
    expect(state.surface).toBe("none");
    expect(state.hasPin).toBe(false);
  });

  it("clears the pin without disturbing another surface", () => {
    const state = run(dropPin(), openSheet(), clearPin());
    expect(state.surface).toBe("sheet");
    expect(state.hasPin).toBe(false);
  });

  it("ignores clearing when there is no pin", () => {
    const state = run(openSearch());
    expect(surfaceReducer(state, clearPin())).toBe(state);
  });
});

describe("detent", () => {
  it("applies only while the sheet is open", () => {
    expect(run(openSheet(), setDetent("peek")).sheetDetent).toBe("peek");
    const closed = run(openSearch());
    expect(surfaceReducer(closed, setDetent("full"))).toBe(closed);
  });

  it("returns the same state for an unchanged detent", () => {
    const state = run(openSheet());
    expect(surfaceReducer(state, setDetent("half"))).toBe(state);
  });
});

describe("closing", () => {
  it("closes the sheet entirely and keeps the opener's focus target", () => {
    expect(run(openSheet("help"), closeSurface())).toMatchObject({
      surface: "none",
      sheetSection: null,
      returnFocusTo: "settings",
    });
    expect(run(openSheet("layers"), closeSurface())).toMatchObject({
      surface: "none",
      sheetSection: null,
      returnFocusTo: "map-options",
    });
  });

  it("is a no-op when nothing is open", () => {
    expect(surfaceReducer(initialSurfaceState, closeSurface())).toBe(
      initialSurfaceState,
    );
  });

  it("closes the sheet from the full detent on Escape, not down to half", () => {
    const state = run(openSheet(), setDetent("full"), pressEscape());
    expect(state.surface).toBe("none");
  });

  it("closes whichever surface is active on Escape", () => {
    for (const open of [openSearch(), startMeasure(), dropPin()]) {
      expect(run(open, pressEscape()).surface).toBe("none");
    }
  });

  it("ignores Escape when nothing is open", () => {
    expect(surfaceReducer(initialSurfaceState, pressEscape())).toBe(
      initialSurfaceState,
    );
  });

  it("leaves the pin in place on Escape", () => {
    expect(run(dropPin(), pressEscape()).hasPin).toBe(true);
  });

  it("resets the detent so the next sheet starts at half", () => {
    expect(
      run(openSheet(), setDetent("peek"), closeSurface()).sheetDetent,
    ).toBe("half");
  });
});

describe("blurring search", () => {
  it("closes search and leaves nothing to restore focus to", () => {
    expect(run(openSearch(), blurSearch())).toMatchObject({
      surface: "none",
      returnFocusTo: null,
    });
  });

  it("does nothing when search is not the active surface", () => {
    const state = run(openSheet());
    expect(surfaceReducer(state, blurSearch())).toBe(state);
  });
});

describe("unknown actions", () => {
  it("leave the state untouched", () => {
    const state = run(openSheet());
    expect(
      surfaceReducer(state, { type: "nonsense" } as unknown as SurfaceAction),
    ).toBe(state);
  });
});

describe("isSettingsSection", () => {
  it("is true for settings and help only", () => {
    expect(isSettingsSection("settings")).toBe(true);
    expect(isSettingsSection("help")).toBe(true);
    for (const section of ["basemap", "pin", "layers", "shapes"] as const) {
      expect(isSettingsSection(section)).toBe(false);
    }
    expect(isSettingsSection(null)).toBe(false);
  });
});

describe("the sheet over a measurement", () => {
  it("picks the measurement up again when the sheet closes, with focus on Measure", () => {
    for (const section of ["settings", "basemap", "layers"] as const) {
      const open = run(startMeasure(), openSheet(section));
      expect(open).toMatchObject({
        surface: "sheet",
        sheetSection: section,
        resumeMeasure: true,
        resumeDraw: false,
      });
      for (const close of [closeSurface(), pressEscape()]) {
        expect(surfaceReducer(open, close)).toMatchObject({
          surface: "measure",
          returnFocusTo: "measure",
          sheetSection: null,
          resumeMeasure: false,
        });
      }
    }
  });

  it("keeps resuming while the sheet switches between Settings and Map options", () => {
    const state = run(
      startMeasure(),
      openSheet("settings"),
      openSheet("basemap"),
      openSheet("settings"),
    );
    expect(state.resumeMeasure).toBe(true);
    expect(surfaceReducer(state, closeSurface()).surface).toBe("measure");
  });

  it("does not resume when the sheet was opened from nothing or from another surface", () => {
    expect(run(openSheet("settings")).resumeMeasure).toBe(false);
    expect(run(openSearch(), openSheet("settings")).resumeMeasure).toBe(false);
    expect(run(startDirections(), openSheet("settings")).resumeMeasure).toBe(
      false,
    );
    expect(
      surfaceReducer(run(openSheet("settings")), closeSurface()).surface,
    ).toBe("none");
  });

  it("forgets the measurement when another tool or surface takes over", () => {
    const base = run(startMeasure(), openSheet("settings"));
    expect(surfaceReducer(base, startDraw())).toMatchObject({
      surface: "draw",
      resumeMeasure: false,
    });
    expect(surfaceReducer(base, openSearch())).toMatchObject({
      surface: "search",
      resumeMeasure: false,
    });
    expect(surfaceReducer(base, startDirections())).toMatchObject({
      surface: "directions",
      resumeMeasure: false,
    });
    expect(surfaceReducer(base, dropPin())).toMatchObject({
      surface: "pin",
      resumeMeasure: false,
    });
  });

  it("returns to the measure tool, not the sheet, when measure is started again", () => {
    expect(
      run(startMeasure(), openSheet("settings"), startMeasure()),
    ).toMatchObject({ surface: "measure", resumeMeasure: false });
  });
});
