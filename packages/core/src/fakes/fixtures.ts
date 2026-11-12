// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
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

/**
 * A hybrid basemap (image tiles under the labels of a vector style), with
 * real detail to tile level 14 and zoom limits 0 to 17. Its licence is
 * non-commercial, as a host's satellite imagery may be, and its swatch is
 * dark.
 */
export const FAKE_HYBRID_BASEMAP: BasemapDefinition =
  Object.freeze<BasemapDefinition>({
    id: "fake-hybrid",
    name: "Fake hybrid",
    source: {
      kind: "hybrid",
      tileUrl: "https://imagery.example/{z}/{y}/{x}.jpg",
      tileSize: 256,
      maxTileZoom: 14,
      labelStyleUrl: "https://tiles.example/labels.json",
      labelSourceLayers: ["place", "transportation"],
      labelOmitLayers: ["ferries"],
    },
    minZoom: 0,
    maxZoom: 17,
    thumbnail: "/basemaps/fake-hybrid.webp",
    attribution: [{ text: "Fake imagery" }],
    appearance: "dark",
    swatch: "#203024",
    nonCommercial: true,
  });
