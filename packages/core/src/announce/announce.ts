// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type RoutingRequestKind,
  routingErrorMessage,
  stopLetter,
  travelModeParticiple,
} from "../directions/directions";
import { formatLatLng } from "../format/format";
import { describeSlotStart } from "../layers/dateTime";
import { joinMessages, message } from "../messages/formatMessage";
import type {
  LocationErrorKind,
  RoutingErrorKind,
  SearchErrorKind,
} from "../ports/errors";
import type { LatLng } from "../ports/geometry";
import type { MapProjection } from "../ports/map";
import type { Message, MessagePart } from "../ports/messages";
import type { TravelMode } from "../ports/routing";
import type { UnitSystem } from "../ports/settings";
import { describeDuration } from "../units/duration";
import { describeArea, describeDistance } from "../units/measurement";

/*
 * Every message the single live region announces is built here as a key and
 * its parameters (see `Message`), so wording is reviewed in one place, tests
 * can pin it, and the one place that speaks it formats it with the active
 * catalogue. The English is in `messages/en-GB.ts`: plain, neutral British
 * English, each error saying what happened and what to do next.
 */

const SEARCH_ERROR_MESSAGES = {
  offline: message("error.search.offline", {}),
  "rate-limited": message("error.search.rate-limited", {}),
  failed: message("error.search.failed", {}),
} as const satisfies Readonly<Record<SearchErrorKind, Message>>;

const LOCATION_ERROR_MESSAGES = {
  denied: message("error.location.denied", {}),
  unavailable: message("error.location.unavailable", {}),
  timeout: message("error.location.timeout", {}),
} as const satisfies Readonly<Record<LocationErrorKind, Message>>;

const DETENT_MESSAGES = {
  peek: message("announce.detent.peek", {}),
  half: message("announce.detent.half", {}),
  full: message("announce.detent.full", {}),
} as const;

const PROJECTION_MESSAGES = {
  flat: message("announce.projection.flat", {}),
  globe: message("announce.projection.globe", {}),
} as const satisfies Readonly<Record<MapProjection, Message>>;

/** A feed layer loaded: "Earthquakes: 43 shown on the map." */
export function announceLayerLoaded(name: MessagePart, count: number): Message {
  return message("announce.layerLoaded", { name, count });
}

/** The map image was handed to the browser to save. */
export function announceImageSaved(): Message {
  return message("announce.imageSaved", {});
}

/** The map image could not be made. */
export function announceImageFailed(): Message {
  return message("announce.imageFailed", {});
}

/** The keyboard route found no feature at the centre of the map. */
export function announceNoFeaturesHere(): Message {
  return message("announce.noFeaturesHere", {});
}

/** A tap or the keyboard found several features together, and a list opened to choose one. */
export function announceFeaturesFound(count: number): Message {
  return message("announce.featuresFound", { count });
}

/** What one tap on raster layers that answer a tap came to, for {@link announceIdentified}. */
export interface IdentifyReport {
  /** How many features the layers that answered found, in all. */
  readonly found: number;
  /** How many layers were asked. */
  readonly asked: number;
  /** How many layers could have been asked: on, showing imagery, and covering the tapped place. */
  readonly available: number;
  /** The names of the layers that did not answer: they failed or timed out. */
  readonly failed: readonly MessagePart[];
}

/** What to say about one tap, and how urgently. */
export interface IdentifyAnnouncement {
  /** What to say. */
  readonly message: Message;
  /** `assertive` interrupts what is being read; `polite` waits for it. */
  readonly priority: "polite" | "assertive";
}

/**
 * The one message for a tap that asked raster layers what is there, said once
 * when every layer has answered or run out of time. Several features say a
 * list opened, and one feature says nothing because its card takes focus.
 * Nothing found says so, unless every layer failed, when there is nothing to
 * report but the failure. Layers that did not answer are named, and a tap
 * that could have asked more layers than it did says how many it asked. It
 * is assertive only when every layer asked failed, because then the person
 * has learned nothing. Null when there is nothing to say, including when no
 * layer was asked.
 */
