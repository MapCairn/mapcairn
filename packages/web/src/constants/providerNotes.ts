/**
 * The privacy statement in Settings. It matches the privacy page: what the
 * site sets and counts, who receives a search or an address lookup and when,
 * and where settings are kept.
 */
export const SETTINGS_PRIVACY_NOTE =
  "MapCairn has no accounts, sets no cookies and counts page views without tracking you. Map tiles come from the map provider you choose. Searching sends your query to OpenStreetMap's Nominatim service, and Look up address on a pin sends the pin's position, to about 11 m, to the same service. Nothing is sent to it until you do one of those, and a pair of coordinates typed in search is not sent to it, though showing the place loads map tiles for that area, as any move of the map does. A data layer contacts its provider only while it is on. Your settings stay on this device.";

/** What "Look up address" on a pin sends and to whom, shown under the button. */
export const PIN_LOOKUP_NOTE =
  "Sends the pin's position, to about 11 m, to OpenStreetMap's Nominatim service.";
