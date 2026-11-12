// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MapImageDrawing, MapPlacement } from "@mapcairn/core";
import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IMAGE_WAIT_MS,
  MapImageExporter,
  type MapImageExportHost,
} from "./imageExport";
import { canvasStub } from "./maplibreTestEngine";

/** The scale between the test canvas (1600 px wide) and its CSS width (800 px). */
const SCALE = 2;
const PROJECTED = { x: 120, y: 80 };

/** The few members of a map the exporter touches. */
function stubMap() {
  const listeners = new Map<string, () => void>();
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1200;
  Object.defineProperty(canvas, "clientWidth", { value: 800 });
  const map = {
    loaded: vi.fn(() => true),
    triggerRepaint: vi.fn(() => {
      listeners.get("render")?.();
    }),
    getCanvas: () => canvas,
    on: vi.fn((type: string, listener: () => void) => {
      listeners.set(type, listener);
      return { unsubscribe: () => listeners.delete(type) };
    }),
  };
  return { map, canvas, listeners, asMap: () => map as unknown as MapLibreMap };
}

const PLACEMENT: MapPlacement = {
  projection: "flat",
  view: { center: { lat: 0, lng: 0 }, zoom: 2 },
  project: () => PROJECTED,
  isVisible: () => true,
};

const DOT_DRAWING: MapImageDrawing = {
  colour: "#112233",
  halo: "#ffffff",
  marks: [{ kind: "dot", position: { lat: 0, lng: 0 } }],
};

describe("MapImageExporter", () => {
  let restoreCanvas = () => {};

  beforeEach(() => {
    restoreCanvas = canvasStub.install();
  });

  afterEach(() => {
    restoreCanvas();
    vi.useRealTimers();
  });

  /** An exporter over a stub map and an adjustable host. */
  function setup(overrides: Partial<MapImageExportHost> = {}) {
    const stub = stubMap();
    const host: MapImageExportHost = {
      mountedMap: () => stub.asMap(),
      isSwapPending: () => false,
      placement: vi.fn(() => PLACEMENT),
      ...overrides,
    };
    return { ...stub, host, exporter: new MapImageExporter(host) };
  }

  const methodsOf = () =>
    (canvasStub.contexts[0]?.calls ?? []).map((call) => call.method);

  it("repaints, copies the canvas in the render event and encodes a PNG", async () => {
    const { exporter, map, canvas } = setup();
    const image = await exporter.toImage();
    expect(image.type).toBe("image/png");
    expect(map.triggerRepaint).toHaveBeenCalledTimes(1);
    expect(canvasStub.contexts[0]?.calls[0]).toMatchObject({
      method: "drawImage",
      args: [canvas, 0, 0],
    });
  });

  it("refuses when the host has no mounted map, without touching the engine", async () => {
    const { exporter, map } = setup({ mountedMap: () => undefined });
    await expect(exporter.toImage()).rejects.toMatchObject({
      reason: "export-failed",
      message: "The map is not mounted.",
    });
    expect(map.triggerRepaint).not.toHaveBeenCalled();
  });

  it("refuses while the host says a swap is pending", async () => {
    const { exporter, map } = setup({ isSwapPending: () => true });
    await expect(exporter.toImage()).rejects.toMatchObject({
      reason: "export-failed",
    });
    expect(map.triggerRepaint).not.toHaveBeenCalled();
  });

  it("asks the host about a swap again at the render, not only at the start", async () => {
    let swapping = false;
    const { exporter, map, listeners } = setup({
      isSwapPending: () => swapping,
    });
    map.triggerRepaint.mockImplementation(() => {});
    const image = exporter.toImage();
    const refused = expect(image).rejects.toMatchObject({
      reason: "export-failed",
    });
    await vi.waitFor(() => expect(map.triggerRepaint).toHaveBeenCalled());
    swapping = true;
    listeners.get("render")?.();
    await refused;
    expect(canvasStub.contexts).toEqual([]);
  });

  it("gives up when no frame is drawn within the wait", async () => {
    vi.useFakeTimers();
    const { exporter, map } = setup();
    map.triggerRepaint.mockImplementation(() => {});
    const image = exporter.toImage();
    const refused = expect(image).rejects.toMatchObject({
      reason: "export-failed",
      message: "The map did not draw a frame to save.",
    });
    await vi.advanceTimersByTimeAsync(IMAGE_WAIT_MS);
    await refused;
  });

  it("refuses and draws no marks when the host loses the map while fonts load", async () => {
    let mounted = true;
    const { exporter, host, asMap } = setup();
    host.mountedMap = () => (mounted ? asMap() : undefined);
    let release = () => {};
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        ready: new Promise<void>((resolve) => {
          release = resolve;
        }),
      },
    });
    try {
      const image = exporter.toImage({ drawing: DOT_DRAWING });
      const refused = expect(image).rejects.toMatchObject({
        reason: "export-failed",
        message: "The map is not mounted.",
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      mounted = false;
      release();
      await refused;
      expect(methodsOf()).not.toContain("arc");
      expect(host.placement).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  it("places a dot where the host's placement projects it, at the image's scale", async () => {
    const { exporter, host } = setup();
    await exporter.toImage({ drawing: DOT_DRAWING });
    expect(host.placement).toHaveBeenCalledTimes(1);
    const arc = canvasStub.contexts[0]?.calls.find(
      (call) => call.method === "arc",
    );
    expect(arc?.args.slice(0, 2)).toEqual([
      PROJECTED.x * SCALE,
      PROJECTED.y * SCALE,
    ]);
  });

  it("does not ask the host for a placement when there is nothing to draw", async () => {
    const { exporter, host } = setup();
    await exporter.toImage();
    await exporter.toImage({ drawing: { ...DOT_DRAWING, marks: [] } });
    expect(host.placement).not.toHaveBeenCalled();
  });

  it("draws the credit text on a strip after the marks", async () => {
    const { exporter } = setup();
    await exporter.toImage({
      drawing: DOT_DRAWING,
      attribution: "© Example contributors",
    });
    const methods = methodsOf();
    expect(methods).toContain("fillText");
    expect(methods.lastIndexOf("stroke")).toBeLessThan(
      methods.indexOf("fillRect"),
    );
  });

  it("turns a blocked or failed encode into export-failed", async () => {
    const { exporter } = setup();
    canvasStub.failNext = true;
    await expect(exporter.toImage()).rejects.toMatchObject({
      reason: "export-failed",
    });
    canvasStub.throwNext = new DOMException("tainted", "SecurityError");
    await expect(exporter.toImage()).rejects.toMatchObject({
      reason: "export-failed",
    });
  });
});
