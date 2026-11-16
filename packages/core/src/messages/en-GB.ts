// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MessageKey } from "../ports/messages";

/**
 * The SDK's shipped default catalogue: British English, the source language.
 * Every `MessageKey` has a value here; `packages/core/src/lint` fails the
 * build when one is missing or when a value's placeholders do not match its
 * `MessageParams` entry. Seeded verbatim from the Settings panel's inline
 * copy and from the strings core's announcement, description, unit and error
 * helpers used to return, so moving them to keys changes no visible text.
 *
 * A key used with `plural` carries two forms separated by `|`: the form for
 * `Intl.PluralRules`'s "one" category first, the form for every other
 * category second. English has only "one" and "other", so two forms are
 * enough.
 */
export const EN_GB_CATALOGUE: Record<MessageKey, string> = {
  "settings.title": "Settings",
  "settings.theme.label": "Theme",
  "settings.theme.system": "System",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.units.label": "Units",
  "settings.units.metric": "Metric",
  "settings.units.imperial": "Imperial",
  "settings.mapShape.label": "Map shape",
  "settings.mapShape.flat": "Flat",
  "settings.mapShape.globe": "Globe",
  "settings.zoomButtons.label": "Show zoom buttons",
  "settings.zoomButtons.description":
    "On by default with a mouse, off on touch screens.",
  "settings.saveData.label": "Save data",
  "settings.saveData.description":
    "Shows map names instead of previews and leaves out heavy map layers.",
  "settings.notSaved": "Changes will not be remembered on this device.",
  "settings.privacy.heading": "Privacy",
  "settings.privacy.link": "Read the privacy policy",
  // Common joins
  "common.followedBy": "{first} {second}",
  "common.commaJoined": "{first}, {second}",
  "common.dotJoined": "{first} · {second}",
  // Formatting
  "format.hemisphereNorth": "N",
  "format.hemisphereSouth": "S",
  "format.hemisphereEast": "E",
  "format.hemisphereWest": "W",
  "format.day": "{date}",
  "format.utcTime": "{time} UTC",
  "format.utcRange": "{start} to {end} UTC",
  "format.timeOnDay": "{time} on {day}",
  "search.coordinatesLabel": "Coordinates {latitude}, {longitude}",
  // Units and durations
  "units.metre": "{count} metre|{count} metres",
  "units.kilometre": "{count} kilometre|{count} kilometres",
  "units.foot": "{count} foot|{count} feet",
  "units.mile": "{count} mile|{count} miles",
  "units.squareMetre": "{count} square metre|{count} square metres",
  "units.hectare": "{count} hectare|{count} hectares",
  "units.squareKilometre": "{count} square kilometre|{count} square kilometres",
  "units.squareFoot": "{count} square foot|{count} square feet",
  "units.acre": "{count} acre|{count} acres",
  "units.squareMile": "{count} square mile|{count} square miles",
  "duration.day": "{count} day|{count} days",
  "duration.hour": "{count} hour|{count} hours",
  "duration.minute": "{count} minute|{count} minutes",
  "duration.underMinute": "under a minute",
  "scale.label": "Scale: {distance}",
  // Errors
  "error.search.offline":
    "You appear to be offline. Check your connection and try again.",
  "error.search.rate-limited":
    "Too many searches in a short time. Wait a moment and try again.",
  "error.search.failed": "Search did not work. Try again in a moment.",
  "error.location.denied":
    "Location access is blocked. Allow it in your browser settings, or search for a place instead.",
  "error.location.unavailable":
    "Your location is not available right now. Check that location services are on, or search for a place instead.",
  "error.location.timeout":
    "Finding your location took too long. Try again, or search for a place instead.",
  "error.routing.network":
    "The routing service could not be reached. You may be offline. Check your connection and try again.",
  "error.routing.rateLimited":
    "The routing service is busy. Wait a moment and try again.",
  "error.routing.noRoute":
    "No route was found between these stops. Move a stop closer to a road or path, or choose another way to travel.",
  "error.routing.noReachableArea":
    "Nothing is reachable from the first stop in that time. Move it closer to a road or path, or choose another way to travel.",
  "error.routing.invalid":
    "The routing service could not use those stops. Move them and try again.",
  "error.routing.unsupported":
    "That way of travelling is not available here. Choose another.",
  // Directions
  "directions.participle.drive": "driving",
  "directions.participle.walk": "walking",
  "directions.participle.cycle": "cycling",
  // Layer status lines
  "describe.zoomIn": "Zoom in to level {level} or closer to load this layer.",
  "describe.zoomOut": "Zoom out below level {level} to see this layer.",
  "describe.layersLoading": "Loading layers",
  "describe.layersLoadFailed": "Layers could not be loaded.",
  "describe.noLayers": "No layers are available.",
  "describe.layersRefreshFailed":
    "Layers could not be updated. Showing the last list.",
  "describe.layersSkipped":
    "{count} layer could not be shown|{count} layers could not be shown",
  "describe.tilesNoImagery": "No imagery was found for {when}. Try another.",
  "describe.tilesUnavailable": "Could not load. Check your connection.",
  "describe.tilesSlow":
    "Still waiting for imagery. The provider may be slow or not answering.",
  // Announcements
  "announce.layerLoaded": "{name}: {count} shown on the map.",
  "announce.layerStatus": "{name}: {status}",
  "announce.layerCapped":
    "{name}: showing the first {shown}. Zoom in to see more.",
  "announce.layerZoomIn":
    "{name}: zoom in to level {level} or closer to load this layer.",
  "announce.layerZoomOut":
    "{name}: zoom out below level {level} to see this layer.",
  "announce.layerOn": "{name} is on.",
  "announce.layersTurnedOff":
    "{count} layer turned off. Undo available|{count} layers turned off. Undo available",
  "announce.layersTurnedBackOn":
    "{count} layer turned back on|{count} layers turned back on",
  "announce.layerLoadFailed":
    "{name} could not load. Check your connection and try again.",
  "announce.layerInvalid":
    "{name} could not load: the provider sent something unexpected. Try again later.",
  "announce.tilesRecovered": "{name}: imagery is showing again.",
  "announce.imageSaved": "Map image saved.",
  "announce.imageFailed": "The map image could not be saved. Try again.",
  "announce.noFeaturesHere": "No features at the centre of the map.",
  "announce.featuresFound": "{count} features here. Choose one from the list.",
  "announce.nothingFoundHere": "Nothing found here.",
  "announce.layersDidNotAnswer": "{names} did not answer.",
  "announce.askedOfAvailable": "Asked {asked} of {available} layers.",
  "announce.layerUnavailable":
    "{name} is no longer available and was turned off.",
  "announce.layersUnavailable":
    "{count} layers are no longer available and were turned off.",
  "announce.linkLayersUnavailable":
    "{count} layer in the link is not available.|{count} layers in the link are not available.",
  "announce.layersSkipped":
    "{count} layer could not be shown.|{count} layers could not be shown.",
  "announce.layersAdded": "{count} added",
  "announce.layersRemoved": "{count} removed",
  "announce.layersUpdated": "Layers updated: {changes}.",
  "announce.featureSelected": "Added {title}. {total} selected.",
  "announce.featuresSelected":
    "{count} feature added. {total} selected.|{count} features added. {total} selected.",
  "announce.featureDeselected": "Removed {title}. {total} selected.",
  "announce.featuresDeselected":
    "{count} feature removed. {total} selected.|{count} features removed. {total} selected.",
  "announce.selectionCleared": "Selection cleared.",
  "announce.selectionFull":
    "The selection holds {limit} at most. Nothing was added.",
  "announce.showingFeature": "Showing {title} on the map.",
  "announce.detailShown": "Affected area of {title} shown on the map.",
  "announce.detailError": "The affected area could not load. Try again.",
  "announce.searchResults": "{count} result|{count} results",
  "announce.coordinateResult": "{results}, {label}",
  "announce.noResults": "No results",
  "announce.suggestions": "{count} suggestion|{count} suggestions",
  "announce.noSuggestions": "No suggestions",
  "announce.suggestionsUnavailable":
    "Suggestions are unavailable. Press Enter to search.",
  "announce.locationFound": "Location found, accuracy about {accuracy}",
  "announce.copied": "Coordinates copied",
  "announce.copyFailed":
    "Could not copy. Select the coordinates and copy them manually.",
  "announce.pinDropped": "Pin dropped at {position}",
  "announce.pinCleared": "Pin removed",
  "announce.measureDistance": "Total distance {distance}",
  "announce.measureArea": "Total area {area}",
  "announce.basemapChanged": "Basemap changed to {name}",
  "announce.projection.flat": "Map shape: flat",
  "announce.projection.globe": "Map shape: globe",
  "announce.zoom": "Zoom level {level}",
  "announce.detent.peek": "Panel minimised",
  "announce.detent.half": "Panel half height",
  "announce.detent.full": "Panel full height",
  "announce.surfaceOpened": "{name} opened",
  "announce.surfaceClosed": "{name} closed",
  "announce.tileError":
    "Some of the map could not load. Check your connection.",
  "announce.offline": "You are offline. Parts of the map may not load.",
  "announce.addressFound": "Address found: {address}",
  "announce.addressNotFound": "No address found here",
  "announce.addressError":
    "Could not look up the address. Check your connection and try again.",
  "announce.stopAdded":
    "Stop {letter} added, {count} stop|Stop {letter} added, {count} stops",
  "announce.stopLimit":
    "You can add up to {max} stops. Remove one to add another.",
  "announce.stopRemoved": "Stop {letter} removed",
  "announce.stopMoved":
    "Stop moved to position {position} of {total}, now stop {letter}",
  "announce.routeFound": "Route found, {distance}, {duration} {mode}",
  "announce.areaFound":
    "Area reachable within {count} minute {mode} found, covering {area}|Area reachable within {count} minutes {mode} found, covering {area}",
  "announce.routingCancelled": "Cancelled",
  "announce.directionsCleared": "Directions cleared",
  "announce.tourSkipped":
    "Tour skipped. Help, in Settings, can start it again.",
  "announce.timeMoved": "Time moved to {time}, the nearest available.",
  // Drawing
  "draw.hint.point":
    "Tap the map to place a point, or use Add point at map centre.",
  "draw.hint.line":
    "Tap the map to add points, then Finish. Or use Add point at map centre.",
  "draw.hint.polygon":
    "Tap the map to add corners, then Finish. Or use Add point at map centre.",
  "draw.hint.circle":
    "Tap the centre, then a second point to set the radius. Or use Add point at map centre.",
  "draw.issue.too-few-vertices":
    "Not enough points yet. A line needs two points and a polygon needs three.",
  "draw.issue.self-intersecting":
    "The edges cross each other. Move a point so they do not, then finish.",
  "draw.issue.degenerate":
    "That would have no size. Choose a place further from the others.",
  "draw.issue.radius-missing": "Tap a second point to set the circle's radius.",
  "draw.issue.radius-too-large":
    "That radius is too large. The most is 10,000 km.",
  "draw.measure.circle": "radius {radius}, area {area}",
  "draw.measure.line": "length {length}",
  "draw.measure.polygonArea": "area {area}",
  "draw.measure.polygon": "area {area}, perimeter {perimeter}",
  "draw.measure.radiusAndArea": "{radius} radius · {area}",
  "draw.sentence.circle": "Radius {radius}, area {area}.",
  "draw.sentence.line": "Length {length}.",
  "draw.sentence.polygonArea": "Area {area}.",
  "draw.sentence.polygon": "Area {area}, perimeter {perimeter}.",
  "draw.vertexAdded": "Point {count} added.",
  "draw.vertexAddedTo": "Point {count} added to {label}.",
  "draw.circleChanged": "{label} changed.",
  "draw.pointMoved": "{label} moved.",
  "draw.vertexMoved": "Point {index} of {label} moved.",
  "draw.vertexInserted": "Point added to {label} as point {index} of {count}.",
  "draw.vertexRemoved":
    "Point removed from {label}. {count} point left.|Point removed from {label}. {count} points left.",
  "draw.pointAdded": "{label} added.",
  "draw.finished": "{label} finished.",
  "draw.vertexSelected": "Point {index} of {count} selected in {label}.",
  "draw.pathSelected":
    "{label} selected. {count} point.|{label} selected. {count} points.",
  "draw.shapeSelected": "{label} selected.",
  "draw.discarded.point": "Discarded the unfinished point.",
  "draw.discarded.line": "Discarded the unfinished line.",
  "draw.discarded.polygon": "Discarded the unfinished polygon.",
  "draw.discarded.circle": "Discarded the unfinished circle.",
  "draw.deleted": "Deleted {label}. Undo brings it back.",
  "draw.clearedOne": "Deleted 1 shape.",
  "draw.clearedAll": "Deleted all {count} shapes.",
  "draw.undone": "Undone.",
  "draw.redone": "Redone.",
  "draw.loaded":
    "{count} shape loaded from the link.|{count} shapes loaded from the link.",
  "draw.import.refusal.drawing-full":
    "That would make more than {max} shapes. Delete some shapes first, or import a smaller file.",
  "draw.import.refusal.empty": "The file is empty.",
  "draw.import.refusal.too-large":
    "The file is larger than {megabytes} MB. Split it into smaller files.",
  "draw.import.refusal.too-deep":
    "The file is nested too deeply to read. Check that it is GeoJSON.",
  "draw.import.refusal.not-recognised":
    "This is not GeoJSON, WKT or a CSV of shapes from this map. Choose a .geojson, .json, .wkt, .txt or .csv file.",
  "draw.import.refusal.wkt-unreadable":
    "The WKT could not be read, so none of the file was imported.",
  "draw.import.refusal.too-many-shapes":
    "The file holds more than {max} shapes. Import at most {max} at a time.",
  "draw.import.refusal.too-many-points":
    "The file holds more than {max} points. Simplify the shapes or split the file.",
  "draw.import.refusalWithDetail": "{refusal} {detail}",
  "draw.import.skip.self-intersecting": "{count} with edges that cross",
  "draw.import.skip.degenerate": "{count} with no length or area",
  "draw.import.skip.too-few-vertices": "{count} with too few points",
  "draw.import.skip.radius-missing": "{count} with no radius",
  "draw.import.skip.radius-too-large": "{count} with a radius over 10,000 km",
  "draw.import.skip.out-of-range": "{count} with a position outside the world",
  "draw.import.skip.too-many-points": "{count} with more than {max} points",
  "draw.import.skip.malformed":
    "{count} with coordinates that could not be read",
  "draw.import.skip.unsupported": "{count} of a type that cannot be drawn",
  "draw.import.skip.other-srid":
    "{count} in a coordinate system other than SRID {srid}",
  "draw.import.skipped": "{total} skipped: {reasons}.",
  "draw.import.noShapes": "The file holds no shapes.",
  "draw.import.noneImported": "No shapes imported.",
  "draw.import.imported": "{count} shape imported.|{count} shapes imported.",
  "draw.import.holesLeftOut":
    "Holes in {count} polygon were left out.|Holes in {count} polygons were left out.",
  "common.itemCount": "{count} item|{count} items",
  "settings.language.label": "Language",
  "settings.language.auto": "Automatic",
  // Components: chrome, host, ui, panels and the app shell
  "chrome.endStack.label": "Map tools",
  "chrome.endStack.resetBearing": "Reset bearing to north",
  "chrome.endStack.controls": "Map controls",
  "chrome.endStack.mapOptions": "Map options",
  "chrome.endStack.measure": "Measure distance and area",
  "chrome.endStack.directions": "Directions",
  "chrome.endStack.draw": "Draw shapes",
  "chrome.endStack.locate": "Locate me",
  "chrome.endStack.settings": "Settings",
  "chrome.endStack.zoomControls": "Zoom controls",
  "chrome.endStack.zoomIn": "Zoom in",
  "chrome.endStack.zoomOut": "Zoom out",
  "chrome.attribution.label": "Map credits",
  "chrome.readout.label": "Map scale",
  "chrome.readout.zoomShort": "z {level}",
  "chrome.readout.zoomSpoken": "Zoom {level}",
  "chrome.readout.zoomSpokenAfterPosition": ", Zoom {level}",
  "chrome.sheet.resize": "Resize panel",
  "chrome.sheet.close": "Close",
  "host.map.label": "Map",
  "host.map.roleDescription": "map",
  "ui.skipToMap": "Skip to map",
  "ui.dismiss": "Dismiss",
  "panels.basemap.title": "Basemap",
  "panels.basemap.groupLabel": "Basemap",
  "panels.basemap.tryAgain": "Try again",
  "panels.basemap.unavailable": "Not available right now",
  "panels.basemap.usesMoreData": "Uses more data",
  "panels.shapes.title": "Shapes",
  "panels.shapes.empty":
    "Nothing drawn yet. Choose Draw shapes on the map to start.",
  "panels.shapes.listLabel": "Drawn shapes",
  "panels.shapes.unfinished": "{label}, unfinished",
  "panels.shapes.deleteSelected": "Delete selected shape",
  "panels.shapes.deleteAll": "Delete all shapes",
  "panels.shapes.importHeading": "Import",
  "panels.shapes.import": "Import GeoJSON, CSV or WKT",
  "panels.shapes.exportHeading": "Export",
  "panels.shapes.downloadGeoJson": "Download GeoJSON",
  "panels.shapes.downloadCsv": "Download CSV",
  "panels.shapes.downloadWkt": "Download WKT",
  "panels.shapes.copyLink": "Copy link with shapes",
  "panels.shapes.storageNote":
    "Shapes stay in this browser and are not saved. Files are made and read on your device, and nothing is uploaded. A link with shapes holds them in its address, so anyone you send it to can see them.",
  "panels.help.title": "Help",
  "panels.help.tourHeading": "Tour",
  "panels.help.tourDescription":
    "A few short steps that show the main controls by using them.",
  "panels.help.tourStart": "Take the tour",
  "panels.help.searchHeading": "Search",
  "panels.help.searchDescription":
    "Type a place name or a pair of coordinates, such as -26.2041, 28.0473 or 26.2041° S, 28.0473° E, then press Enter or Search. Write each value with a decimal point or a degree sign. Coordinates are read on this device and not sent to the geocoder; the map then loads map tiles for that area, as it does for any move.",
  "panels.help.keyboardHeading": "Keyboard",
  "panels.help.drawingHeading": "Drawing",
  "panels.help.accessibilityHeading": "Accessibility",
  "panels.help.accessibilityDescription":
    "MapCairn aims to meet WCAG 2.2 level AA. Every action that uses a gesture, such as a long press or a drag, also has a button or a keyboard shortcut.",
  "panels.pin.title": "Pin",
  "panels.pin.drop": "Drop pin at map centre",
  "panels.pin.note": "A pin is on the map.",
  "panels.export.title": "Save image",
  "panels.export.description":
    "Saves the map as it looks now, with its layers and credits, as a PNG file. It is made in your browser and sent nowhere.",
  "panels.export.save": "Save image",
  "panels.export.error": "The map image could not be saved. Try again.",
  "app.reload": "Reload",
  "app.loadingMap": "Loading the map",
  "app.sheetTitle.directions": "Directions",
  "app.sheetTitle.settings": "Settings and help",
  "app.sheetTitle.mapOptions": "Map options",
  "app.error.notFound.title": "Page not found",
  "app.error.notFound.message":
    "There is nothing at this address. Check the link, or go back to the map.",
  "app.error.notFound.link": "Go to the map",
  "app.error.unexpected.title": "Something went wrong",
  "app.error.unexpected.message":
    "MapCairn stopped because of an unexpected problem. Reload the page to start again. Your settings are kept.",
  "app.banner.engineFailed":
    "The map could not start. Reload the page to try again.",
  "app.banner.engineStopped":
    "The map stopped working. Reload the page to try again.",
  "app.banner.basemapFailed": "That basemap could not be loaded.",
  "app.banner.basemapUnavailable": "{name} is not available right now.",
  "app.banner.retry": "Retry",
  "app.banner.tryAgain": "Try again",
  "app.banner.usePreviousBasemap": "Use previous basemap",
  "app.webgl.title": "MapCairn needs WebGL to draw the map.",
  "app.webgl.advice":
    "This browser has WebGL turned off or does not support it. Try a different browser, or turn on hardware acceleration in your browser settings.",
  "app.tour.layers.heading": "Turn on a layer",
  "app.tour.layers.text":
    "Open Map options and turn on any layer under Layers.",
  "app.tour.mapShape.heading": "Try the globe",
  "app.tour.mapShape.text":
    "Open Settings and switch Map shape between Flat and Globe. Help, just below it, lists the keys and can start this tour again.",
  "app.tour.search.heading": "Find a place",
  "app.tour.search.text": "Type a place name in Search and press Enter.",
  "app.tour.welcome.heading": "New to MapCairn?",
  "app.tour.welcome.text":
    "Data such as earthquakes and fires is drawn only once you turn its layer on. This three-step tour shows how.",
  "app.tour.welcome.announcement":
    "New to MapCairn? A three-step tour is after the search box, with Take the tour and Skip.",
  "app.tour.ending.heading": "Tour finished",
  "app.tour.ending.text": "Help, in Settings, can start it again.",
};
