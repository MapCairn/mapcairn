import { runMapAdapterContract } from "@karta/core/contracts";
import { afterEach, beforeAll } from "vitest";
import { createLeafletMapAdapter } from "./LeafletMapAdapter";
import {
  captureMaps,
  createSizedHost,
  L,
  loadPendingTiles,
  rasterBasemap,
  type SizedHost,
  tileLayerOf,
} from "./leafletTestHost";

const latestMap = captureMaps();
const hosts: SizedHost[] = [];

beforeAll(() => {
  // happy-dom reports no 3D transforms, which makes Leaflet round every zoom
  // to a whole number. Real browsers have them.
  L.Browser.any3d = true;
});

afterEach(() => {
  for (const host of hosts.splice(0)) {
    host.element.remove();
  }
});

runMapAdapterContract("Leaflet", () => {
  const host = createSizedHost(800, 600);
  hosts.push(host);
  return {
    adapter: createLeafletMapAdapter(),
    controls: {
      host: host.element,
      hostSize: { width: 800, height: 600 },
      basemap: rasterBasemap({ minZoom: 0, maxZoom: 19 }),
      async settle() {
        // happy-dom fetches no images, so tiles report loading here.
        loadPendingTiles(host.element);
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
      simulateClick(latlng) {
        // A DOM click rounds to whole pixels, more than the contract's
        // tolerance at mid zooms, so fire Leaflet's own event. The adapter's
        // test covers the DOM path.
        const map = latestMap();
        const position = L.latLng(latlng.lat, latlng.lng);
        map.fire("click", {
          latlng: position,
          containerPoint: map.latLngToContainerPoint(position),
        });
      },
      simulateTileError() {
        tileLayerOf(latestMap()).fire("tileerror");
      },
      simulateLoading(loading) {
        tileLayerOf(latestMap()).fire(loading ? "loading" : "load");
      },
    },
  };
});
