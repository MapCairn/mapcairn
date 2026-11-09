import { describe, expect, it } from "vitest";
import {
  activeSurfaceLabel,
  blurSearch,
  clearPin,
  closeSurface,
  dropPin,
  initialSurfaceState,
  isModal,
  openSearch,
  openSheet,
  pressEscape,
  type SurfaceAction,
  type SurfaceState,
  selectFeature,
  setDetent,
  startMeasure,
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

  it("switches section without resetting the detent the user chose", () => {
    const state = run(
      openSheet("basemap"),
      setDetent("full"),
      openSheet("help"),
    );
    expect(state.sheetSection).toBe("help");
    expect(state.sheetDetent).toBe("full");
    expect(state.returnFocusTo).toBe("map-options");
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
      openSheet("data"),
    );
    expect(state.sheetDetent).toBe("half");
    expect(state.sheetSection).toBe("data");
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

  it("replaces anything with a selected feature", () => {
    expect(run(openSearch(), selectFeature())).toMatchObject({
      surface: "feature",
      returnFocusTo: "feature",
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
    for (const open of [
      openSearch(),
      startMeasure(),
      dropPin(),
      selectFeature(),
    ]) {
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

describe("isModal", () => {
  it("is true only for the sheet at the full detent", () => {
    expect(isModal(run(openSheet(), setDetent("full")))).toBe(true);
    expect(isModal(run(openSheet(), setDetent("half")))).toBe(false);
    expect(isModal(run(openSheet(), setDetent("peek")))).toBe(false);
    expect(isModal(initialSurfaceState)).toBe(false);
    expect(isModal(run(openSearch()))).toBe(false);
  });
});

describe("activeSurfaceLabel", () => {
  it("names each surface for announcements", () => {
    expect(activeSurfaceLabel(initialSurfaceState)).toBeNull();
    expect(activeSurfaceLabel(run(openSheet()))).toBe("Map options");
    expect(activeSurfaceLabel(run(openSearch()))).toBe("Search results");
    expect(activeSurfaceLabel(run(startMeasure()))).toBe("Measure");
    expect(activeSurfaceLabel(run(dropPin()))).toBe("Pin");
    expect(activeSurfaceLabel(run(selectFeature()))).toBe("Feature details");
  });
});