export function announceIdentified({
  found,
  asked,
  available,
  failed,
}: IdentifyReport): IdentifyAnnouncement | null {
  if (asked === 0) {
    return null;
  }
  const everyoneFailed = failed.length === asked;
  const parts: Message[] = [];
  if (found > 1) {
    parts.push(announceFeaturesFound(found));
  } else if (found === 0 && !everyoneFailed) {
    parts.push(message("announce.nothingFoundHere", {}));
  }
  if (failed.length > 0) {
    parts.push(message("announce.layersDidNotAnswer", { names: failed }));
  }
  if (available > asked) {
    parts.push(message("announce.askedOfAvailable", { asked, available }));
  }
  const said = joinMessages(parts);
  return said === null
    ? null
    : { message: said, priority: everyoneFailed ? "assertive" : "polite" };
}

/** A query layer drew only the first of more features than it shows. */
export function announceLayerCapped(name: MessagePart, shown: number): Message {
  return message("announce.layerCapped", { name, shown });
}

/** One decimal place, as `formatZoom` shows it, free of floating point noise. */
function tenths(level: number): number {
  return Number((level * 10).toFixed(6));
}

/** The level to zoom in to for a layer that is too far out to load. A level with more than one decimal is rounded up, so the level shown is always enough. */
function levelToZoomInTo(level: number): number {
  return Math.ceil(tenths(level)) / 10;
}

/**
 * The level to zoom out below for a layer that is too far in to show. The
 * engine hides a layer from its `maxzoom` itself, so the level is one to go
 * below, rounded down to one decimal so that the level shown is enough.
 */
function levelToZoomOutBelow(level: number): number {
  return Math.floor(tenths(level)) / 10;
}

/**
 * The status line of a layer that is too far out to load, naming the
 * normalised zoom level to zoom in to. The level comes from the layer's
 * definition, so a layer without a zoom window never gets this line.
 */
export function describeZoomIn(level: number): Message {
  return message("describe.zoomIn", { level: levelToZoomInTo(level) });
}

/** The status line of a layer that is too far in to show, naming the level to zoom out to. */
export function describeZoomOut(level: number): Message {
  return message("describe.zoomOut", { level: levelToZoomOutBelow(level) });
}

/** A layer is too far out to load, in the words of {@link describeZoomIn}. */
export function announceLayerZoomIn(name: MessagePart, level: number): Message {
  return message("announce.layerZoomIn", {
    name,
    level: levelToZoomInTo(level),
  });
}

/** A layer is too far in to show, in the words of {@link describeZoomOut}. */
export function announceLayerZoomOut(
  name: MessagePart,
  level: number,
): Message {
  return message("announce.layerZoomOut", {
    name,
    level: levelToZoomOutBelow(level),
  });
}

/** A tile layer was turned on. */
export function announceLayerOn(name: MessagePart): Message {
  return message("announce.layerOn", { name });
}

/** One action turned several layers off, and the interface offers an Undo for a few seconds. */
export function announceLayersTurnedOff(count: number): Message {
  return message("announce.layersTurnedOff", { count });
}

/** An undo turned layers that one action had turned off back on. */
export function announceLayersTurnedBackOn(count: number): Message {
  return message("announce.layersTurnedBackOn", { count });
}

/** What a change to the layer catalogue did, for {@link announceCatalogueChange}. */
export interface CatalogueChange {
  /** The names of enabled layers the catalogue no longer holds, which were turned off. */
  readonly turnedOff: readonly MessagePart[];
  /** How many layers the link named that the catalogue does not have for this person. */
  readonly linkUnavailable: number;
  /** How many definitions the host supplied that were left out. Zero says nothing. */
  readonly skipped: number;
  /** How many layers a refresh added to a list that was already shown. Zero says nothing. */
  readonly added: number;
  /** How many layers a refresh removed from a list that was already shown. Zero says nothing. */
  readonly removed: number;
  /** The first list the catalogue gave is empty, which is worth saying after the wait. */
  readonly empty: boolean;
}

/** The catalogue's layers are still being fetched. */
export function describeLayersLoading(): Message {
  return message("describe.layersLoading", {});
}

/** The catalogue could not be loaded at all. */
export function describeLayersLoadFailed(): Message {
  return message("describe.layersLoadFailed", {});
}

/** The catalogue loaded and holds no layers. */
export function describeNoLayers(): Message {
  return message("describe.noLayers", {});
}

