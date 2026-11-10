import { describe, expect, it } from "vitest";
import {
  clearPin,
  closeSurface,
  dropPin,
  initialSurfaceState,
  openSearch,
  openSheet,
  pressEscape,
  type SurfaceAction,
  type SurfaceState,
  startDraw,
  startMeasure,
  stopDraw,
  surfaceReducer,
} from "./surface";

function run(...actions: SurfaceAction[]): SurfaceState {
  return actions.reduce(surfaceReducer, initialSurfaceState);
}

describe("draw", () => {
  it("opens as the active surface and takes the draw focus target", () => {
    expect(run(startDraw())).toMatchObject({
      surface: "draw",
      returnFocusTo: "draw",
    });
  });

  it("is idempotent", () => {
    const drawing = run(startDraw());
    expect(surfaceReducer(drawing, startDraw())).toBe(drawing);
  });

  it("stops only when draw is the active surface, keeping its focus target", () => {
    expect(run(startDraw(), stopDraw())).toMatchObject({
      surface: "none",
      returnFocusTo: "draw",
    });
    const measuring = run(startMeasure());
    expect(surfaceReducer(measuring, stopDraw())).toBe(measuring);
  });

  it("is one tool at a time: measure replaces draw and draw replaces measure", () => {
    expect(run(startDraw(), startMeasure()).surface).toBe("measure");
    expect(run(startMeasure(), startDraw()).surface).toBe("draw");
    expect(run(startDraw(), openSearch()).surface).toBe("search");
    expect(run(startMeasure(), startDraw())).toMatchObject({
      returnFocusTo: "draw",
    });
  });

  it("closes on Escape and when closed explicitly", () => {
    expect(run(startDraw(), pressEscape()).surface).toBe("none");
    expect(run(startDraw(), closeSurface()).surface).toBe("none");
  });

  it("keeps drawing when a pin is dropped, and records the pin", () => {
    const state = run(startDraw(), dropPin());
    expect(state.surface).toBe("draw");
    expect(state.hasPin).toBe(true);
    expect(surfaceReducer(state, clearPin()).surface).toBe("draw");
  });
});

describe("the sheet over a drawing", () => {
  it("picks the drawing up again when the sheet closes, with focus on Shapes", () => {
    const open = run(startDraw(), openSheet("shapes"));
    expect(open).toMatchObject({
      surface: "sheet",
      sheetSection: "shapes",
      resumeDraw: true,
    });
    expect(surfaceReducer(open, closeSurface())).toMatchObject({
      surface: "draw",
      returnFocusTo: "draw-shapes",
      sheetSection: null,
      resumeDraw: false,
    });
    expect(surfaceReducer(open, pressEscape()).surface).toBe("draw");
  });

  it("does not resume when the sheet was opened from nothing", () => {
    const open = run(openSheet("shapes"));
    expect(open.resumeDraw).toBe(false);
    expect(surfaceReducer(open, closeSurface()).surface).toBe("none");
  });

  it("keeps resuming while the section changes", () => {
    const state = run(startDraw(), openSheet("shapes"), openSheet("help"));
    expect(state.resumeDraw).toBe(true);
  });

  it("forgets the drawing when another tool or surface takes over", () => {
    const fromMeasure = run(startDraw(), openSheet("shapes"), startMeasure());
    expect(fromMeasure).toMatchObject({
      surface: "measure",
      resumeDraw: false,
    });
    expect(surfaceReducer(fromMeasure, closeSurface()).surface).toBe("none");
    const fromPin = run(startDraw(), openSheet("shapes"), dropPin());
    expect(fromPin).toMatchObject({ surface: "pin", resumeDraw: false });
  });

  it("never resumes both tools, and measure's flag stays off over a drawing", () => {
    expect(run(startDraw(), openSheet("settings"))).toMatchObject({
      resumeDraw: true,
      resumeMeasure: false,
    });
  });

  it("returns to the draw tool, not the sheet, when draw is started again", () => {
    const state = run(startDraw(), openSheet("shapes"), startDraw());
    expect(state).toMatchObject({ surface: "draw", resumeDraw: false });
  });
});
