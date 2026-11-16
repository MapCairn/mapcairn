// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * A key into the shipped message catalogue. One flat, hand-maintained union,
 * grouped by area with a dotted prefix. A component never writes a literal
 * string; it looks up a key through {@link MessageCatalogue.t} or
 * {@link MessageCatalogue.plural} instead, so the text can be replaced or
 * translated without touching the component.
 *
 * @remarks The keys are those of the Settings panel and of the text core's
 *   pure helpers return as a {@link Message} (announcements, descriptions,
 *   units, errors, the draw tool's wording); later steps add a key as each
 *   further component moves off inline copy. `common.itemCount` is the
 *   exception: it carries no user-facing text yet
 *   and exists only so the contract suite can prove {@link
 *   MessageCatalogue.plural} picks the right English form, until a real
 *   plural key is needed.
 */
export type MessageKey =
  | "settings.title"
  | "settings.theme.label"
  | "settings.theme.system"
  | "settings.theme.light"
  | "settings.theme.dark"
  | "settings.units.label"
  | "settings.units.metric"
  | "settings.units.imperial"
  | "settings.mapShape.label"
  | "settings.mapShape.flat"
  | "settings.mapShape.globe"
  | "settings.zoomButtons.label"
  | "settings.zoomButtons.description"
  | "settings.saveData.label"
  | "settings.saveData.description"
  | "settings.notSaved"
  | "settings.privacy.heading"
  | "settings.privacy.link"
  // Common joins
  | "common.followedBy"
  | "common.commaJoined"
  | "common.dotJoined"
  // Formatting
  | "format.hemisphereNorth"
  | "format.hemisphereSouth"
  | "format.hemisphereEast"
  | "format.hemisphereWest"
  | "format.day"
  | "format.utcTime"
  | "format.utcRange"
  | "format.timeOnDay"
  | "search.coordinatesLabel"
  // Units and durations
  | "units.metre"
  | "units.kilometre"
  | "units.foot"
  | "units.mile"
  | "units.squareMetre"
  | "units.hectare"
  | "units.squareKilometre"
  | "units.squareFoot"
  | "units.acre"
  | "units.squareMile"
  | "duration.day"
  | "duration.hour"
  | "duration.minute"
  | "duration.underMinute"
  | "scale.label"
  // Errors
  | "error.search.offline"
  | "error.search.rate-limited"
  | "error.search.failed"
  | "error.location.denied"
  | "error.location.unavailable"
  | "error.location.timeout"
  | "error.routing.network"
  | "error.routing.rateLimited"
  | "error.routing.noRoute"
  | "error.routing.noReachableArea"
  | "error.routing.invalid"
  | "error.routing.unsupported"
  // Directions
  | "directions.participle.drive"
  | "directions.participle.walk"
  | "directions.participle.cycle"
  // Layer status lines
  | "describe.zoomIn"
  | "describe.zoomOut"
  | "describe.layersLoading"
  | "describe.layersLoadFailed"
  | "describe.noLayers"
  | "describe.layersRefreshFailed"
  | "describe.layersSkipped"
  | "describe.tilesNoImagery"
  | "describe.tilesUnavailable"
  | "describe.tilesSlow"
  // Announcements
  | "announce.layerLoaded"
  | "announce.layerStatus"
  | "announce.layerCapped"
  | "announce.layerZoomIn"
  | "announce.layerZoomOut"
  | "announce.layerOn"
  | "announce.layersTurnedOff"
  | "announce.layersTurnedBackOn"
  | "announce.layerLoadFailed"
  | "announce.layerInvalid"
  | "announce.tilesRecovered"
  | "announce.imageSaved"
  | "announce.imageFailed"
  | "announce.noFeaturesHere"
  | "announce.featuresFound"
  | "announce.nothingFoundHere"
  | "announce.layersDidNotAnswer"
  | "announce.askedOfAvailable"
  | "announce.layerUnavailable"
  | "announce.layersUnavailable"
  | "announce.linkLayersUnavailable"
  | "announce.layersSkipped"
  | "announce.layersAdded"
  | "announce.layersRemoved"
  | "announce.layersUpdated"
  | "announce.featureSelected"
  | "announce.featuresSelected"
  | "announce.featureDeselected"
  | "announce.featuresDeselected"
  | "announce.selectionCleared"
  | "announce.selectionFull"
  | "announce.showingFeature"
  | "announce.detailShown"
  | "announce.detailError"
  | "announce.searchResults"
  | "announce.coordinateResult"
  | "announce.noResults"
  | "announce.suggestions"
  | "announce.noSuggestions"
  | "announce.suggestionsUnavailable"
  | "announce.locationFound"
  | "announce.copied"
  | "announce.copyFailed"
  | "announce.pinDropped"
  | "announce.pinCleared"
  | "announce.measureDistance"
  | "announce.measureArea"
  | "announce.basemapChanged"
  | "announce.projection.flat"
  | "announce.projection.globe"
  | "announce.zoom"
  | "announce.detent.peek"
  | "announce.detent.half"
  | "announce.detent.full"
  | "announce.surfaceOpened"
  | "announce.surfaceClosed"
  | "announce.tileError"
  | "announce.offline"
  | "announce.addressFound"
  | "announce.addressNotFound"
  | "announce.addressError"
  | "announce.stopAdded"
  | "announce.stopLimit"
  | "announce.stopRemoved"
  | "announce.stopMoved"
  | "announce.routeFound"
  | "announce.areaFound"
  | "announce.routingCancelled"
  | "announce.directionsCleared"
  | "announce.tourSkipped"
  | "announce.timeMoved"
  // Drawing
  | "draw.hint.point"
  | "draw.hint.line"
  | "draw.hint.polygon"
  | "draw.hint.circle"
  | "draw.issue.too-few-vertices"
  | "draw.issue.self-intersecting"
  | "draw.issue.degenerate"
  | "draw.issue.radius-missing"
  | "draw.issue.radius-too-large"
  | "draw.measure.circle"
  | "draw.measure.line"
  | "draw.measure.polygonArea"
  | "draw.measure.polygon"
  | "draw.measure.radiusAndArea"
  | "draw.sentence.circle"
  | "draw.sentence.line"
  | "draw.sentence.polygonArea"
  | "draw.sentence.polygon"
  | "draw.vertexAdded"
  | "draw.vertexAddedTo"
  | "draw.circleChanged"
  | "draw.pointMoved"
  | "draw.vertexMoved"
  | "draw.vertexInserted"
  | "draw.vertexRemoved"
  | "draw.pointAdded"
  | "draw.finished"
  | "draw.vertexSelected"
  | "draw.pathSelected"
  | "draw.shapeSelected"
  | "draw.discarded.point"
  | "draw.discarded.line"
  | "draw.discarded.polygon"
  | "draw.discarded.circle"
  | "draw.deleted"
  | "draw.clearedOne"
  | "draw.clearedAll"
  | "draw.undone"
  | "draw.redone"
  | "draw.loaded"
  | "draw.import.refusal.drawing-full"
  | "draw.import.refusal.empty"
  | "draw.import.refusal.too-large"
  | "draw.import.refusal.too-deep"
  | "draw.import.refusal.not-recognised"
  | "draw.import.refusal.wkt-unreadable"
  | "draw.import.refusal.too-many-shapes"
  | "draw.import.refusal.too-many-points"
  | "draw.import.refusalWithDetail"
  | "draw.import.skip.self-intersecting"
  | "draw.import.skip.degenerate"
  | "draw.import.skip.too-few-vertices"
  | "draw.import.skip.radius-missing"
  | "draw.import.skip.radius-too-large"
  | "draw.import.skip.out-of-range"
  | "draw.import.skip.too-many-points"
  | "draw.import.skip.malformed"
  | "draw.import.skip.unsupported"
  | "draw.import.skip.other-srid"
  | "draw.import.skipped"
  | "draw.import.noShapes"
  | "draw.import.noneImported"
  | "draw.import.imported"
  | "draw.import.holesLeftOut"
  | "common.itemCount"
  | "settings.language.label"
  | "settings.language.auto"
  // Components: chrome, host, ui, panels and the app shell
  | "chrome.endStack.label"
  | "chrome.endStack.resetBearing"
  | "chrome.endStack.controls"
  | "chrome.endStack.mapOptions"
  | "chrome.endStack.measure"
  | "chrome.endStack.directions"
  | "chrome.endStack.draw"
  | "chrome.endStack.locate"
  | "chrome.endStack.settings"
  | "chrome.endStack.zoomControls"
  | "chrome.endStack.zoomIn"
  | "chrome.endStack.zoomOut"
  | "chrome.attribution.label"
  | "chrome.readout.label"
  | "chrome.readout.zoomShort"
  | "chrome.readout.zoomSpoken"
  | "chrome.readout.zoomSpokenAfterPosition"
  | "chrome.sheet.resize"
  | "chrome.sheet.close"
  | "host.map.label"
  | "host.map.roleDescription"
  | "ui.skipToMap"
  | "ui.dismiss"
  | "panels.basemap.title"
  | "panels.basemap.groupLabel"
  | "panels.basemap.tryAgain"
  | "panels.basemap.unavailable"
  | "panels.basemap.usesMoreData"
  | "panels.shapes.title"
  | "panels.shapes.empty"
  | "panels.shapes.listLabel"
  | "panels.shapes.unfinished"
  | "panels.shapes.deleteSelected"
  | "panels.shapes.deleteAll"
  | "panels.shapes.importHeading"
  | "panels.shapes.import"
  | "panels.shapes.exportHeading"
  | "panels.shapes.downloadGeoJson"
  | "panels.shapes.downloadCsv"
  | "panels.shapes.downloadWkt"
  | "panels.shapes.copyLink"
  | "panels.shapes.storageNote"
  | "panels.help.title"
  | "panels.help.tourHeading"
  | "panels.help.tourDescription"
  | "panels.help.tourStart"
  | "panels.help.searchHeading"
  | "panels.help.searchDescription"
  | "panels.help.keyboardHeading"
  | "panels.help.drawingHeading"
  | "panels.help.accessibilityHeading"
  | "panels.help.accessibilityDescription"
  | "panels.pin.title"
  | "panels.pin.drop"
  | "panels.pin.note"
  | "panels.export.title"
  | "panels.export.description"
  | "panels.export.save"
  | "panels.export.error"
  | "app.reload"
  | "app.loadingMap"
  | "app.sheetTitle.directions"
  | "app.sheetTitle.settings"
  | "app.sheetTitle.mapOptions"
  | "app.error.notFound.title"
  | "app.error.notFound.message"
  | "app.error.notFound.link"
  | "app.error.unexpected.title"
  | "app.error.unexpected.message"
  | "app.banner.engineFailed"
  | "app.banner.engineStopped"
  | "app.banner.basemapFailed"
  | "app.banner.basemapUnavailable"
  | "app.banner.retry"
  | "app.banner.tryAgain"
  | "app.banner.usePreviousBasemap"
  | "app.webgl.title"
  | "app.webgl.advice"
  | "app.tour.layers.heading"
  | "app.tour.layers.text"
  | "app.tour.mapShape.heading"
  | "app.tour.mapShape.text"
  | "app.tour.search.heading"
  | "app.tour.search.text"
  | "app.tour.welcome.heading"
  | "app.tour.welcome.text"
  | "app.tour.welcome.announcement"
  | "app.tour.ending.heading"
  | "app.tour.ending.text";

/**
 * The parameters a key's placeholders need. A key with no placeholders maps
 * to an empty object, so it still takes a `params` argument (for a
 * consistent call shape), but an empty one.
 */
interface MessageParamOverrides {
  // Common joins
  readonly "common.followedBy": {
    readonly first: string;
    readonly second: string;
  };
  readonly "common.commaJoined": {
    readonly first: string;
    readonly second: string;
  };
  readonly "common.dotJoined": {
    readonly first: string;
    readonly second: string;
  };
  // Formatting
  readonly "format.day": { readonly date: Date };
  readonly "format.utcTime": { readonly time: string };
  readonly "format.utcRange": { readonly start: string; readonly end: string };
  readonly "format.timeOnDay": { readonly time: string; readonly day: string };
  readonly "search.coordinatesLabel": {
    readonly latitude: string;
    readonly longitude: string;
  };
  // Units and durations
  readonly "units.metre": { readonly count: number };
  readonly "units.kilometre": { readonly count: number };
  readonly "units.foot": { readonly count: number };
  readonly "units.mile": { readonly count: number };
  readonly "units.squareMetre": { readonly count: number };
  readonly "units.hectare": { readonly count: number };
  readonly "units.squareKilometre": { readonly count: number };
  readonly "units.squareFoot": { readonly count: number };
  readonly "units.acre": { readonly count: number };
  readonly "units.squareMile": { readonly count: number };
  readonly "duration.day": { readonly count: number };
  readonly "duration.hour": { readonly count: number };
  readonly "duration.minute": { readonly count: number };
  readonly "scale.label": { readonly distance: string };
  // Errors
  // Directions
  // Layer status lines
  readonly "describe.zoomIn": { readonly level: number };
  readonly "describe.zoomOut": { readonly level: number };
  readonly "describe.layersSkipped": { readonly count: number };
  readonly "describe.tilesNoImagery": { readonly when: string };
  // Announcements
  readonly "announce.layerLoaded": {
    readonly name: string;
    readonly count: number;
  };
  readonly "announce.layerStatus": {
    readonly name: string;
    readonly status: string;
  };
  readonly "announce.layerCapped": {
    readonly name: string;
    readonly shown: number;
  };
  readonly "announce.layerZoomIn": {
    readonly name: string;
    readonly level: number;
  };
  readonly "announce.layerZoomOut": {
    readonly name: string;
    readonly level: number;
  };
  readonly "announce.layerOn": { readonly name: string };
  readonly "announce.layersTurnedOff": { readonly count: number };
  readonly "announce.layersTurnedBackOn": { readonly count: number };
  readonly "announce.layerLoadFailed": { readonly name: string };
  readonly "announce.layerInvalid": { readonly name: string };
  readonly "announce.tilesRecovered": { readonly name: string };
  readonly "announce.featuresFound": { readonly count: number };
  readonly "announce.layersDidNotAnswer": { readonly names: readonly string[] };
  readonly "announce.askedOfAvailable": {
    readonly asked: number;
    readonly available: number;
  };
  readonly "announce.layerUnavailable": { readonly name: string };
  readonly "announce.layersUnavailable": { readonly count: number };
  readonly "announce.linkLayersUnavailable": { readonly count: number };
  readonly "announce.layersSkipped": { readonly count: number };
  readonly "announce.layersAdded": { readonly count: number };
  readonly "announce.layersRemoved": { readonly count: number };
  readonly "announce.layersUpdated": { readonly changes: string };
  readonly "announce.featureSelected": {
    readonly title: string;
    readonly total: number;
  };
  readonly "announce.featuresSelected": {
    readonly count: number;
    readonly total: number;
  };
  readonly "announce.featureDeselected": {
    readonly title: string;
    readonly total: number;
  };
  readonly "announce.featuresDeselected": {
    readonly count: number;
    readonly total: number;
  };
  readonly "announce.selectionFull": { readonly limit: number };
  readonly "announce.showingFeature": { readonly title: string };
  readonly "announce.detailShown": { readonly title: string };
  readonly "announce.searchResults": { readonly count: number };
  readonly "announce.coordinateResult": {
    readonly results: string;
    readonly label: string;
  };
  readonly "announce.suggestions": { readonly count: number };
  readonly "announce.locationFound": { readonly accuracy: string };
  readonly "announce.pinDropped": { readonly position: string };
  readonly "announce.measureDistance": { readonly distance: string };
  readonly "announce.measureArea": { readonly area: string };
  readonly "announce.basemapChanged": { readonly name: string };
  readonly "announce.zoom": { readonly level: number };
  readonly "announce.surfaceOpened": { readonly name: string };
  readonly "announce.surfaceClosed": { readonly name: string };
  readonly "announce.addressFound": { readonly address: string };
  readonly "announce.stopAdded": {
    readonly letter: string;
    readonly count: number;
  };
  readonly "announce.stopLimit": { readonly max: number };
  readonly "announce.stopRemoved": { readonly letter: string };
  readonly "announce.stopMoved": {
    readonly position: number;
    readonly total: number;
    readonly letter: string;
  };
  readonly "announce.routeFound": {
    readonly distance: string;
    readonly duration: string;
    readonly mode: string;
  };
  readonly "announce.areaFound": {
    readonly count: number;
    readonly mode: string;
    readonly area: string;
  };
  readonly "announce.timeMoved": { readonly time: string };
  // Drawing
  readonly "draw.measure.circle": {
    readonly radius: string;
    readonly area: string;
  };
  readonly "draw.measure.line": { readonly length: string };
  readonly "draw.measure.polygonArea": { readonly area: string };
  readonly "draw.measure.polygon": {
    readonly area: string;
    readonly perimeter: string;
  };
  readonly "draw.measure.radiusAndArea": {
    readonly radius: string;
    readonly area: string;
  };
  readonly "draw.sentence.circle": {
    readonly radius: string;
    readonly area: string;
  };
  readonly "draw.sentence.line": { readonly length: string };
  readonly "draw.sentence.polygonArea": { readonly area: string };
  readonly "draw.sentence.polygon": {
    readonly area: string;
    readonly perimeter: string;
  };
  readonly "draw.vertexAdded": { readonly count: number };
  readonly "draw.vertexAddedTo": {
    readonly count: number;
    readonly label: string;
  };
  readonly "draw.circleChanged": { readonly label: string };
  readonly "draw.pointMoved": { readonly label: string };
  readonly "draw.vertexMoved": {
    readonly index: number;
    readonly label: string;
  };
  readonly "draw.vertexInserted": {
    readonly label: string;
    readonly index: number;
    readonly count: number;
  };
  readonly "draw.vertexRemoved": {
    readonly label: string;
    readonly count: number;
  };
  readonly "draw.pointAdded": { readonly label: string };
  readonly "draw.finished": { readonly label: string };
  readonly "draw.vertexSelected": {
    readonly index: number;
    readonly count: number;
    readonly label: string;
  };
  readonly "draw.pathSelected": {
    readonly label: string;
    readonly count: number;
  };
  readonly "draw.shapeSelected": { readonly label: string };
  readonly "draw.deleted": { readonly label: string };
  readonly "draw.clearedAll": { readonly count: number };
  readonly "draw.loaded": { readonly count: number };
  readonly "draw.import.refusal.drawing-full": { readonly max: number };
  readonly "draw.import.refusal.too-large": { readonly megabytes: number };
  readonly "draw.import.refusal.too-many-shapes": { readonly max: number };
  readonly "draw.import.refusal.too-many-points": { readonly max: number };
  readonly "draw.import.refusalWithDetail": {
    readonly refusal: string;
    readonly detail: string;
  };
  readonly "draw.import.skip.self-intersecting": { readonly count: number };
  readonly "draw.import.skip.degenerate": { readonly count: number };
  readonly "draw.import.skip.too-few-vertices": { readonly count: number };
  readonly "draw.import.skip.radius-missing": { readonly count: number };
  readonly "draw.import.skip.radius-too-large": { readonly count: number };
  readonly "draw.import.skip.out-of-range": { readonly count: number };
  readonly "draw.import.skip.too-many-points": {
    readonly count: number;
    readonly max: number;
  };
  readonly "draw.import.skip.malformed": { readonly count: number };
  readonly "draw.import.skip.unsupported": { readonly count: number };
  readonly "draw.import.skip.other-srid": {
    readonly count: number;
    readonly srid: string;
  };
  readonly "draw.import.skipped": {
    readonly total: number;
    readonly reasons: string;
  };
  readonly "draw.import.imported": { readonly count: number };
  readonly "draw.import.holesLeftOut": { readonly count: number };
  /** `{count}`, consumed by {@link MessageCatalogue.plural}. */
  readonly "common.itemCount": { readonly count: number };
  // Components: chrome, host, ui, panels and the app shell
  readonly "chrome.readout.zoomShort": { readonly level: string };
  readonly "chrome.readout.zoomSpoken": { readonly level: string };
  readonly "chrome.readout.zoomSpokenAfterPosition": { readonly level: string };
  readonly "panels.shapes.unfinished": { readonly label: string };
  readonly "app.banner.basemapUnavailable": { readonly name: string };
}

/** The parameters every {@link MessageKey} takes, keyed by the key itself. */
export type MessageParams = {
  readonly [K in MessageKey]: K extends keyof MessageParamOverrides
    ? MessageParamOverrides[K]
    : Record<string, never>;
};

/**
 * What a placeholder can be filled with. A number is formatted with the
 * catalogue's language (grouping and decimal separator), a `Date` as a UTC
 * day in words, and a list of strings with `Intl.ListFormat`.
 */
export type MessageValue = string | number | Date | readonly string[];

/**
 * The parameters a {@link Message} carries: those of the key, except that a
 * text placeholder may also hold another message, which is formatted first
 * (a distance inside "Total distance {distance}"). A key with no
 * placeholders takes none.
 */
export type MessageArgs<P> =
  P extends Record<string, never>
    ? P
    : {
        readonly [Name in keyof P]: P[Name] extends string
          ? P[Name] | Message
          : P[Name];
      };

/**
 * A piece of text as a key and its parameters, with no language chosen yet.
 * Pure helpers return these instead of English, and the one place that shows
 * or announces the text formats it with the active catalogue (see
 * `formatMessage`). `Message` with no argument is any message.
 */
export type Message<K extends MessageKey = MessageKey> = K extends MessageKey
  ? {
      readonly key: K;
      readonly params: MessageArgs<MessageParams[K]>;
    }
  : never;

/**
 * Formats text for one language. The SDK's dependency-free default is
 * `createMessageCatalogue`; a host may wire a message-format library of its
 * own behind this same shape.
 */
export interface MessageCatalogue {
  /** BCP 47 tag of the language this instance speaks, for example "en-GB" or "af". */
  readonly language: string;
  /**
   * Looks up a key, substitutes its parameters (written `{name}` in the
   * string), and falls back to the English value with a single
   * `console.warn` per missing key when the active catalogue lacks it.
   */
  t<K extends MessageKey>(key: K, params: MessageParams[K]): string;
  /**
   * As {@link t}, but first picks the plural form with `Intl.PluralRules`.
   * `params` carries `count` plus the key's other parameters.
   */
  plural<K extends MessageKey>(
    key: K,
    params: MessageParams[K] & { readonly count: number },
  ): string;
  /**
   * Joins items with `Intl.ListFormat`, for example "Topographic, Satellite
   * and Dark". `type` defaults to "conjunction".
   */
  list(items: readonly string[], type?: "conjunction" | "disjunction"): string;
}
