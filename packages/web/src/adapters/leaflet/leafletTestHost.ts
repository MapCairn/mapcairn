import type { BasemapDefinition } from "@karta/core";
import * as LeafletNamespace from "leaflet";

type LeafletModule = typeof LeafletNamespace;

/**
 * The Leaflet module object the adapter's dynamic import resolves to, so tests
 * can read the same `Browser` flags and map class the adapter uses.
 */
export const L: LeafletModule =
  (LeafletNamespace as LeafletModule & { default?: LeafletModule }).default ??
  LeafletNamespace;

/** Test-only raster basemap with an unreachable tile host. */
export function rasterBasemap(
  overrides: Partial<BasemapDefinition> = {},
): BasemapDefinition {
  return {
    id: "test-raster",
    name: "Test raster",
    engine: "leaflet",
    source: {
      kind: "raster",
      tileUrl: "https://tiles.test/{z}/{x}/{y}.png",
      tileSize: 256,
    },
    minZoom: 0,
    maxZoom: 19,
    thumbnail: "/thumb.png",
    attribution: [{ text: "Test" }],
    appearance: "light",
    ...overrides,
  };
}

/** Test-only vector basemap, which the Leaflet adapter must refuse. */
export const vectorBasemap: BasemapDefinition = {
  id: "test-vector",
  name: "Test vector",
  engine: "maplibre",
  source: { kind: "vector", styleUrl: "https://styles.test/style.json" },
  minZoom: 0,
  maxZoom: 22,
  thumbnail: "/thumb.png",
  attribution: [{ text: "Test" }],
  appearance: "light",
};

/** A host element with a fixed layout size, which happy-dom cannot compute. */
export interface SizedHost {
  readonly element: HTMLDivElement;
  resize(width: number, height: number): void;
}

/** Creates a sized host in the document. */
export function createSizedHost(width = 800, height = 600): SizedHost {
  const element = document.createElement("div");
  const size = { width, height };
  for (const [property, axis] of [
    ["clientWidth", "width"],
    ["offsetWidth", "width"],
    ["clientHeight", "height"],
    ["offsetHeight", "height"],
  ] as const) {
    Object.defineProperty(element, property, {
      configurable: true,
      get: () => size[axis],
    });
  }
  element.getBoundingClientRect = () =>
    ({
      width: size.width,
      height: size.height,
      left: 0,
      top: 0,
      right: size.width,
      bottom: size.height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.append(element);
  return {
    element,
    resize(nextWidth, nextHeight) {
      size.width = nextWidth;
      size.height = nextHeight;
    },
  };
}

/** Makes every tile that is still loading report that it loaded. */
export function loadPendingTiles(host: HTMLElement): void {
  for (const tile of host.querySelectorAll<HTMLImageElement>(
    "img.leaflet-tile:not(.leaflet-tile-loaded)",
  )) {
    tile.dispatchEvent(new Event("load"));
  }
}

let latestMap: LeafletNamespace.Map | undefined;
let hooked = false;

/**
 * Records every Leaflet map as it is created, so a test can reach the engine
 * behind the adapter without the adapter exposing it.
 */
export function captureMaps(): () => LeafletNamespace.Map {
  if (!hooked) {
    hooked = true;
    L.Map.addInitHook(function (this: LeafletNamespace.Map) {
      latestMap = this;
    });
  }
  return () => {
    if (!latestMap) {
      throw new Error("No Leaflet map has been created.");
    }
    return latestMap;
  };
}

/** Finds the single tile layer on a map. */
export function tileLayerOf(
  map: LeafletNamespace.Map,
): LeafletNamespace.TileLayer {
  let found: LeafletNamespace.TileLayer | undefined;
  map.eachLayer((layer) => {
    if (layer instanceof L.TileLayer) {
      found = layer;
    }
  });
  if (!found) {
    throw new Error("The map has no tile layer.");
  }
  return found;
}
