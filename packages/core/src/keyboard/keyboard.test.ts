import { describe, expect, it } from "vitest";
import { MAP_KEY_HELP, mapKeyAction, mapKeyHelp } from "./keyboard";

const rotating = { supportsRotation: true };
const fixed = { supportsRotation: false };

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
    expect(mapKeyAction(press("ArrowLeft"), rotating)).toEqual({
      type: "pan",
      dx: -80,
      dy: 0,
    });
    expect(mapKeyAction(press("ArrowRight"), rotating)).toEqual({
      type: "pan",
      dx: 80,
      dy: 0,
    });
    expect(mapKeyAction(press("ArrowUp"), rotating)).toEqual({
      type: "pan",
      dx: 0,
      dy: -80,
    });
    expect(mapKeyAction(press("ArrowDown"), rotating)).toEqual({
      type: "pan",
      dx: 0,
      dy: 80,
    });
  });

  it("pans 240px with Shift and up or down, on every engine", () => {
    for (const capabilities of [rotating, fixed]) {
      expect(
        mapKeyAction(press("ArrowUp", { shiftKey: true }), capabilities),
      ).toEqual({ type: "pan", dx: 0, dy: -240 });
      expect(
        mapKeyAction(press("ArrowDown", { shiftKey: true }), capabilities),
      ).toEqual({ type: "pan", dx: 0, dy: 240 });
    }
  });

  it("pans 240px with Shift and left or right when rotation is unsupported", () => {
    expect(mapKeyAction(press("ArrowLeft", { shiftKey: true }), fixed)).toEqual(
      { type: "pan", dx: -240, dy: 0 },
    );
    expect(
      mapKeyAction(press("ArrowRight", { shiftKey: true }), fixed),
    ).toEqual({ type: "pan", dx: 240, dy: 0 });
  });
});

describe("rotating", () => {
  it("rotates 15 degrees with Shift and left or right when supported", () => {
    expect(
      mapKeyAction(press("ArrowLeft", { shiftKey: true }), rotating),
    ).toEqual({ type: "rotate", degrees: -15 });
    expect(
      mapKeyAction(press("ArrowRight", { shiftKey: true }), rotating),
    ).toEqual({ type: "rotate", degrees: 15 });
  });

  it("resets the bearing with Home or 0 when supported", () => {
    expect(mapKeyAction(press("Home"), rotating)).toEqual({
      type: "resetBearing",
    });
    expect(mapKeyAction(press("0"), rotating)).toEqual({
      type: "resetBearing",
    });
  });

  it("ignores Home and 0 when rotation is unsupported", () => {
    expect(mapKeyAction(press("Home"), fixed)).toBeNull();
    expect(mapKeyAction(press("0"), fixed)).toBeNull();
  });
});

describe("zooming", () => {
  it("zooms in with plus and equals", () => {
    expect(mapKeyAction(press("+", { shiftKey: true }), rotating)).toEqual({
      type: "zoomIn",
    });
    expect(mapKeyAction(press("="), rotating)).toEqual({ type: "zoomIn" });
  });

  it("zooms out with minus and underscore", () => {
    expect(mapKeyAction(press("-"), rotating)).toEqual({ type: "zoomOut" });
    expect(mapKeyAction(press("_", { shiftKey: true }), rotating)).toEqual({
      type: "zoomOut",
    });
  });
});

describe("other keys", () => {
  it("drops a pin with p or P", () => {
    expect(mapKeyAction(press("p"), fixed)).toEqual({ type: "dropPin" });
    expect(mapKeyAction(press("P", { shiftKey: true }), fixed)).toEqual({
      type: "dropPin",
    });
  });

  it("escapes with Escape", () => {
    expect(mapKeyAction(press("Escape"), fixed)).toEqual({ type: "escape" });
  });

  it("ignores keys it does not own", () => {
    expect(mapKeyAction(press("a"), rotating)).toBeNull();
    expect(mapKeyAction(press("Tab"), rotating)).toBeNull();
    expect(mapKeyAction(press("Enter"), rotating)).toBeNull();
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
        expect(
          mapKeyAction(press(key, { [modifier]: true }), rotating),
        ).toBeNull();
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
    expect(MAP_KEY_HELP).toEqual(mapKeyHelp(rotating));
  });

  it("mentions rotation only when it is supported", () => {
    const text = (list: readonly { keys: string; description: string }[]) =>
      list.map((entry) => `${entry.keys} ${entry.description}`).join("\n");
    expect(text(mapKeyHelp(rotating))).toMatch(/rotate/i);
    expect(text(mapKeyHelp(rotating))).toMatch(/north/i);
    expect(text(mapKeyHelp(fixed))).not.toMatch(/rotate/i);
    expect(text(mapKeyHelp(fixed))).not.toMatch(/north/i);
  });

  it("still documents panning, zooming, pins and Escape without rotation", () => {
    const descriptions = mapKeyHelp(fixed).map((entry) => entry.description);
    expect(descriptions.some((d) => /pan/i.test(d))).toBe(true);
    expect(descriptions.some((d) => /zoom/i.test(d))).toBe(true);
    expect(descriptions.some((d) => /pin/i.test(d))).toBe(true);
    expect(descriptions.some((d) => /close/i.test(d))).toBe(true);
  });
});
