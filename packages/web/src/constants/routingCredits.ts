// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LayerAttribution } from "@mapcairn/core";

/**
 * The credits for a route or travel-time area on the map: OpenStreetMap, whose
 * data the routing service uses, the service itself, and a link to OpenStreetMap's
 * Fix the map page, which the service's usage terms ask for. The map credits
 * list them only while a result is drawn, because nothing else on the map
 * comes from that service. The wording of the first matches the basemap
 * credits, so the credits list it once.
 *
 * @param fixTheMapText The link text for Fix the map, from the message
 *   catalogue (`host.credits.fixTheMap`).
 */
export function routingCredits(
  fixTheMapText: string,
): readonly LayerAttribution[] {
  return [
    {
      text: "© OpenStreetMap contributors",
      url: "https://www.openstreetmap.org/copyright",
    },
    {
      text: "Routing by Valhalla, run by FOSSGIS",
      url: "https://valhalla1.openstreetmap.de",
    },
    {
      text: fixTheMapText,
      url: "https://www.openstreetmap.org/fixthemap",
    },
  ];
}
