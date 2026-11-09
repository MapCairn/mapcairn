import { formatLatLng, formatNumber, formatZoom } from "../format/format";
import type { LocationErrorKind, SearchErrorKind } from "../ports/errors";
import type { LatLng } from "../ports/geometry";
import type { UnitSystem } from "../ports/settings";
import {
  describeArea,
  describeDistance,
  pluralise,
} from "../units/measurement";

/*
 * Every string the single live region announces lives here, so wording is
 * reviewed in one place and tests can pin it. Plain, neutral British English,
 * each error saying what happened and what to do next.
 */

const SEARCH_ERROR_MESSAGES: Readonly<Record<SearchErrorKind, string>> = {
  offline: "You appear to be offline. Check your connection and try again.",
  "rate-limited":
    "Too many searches in a short time. Wait a moment and try again.",
  failed: "Search did not work. Try again in a moment.",
};

const LOCATION_ERROR_MESSAGES: Readonly<Record<LocationErrorKind, string>> = {
  denied:
    "Location access is blocked. Allow it in your browser settings, or search for a place instead.",
  unavailable:
    "Your location is not available right now. Check that location services are on, or search for a place instead.",
  timeout:
    "Finding your location took too long. Try again, or search for a place instead.",
};

const DETENT_MESSAGES = {
  peek: "Panel minimised",
  half: "Panel half height",
  full: "Panel full height",
} as const;

/** A feed layer loaded: "Earthquakes: 43 shown on the map." */
export function announceLayerLoaded(name: string, count: number): string {
  return `${name}: ${formatNumber(count)} shown on the map.`;
}

/** A tile layer was turned on. */
export function announceLayerOn(name: string): string {
  return `${name} is on.`;
}

/** A feed layer loaded with nothing in it, in the layer's own words. */
export function announceLayerEmpty(name: string, emptyText: string): string {
  return `${name}: ${emptyText}`;
}

/** A layer could not load, and what to do next. */
export function announceLayerError(
  name: string,
  kind: "network" | "invalid",
): string {
  return kind === "network"
    ? `${name} could not load. Check your connection and try again.`
    : `${name} could not load: the provider sent something unexpected. Try again later.`;
}

/** A feature's affected area is on the map. */
export function announceDetailShown(title: string): string {
  return `Affected area of ${title} shown on the map.`;
}

/** A feature's affected area could not load. */
export function announceDetailError(): string {
  return "The affected area could not load. Try again.";
}

/** "3 results" or "1 result". */
export function announceSearchResults(count: number): string {
  return `${formatNumber(count)} ${pluralise(count, ["result", "results"])}`;
}

/** Announced when a search finds nothing. */
export function announceNoResults(): string {
  return "No results";
}

/** Says what went wrong with a search and what to do next. */
export function announceSearchError(kind: SearchErrorKind): string {
  return SEARCH_ERROR_MESSAGES[kind];
}

/** Announced when a location fix arrives, with its accuracy in the user's units. */
export function announceLocationFound(
  accuracyMetres: number,
  units: UnitSystem,
): string {
  return `Location found, accuracy about ${describeDistance(accuracyMetres, units)}`;
}

/** Says why finding the location failed and what to do next. */
export function announceLocationError(kind: LocationErrorKind): string {
  return LOCATION_ERROR_MESSAGES[kind];
}

/** Announced after an attempt to copy coordinates. */
export function announceCopied(ok: boolean): string {
  return ok
    ? "Coordinates copied"
    : "Could not copy. Select the coordinates and copy them manually.";
}

/** Announced when a pin is placed, with its coordinates. */
export function announcePinDropped(position: LatLng): string {
  return `Pin dropped at ${formatLatLng(position)}`;
}

/** Announced when the pin is removed. */
export function announcePinCleared(): string {
  return "Pin removed";
}

/**
 * Announces the running total of a measurement: metres for `distance`,
 * square metres for `area`. Unit names are spoken in full.
 */
export function announceMeasureTotal(
  mode: "distance" | "area",
  value: number,
  units: UnitSystem,
): string {
  return mode === "distance"
    ? `Total distance ${describeDistance(value, units)}`
    : `Total area ${describeArea(value, units)}`;
}

/** Announced when the basemap changes. */
export function announceBasemap(name: string): string {
  return `Basemap changed to ${name}`;
}

/** Announced when the zoom level settles. */
export function announceZoom(zoom: number): string {
  return `Zoom level ${formatZoom(zoom)}`;
}

/** Announced when the bottom panel moves to a new height. */
export function announceDetent(detent: "peek" | "half" | "full"): string {
  return DETENT_MESSAGES[detent];
}

/** Announced when a panel, dialog or sheet opens. */
export function announceSurfaceOpened(name: string): string {
  return `${name} opened`;
}

/** Announced when a panel, dialog or sheet closes. */
export function announceSurfaceClosed(name: string): string {
  return `${name} closed`;
}

/** Announced when map tiles fail to load. */
export function announceTileError(): string {
  return "Some of the map could not load. Check your connection.";
}

/** Announced when the browser goes offline. */
export function announceOffline(): string {
  return "You are offline. Parts of the map may not load.";
}

/** Announced when an address lookup finds the address at a pin. */
export function announceAddressFound(address: string): string {
  return `Address found: ${address}`;
}

/** Announced when an address lookup finds no address at a pin. */
export function announceAddressNotFound(): string {
  return "No address found here";
}

/** Says an address lookup failed and what to do next. */
export function announceAddressError(): string {
  return "Could not look up the address. Check your connection and try again.";
}