/** A refresh failed, so the list from before stays. */
export function describeLayersRefreshFailed(): Message {
  return message("describe.layersRefreshFailed", {});
}

/** How many of the host's definitions were left out, as a phrase with no full stop. */
export function describeLayersSkipped(count: number): Message {
  return message("describe.layersSkipped", { count });
}

function announceLayersUnavailable(names: readonly MessagePart[]): Message {
  const [only] = names;
  return only !== undefined && names.length === 1
    ? message("announce.layerUnavailable", { name: only })
    : message("announce.layersUnavailable", { count: names.length });
}

/** What a refresh added and removed: "3 added", "2 removed" or "3 added, 2 removed". */
function describeLayerChanges(added: number, removed: number): Message {
  const addedMessage = message("announce.layersAdded", { count: added });
  const removedMessage = message("announce.layersRemoved", { count: removed });
  if (added > 0 && removed > 0) {
    return message("common.commaJoined", {
      first: addedMessage,
      second: removedMessage,
    });
  }
  return added > 0 ? addedMessage : removedMessage;
}

/**
 * One message for one change to the catalogue, in a fixed order: the layers
 * that were turned off, the layers of the link that are not available, how
 * many definitions could not be shown, what a refresh added and removed, and
 * that the first list is empty. Null when none of them applies. A transition
 * is one message, so the live region speaks the whole change in one go.
 */
export function announceCatalogueChange(
  change: CatalogueChange,
): Message | null {
  const parts = [
    change.turnedOff.length > 0
      ? announceLayersUnavailable(change.turnedOff)
      : null,
    change.linkUnavailable > 0
      ? message("announce.linkLayersUnavailable", {
          count: change.linkUnavailable,
        })
      : null,
    change.skipped > 0
      ? message("announce.layersSkipped", { count: change.skipped })
      : null,
    change.added > 0 || change.removed > 0
      ? message("announce.layersUpdated", {
          changes: describeLayerChanges(change.added, change.removed),
        })
      : null,
    change.empty ? describeNoLayers() : null,
  ].filter((part) => part !== null);
  return joinMessages(parts);
}

/*
 * The selection's messages each carry the running total, because the live
 * region replaces a waiting message with a later one that arrives within its
 * window: the one that is read out must still be true when an earlier one was
 * replaced.
 */

/** One feature was added to the selection: "Added Gauge 4. 5 selected." */
export function announceFeatureSelected(title: string, total: number): Message {
  return message("announce.featureSelected", { title, total });
}

/** Several features, or one with no title to give, were added to the selection. */
export function announceFeaturesSelected(
  count: number,
  total: number,
): Message {
  return message("announce.featuresSelected", { count, total });
}

/** One feature was removed from the selection: "Removed Gauge 4. 4 selected." */
export function announceFeatureDeselected(
  title: string,
  total: number,
): Message {
  return message("announce.featureDeselected", { title, total });
}

/** Several features, or one with no title to give, were removed from the selection. */
export function announceFeaturesDeselected(
  count: number,
  total: number,
): Message {
  return message("announce.featuresDeselected", { count, total });
}

/** The selection was emptied. */
export function announceSelectionCleared(): Message {
  return message("announce.selectionCleared", {});
}

/** An addition was refused whole because the selection would pass its `limit`. */
export function announceSelectionFull(limit: number): Message {
  return message("announce.selectionFull", { limit });
}

/** A feed layer loaded with nothing in it, in the layer's own words. */
export function announceLayerEmpty(
  name: MessagePart,
  emptyText: MessagePart,
): Message {
  return message("announce.layerStatus", { name, status: emptyText });
}

/** A layer did not load because the device is offline, and what to do next. */
export function announceLayerOffline(name: MessagePart): Message {
  return message("announce.layerOffline", { name });
}

/** A layer could not load, and what to do next. */
export function announceLayerError(
  name: MessagePart,
  kind: "network" | "invalid",
): Message {
  return kind === "network"
    ? message("announce.layerLoadFailed", { name })
    : message("announce.layerInvalid", { name });
}

/**
 * The status line of a tile layer whose tiles all failed. `when` is the
 * layer's chosen date or time in words, or null for a layer with none to
 * choose, which can only say that it did not load.
 */
export function describeTilesUnavailable(when: Message | null): Message {
  return when === null
    ? message("describe.tilesUnavailable", {})
    : message("describe.tilesNoImagery", { when });
}

