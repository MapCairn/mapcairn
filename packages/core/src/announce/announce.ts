// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type RoutingRequestKind,
  routingErrorMessage,
  stopLetter,
  travelModeParticiple,
} from "../directions/directions";
import { formatLatLng, formatNumber, formatZoom } from "../format/format";
import { describeSlotStart } from "../layers/dateTime";
import type {
  LocationErrorKind,
  RoutingErrorKind,
  SearchErrorKind,
} from "../ports/errors";
import type { LatLng } from "../ports/geometry";
import type { MapProjection } from "../ports/map";
import type { TravelMode } from "../ports/routing";
import type { UnitSystem } from "../ports/settings";
import { describeDuration } from "../units/duration";
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

/** The map image was handed to the browser to save. */
export function announceImageSaved(): string {
  return "Map image saved.";
}

/** The map image could not be made. */
export function announceImageFailed(): string {
  return "The map image could not be saved. Try again.";
}

/** The keyboard route found no feature at the centre of the map. */
export function announceNoFeaturesHere(): string {
  return "No features at the centre of the map.";
}

/** A tap or the keyboard found several features together, and a list opened to choose one. */
export function announceFeaturesFound(count: number): string {
  return `${formatNumber(count)} features here. Choose one from the list.`;
}

/** A query layer drew only the first of more features than it shows. */
export function announceLayerCapped(name: string, shown: number): string {
  return `${name}: showing the first ${formatNumber(shown)}. Zoom in to see more.`;
}

/** A query layer is too far out to ask for features. */
export function announceLayerZoomIn(name: string): string {
  return `${name}: zoom in to load this layer.`;
}

/** A tile layer was turned on. */
export function announceLayerOn(name: string): string {
  return `${name} is on.`;
}

/** One action turned several layers off, and the interface offers an Undo for a few seconds. */
export function announceLayersTurnedOff(count: number): string {
  return `${formatNumber(count)} ${pluralise(count, ["layer", "layers"])} turned off. Undo available`;
}

/** An undo turned layers that one action had turned off back on. */
export function announceLayersTurnedBackOn(count: number): string {
  return `${formatNumber(count)} ${pluralise(count, ["layer", "layers"])} turned back on`;
}

/** What a change to the layer catalogue did, for {@link announceCatalogueChange}. */
export interface CatalogueChange {
  /** The names of enabled layers the catalogue no longer holds, which were turned off. */
  readonly turnedOff: readonly string[];
  /** How many layers the link named that the catalogue does not have for this person. */
  readonly linkUnavailable: number;
}

function announceLayersUnavailable(names: readonly string[]): string {
  const [only] = names;
  return only !== undefined && names.length === 1
    ? `${only} is no longer available and was turned off.`
    : `${formatNumber(names.length)} layers are no longer available and were turned off.`;
}

function announceLinkLayersUnavailable(count: number): string {
  return count === 1
    ? "1 layer in the link is not available."
    : `${formatNumber(count)} layers in the link are not available.`;
}

/**
 * One message for one change to the catalogue: the layers that were turned
 * off, then the layers of the link that are not available. Null when neither
 * happened. The live region coalesces messages that arrive within a window of the
 * last one sent to the latest of them, so a transition says everything at once.
 */
export function announceCatalogueChange(
  change: CatalogueChange,
): string | null {
  const parts = [
    change.turnedOff.length > 0
      ? announceLayersUnavailable(change.turnedOff)
      : null,
    change.linkUnavailable > 0
      ? announceLinkLayersUnavailable(change.linkUnavailable)
      : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" ") : null;
}

/*
 * The selection's messages each carry the running total, because the live
 * region coalesces messages that arrive close together to the latest: the one
 * that is read out must still be true when an earlier one was replaced.
 */

/** One feature was added to the selection: "Added Gauge 4. 5 selected." */
export function announceFeatureSelected(title: string, total: number): string {
  return `Added ${title}. ${formatNumber(total)} selected.`;
}

/** Several features, or one with no title to give, were added to the selection. */
export function announceFeaturesSelected(count: number, total: number): string {
  return `${formatNumber(count)} ${pluralise(count, ["feature", "features"])} added. ${formatNumber(total)} selected.`;
}

/** One feature was removed from the selection: "Removed Gauge 4. 4 selected." */
export function announceFeatureDeselected(
  title: string,
  total: number,
): string {
  return `Removed ${title}. ${formatNumber(total)} selected.`;
}

/** Several features, or one with no title to give, were removed from the selection. */
export function announceFeaturesDeselected(
  count: number,
  total: number,
): string {
  return `${formatNumber(count)} ${pluralise(count, ["feature", "features"])} removed. ${formatNumber(total)} selected.`;
}

/** The selection was emptied. */
export function announceSelectionCleared(): string {
  return "Selection cleared.";
}

