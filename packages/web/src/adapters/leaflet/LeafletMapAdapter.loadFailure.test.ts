import { afterEach, expect, it, vi } from "vitest";
import { rasterBasemap } from "./leafletTestHost";

afterEach(() => {
  vi.doUnmock("leaflet");
  vi.resetModules();
});

it("rejects mount with a load-failed MapEngineError when Leaflet cannot be loaded", async () => {
  vi.resetModules();
  vi.doMock("leaflet", () => {
    throw new Error("network down");
  });
  // Import after the reset so the error class matches the adapter's copy.
  const { MapEngineError } = await import("@karta/core");
  const { createLeafletMapAdapter } = await import("./LeafletMapAdapter");
  const host = document.createElement("div");
  const result = createLeafletMapAdapter().mount(host, {
    view: { center: { lat: 0, lng: 0 }, zoom: 3, bearing: 0 },
    basemap: rasterBasemap(),
    reducedMotion: true,
  });
  await expect(result).rejects.toBeInstanceOf(MapEngineError);
  await expect(result).rejects.toMatchObject({ reason: "load-failed" });
  expect(host.childElementCount).toBe(0);
});