/** A tile layer's tiles all failed, in the words of {@link describeTilesUnavailable}. */
export function announceTilesUnavailable(
  name: MessagePart,
  when: Message | null,
): Message {
  return message("announce.layerStatus", {
    name,
    status: describeTilesUnavailable(when),
  });
}

/**
 * The status line of a tile layer that has had tiles asked for and none has
 * loaded yet. It does not say the layer failed: the provider has not answered,
 * and may still.
 */
export function describeTilesSlow(): Message {
  return message("describe.tilesSlow", {});
}

/** A tile layer is still waiting for its first tile, in the words of {@link describeTilesSlow}. */
export function announceTilesSlow(name: MessagePart): Message {
  return message("announce.layerStatus", {
    name,
    status: describeTilesSlow(),
  });
}

/** A tile layer that was slow or had found no tiles loaded one, so its status has gone. */
export function announceTilesRecovered(name: MessagePart): Message {
  return message("announce.tilesRecovered", { name });
}

/** "Show on map" centred the map on a feature. */
export function announceShowingFeature(title: string): Message {
  return message("announce.showingFeature", { title });
}

/** A feature's affected area is on the map. */
export function announceDetailShown(title: string): Message {
  return message("announce.detailShown", { title });
}

/** A feature's affected area could not load. */
export function announceDetailError(): Message {
  return message("announce.detailError", {});
}

/** "3 results" or "1 result". */
export function announceSearchResults(count: number): Message {
  return message("announce.searchResults", { count });
}

/**
 * Announced when a search finds exactly one place and the map goes to it
 * without a list to choose from. It names the place, which the count would
 * not.
 */
export function announceSearchPicked(label: string): Message {
  return message("announce.searchPicked", { label });
}

/**
 * Announced when a search is answered by one pair of coordinates. It names the
 * place, so a second pair is never mistaken for a repeat of the first.
 */
export function announceCoordinateResult(label: string): Message {
  return message("announce.coordinateResult", {
    results: announceSearchResults(1),
    label,
  });
}

/** Announced when a search finds nothing. */
export function announceNoResults(): Message {
  return message("announce.noResults", {});
}

/** Says what went wrong with a search and what to do next. */
export function announceSearchError(kind: SearchErrorKind): Message {
  return SEARCH_ERROR_MESSAGES[kind];
}

/** "3 suggestions" or "1 suggestion", announced as the person types. */
export function announceSuggestions(count: number): Message {
  return message("announce.suggestions", { count });
}

/** Announced when typing finds no suggestion. */
export function announceNoSuggestions(): Message {
  return message("announce.noSuggestions", {});
}

/** Announced once when suggestions stop working, so the person knows Enter still searches. */
export function announceSuggestionsUnavailable(): Message {
  return message("announce.suggestionsUnavailable", {});
}

/** Announced when a location fix arrives, with its accuracy in the user's units. */
export function announceLocationFound(
  accuracyMetres: number,
  units: UnitSystem,
): Message {
  return message("announce.locationFound", {
    accuracy: describeDistance(accuracyMetres, units),
  });
}

/** Says why finding the location failed and what to do next. */
export function announceLocationError(kind: LocationErrorKind): Message {
  return LOCATION_ERROR_MESSAGES[kind];
}

/** Announced after an attempt to copy coordinates. */
export function announceCopied(ok: boolean): Message {
  return ok
    ? message("announce.copied", {})
    : message("announce.copyFailed", {});
}

/** Announced when a pin is placed, with its coordinates. */
export function announcePinDropped(position: LatLng): Message {
  return message("announce.pinDropped", { position: formatLatLng(position) });
}

/** Announced when the pin is removed. */
export function announcePinCleared(): Message {
  return message("announce.pinCleared", {});
}

/**
 * Announces the running total of a measurement: metres for `distance`,
 * square metres for `area`. Unit names are spoken in full.
 */
export function announceMeasureTotal(
  mode: "distance" | "area",
  value: number,
  units: UnitSystem,
): Message {
  return mode === "distance"
    ? message("announce.measureDistance", {
        distance: describeDistance(value, units),
      })
    : message("announce.measureArea", { area: describeArea(value, units) });
}

