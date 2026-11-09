import { describe, expect, it } from "vitest";
import { MAP_KEY_HELP, mapKeyAction } from "./keyboard";

function press(
  key: string,
  modifiers: Partial<{
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
  }> = {},
) {
  return {
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...modifiers,
  };
}

describe("panning", () => {
  it("pans 80px per arrow key press", () => {
    expect(mapKeyAction(press("ArrowLeft"))).toEqual({
      type: "pan",
      dx: -80,
      dy: 0,
    });
    expect(mapKeyAction(press("ArrowRight"))).toEqual({
      type: "pan",
      dx: 80,
      dy: 0,
    });
    expect(mapKeyAction(press("ArrowUp"))).toEqual({
      type: "pan",
      dx: 0,
      dy: -80,
    });
    expect(mapKeyAction(press("ArrowDown"))).toEqual({
      type: "pan",
      dx: 0,
      dy: 80,
    });
  });

  it("pans 240px with Shift and up or down", () => {
    expect(mapKeyAction(press("ArrowUp", { shiftKey: true }))).toEqual({
      type: "pan",
      dx: 0,
      dy: -240,
    });
    expect(mapKeyAction(press("ArrowDown", { shiftKey: true }))).toEqual({
      type: "pan",
      dx: 0,
      dy: 240,
    });
  });
});

describe("rotating", () => {
  it("rotates 15 degrees with Shift and left or right", () => {
    expect(mapKeyAction(press("ArrowLeft", { shiftKey: true }))).toEqual({
      type: "rotate",
      degrees: -15,
    });
    expect(mapKeyAction(press("ArrowRight", { shiftKey: true }))).toEqual({
      type: "rotate",
      degrees: 15,
    });
  });

  it("resets the bearing with Home or 0", () => {
    expect(mapKeyAction(press("Home"))).toEqual({ type: "resetBearing" });
    expect(mapKeyAction(press("0"))).toEqual({ type: "resetBearing" });
  });
});

describe("zooming", () => {
  it("zooms in with plus and equals", () => {
    expect(mapKeyAction(press("+", { shiftKey: true }))).toEqual({
      type: "zoomIn",
    });
    expect(mapKeyAction(press("="))).toEqual({ type: "zoomIn" });
  });

  it("zooms out with minus and underscore", () => {
    expect(mapKeyAction(press("-"))).toEqual({ type: "zoomOut" });
    expect(mapKeyAction(press("_", { shiftKey: true }))).toEqual({
      type: "zoomOut",
    });
  });
});

describe("other keys", () => {
  it("drops a pin with p or P", () => {
    expect(mapKeyAction(press("p"))).toEqual({ type: "dropPin" });
    expect(mapKeyAction(press("P", { shiftKey: true }))).toEqual({
      type: "dropPin",
    });
  });

  it("escapes with Escape", () => {
    expect(mapKeyAction(press("Escape"))).toEqual({ type: "escape" });
  });

  it("ignores keys it does not own", () => {
    expect(mapKeyAction(press("a"))).toBeNull();
    expect(mapKeyAction(press("Tab"))).toBeNull();
    expect(mapKeyAction(press("Enter"))).toBeNull();
  });
});

describe("browser shortcuts", () => {
  it("returns null for every owned key when ctrl, meta or alt is held", () => {
    const keys = [
      "ArrowLeft",
      "ArrowUp",
      "+",
      "=",
      "-",
      "_",
      "Home",
      "0",
      "p",
      "P",
      "Escape",
    ];
    for (const key of keys) {
      for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) {
        expect(mapKeyAction(press(key, { [modifier]: true }))).toBeNull();
      }
    }
  });
});

describe("keyboard help", () => {
  it("lists every shortcut with a description", () => {
    expect(MAP_KEY_HELP.length).toBeGreaterThan(0);
    for (const entry of MAP_KEY_HELP) {
      expect(entry.keys.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("documents panning, rotation, north, zooming, pins and Escape", () => {
    const text = MAP_KEY_HELP.map(
      (entry) => `${entry.keys} ${entry.description}`,
    ).join("\n");
    for (const topic of [
      /pan/i,
      /rotate/i,
      /north/i,
      /zoom/i,
      /pin/i,
      /close/i,
    ]) {
      expect(text).toMatch(topic);
    }
  });
});
