import { describe, expect, it } from "vitest";
import {
  type MapAdapterSubject,
  runMapAdapterContract,
} from "../contracts/mapAdapter.contract";
import { MapEngineError } from "../ports/errors";
import type { MapEvents } from "../ports/map";
import {
  createFakeMapAdapterFactory,
  DEFAULT_FAKE_VIEW,
  FakeMapAdapter,
  type FakeMapAdapterOptions,
  FakeMapHost,
} from "./FakeMapAdapter";
import { FAKE_RASTER_BASEMAP, FAKE_VECTOR_BASEMAP } from "./fixtures";

function subjectFor(
  options: FakeMapAdapterOptions = {},
  withOptionalControls = true,
): () => MapAdapterSubject {
  return () => {
    const adapter = new FakeMapAdapter(options);
    const host = new FakeMapHost();
    return {
      adapter,
      controls: {
        host,
        hostSize: { width: host.width, height: host.height },
        basemap: FAKE_VECTOR_BASEMAP,
        settle: () => Promise.resolve(),
        simulateClick: (latlng) => adapter.simulateClick(latlng),
        simulateTileError: () => adapter.simulateTileError(),
        simulateLoading: (loading) => adapter.simulateLoading(loading),
        ...(withOptionalControls
          ? {
              createFailingMount: () =>
                new FakeMapAdapter({ failMount: "webgl-unavailable" }),
            }
          : {}),
      },
    };
  };
}

runMapAdapterContract("FakeMapAdapter", subjectFor());
runMapAdapterContract(
  "FakeMapAdapter (no optional controls)",
  subjectFor({}, false),
);

const OPTIONS = {
  basemap: FAKE_VECTOR_BASEMAP,
  reducedMotion: false,
  view: { center: { lat: 10, lng: 20 }, zoom: 6, bearing: 30 },
};

