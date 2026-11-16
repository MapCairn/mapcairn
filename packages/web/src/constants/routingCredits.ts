// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LayerAttribution } from "@mapcairn/core";

/**
 * The credits for a route or travel-time area on the map: OpenStreetMap, whose
 * data the routing service uses, and the service itself. The map credits list
 * them only while a result is drawn, because nothing else on the map comes
 * from that service. The wording of the first matches the basemap credits, so
 * the credits list it once.
 */
export const ROUTING_CREDITS: readonly LayerAttribution[] = [
  {
    text: "© OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
  },
  {
    text: "Routing by Valhalla, run by FOSSGIS",
    url: "https://valhalla1.openstreetmap.de",
  },
];