/** An addition was refused whole because the selection would pass its `limit`. */
export function announceSelectionFull(limit: number): string {
  return `The selection holds ${formatNumber(limit)} at most. Nothing was added.`;
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

/**
 * The status line of a tile layer whose tiles all failed. `when` is the
 * layer's chosen date or time in words, or null for a layer with none to
 * choose, which can only say that it did not load.
 */
export function describeTilesUnavailable(when: string | null): string {
  return when === null
    ? "Could not load. Check your connection."
    : `No imagery was found for ${when}. Try another.`;
}

/** A tile layer's tiles all failed, in the words of {@link describeTilesUnavailable}. */
export function announceTilesUnavailable(
  name: string,
  when: string | null,
): string {
  return `${name}: ${describeTilesUnavailable(when)}`;
}

/** A tile layer that had found no tiles loaded one, so its status has gone. */
export function announceTilesRecovered(name: string): string {
  return `${name}: imagery is showing again.`;
}

/** "Show on map" centred the map on a feature. */
export function announceShowingFeature(title: string): string {
  return `Showing ${title} on the map.`;
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

/**
 * Announced when a search is answered by one pair of coordinates. It names the
 * place, so a second pair is never mistaken for a repeat of the first.
 */
export function announceCoordinateResult(label: string): string {
  return `${announceSearchResults(1)}, ${label}`;
}

/** Announced when a search finds nothing. */
export function announceNoResults(): string {
  return "No results";
}

/** Says what went wrong with a search and what to do next. */
export function announceSearchError(kind: SearchErrorKind): string {
  return SEARCH_ERROR_MESSAGES[kind];
}

/** "3 suggestions" or "1 suggestion", announced as the person types. */
export function announceSuggestions(count: number): string {
  return `${formatNumber(count)} ${pluralise(count, ["suggestion", "suggestions"])}`;
}

/** Announced when typing finds no suggestion. */
export function announceNoSuggestions(): string {
  return "No suggestions";
}

/** Announced once when suggestions stop working, so the person knows Enter still searches. */
export function announceSuggestionsUnavailable(): string {
  return "Suggestions are unavailable. Press Enter to search.";
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

/** Announced when the map is switched between flat and globe. */
export function announceProjection(projection: MapProjection): string {
  return `Map shape: ${projection}`;
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

/** Announced when a stop is added to the directions. `index` counts from zero. */
export function announceStopAdded(index: number, total: number): string {
  return `Stop ${stopLetter(index)} added, ${total} ${pluralise(total, ["stop", "stops"])}`;
}

/** Announced when a stop cannot be added because the directions hold `max` already. */
export function announceStopLimit(max: number): string {
  return `You can add up to ${max} stops. Remove one to add another.`;
}

/** Announced when a stop is removed from the directions. `index` counts from zero. */
export function announceStopRemoved(index: number): string {
  return `Stop ${stopLetter(index)} removed`;
}

/** Announced when a stop moves to a new place in the list. `index` counts from zero. */
export function announceStopMoved(index: number, total: number): string {
  return `Stop moved to position ${index + 1} of ${total}, now stop ${stopLetter(index)}`;
}

/** Announced when a route is found: how far, how long, and how it is travelled. */
export function announceRouteFound(
  metres: number,
  seconds: number,
  mode: TravelMode,
  units: UnitSystem,
): string {
  return `Route found, ${describeDistance(metres, units)}, ${describeDuration(seconds)} ${travelModeParticiple(mode)}`;
}

/** Announced when a reachable area is found: how long it is for, the mode and its size. */
export function announceAreaFound(
  minutes: number,
  squareMetres: number,
  mode: TravelMode,
  units: UnitSystem,
): string {
  return `Area reachable within ${minutes} ${pluralise(minutes, ["minute", "minutes"])} ${travelModeParticiple(mode)} found, covering ${describeArea(squareMetres, units)}`;
}

/** Announced when a route or area request fails, saying what to do next. */
export function announceRoutingError(
  kind: Exclude<RoutingErrorKind, "aborted">,
  request: RoutingRequestKind,
): string {
  return routingErrorMessage(kind, request);
}

/** Announced when the person cancels a route or area request. */
export function announceRoutingCancelled(): string {
  return "Cancelled";
}

/** Announced when the stops and the route or area are cleared. */
export function announceDirectionsCleared(): string {
  return "Directions cleared";
}

/** Announced when the person skips the first-visit tour, saying how to start it again. */
export function announceTourSkipped(): string {
  return "Tour skipped. Help, in Settings, can start it again.";
}

/**
 * Announced when a chosen time is not offered and the layer moves to the
 * nearest slot that is. `slot` is that slot's value.
 */
export function announceTimeMoved(slot: string): string {
  return `Time moved to ${describeSlotStart(slot)}, the nearest available.`;
}
