import type { LayerAttribution } from "@karta/core";

/**
 * What a request sends and to whom, shown under the Directions buttons. It
 * matches the privacy page: the places and the way of travelling, and the
 * visitor's IP address, go to the routing service only when a button asks.
 */
export const ROUTING_NOTE =
  "Nothing is sent until you ask. Get route sends the stops and the way of travelling, and a travel time area sends the first stop, with your IP address, to the Valhalla routing service run by FOSSGIS. It uses OpenStreetMap data.";

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