describe("FakeMapAdapter", () => {
  it("rejects mount with the scripted reason and does not count it", async () => {
    const adapter = new FakeMapAdapter({ failMount: "load-failed" });
    const error = await adapter
      .mount(new FakeMapHost(), OPTIONS)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MapEngineError);
    expect((error as MapEngineError).reason).toBe("load-failed");
    expect(adapter.mountCount).toBe(0);
  });

  it("starts from a default view before it is mounted", () => {
    const adapter = new FakeMapAdapter();
    expect(adapter.getView()).toEqual(DEFAULT_FAKE_VIEW);
    expect(adapter.getMinZoom()).toBe(0);
    expect(adapter.getMaxZoom()).toBe(18);
  });

  it("counts mounts, applies reduced motion and records destroy", async () => {
    const adapter = new FakeMapAdapter();
    await adapter.mount(new FakeMapHost(), { ...OPTIONS, reducedMotion: true });
    expect(adapter.mountCount).toBe(1);
    expect(adapter.animationEnabled).toBe(false);
    expect(adapter.destroyed).toBe(false);
    adapter.destroy();
    adapter.destroy();
    expect(adapter.destroyed).toBe(true);
    await adapter.mount(new FakeMapHost(), OPTIONS);
    expect(adapter.mountCount).toBe(2);
    expect(adapter.destroyed).toBe(false);
  });

  it("takes zoom limits from the mounted basemap and reclamps on setBasemap", async () => {
    const adapter = new FakeMapAdapter();
    await adapter.mount(new FakeMapHost(), {
      ...OPTIONS,
      view: { ...OPTIONS.view, zoom: 16 },
    });
    expect(adapter.getView().zoom).toBe(16);
    const zooms: number[] = [];
    adapter.on("zoom", (view) => zooms.push(view.zoom));
    await adapter.setBasemap(FAKE_RASTER_BASEMAP);
    expect(adapter.getMinZoom()).toBe(2);
    expect(adapter.getMaxZoom()).toBe(12);
    expect(adapter.getView().zoom).toBe(12);
    expect(zooms).toEqual([12]);
  });

  it("wraps longitude and bearing and clamps latitude", async () => {
    const adapter = new FakeMapAdapter();
    await adapter.mount(new FakeMapHost(), OPTIONS);
    expect(adapter.getView().bearing).toBe(30);
    adapter.rotateBy(-60);
    expect(adapter.getView().bearing).toBe(330);
    adapter.resetBearing();
    expect(adapter.getView().bearing).toBe(0);
    adapter.setView({ center: { lat: 95, lng: 190 } });
    expect(adapter.getView().center.lat).toBeCloseTo(85.0511, 3);
    expect(adapter.getView().center.lng).toBeCloseTo(-170, 6);
  });

  it("does not emit when a change leaves the view as it was", async () => {
    const adapter = new FakeMapAdapter();
    await adapter.mount(new FakeMapHost(), OPTIONS);
    let events = 0;
    for (const name of ["move", "moveEnd", "zoom", "rotate"] as const) {
      adapter.on(name, () => {
        events += 1;
      });
    }
    adapter.setView({});
    adapter.setView({ zoom: 6 });
    adapter.panBy(0, 0);
    expect(events).toBe(0);
  });

  it("keeps panning inside the Mercator world", async () => {
    const adapter = new FakeMapAdapter();
    await adapter.mount(new FakeMapHost(), {
      ...OPTIONS,
      view: { center: { lat: 80, lng: 0 }, zoom: 3, bearing: 0 },
    });
    adapter.panBy(0, -100_000);
    expect(adapter.getView().center.lat).toBeCloseTo(85.0511, 3);
    adapter.panBy(0, 1_000_000);
    expect(adapter.getView().center.lat).toBeCloseTo(-85.0511, 3);
  });

  it("projects with the size of the host it was mounted in", async () => {
    const adapter = new FakeMapAdapter();
    await adapter.mount(new FakeMapHost(400, 300), OPTIONS);
    const point = adapter.project(adapter.getView().center);
    expect(point.x).toBeCloseTo(200, 6);
    expect(point.y).toBeCloseTo(150, 6);
  });

  it("fits a point, a padded box and a box too big for the host within the limits", async () => {
    const adapter = new FakeMapAdapter();
    await adapter.mount(new FakeMapHost(), OPTIONS);
    adapter.fitBounds({ south: 1, west: 2, north: 1, east: 2 });
    expect(adapter.getView().zoom).toBe(18);
    adapter.fitBounds({ south: 1, west: 2, north: 1, east: 2 }, { maxZoom: 9 });
    expect(adapter.getView().zoom).toBe(9);
    const bounds = { south: 0, west: 0, north: 10, east: 10 };
    adapter.fitBounds(bounds);
    const plain = adapter.getView().zoom;
    adapter.fitBounds(bounds, {
      padding: { top: 200, right: 200, bottom: 200, left: 200 },
    });
    expect(adapter.getView().zoom).toBeLessThan(plain);
    adapter.fitBounds(bounds, {
      padding: { top: 900, right: 900, bottom: 900, left: 900 },
    });
    expect(adapter.getView().zoom).toBe(0);
  });

  it("includes the scripted features in a click, or none", async () => {
    const adapter = new FakeMapAdapter();
    const seen: MapEvents["click"][] = [];
    await adapter.mount(new FakeMapHost(), OPTIONS);
    adapter.on("click", (event) => seen.push(event));
    adapter.simulateClick({ lat: 10, lng: 20 }, [{ name: "park" }]);
    adapter.simulateClick({ lat: 10, lng: 20 });
    expect(seen[0]?.features).toEqual([{ name: "park" }]);
    expect(seen[1]?.features).toEqual([]);
  });

  it("records animation, keyboard and focus switches and focuses the host", async () => {
    const adapter = new FakeMapAdapter();
    const host = new FakeMapHost();
    adapter.focus();
    expect(host.focusCalls).toHaveLength(0);
    await adapter.mount(host, OPTIONS);
    adapter.setAnimationEnabled(false);
    adapter.setKeyboardEnabled(false);
    adapter.focus();
    expect(adapter.animationEnabled).toBe(false);
    expect(adapter.keyboardEnabled).toBe(false);
    expect(adapter.focusCount).toBe(2);
    expect(host.focusCalls).toEqual([{ preventScroll: true }]);
  });

  it("drops its listeners on destroy", async () => {
    const adapter = new FakeMapAdapter();
    await adapter.mount(new FakeMapHost(), OPTIONS);
    let moves = 0;
    adapter.on("move", () => {
      moves += 1;
    });
    adapter.destroy();
    adapter.setView({ zoom: 7 });
    expect(moves).toBe(0);
  });

  it("builds a fresh adapter on every call and reports each one", () => {
    const built: FakeMapAdapter[] = [];
    const factory = createFakeMapAdapterFactory((adapter) =>
      built.push(adapter),
    );
    const first = factory();
    const second = factory();
    expect(first).not.toBe(second);
    expect(built).toEqual([first, second]);
    expect(createFakeMapAdapterFactory()()).toBeInstanceOf(FakeMapAdapter);
  });
});
