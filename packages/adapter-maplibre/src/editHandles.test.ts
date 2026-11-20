// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MapEditHandle, MapEvents, MapPlacement } from "@mapcairn/core";
import { describe, expect, it, vi } from "vitest";
import {
  EditHandleController,
  type EditHandleHost,
  type PointerLikeEvent,
} from "./editHandles";

/** Where the test placement puts each handle: its longitude and latitude as pixels. */
const project = (position: { lat: number; lng: number }) => ({
  x: position.lng,
  y: position.lat,
});

function placementWith(visible: (lng: number) => boolean): MapPlacement {
  return {
    projection: "flat",
    view: { center: { lat: 0, lng: 0 }, zoom: 2 },
    project,
    isVisible: (position) => visible(position.lng),
  };
}

const HANDLE: MapEditHandle = {
  id: "v0",
  position: { lat: 50, lng: 100 },
  kind: "vertex",
};

/** A pointer event at a pixel, which the test placement also reads as a position. */
function pointer(x: number, y: number, lng = x): PointerLikeEvent {
  return { point: { x, y }, lngLat: { lat: y, lng }, preventDefault: vi.fn() };
}

function setup(placement: MapPlacement = placementWith(() => true)) {
  const drags: MapEvents["handleDrag"][] = [];
  const hovers: MapEvents["handleHover"][] = [];
  const host: EditHandleHost = {
    placement: () => placement,
    emitDrag: (drag) => drags.push(drag),
    emitHover: (id) => hovers.push(id),
  };
  const controller = new EditHandleController(host);
  controller.setHandles([HANDLE]);
  return { controller, drags: () => drags, hovers: () => hovers };
}

describe("EditHandleController", () => {
  describe("press", () => {
    it("takes a press on a handle from the engine and reports a start", () => {
      const { controller, drags } = setup();
      const event = pointer(100, 50);
      controller.press(event, "mouse");
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(drags()).toEqual([
        {
          id: "v0",
          phase: "start",
          latlng: { lat: 50, lng: 100 },
          moved: false,
        },
      ]);
    });

    it("leaves a press on the bare map to the engine", () => {
      const { controller, drags } = setup();
      const event = pointer(400, 300);
      controller.press(event, "mouse");
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(drags()).toEqual([]);
    });

    it("reaches further for a finger than for a mouse", () => {
      const { controller, drags } = setup();
      const nearby = pointer(100, 50 + 20);
      controller.press(nearby, "mouse");
      expect(drags()).toEqual([]);
      controller.press(nearby, "touch");
      expect(drags()).toHaveLength(1);
    });

    it("offers no handle beyond the horizon", () => {
      const { controller, drags } = setup(placementWith(() => false));
      controller.press(pointer(100, 50), "mouse");
      expect(drags()).toEqual([]);
    });

    it("reports the position with its longitude brought into [-180, 180)", () => {
      const { controller, drags } = setup();
      controller.press(pointer(100, 50, 190), "mouse");
      expect(drags()[0]?.latlng.lng).toBe(-170);
    });
  });

  describe("move and release", () => {
    it("reports moves only after the pointer leaves the click tolerance", () => {
      const { controller, drags } = setup();
      controller.press(pointer(100, 50), "mouse");
      controller.move(pointer(101, 50), "mouse");
      controller.move(pointer(160, 50), "mouse");
      controller.release(pointer(160, 50));
      expect(drags().map(({ phase, moved }) => ({ phase, moved }))).toEqual([
        { phase: "start", moved: false },
        { phase: "move", moved: true },
        { phase: "end", moved: true },
      ]);
    });

    it("reports a release without a move as not moved", () => {
      const { controller, drags } = setup();
      controller.press(pointer(100, 50), "touch");
      controller.release(pointer(100, 50));
      expect(drags().at(-1)).toMatchObject({ phase: "end", moved: false });
    });

    it("ignores a release when no handle was pressed", () => {
      const { controller, drags } = setup();
      controller.release(pointer(100, 50));
      expect(drags()).toEqual([]);
      expect(controller.dropsClick()).toBe(false);
    });
  });

  describe("hover", () => {
    it("reports entering and leaving a handle once each, for the mouse only", () => {
      const { controller, hovers } = setup();
      controller.move(pointer(100, 50), "touch");
      expect(hovers()).toEqual([]);
      controller.move(pointer(100, 50), "mouse");
      controller.move(pointer(101, 50), "mouse");
      controller.move(pointer(400, 300), "mouse");
      controller.move(pointer(401, 300), "mouse");
      expect(hovers()).toEqual(["v0", null]);
    });

    it("does nothing without handles", () => {
      const { controller, hovers } = setup();
      controller.setHandles([]);
      controller.move(pointer(100, 50), "mouse");
      expect(hovers()).toEqual([]);
    });

    it("ends the hover when the hovered handle is replaced, and only then", () => {
      const { controller, hovers } = setup();
      controller.move(pointer(100, 50), "mouse");
      controller.setHandles([HANDLE]);
      expect(hovers()).toEqual(["v0"]);
      controller.setHandles([{ ...HANDLE, id: "v1" }]);
      expect(hovers()).toEqual(["v0", null]);
    });

    it("does not report a hover while a handle is being dragged", () => {
      const { controller, hovers } = setup();
      controller.press(pointer(100, 50), "mouse");
      controller.move(pointer(400, 300), "mouse");
      expect(hovers()).toEqual([]);
    });
  });

  describe("the click after a press", () => {
    it("is dropped once, and then clicks pass", () => {
      const { controller } = setup();
      controller.press(pointer(100, 50), "mouse");
      controller.release(pointer(100, 50));
      expect(controller.dropsClick()).toBe(true);
      expect(controller.dropsClick()).toBe(false);
    });

    it("is not dropped when the next press misses every handle", () => {
      const { controller } = setup();
      controller.press(pointer(100, 50), "mouse");
      controller.release(pointer(100, 50));
      controller.press(pointer(400, 300), "mouse");
      expect(controller.dropsClick()).toBe(false);
    });
  });

  describe("reset", () => {
    it("forgets a press in progress and the hover", () => {
      const { controller, drags, hovers } = setup();
      controller.move(pointer(100, 50), "mouse");
      controller.press(pointer(100, 50), "mouse");
      controller.reset();
      controller.release(pointer(100, 50));
      expect(drags().map((drag) => drag.phase)).toEqual(["start"]);
      controller.move(pointer(100, 50), "mouse");
      expect(hovers()).toEqual(["v0", "v0"]);
    });
  });
});
