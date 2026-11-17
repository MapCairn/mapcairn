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
  | "draw.import.axisHint.lat-lng"
  | "draw.import.axisHint.lng-lat"
  | "common.itemCount"
  | "settings.language.label"
  | "settings.language.auto"
  | "settings.language.loadFailed"
  | "settings.language.tryAgain"
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
  | "panels.shapes.axisOrderLabel"
  | "panels.shapes.axisOrder.lng-lat"
  | "panels.shapes.axisOrder.lat-lng"
  | "panels.shapes.axisReread.lat-lng"
  | "panels.shapes.axisReread.lng-lat"
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
  | "app.tour.ending.text"
  // Short durations
  | "duration.short.day"
  | "duration.short.hour"
  | "duration.short.minute"
  | "duration.short.underMinute"
  // Travel modes and stops
  | "directions.mode.drive"
  | "directions.mode.walk"
  | "directions.mode.cycle"
  | "directions.stop"
  // Default shape labels
  | "draw.shapeLabel.point"
  | "draw.shapeLabel.line"
  | "draw.shapeLabel.polygon"
  | "draw.shapeLabel.circle"
  // WKT reader faults
  | "wkt.atPosition"
  | "wkt.unexpectedCharacter"
  | "wkt.unexpectedText"
  | "wkt.expectedKeyword"
  | "wkt.expectedNumber"
  | "wkt.invalidNumber"
  | "wkt.zNeedsThree"
  | "wkt.expectedSrid"
  | "wkt.sridDigits"
  | "wkt.expectedType"
  | "wkt.unknownType"
  | "wkt.unexpectedWord"
  | "wkt.nestedTooDeep"
  | "wkt.mixedBrackets"
  | "wkt.measureUnsupported"
  | "wkt.typeUnsupported"
  | "wkt.onlySrid"
  // Layer formatters and class labels
  | "layers.formatter.agoDay"
  | "layers.formatter.agoHour"
  | "layers.formatter.agoMinute"
  | "layers.formatter.inDay"
  | "layers.formatter.inHour"
  | "layers.formatter.inMinute"
  | "layers.formatter.justNow"
  | "layers.interval.upTo"
  | "layers.interval.andAbove"
  | "layers.interval.range"
  // Tools: shared
  | "tools.done"
  | "tools.addPointAtCentre"
  | "tools.tryAgain"
  // Tools: measure
  | "tools.measure.region"
  | "tools.measure.label"
  | "tools.measure.distance"
  | "tools.measure.area"
  | "tools.measure.total"
  | "tools.measure.undo"
  | "tools.measure.clear"
  | "tools.measure.hint"
  // Tools: draw
  | "tools.draw.region"
  | "tools.draw.toolbar"
  | "tools.draw.shapeToDraw"
  | "tools.draw.mode.point"
  | "tools.draw.mode.line"
  | "tools.draw.mode.polygon"
  | "tools.draw.mode.circle"
  | "tools.draw.selectedPoints"
  | "tools.draw.selectedPoint"
  | "tools.draw.previousPoint"
  | "tools.draw.nextPoint"
  | "tools.draw.insertPoint"
  | "tools.draw.removePoint"
  | "tools.draw.smallerRadius"
  | "tools.draw.largerRadius"
  | "tools.draw.radiusToCentre"
  | "tools.draw.movePoint"
  | "tools.draw.cancelShape"
  | "tools.draw.deleteShape"
  | "tools.draw.undo"
  | "tools.draw.redo"
  | "tools.draw.shapesAndExport"
  | "tools.draw.finish"
  | "tools.draw.selectedHint"
  | "tools.draw.status.empty"
  | "tools.draw.status.drawing"
  | "tools.draw.status.shapes"
  | "tools.draw.file.unreadable"
  | "tools.draw.file.unsupported"
  | "tools.draw.linkLimitNote"
  | "tools.draw.nothingToExport"
  | "tools.draw.saved"
  | "tools.draw.saveFailed"
  | "tools.draw.tooManyToShare"
  | "tools.draw.nothingToShare"
  | "tools.draw.nothingToCopy"
  | "tools.draw.linkCopied"
  | "tools.draw.linkCopiedLeftOut"
  | "tools.draw.linkCopyFailed"
  // Tools: pin card
  | "tools.pin.heading"
  | "tools.pin.close"
  | "tools.pin.noAddress"
  | "tools.pin.lookUp"
  | "tools.pin.lookingUp"
  | "tools.pin.lookupFailed"
  | "tools.pin.lookupNote"
  | "tools.pin.copy"
  | "tools.pin.clear"
  | "tools.pin.copied"
  | "tools.pin.copyFailed"
  // Tools: search
  | "tools.search.label"
  | "tools.search.places"
  | "tools.search.clear"
  | "tools.search.suggestions"
  | "tools.search.results"
  | "tools.search.searching"
  | "tools.search.nothingMatched"
  | "tools.search.unavailable"
  | "tools.search.retry"
  // Tools: locate
  | "tools.locate.locating"
  // Tools: tour
  | "tools.tour.progress"
  | "tools.tour.take"
  | "tools.tour.skip"
  | "tools.tour.next"
  | "tools.tour.finish"
  | "tools.tour.skipTour"
  | "tools.tour.close"
  | "tools.tour.stepAnnouncement"
  | "tools.tour.finished"
  // Tools: directions
  | "tools.directions.note"
  | "tools.directions.stops"
  | "tools.directions.stopsHint"
  | "tools.directions.stopPrefix"
  | "tools.directions.moveUp"
  | "tools.directions.moveDown"
  | "tools.directions.remove"
  | "tools.directions.addAtCentre"
  | "tools.directions.addPin"
  | "tools.directions.droppedPin"
  | "tools.directions.full"
  | "tools.directions.route"
  | "tools.directions.travelMode"
  | "tools.directions.getRoute"
  | "tools.directions.cancel"
  | "tools.directions.needTwo"
  | "tools.directions.searchHeading"
  | "tools.directions.searchForm"
  | "tools.directions.searchInput"
  | "tools.directions.searchPlaceholder"
  | "tools.directions.placesFound"
  | "tools.directions.addPlace"
  | "tools.directions.areaHeading"
  | "tools.directions.areaHint"
  | "tools.directions.showArea"
  | "tools.directions.findingRoute"
  | "tools.directions.findingArea"
  | "tools.directions.clear"
  | "tools.directions.legs"
  | "tools.directions.reachesArea"
  | "tools.directions.routeSummary"
  | "tools.directions.leg"
  // Layers
  | "layers.title"
  | "layers.intro"
  | "layers.theFeature"
  | "layers.tryAgain"
  | "layers.usesCost"
  | "layers.keyFor"
  | "layers.status.loading"
  | "layers.status.updated"
  | "layers.status.updatedCapped"
  | "layers.status.updatedEmpty"
  | "layers.status.loadFailedNetwork"
  | "layers.status.loadFailedInvalid"
  | "layers.list.summary"
  | "layers.list.sortBy"
  | "layers.list.showOnMap"
  | "layers.list.showAll"
  | "layers.card.close"
  | "layers.card.opensInNewTab"
  | "layers.card.back"
  | "layers.card.showOnMap"
  | "layers.card.hideArea"
  | "layers.card.areaFailed"
  | "layers.choices.heading"
  | "layers.choices.close"
  | "layers.choices.hint"
  | "layers.choices.openDetails"
  | "layers.turnOff.all"
  | "layers.turnOff.count"
  | "layers.turnOff.group"
  | "layers.turnOff.doneAll"
  | "layers.turnOff.undo"
  | "layers.turnOff.undoAll"
  | "layers.turnOff.doneGroup"
  | "layers.turnOff.undoGroup"
  | "layers.key.title"
  | "layers.key.toggle"
  | "layers.key.chip"
  | "layers.key.scrolling"
  | "layers.key.showing"
  | "layers.key.nameKey"
  | "layers.time.date"
  | "layers.time.time"
  | "layers.time.status"
  // Definition text: layer and basemap fields, keyboard help
  | "layer.cyclones.name"
  | "layer.cyclones.description"
  | "layer.cyclones.emptyText"
  | "layer.group.floodsStormsAndDroughts"
  | "layer.drought-alerts.name"
  | "layer.drought-alerts.description"
  | "layer.drought-alerts.emptyText"
  | "layer.earth-at-night.name"
  | "layer.earth-at-night.description"
  | "layer.earth-at-night.dataCost"
  | "layer.group.imagery"
  | "layer.control.opacity"
  | "layer.earthquakes.name"
  | "layer.earthquakes.description"
  | "layer.earthquakes.dataCost"
  | "layer.earthquakes.emptyText"
  | "layer.group.earthquakesAndVolcanoes"
  | "layer.earthquakes.control.window.label"
  | "layer.earthquakes.control.window.option.hour"
  | "layer.earthquakes.control.window.option.day"
  | "layer.earthquakes.control.window.option.week"
  | "layer.earthquakes.control.small.label"
  | "layer.earthquakes.control.small.description"
  | "layer.earthquakes.key.1"
  | "layer.earthquakes.key.2"
  | "layer.earthquakes.key.3"
  | "layer.earthquakes.key.4"
  | "layer.earthquakes.key.5"
  | "layer.earthquakes.card.link"
  | "layer.earthquakes.sort.newest"
  | "layer.earthquakes.sort.strongest"
  | "layer.fire-alerts.name"
  | "layer.fire-alerts.description"
  | "layer.fire-alerts.emptyText"
  | "layer.group.fires"
  | "layer.fire-hotspots-viirs.name"
  | "layer.fire-hotspots-viirs.description"
  | "layer.fire-hotspots-viirs.dataCost"
  | "layer.control.date"
  | "layer.fire-hotspots.name"
  | "layer.fire-hotspots.description"
  | "layer.fire-hotspots.dataCost"
  | "layer.flood-alerts.name"
  | "layer.flood-alerts.description"
  | "layer.flood-alerts.emptyText"
  | "layer.flood-hazard.name"
  | "layer.flood-hazard.description"
  | "layer.flood-hazard.dataCost"
  | "layer.flood-hazard.disclaimer"
  | "layer.imagery.name"
  | "layer.imagery.description"
  | "layer.imagery.dataCost"
  | "layer.population.name"
  | "layer.population.description"
  | "layer.population.dataCost"
  | "layer.group.people"
  | "layer.rainfall-half-hourly.name"
  | "layer.rainfall-half-hourly.description"
  | "layer.rainfall-half-hourly.dataCost"
  | "layer.rainfall-half-hourly.disclaimer"
  | "layer.rainfall-half-hourly.control.time.label"
  | "layer.rainfall-half-hourly.control.time.description"
  | "layer.rainfall.name"
  | "layer.rainfall.description"
  | "layer.rainfall.dataCost"
  | "layer.rainfall.disclaimer"
  | "layer.rainfall.control.date.description"
  | "layer.sea-temperature-anomaly.name"
  | "layer.sea-temperature-anomaly.description"
  | "layer.sea-temperature-anomaly.dataCost"
  | "layer.group.oceans"
  | "layer.volcano-alerts.name"
  | "layer.volcano-alerts.description"
  | "layer.volcano-alerts.emptyText"
  | "layer.world-countries.name"
  | "layer.world-countries.description"
  | "layer.world-countries.dataCost"
  | "layer.world-countries.disclaimer"
  | "layer.world-countries.emptyText"
  | "layer.group.boundaries"
  | "layer.world-countries.key.1"
  | "layer.world-countries.key.2"
  | "layer.world-countries.key.3"
  | "layer.world-countries.key.4"
  | "layer.world-countries.key.5"
  | "layer.world-countries.sort.name"
  | "layer.world-countries.sort.population"
  | "layer.gdacs.dataCost"
  | "layer.gdacs.disclaimer"
  | "layer.gdacs.key.1"
  | "layer.gdacs.key.2"
  | "layer.gdacs.key.3"
  | "layer.gdacs.key.4"
  | "layer.gdacs.card.link"
  | "layer.gdacs.sort.newest"
  | "layer.gdacs.sort.alert"
  | "layer.gdacs.detail.label"
  | "layer.gdacs.detail.dataCost"
  | "basemap.bright.name"
  | "basemap.liberty.name"
  | "basemap.colorful.name"
  | "basemap.fiord.name"
  | "basemap.dark.name"
  | "basemap.positron.name"
  | "basemap.osm.name"
  | "keyHelp.keys.arrowKeys"
  | "keyHelp.keys.shiftUpDown"
  | "keyHelp.keys.shiftLeftRight"
  | "keyHelp.keys.plusMinus"
  | "keyHelp.keys.homeOr0"
  | "keyHelp.keys.p"
  | "keyHelp.keys.i"
  | "keyHelp.keys.escape"
  | "keyHelp.keys.space"
  | "keyHelp.keys.enter"
  | "keyHelp.keys.squareBrackets"
  | "keyHelp.keys.deleteBackspace"
  | "keyHelp.keys.undo"
  | "keyHelp.map.pan"
  | "keyHelp.map.panFurther"
  | "keyHelp.map.rotate"
  | "keyHelp.map.zoom"
  | "keyHelp.map.north"
  | "keyHelp.map.pin"
  | "keyHelp.map.identify"
  | "keyHelp.map.escape"
  | "keyHelp.draw.addPoint"
  | "keyHelp.draw.finish"
  | "keyHelp.draw.nudge"
  | "keyHelp.draw.selectPoint"
  | "keyHelp.draw.remove"
  | "keyHelp.draw.undo"
  | "keyHelp.draw.escape"
  | "host.map.keyInstruction"
  | "host.notes.privacy"
  | "host.notes.pinLookup"
  | "host.notes.routing";

