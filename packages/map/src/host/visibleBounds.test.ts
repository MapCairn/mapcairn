import { BASEMAPS, FakeMapAdapter } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { visibleBounds } from "./visibleBounds";

function host(width: number, height: number) {
  return {
    focus: () => undefined,
    getBoundingClientRect: () => ({ width, height, left: 10, top: 20 }),
  };
}

async function mountedAdapter(width: number, height: number) {
  const adapter = new FakeMapAdapter();
  const basemap = BASEMAPS[0];
  if (!basemap) {
    throw new Error("No basemap");
  }
  await adapter.mount(host(width, height), {
    view: { center: { lat: -33.92, lng: 18.42 }, zoom: 12, bearing: 0 },
    basemap,
    reducedMotion: true,
  });
  return adapter;
}

describe("visibleBounds", () => {
  it("is the box between the map's corners, around its centre", async () => {
    const adapter = await mountedAdapter(800, 600);
    const element = host(800, 600);

    const bounds = visibleBounds(adapter, element);

    const north = adapter.unproject({ x: 0, y: 0 });
    const south = adapter.unproject({ x: 800, y: 600 });
    expect(bounds).toEqual({
      south: south.lat,
      west: north.lng,
      north: north.lat,
      east: south.lng,
    });
    expect(bounds?.south).toBeLessThan(-33.92);
    expect(bounds?.north).toBeGreaterThan(-33.92);
    expect(bounds?.west).toBeLessThan(18.42);
    expect(bounds?.east).toBeGreaterThan(18.42);
  });

  it("is undefined without an adapter or a host", async () => {
    const adapter = await mountedAdapter(800, 600);
    expect(visibleBounds(null, host(800, 600))).toBeUndefined();
    expect(visibleBounds(adapter, null)).toBeUndefined();
  });

  it("is undefined while the host has no size", async () => {
    const adapter = await mountedAdapter(800, 600);
    expect(visibleBounds(adapter, host(0, 600))).toBeUndefined();
  });
});
