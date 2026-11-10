import type { BasemapDefinition } from "../ports/basemap";

/** A vector basemap, with zoom limits 0 to 18. */
export const FAKE_VECTOR_BASEMAP: BasemapDefinition =
  Object.freeze<BasemapDefinition>({
    id: "fake-vector",
    name: "Fake vector",
    source: { kind: "vector", styleUrl: "https://tiles.example/style.json" },
    minZoom: 0,
    maxZoom: 18,
    thumbnail: "/basemaps/fake-vector.webp",
    attribution: [{ text: "Fake tiles" }],
    appearance: "light",
  });

/**
 * A vector basemap whose provider asks for a permanent credit and does not
 * allow saved images, with no preview image (so the picker shows a swatch).
 */
export const FAKE_CREDITED_BASEMAP: BasemapDefinition =
  Object.freeze<BasemapDefinition>({
    id: "fake-credited",
    name: "Fake credited",
    source: {
      kind: "vector",
      styleUrl: "https://tiles.example/credited.json",
    },
    minZoom: 0,
    maxZoom: 18,
    attribution: [
      { text: "© Fake provider", href: "https://provider.example/legal" },
    ],
    appearance: "dark",
    allowsImageExport: false,
    credit: {
      kind: "permanent",
      logo: {
        src: "/basemaps/fake-provider.svg",
        href: "https://provider.example/",
        label: "Fake provider",
        minHeight: 24,
      },
      lines: [
        { text: "© Fake provider", href: "https://provider.example/legal" },
      ],
    },
  });

/** A raster basemap, with zoom limits 2 to 12. */
export const FAKE_RASTER_BASEMAP: BasemapDefinition =
  Object.freeze<BasemapDefinition>({
    id: "fake-raster",
    name: "Fake raster",
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