/**
 * Text a definition shows a person: a {@link MessageKey}, looked up in the
 * active catalogue where the definition is rendered, or a plain string,
 * shown as written. A third-party definition keeps writing plain strings; the
 * reference host's own definitions use keys so they can be translated. Read
 * it with `resolveText`. It is a plain `string` at compile time, so a host's
 * definition needs no cast, and the runtime check against the English
 * catalogue decides what is a key.
 */
export type DefinitionText = MessageKey | string;

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
  readonly "settings.language.loadFailed": { readonly language: string };
  // Components: chrome, host, ui, panels and the app shell
  readonly "chrome.readout.zoomShort": { readonly level: string };
  readonly "chrome.readout.zoomSpoken": { readonly level: string };
  readonly "chrome.readout.zoomSpokenAfterPosition": { readonly level: string };
  readonly "panels.shapes.unfinished": { readonly label: string };
  readonly "app.banner.basemapUnavailable": { readonly name: string };
  // Short durations
  readonly "duration.short.day": { readonly count: number };
  readonly "duration.short.hour": { readonly count: number };
  readonly "duration.short.minute": { readonly count: number };
  // Travel modes and stops
  readonly "directions.stop": {
    readonly letter: string;
    readonly place: string;
  };
  // Default shape labels
  readonly "draw.shapeLabel.point": { readonly serial: number };
  readonly "draw.shapeLabel.line": { readonly serial: number };
  readonly "draw.shapeLabel.polygon": { readonly serial: number };
  readonly "draw.shapeLabel.circle": { readonly serial: number };
  // WKT reader faults
  readonly "wkt.atPosition": {
    readonly fault: string;
    readonly position: string;
  };
  readonly "wkt.expectedKeyword": { readonly kind: string };
  readonly "wkt.sridDigits": { readonly max: string };
  readonly "wkt.unknownType": { readonly keyword: string };
  readonly "wkt.typeUnsupported": { readonly keyword: string };
  readonly "wkt.onlySrid": {
    readonly supported: string;
    readonly srid: string;
  };
  // Layer formatters and class labels
  readonly "layers.formatter.agoDay": { readonly count: number };
  readonly "layers.formatter.agoHour": { readonly count: number };
  readonly "layers.formatter.agoMinute": { readonly count: number };
  readonly "layers.formatter.inDay": { readonly count: number };
  readonly "layers.formatter.inHour": { readonly count: number };
  readonly "layers.formatter.inMinute": { readonly count: number };
  readonly "layers.interval.upTo": {
    readonly high: string;
    readonly unit: string;
  };
  readonly "layers.interval.andAbove": {
    readonly low: string;
    readonly unit: string;
  };
  readonly "layers.interval.range": {
    readonly low: string;
    readonly high: string;
    readonly unit: string;
  };
  // Tools: draw
  readonly "tools.draw.selectedPoints": {
    readonly label: string;
    readonly count: number;
  };
  readonly "tools.draw.selectedPoint": {
    readonly label: string;
    readonly index: number;
    readonly total: number;
  };
  readonly "tools.draw.status.drawing": {
    readonly label: string;
    readonly count: number;
  };
  readonly "tools.draw.status.shapes": { readonly count: number };
  readonly "tools.draw.linkLimitNote": { readonly max: number };
  readonly "tools.draw.saved": {
    readonly count: number;
    readonly filename: string;
  };
  readonly "tools.draw.nothingToCopy": { readonly count: number };
  readonly "tools.draw.linkCopiedLeftOut": { readonly count: number };
  // Tools: tour
  readonly "tools.tour.progress": {
    readonly step: number;
    readonly total: number;
  };
  readonly "tools.tour.stepAnnouncement": {
    /** The `tools.tour.progress` message, so the announcement and the card say the step the same way. */
    readonly progress: string;
    readonly heading: string;
    readonly text: string;
  };
  // Tools: directions
  readonly "tools.directions.stopPrefix": { readonly letter: string };
  readonly "tools.directions.moveUp": { readonly letter: string };
  readonly "tools.directions.moveDown": { readonly letter: string };
  readonly "tools.directions.remove": { readonly letter: string };
  readonly "tools.directions.full": { readonly max: number };
  readonly "tools.directions.addPlace": { readonly place: string };
  readonly "tools.directions.showArea": { readonly count: number };
  readonly "tools.directions.reachesArea": { readonly area: string };
  readonly "tools.directions.routeSummary": {
    readonly mode: string;
    readonly how: string;
    readonly count: number;
  };
  readonly "tools.directions.leg": {
    readonly from: string;
    readonly to: string;
    readonly distance: string;
    readonly duration: string;
  };
  // Layers
  readonly "layers.usesCost": { readonly cost: string };
  readonly "layers.keyFor": { readonly name: string };
  readonly "layers.status.updated": {
    readonly time: string;
    readonly count: number;
  };
  readonly "layers.status.updatedCapped": {
    readonly time: string;
    readonly count: number;
  };
  readonly "layers.status.updatedEmpty": {
    readonly time: string;
    readonly text: string;
  };
  readonly "layers.list.summary": { readonly count: number };
  readonly "layers.list.showAll": { readonly count: number };
  readonly "layers.choices.heading": { readonly count: number };
  readonly "layers.turnOff.count": { readonly count: number };
  readonly "layers.turnOff.group": {
    readonly count: number;
    readonly group: string;
  };
  readonly "layers.turnOff.doneAll": { readonly count: number };
  readonly "layers.turnOff.undoAll": { readonly count: number };
  readonly "layers.turnOff.doneGroup": {
    readonly count: number;
    readonly group: string;
  };
  readonly "layers.turnOff.undoGroup": {
    readonly count: number;
    readonly group: string;
  };
  readonly "layers.key.toggle": { readonly count: number };
  readonly "layers.key.chip": { readonly count: number };
  readonly "layers.key.showing": { readonly time: string };
  readonly "layers.key.nameKey": { readonly name: string };
  readonly "layers.time.status": {
    readonly slot: string;
    readonly newest: string;
  };
  // Definition text: layer and basemap fields, keyboard help
  readonly "host.map.keyInstruction": {
    readonly keys: string;
    readonly description: string;
  };
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
 * (a distance inside "Total distance {distance}"), and a list of strings
 * may hold messages among its items. A key with no
 * placeholders takes none.
 */
export type MessageArgs<P> =
  P extends Record<string, never>
    ? P
    : {
        readonly [Name in keyof P]: P[Name] extends string
          ? P[Name] | Message
          : P[Name] extends readonly string[]
            ? readonly (string | Message)[]
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
