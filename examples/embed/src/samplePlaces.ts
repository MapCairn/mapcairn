// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { PlaceItem } from "./placeSearch";

/**
 * The example's search index: a few invented places near the starting view,
 * in the shape a plain JSON place service returns them (see `PlaceItem`). The
 * names and positions are made up for the demo and describe nothing real.
 * `Glen Example` carries an extent, so picking it fits the map to the glen
 * instead of centring on a point.
 */
export const SAMPLE_PLACES: readonly PlaceItem[] = [
  {
    id: "cairn-hollow",
    name: "Cairn Hollow",
    area: "Example Glen",
    lat: 57.052,
    lon: -3.648,
  },
  {
    id: "glen-example",
    name: "Glen Example",
    area: "Sample Parish",
    lat: 57.07,
    lon: -3.7,
    box: [57.03, -3.76, 57.11, -3.64],
  },
  {
    id: "ben-placeholder",
    name: "Ben Placeholder",
    area: "Sample Parish",
    lat: 57.09,
    lon: -3.58,
  },
  {
    id: "loch-invented",
    name: "Loch Invented",
    area: "Example Glen",
    lat: 57.01,
    lon: -3.69,
    box: [57.0, -3.72, 57.02, -3.66],
  },
  {
    id: "fictional-bridge",
    name: "Fictional Bridge",
    area: "Sample Parish",
    lat: 57.04,
    lon: -3.61,
  },
];
