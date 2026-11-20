// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  MapImageDrawing,
  MapImageView,
  MapPlacement,
  VisibleMap,
} from "@mapcairn/core";
import { MAX_IMAGE_SIDE_PX } from "@mapcairn/core";
import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IMAGE_TILES_WAIT_MS,
  IMAGE_WAIT_MS,
  MapImageExporter,
  type MapImageExportHost,
  type RenderMap,
  type RenderMapRequest,
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
    remove: vi.fn(),
  };
  return { map, canvas, listeners, asMap: () => map as unknown as MapLibreMap };
}

const PLACEMENT: MapPlacement = {
  projection: "flat",
  view: { center: { lat: 0, lng: 0 }, zoom: 2 },
  project: () => PROJECTED,
  isVisible: () => true,
};

const VISIBLE: VisibleMap = {
  size: { width: 800, height: 600 },
  view: { center: { lat: -33.9, lng: 18.4 }, zoom: 11, bearing: 0 },
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
      visibleMap: () => VISIBLE,
      closed: () => new AbortController().signal,
      styleVersion: () => 0,
      openRenderMap: vi.fn(() => Promise.reject(new Error("not asked for"))),
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

  describe("at a requested size and view", () => {
    const BOX_VIEW: MapImageView = {
      bounds: { south: -34, west: 18, north: -33, east: 19 },
    };

    /**
     * The canvas MapLibre makes in a container: `round(ratio * floor(width))`
     * pixels (its `_containerDimensions` and `_resizeCanvas`), worked out here
     * on its own so a test cannot agree with the planner by accident.
     */
    const engineCanvasSize = ({ container, pixelRatio }: RenderMapRequest) => ({
      width: Math.round(
        pixelRatio * Math.floor(Number.parseFloat(container.style.width)),
      ),
      height: Math.round(
        pixelRatio * Math.floor(Number.parseFloat(container.style.height)),
      ),
    });

    /** An exporter whose host hands out one render map, with a canvas the size the request asks for. */
    function setupRender(
      options: {
        readonly idle?: Promise<void>;
        readonly tilesWaitMs?: number;
        readonly canvasShortBy?: number;
      } = {},
    ) {
      const render = stubMap();
      const connectedAtOpen: boolean[] = [];
      const openRenderMap = vi.fn(
        async (request: RenderMapRequest): Promise<RenderMap> => {
          connectedAtOpen.push(request.container.isConnected);
          const { width, height } = engineCanvasSize(request);
          render.canvas.width = width - (options.canvasShortBy ?? 0);
          render.canvas.height = height;
          return {
            map: render.asMap(),
            idle: options.idle ?? Promise.resolve(),
          };
        },
      );
      const visible = setup({ openRenderMap });
      const exporter = new MapImageExporter(visible.host, options.tilesWaitMs);
      return { ...visible, exporter, render, openRenderMap, connectedAtOpen };
    }

    /** The container the export asked the host to open a map in. */
    const requestOf = (
      open: { mock: { calls: unknown[][] } },
      call = 0,
    ): RenderMapRequest => {
      const request = open.mock.calls[call]?.[0];
      if (!request) {
        throw new Error("No render map was asked for.");
      }
      return request as RenderMapRequest;
    };
    const containerOf = (open: { mock: { calls: unknown[][] } }) =>
      requestOf(open).container;

    it("draws a map of its own in a hidden container of the requested size, and removes both afterwards", async () => {
      const { exporter, openRenderMap, render, map, connectedAtOpen } =
        setupRender();
      const image = await exporter.toImage({
        size: { width: 640, height: 480 },
        pixelRatio: 2,
        view: BOX_VIEW,
      });
      expect(image.type).toBe("image/png");
      const request = requestOf(openRenderMap);
      expect(request).toMatchObject({ pixelRatio: 2, view: BOX_VIEW });
      const { container } = request;
      expect(connectedAtOpen).toEqual([true]);
      expect(container.style.width).toBe("640px");
      expect(container.style.height).toBe("480px");
      expect(container.style.visibility).toBe("hidden");
      expect(container.getAttribute("aria-hidden")).toBe("true");
      expect(container.isConnected).toBe(false);
      expect(render.map.remove).toHaveBeenCalledTimes(1);
      expect(render.map.triggerRepaint).toHaveBeenCalledTimes(1);
      expect(map.triggerRepaint).not.toHaveBeenCalled();
      expect(canvasStub.contexts[0]?.calls[0]).toMatchObject({
        method: "drawImage",
        args: [render.canvas, 0, 0],
      });
      expect([
        canvasStub.contexts[0]?.canvas.width,
        canvasStub.contexts[0]?.canvas.height,
      ]).toEqual([1280, 960]);
    });

    it("fills in the size and view of the map on screen, and a pixel ratio of 1", async () => {
      const { exporter, openRenderMap } = setupRender();
      await exporter.toImage({ pixelRatio: 2 });
      expect(requestOf(openRenderMap)).toMatchObject({
        pixelRatio: 2,
        view: { center: VISIBLE.view.center, zoom: VISIBLE.view.zoom },
      });
      expect(containerOf(openRenderMap).style.width).toBe("800px");
      await exporter.toImage({ view: BOX_VIEW });
      expect(requestOf(openRenderMap, 1)).toMatchObject({ pixelRatio: 1 });
    });

    it("does not open a render map for the map as it is, even with credits and marks", async () => {
      const { exporter, host } = setup();
      await exporter.toImage({
        attribution: "© Example",
        drawing: DOT_DRAWING,
      });
      expect(host.openRenderMap).not.toHaveBeenCalled();
    });

    it("refuses a size that is too large or not valid before it opens anything", async () => {
      const { exporter, openRenderMap } = setupRender();
      await expect(
        exporter.toImage({
          size: { width: MAX_IMAGE_SIDE_PX + 1, height: 10 },
        }),
      ).rejects.toMatchObject({ kind: "too-large", reason: "export-failed" });
      await expect(
        exporter.toImage({ size: { width: 0, height: 10 } }),
      ).rejects.toMatchObject({ kind: "invalid", reason: "export-failed" });
      expect(openRenderMap).not.toHaveBeenCalled();
    });

    it("refuses when the map is not mounted, or a swap is loading, before it opens anything", async () => {
      const gone = setupRender();
      gone.host.mountedMap = () => undefined;
      await expect(
        gone.exporter.toImage({ pixelRatio: 2 }),
      ).rejects.toMatchObject({ message: "The map is not mounted." });
      const swapping = setupRender();
      swapping.host.isSwapPending = () => true;
      await expect(
        swapping.exporter.toImage({ pixelRatio: 2 }),
      ).rejects.toMatchObject({ reason: "export-failed" });
      expect(gone.openRenderMap).not.toHaveBeenCalled();
      expect(swapping.openRenderMap).not.toHaveBeenCalled();
    });

    it("gives up with a timed-out error when the tiles do not finish, and removes what it made", async () => {
      vi.useFakeTimers();
      const { exporter, openRenderMap, render } = setupRender({
        idle: new Promise<void>(() => {}),
      });
      const image = exporter.toImage({ pixelRatio: 2 });
      let settled = false;
      const refused = expect(image).rejects.toMatchObject({
        kind: "timed-out",
        reason: "export-failed",
      });
      void image.catch(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(IMAGE_TILES_WAIT_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await refused;
      expect(render.map.triggerRepaint).not.toHaveBeenCalled();
      expect(render.map.remove).toHaveBeenCalledTimes(1);
      expect(containerOf(openRenderMap).isConnected).toBe(false);
    });

    it("waits as long as the exporter was told to", async () => {
      vi.useFakeTimers();
      const { exporter } = setupRender({
        idle: new Promise<void>(() => {}),
        tilesWaitMs: 50,
      });
      const refused = expect(
        exporter.toImage({ pixelRatio: 2 }),
      ).rejects.toMatchObject({ kind: "timed-out" });
      await vi.advanceTimersByTimeAsync(50);
      await refused;
    });

    it("does not draw until the tiles have loaded", async () => {
      let loaded = () => {};
      const { exporter, render } = setupRender({
        idle: new Promise<void>((resolve) => {
          loaded = resolve;
        }),
      });
      const image = exporter.toImage({ pixelRatio: 2 });
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(render.map.triggerRepaint).not.toHaveBeenCalled();
      loaded();
      expect((await image).type).toBe("image/png");
      expect(render.map.triggerRepaint).toHaveBeenCalledTimes(1);
    });

    it("removes the render map and container when no frame is drawn", async () => {
      vi.useFakeTimers();
      const { exporter, openRenderMap, render } = setupRender();
      render.map.triggerRepaint.mockImplementation(() => {});
      const refused = expect(
        exporter.toImage({ pixelRatio: 2 }),
      ).rejects.toMatchObject({
        message: "The map did not draw a frame to save.",
      });
      await vi.advanceTimersByTimeAsync(IMAGE_WAIT_MS);
      await refused;
      expect(render.map.remove).toHaveBeenCalledTimes(1);
      expect(containerOf(openRenderMap).isConnected).toBe(false);
    });

    it("removes the render map and container when the adapter is destroyed during the render", async () => {
      let mounted = true;
      const { exporter, host, openRenderMap, render, asMap } = setupRender();
      host.mountedMap = () => (mounted ? asMap() : undefined);
      render.map.triggerRepaint.mockImplementation(() => {
        mounted = false;
        render.listeners.get("render")?.();
      });
      await expect(exporter.toImage({ pixelRatio: 2 })).rejects.toMatchObject({
        message: "The map is not mounted.",
      });
      expect(render.map.remove).toHaveBeenCalledTimes(1);
      expect(containerOf(openRenderMap).isConnected).toBe(false);
    });

    it("turns a render map that cannot be opened into export-failed and removes the container", async () => {
      const { exporter, host } = setup();
      host.openRenderMap = vi.fn(() => Promise.reject(new Error("no WebGL")));
      await expect(exporter.toImage({ pixelRatio: 2 })).rejects.toMatchObject({
        reason: "export-failed",
        message: expect.stringContaining("no WebGL"),
      });
      const request = vi.mocked(host.openRenderMap).mock.calls[0]?.[0];
      expect(request?.container.isConnected).toBe(false);
    });

    it("refuses an image the device could not draw at the requested size", async () => {
      const { exporter, render, openRenderMap } = setupRender({
        canvasShortBy: 1,
      });
      await expect(
        exporter.toImage({ size: { width: 640, height: 480 }, pixelRatio: 2 }),
      ).rejects.toMatchObject({ kind: "too-large", reason: "export-failed" });
      expect(methodsOf()).toEqual(["drawImage"]);
      expect(render.map.remove).toHaveBeenCalledTimes(1);
      expect(containerOf(openRenderMap).isConnected).toBe(false);
    });

    it("places marks with the render map's placement, at the pixel ratio", async () => {
      const { exporter, host, render } = setupRender();
      await exporter.toImage({ pixelRatio: 2, drawing: DOT_DRAWING });
      expect(host.placement).toHaveBeenCalledWith(render.asMap());
      const arc = canvasStub.contexts[0]?.calls.find(
        (call) => call.method === "arc",
      );
      expect(arc?.args.slice(0, 3)).toEqual([
        PROJECTED.x * 2,
        PROJECTED.y * 2,
        14,
      ]);
    });

    it("draws the credit text in full, sized to the pixel ratio", async () => {
      const { exporter } = setupRender();
      await exporter.toImage({
        pixelRatio: 2,
        attribution: "© Example contributors",
      });
      expect(methodsOf()).toContain("fillText");
      expect(canvasStub.contexts[0]?.font).toMatch(/^22px /);
    });

    it("draws a fractional size at the whole CSS pixels the engine sizes its canvas from", async () => {
      const { exporter, openRenderMap } = setupRender();
      await exporter.toImage({
        size: { width: 390.4, height: 700.6 },
        pixelRatio: 2,
      });
      expect(containerOf(openRenderMap).style.width).toBe("390px");
      expect(containerOf(openRenderMap).style.height).toBe("701px");
      expect([
        canvasStub.contexts[0]?.canvas.width,
        canvasStub.contexts[0]?.canvas.height,
      ]).toEqual([780, 1402]);
    });

    describe("when the adapter is destroyed or exports overlap", () => {
      /** A host whose render maps each report idle when the test says, counting how many are open at once. */
      function setupHeld(afterRemove: (opened: number) => void = () => {}) {
        const idles: (() => void)[] = [];
        const log = { open: 0, most: 0, opened: 0 };
        const openRenderMap = vi.fn(
          async (request: RenderMapRequest): Promise<RenderMap> => {
            const render = stubMap();
            const { width, height } = engineCanvasSize(request);
            render.canvas.width = width;
            render.canvas.height = height;
            log.opened += 1;
            log.open += 1;
            log.most = Math.max(log.most, log.open);
            render.map.remove.mockImplementation(() => {
              log.open -= 1;
              afterRemove(log.opened);
            });
            return {
              map: render.asMap(),
              idle: new Promise<void>((resolve) => {
                idles.push(resolve);
              }),
            };
          },
        );
        const lifetime = new AbortController();
        const visible = setup({ openRenderMap, closed: () => lifetime.signal });
        return { ...visible, openRenderMap, idles, log, lifetime };
      }

      it("stops waiting for tiles at once when the adapter is destroyed, with the not-mounted error and nothing left behind", async () => {
        vi.useFakeTimers();
        const { exporter, host, openRenderMap, lifetime, log } = setupHeld();
        const image = exporter.toImage({ pixelRatio: 2 });
        const refused = expect(image).rejects.toMatchObject({
          reason: "export-failed",
          message: "The map is not mounted.",
        });
        await vi.advanceTimersByTimeAsync(10);
        expect(log.open).toBe(1);
        host.mountedMap = () => undefined;
        lifetime.abort();
        await refused;
        expect(log.open).toBe(0);
        expect(containerOf(openRenderMap).isConnected).toBe(false);
        // The tile wait's own timer is gone too, not left to fire later.
        expect(vi.getTimerCount()).toBe(0);
      });

      it("does not wait at all for tiles when the adapter was destroyed while its render map opened", async () => {
        const { exporter, lifetime, log } = setupHeld();
        lifetime.abort();
        await expect(exporter.toImage({ pixelRatio: 2 })).rejects.toMatchObject(
          { message: "The map is not mounted." },
        );
        expect(log).toMatchObject({ open: 0, opened: 1 });
      });

      it("opens one render map at a time, the next export waiting for the one before", async () => {
        const { exporter, idles, log, openRenderMap } = setupHeld();
        const first = exporter.toImage({ pixelRatio: 2 });
        const second = exporter.toImage({ pixelRatio: 2 });
        const third = exporter.toImage({ pixelRatio: 1 });
        await vi.waitFor(() => expect(idles).toHaveLength(1));
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(openRenderMap).toHaveBeenCalledTimes(1);
        idles[0]?.();
        await first;
        await vi.waitFor(() => expect(idles).toHaveLength(2));
        expect(openRenderMap).toHaveBeenCalledTimes(2);
        idles[1]?.();
        await second;
        await vi.waitFor(() => expect(idles).toHaveLength(3));
        idles[2]?.();
        await third;
        expect(log).toEqual({ open: 0, most: 1, opened: 3 });
      });

      it("refuses an export that waited in the queue while the map's style changed, and still draws one asked for after", async () => {
        let version = 0;
        const { exporter, host, idles, log } = setupHeld();
        host.styleVersion = () => version;
        const first = exporter.toImage({ pixelRatio: 2 });
        const stale = exporter.toImage({ pixelRatio: 2 });
        await vi.waitFor(() => expect(idles).toHaveLength(1));
        // A basemap swap or a layer toggle finishes while the second waits.
        version += 1;
        idles[0]?.();
        await first;
        await expect(stale).rejects.toMatchObject({
          reason: "export-failed",
          message: "The map changed while the image was waiting.",
        });
        expect(log.opened).toBe(1);
        const fresh = exporter.toImage({ pixelRatio: 2 });
        await vi.waitFor(() => expect(idles).toHaveLength(2));
        idles[1]?.();
        await expect(fresh).resolves.toBeInstanceOf(Blob);
      });

      it("removes the container even when removing the render map throws", async () => {
        const { exporter, openRenderMap, render } = setupRender();
        render.map.remove.mockImplementation(() => {
          throw new Error("context lost");
        });
        await expect(exporter.toImage({ pixelRatio: 2 })).rejects.toMatchObject(
          { reason: "export-failed" },
        );
        expect(containerOf(openRenderMap).isConnected).toBe(false);
      });

      it("does not let a failed export hold up the next, and checks the adapter again before it starts", async () => {
        const held = setupHeld((opened) => {
          // The adapter goes away as the second export finishes, while the
          // third waits its turn.
          if (opened === 2) {
            held.host.mountedMap = () => undefined;
          }
        });
        const { exporter, idles, log } = held;
        const failing = exporter.toImage({ pixelRatio: 2 });
        const waiting = exporter.toImage({ pixelRatio: 2 });
        const gone = exporter.toImage({ pixelRatio: 2 });
        await vi.waitFor(() => expect(idles).toHaveLength(1));
        canvasStub.failNext = true;
        idles[0]?.();
        await expect(failing).rejects.toMatchObject({
          reason: "export-failed",
        });
        await vi.waitFor(() => expect(idles).toHaveLength(2));
        idles[1]?.();
        await expect(waiting).resolves.toBeInstanceOf(Blob);
        await expect(gone).rejects.toMatchObject({
          message: "The map is not mounted.",
        });
        expect(log).toMatchObject({ open: 0, most: 1, opened: 2 });
      });
    });
  });
});
