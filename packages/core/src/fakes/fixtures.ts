import type { BasemapDefinition } from "../ports/basemap";

/** A vector basemap on the MapLibre engine, with zoom limits 0 to 18. */
export const FAKE_VECTOR_BASEMAP: BasemapDefinition =
  Object.freeze<BasemapDefinition>({
    id: "fake-vector",
    name: "Fake vector",
    engine: "maplibre",
    source: { kind: "vector", styleUrl: "https://tiles.example/style.json" },
    minZoom: 0,
    maxZoom: 18,
    thumbnail: "/basemaps/fake-vector.webp",
    attribution: [{ text: "Fake tiles" }],
    appearance: "light",
  });

/** A raster basemap on the Leaflet engine, with zoom limits 2 to 12. */
export const FAKE_RASTER_BASEMAP: BasemapDefinition =
  Object.freeze<BasemapDefinition>({
    id: "fake-raster",
    name: "Fake raster",
    engine: "leaflet",
    source: {
      kind: "raster",
      tileUrl: "https://tiles.example/{z}/{x}/{y}.png",
      tileSize: 256,
    },
    minZoom: 2,
    maxZoom: 12,
    thumbnail: "/basemaps/fake-raster.webp",
    attribution: [{ text: "Fake tiles" }],
    appearance: "dark",
  });