/** Announced when the basemap changes. */
export function announceBasemap(name: string): Message {
  return message("announce.basemapChanged", { name });
}

/** Announced when the map is switched between flat and globe. */
export function announceProjection(projection: MapProjection): Message {
  return PROJECTION_MESSAGES[projection];
}

/** Announced when the zoom level settles. The level is shown to one decimal. */
export function announceZoom(zoom: number): Message {
  return message("announce.zoom", { level: Math.round(zoom * 10) / 10 });
}

/** Announced when the bottom panel moves to a new height. */
export function announceDetent(detent: "peek" | "half" | "full"): Message {
  return DETENT_MESSAGES[detent];
}

/** Announced when a panel, dialog or sheet opens. */
export function announceSurfaceOpened(name: string): Message {
  return message("announce.surfaceOpened", { name });
}

/** Announced when a panel, dialog or sheet closes. */
export function announceSurfaceClosed(name: string): Message {
  return message("announce.surfaceClosed", { name });
}

/** Announced when map tiles fail to load. */
export function announceTileError(): Message {
  return message("announce.tileError", {});
}

/**
 * The words for the device going offline. The reference host shows them in
 * its connection notice, a status message that is its own live region, so it
 * is not also sent to the announcer; a host without one can announce it.
 */
export function announceOffline(): Message {
  return message("announce.offline", {});
}

/** Announced when an address lookup finds the address at a pin. */
export function announceAddressFound(address: string): Message {
  return message("announce.addressFound", { address });
}

/** Announced when an address lookup finds no address at a pin. */
export function announceAddressNotFound(): Message {
  return message("announce.addressNotFound", {});
}

/** Says an address lookup failed and what to do next. */
export function announceAddressError(): Message {
  return message("announce.addressError", {});
}

/** Announced when a stop is added to the directions. `index` counts from zero. */
export function announceStopAdded(index: number, total: number): Message {
  return message("announce.stopAdded", {
    letter: stopLetter(index),
    count: total,
  });
}

/** Announced when a stop cannot be added because the directions hold `max` already. */
export function announceStopLimit(max: number): Message {
  return message("announce.stopLimit", { max });
}

/** Announced when a stop is removed from the directions. `index` counts from zero. */
export function announceStopRemoved(index: number): Message {
  return message("announce.stopRemoved", { letter: stopLetter(index) });
}

/** Announced when a stop moves to a new place in the list. `index` counts from zero. */
export function announceStopMoved(index: number, total: number): Message {
  return message("announce.stopMoved", {
    position: index + 1,
    total,
    letter: stopLetter(index),
  });
}

/** Announced when a route is found: how far, how long, and how it is travelled. */
export function announceRouteFound(
  metres: number,
  seconds: number,
  mode: TravelMode,
  units: UnitSystem,
): Message {
  return message("announce.routeFound", {
    distance: describeDistance(metres, units),
    duration: describeDuration(seconds),
    mode: travelModeParticiple(mode),
  });
}

/** Announced when a reachable area is found: how long it is for, the mode and its size. */
export function announceAreaFound(
  minutes: number,
  squareMetres: number,
  mode: TravelMode,
  units: UnitSystem,
): Message {
  return message("announce.areaFound", {
    count: minutes,
    mode: travelModeParticiple(mode),
    area: describeArea(squareMetres, units),
  });
}

/** Announced when a route or area request fails, saying what to do next. */
export function announceRoutingError(
  kind: Exclude<RoutingErrorKind, "aborted">,
  request: RoutingRequestKind,
): Message {
  return routingErrorMessage(kind, request);
}

/** Announced when the person cancels a route or area request. */
export function announceRoutingCancelled(): Message {
  return message("announce.routingCancelled", {});
}

/** Announced when the stops and the route or area are cleared. */
export function announceDirectionsCleared(): Message {
  return message("announce.directionsCleared", {});
}

/** Announced when the person skips the first-visit tour, saying how to start it again. */
export function announceTourSkipped(): Message {
  return message("announce.tourSkipped", {});
}

/**
 * Announced when a chosen time is not offered and the layer moves to the
 * nearest slot that is. `slot` is that slot's value.
 */
export function announceTimeMoved(slot: string): Message {
  return message("announce.timeMoved", { time: describeSlotStart(slot) });
}
