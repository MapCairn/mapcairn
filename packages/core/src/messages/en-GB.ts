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
 * The English plural values use `|`: the "one" form first, then "other".
 * Other catalogues may use category-keyed forms or a single plain value.
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
  "settings.notSaved": "Changes will not be remembered on this device.",
  "settings.privacy.heading": "Privacy",
  "settings.privacy.link": "Read the privacy policy",
  "settings.privacy.default":
    "The privacy policy says what each service this map uses receives.",
  // Common joins
  "common.followedBy": "{first} {second}",
  "common.commaJoined": "{first}, {second}",
  "common.dotJoined": "{first} · {second}",
  // Formatting
  "format.hemisphereNorth": "N",
  "format.hemisphereSouth": "S",
  "format.hemisphereEast": "E",
  "format.hemisphereWest": "W",
  "format.wordNorth": "north",
  "format.wordSouth": "south",
  "format.wordEast": "east",
  "format.wordWest": "west",
  "format.wordDegree": "degree degrees",
  "format.wordMinute": "minute minutes",
  "format.wordSecond": "second seconds",
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
  "units.symbol.metre": "m",
  "units.symbol.kilometre": "km",
  "units.symbol.foot": "ft",
  "units.symbol.mile": "mi",
  "units.symbol.squareMetre": "m²",
  "units.symbol.hectare": "ha",
  "units.symbol.squareKilometre": "km²",
  "units.symbol.squareFoot": "ft²",
  "units.symbol.acre": "ac",
  "units.symbol.squareMile": "mi²",
  "units.reading": "{number} {symbol}",
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
  "announce.layerOffline":
    "{name} did not load because you are offline. Try again when you are back online.",
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
  "announce.searchPicked": "Showing {label} on the map.",
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
    "The file is nested too deeply to read. Check that it is a GeoJSON or GPX file.",
  "draw.import.refusal.not-recognised":
    "This is not GeoJSON, GPX, WKT or a CSV of shapes from this map. Choose a .geojson, .json, .gpx, .wkt, .txt or .csv file.",
  "draw.import.refusal.wkt-unreadable":
    "The WKT could not be read, so none of the file was imported.",
  "draw.import.refusal.gpx-unreadable":
    "The GPX could not be read, so none of the file was imported.",
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
  "draw.import.axisHint.lat-lng":
    "No shapes imported. The first position is outside the world as longitude, latitude, but it fits as latitude, longitude.",
  "draw.import.axisHint.lng-lat":
    "No shapes imported. The first position is outside the world as latitude, longitude, but it fits as longitude, latitude.",
  "common.itemCount": "{count} item|{count} items",
  "settings.language.label": "Language",
  "settings.language.auto": "Automatic",
  "settings.language.loadFailed": "{language} could not be loaded.",
  "settings.language.tryAgain": "Try again",
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
  "host.map.named": "{name} ({label})",
  "host.map.announcement": "{label}: {text}",
  "host.map.roleDescription": "map",
  "ui.skipToMap": "Skip to map",
  "ui.dismiss": "Dismiss",
  "panels.basemap.title": "Basemap",
  "panels.basemap.groupLabel": "Basemap",
  "panels.basemap.tryAgain": "Try again",
  "panels.basemap.unavailable": "Not available right now",
  "panels.shapes.title": "Shapes",
  "panels.shapes.empty":
    "Nothing drawn yet. Choose Draw shapes on the map to start.",
  "panels.shapes.listLabel": "Drawn shapes",
  "panels.shapes.unfinished": "{label}, unfinished",
  "panels.shapes.deleteSelected": "Delete selected shape",
  "panels.shapes.deleteAll": "Delete all shapes",
  "panels.shapes.importHeading": "Import",
  "panels.shapes.import": "Import GeoJSON, GPX, CSV or WKT",
  "panels.shapes.axisOrderLabel": "WKT coordinate order",
  "panels.shapes.axisOrder.lng-lat": "Longitude, latitude (default)",
  "panels.shapes.axisOrder.lat-lng": "Latitude, longitude",
  "panels.shapes.axisReread.lat-lng": "Read as latitude, longitude",
  "panels.shapes.axisReread.lng-lat": "Read as longitude, latitude",
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
    "Type a place name or coordinates, such as -26.2041, 28.0473 or 26.2041° S, 28.0473° E, a UTM reference such as 31U 500000 5500000, or an MGRS reference such as 31U CT 12345 67890, then press Enter or Search. After the zone of a UTM reference, N or S is the hemisphere, not a band letter. The letters of an MGRS reference are all capitals or all lower case; a mixed-case reference is searched by name. Write each value of a pair with a decimal point or a degree sign. A decimal comma also works when a semicolon separates the values, or when spaces do and every number has one. Text that reads as coordinates is read on this device and not sent to the geocoder, and other text is searched by name; the map then loads map tiles for that area, as it does for any move.",
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
  "app.banner.online": "You are back online.",
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
  // Short durations
  "duration.short.day": "{count} d",
  "duration.short.hour": "{count} h",
  "duration.short.minute": "{count} min",
  "duration.short.underMinute": "Under 1 min",
  // Travel modes and stops
  "directions.mode.drive": "Drive",
  "directions.mode.walk": "Walk",
  "directions.mode.cycle": "Cycle",
  "directions.stop": "Stop {letter}, {place}",
  // Default shape labels
  "draw.shapeLabel.point": "Point {serial}",
  "draw.shapeLabel.line": "Line {serial}",
  "draw.shapeLabel.polygon": "Polygon {serial}",
  "draw.shapeLabel.circle": "Circle {serial}",
  // WKT reader faults
  "wkt.atPosition": "{fault} at position {position}.",
  "wkt.unexpectedCharacter": "Unexpected character",
  "wkt.unexpectedText": "Unexpected text after the geometry",
  "wkt.expectedKeyword": 'Expected "{kind}"',
  "wkt.expectedNumber": "Expected a number",
  "wkt.invalidNumber": "Not a valid number",
  "wkt.zNeedsThree": "A Z position needs three numbers",
  "wkt.expectedSrid": "Expected an SRID",
  "wkt.sridDigits": "An SRID must be a whole number of at most {max} digits",
  "wkt.expectedType": "Expected a geometry type",
  "wkt.unknownType": 'Unknown geometry type "{keyword}"',
  "wkt.unexpectedWord": "Unexpected word",
  "wkt.nestedTooDeep": "Geometry collections are nested too deeply",
  "wkt.mixedBrackets": "Points must all be bracketed or all bare",
  "wkt.measureUnsupported": "Coordinates with a measure (M) are not supported.",
  "wkt.typeUnsupported": "The WKT type {keyword} is not supported.",
  "wkt.onlySrid":
    "Only SRID {supported} (WGS 84) is supported, not SRID {srid}.",
  // Layer formatters and class labels
  "layers.formatter.agoDay": "{count} day ago|{count} days ago",
  "layers.formatter.agoHour": "{count} hour ago|{count} hours ago",
  "layers.formatter.agoMinute": "{count} minute ago|{count} minutes ago",
  "layers.formatter.inDay": "in {count} day|in {count} days",
  "layers.formatter.inHour": "in {count} hour|in {count} hours",
  "layers.formatter.inMinute": "in {count} minute|in {count} minutes",
  "layers.formatter.justNow": "just now",
  "layers.interval.upTo": "Up to {high}{unit}",
  "layers.interval.andAbove": "{low}{unit} and above",
  "layers.interval.range": "{low} to {high}{unit}",
  // Tools: shared
  "tools.done": "Done",
  "tools.addPointAtCentre": "Add point at map centre",
  "tools.tryAgain": "Try again",
  // Tools: measure
  "tools.measure.region": "Measurement",
  "tools.measure.label": "Measure",
  "tools.measure.distance": "Distance",
  "tools.measure.area": "Area",
  "tools.measure.total": "Total",
  "tools.measure.undo": "Undo last point",
  "tools.measure.clear": "Clear points",
  "tools.measure.hint":
    "Tap the map to add points, or use Add point at map centre.",
  // Tools: draw
  "tools.draw.region": "Drawing",
  "tools.draw.toolbar": "Draw",
  "tools.draw.shapeToDraw": "Shape to draw",
  "tools.draw.mode.point": "Point",
  "tools.draw.mode.line": "Line",
  "tools.draw.mode.polygon": "Polygon",
  "tools.draw.mode.circle": "Circle",
  "tools.draw.selectedPoints": "{label}, {count} point|{label}, {count} points",
  "tools.draw.selectedPoint": "{label}, point {index} of {total}",
  "tools.draw.previousPoint": "Previous point",
  "tools.draw.nextPoint": "Next point",
  "tools.draw.insertPoint": "Add point after this one at map centre",
  "tools.draw.removePoint": "Remove point",
  "tools.draw.smallerRadius": "Smaller radius",
  "tools.draw.largerRadius": "Larger radius",
  "tools.draw.radiusToCentre": "Set radius to map centre",
  "tools.draw.movePoint": "Move point to map centre",
  "tools.draw.cancelShape": "Cancel shape",
  "tools.draw.deleteShape": "Delete shape",
  "tools.draw.undo": "Undo",
  "tools.draw.redo": "Redo",
  "tools.draw.shapesAndExport": "Shapes and export",
  "tools.draw.finish": "Finish",
  "tools.draw.selectedHint":
    "Drag a point to move it, or use the arrow keys. Escape steps back.",
  "tools.draw.status.empty": "Nothing drawn yet",
  "tools.draw.status.drawing": "{label}, {count} point|{label}, {count} points",
  "tools.draw.status.shapes": "{count} shape|{count} shapes",
  "tools.draw.file.unreadable":
    "The file could not be read. Choose it again, or another file.",
  "tools.draw.file.unsupported": "This browser cannot open files here.",
  "tools.draw.linkLimitNote":
    "A link carries at most {max} shapes, so download a file to share them all.",
  "tools.draw.nothingToExport": "Nothing to export yet. Finish a shape first.",
  "tools.draw.saved":
    "Saved {count} shape as {filename}.|Saved {count} shapes as {filename}.",
  "tools.draw.saveFailed":
    "The file could not be saved. Try copying a link instead.",
  "tools.draw.tooManyToShare":
    "Too many shapes to share in a link. Export a file instead.",
  "tools.draw.nothingToShare": "Nothing to share yet. Finish a shape first.",
  "tools.draw.nothingToCopy":
    "Nothing to copy: {count} shape is too small to carry in a link. Export a file instead.|Nothing to copy: {count} shapes are too small to carry in a link. Export a file instead.",
  "tools.draw.linkCopied": "Link with shapes copied.",
  "tools.draw.linkCopiedLeftOut":
    "Link with shapes copied. {count} shape is too small to carry in a link and was left out. Export a file to keep it.|Link with shapes copied. {count} shapes are too small to carry in a link and were left out. Export a file to keep them.",
  "tools.draw.linkCopyFailed":
    "The link could not be copied. Export a file instead.",
  // Tools: pin card
  "tools.pin.heading": "Dropped pin",
  "tools.pin.close": "Close pin",
  "tools.pin.noAddress": "No address found here.",
  "tools.pin.lookUp": "Look up address",
  "tools.pin.lookingUp": "Looking up the address",
  "tools.pin.lookupFailed":
    "Could not look up the address. Check your connection and try again.",
  "tools.pin.lookupNote":
    "Sends the pin's position, to about 11 m, to the address service.",
  "tools.pin.copy": "Copy coordinates",
  "tools.pin.clear": "Clear pin",
  "tools.pin.copied": "Copied",
  "tools.pin.copyFailed": "Could not copy",
  // Tools: search
  "tools.search.label": "Search",
  "tools.search.places": "Search places",
  "tools.search.clear": "Clear search",
  "tools.search.suggestions": "Suggestions",
  "tools.search.results": "Search results",
  "tools.search.searching": "Searching...",
  "tools.search.nothingMatched": "Nothing matched that search.",
  "tools.search.unavailable":
    "Search is unavailable right now. Please try again.",
  "tools.search.retry": "Retry",
  // Tools: locate
  "tools.locate.locating": "Finding your location...",
  // Tools: tour
  "tools.tour.progress": "Step {step} of {total}",
  "tools.tour.take": "Take the tour",
  "tools.tour.skip": "Skip",
  "tools.tour.next": "Next",
  "tools.tour.finish": "Finish",
  "tools.tour.skipTour": "Skip tour",
  "tools.tour.close": "Close",
  "tools.tour.stepAnnouncement": "{progress}, {heading}. {text}",
  "tools.tour.finished": "Tour finished.",
  // Tools: directions
  "tools.directions.note":
    "Nothing is sent until you ask. Get route sends the stops and the way of travelling to the routing service. A travel time area sends the first stop.",
  "tools.directions.stops": "Stops",
  "tools.directions.stopsHint":
    "Tap the map to add a stop, or use Add stop at map centre.",
  "tools.directions.stopPrefix": "Stop {letter}:",
  "tools.directions.moveUp": "Move stop {letter} up",
  "tools.directions.moveDown": "Move stop {letter} down",
  "tools.directions.remove": "Remove stop {letter}",
  "tools.directions.addAtCentre": "Add stop at map centre",
  "tools.directions.addPin": "Add dropped pin",
  "tools.directions.droppedPin": "Dropped pin",
  "tools.directions.full":
    "You can add up to {max} stops. Remove one to add another.",
  "tools.directions.route": "Route",
  "tools.directions.travelMode": "Travel mode",
  "tools.directions.getRoute": "Get route",
  "tools.directions.cancel": "Cancel",
  "tools.directions.needTwo": "Add at least two stops to get a route.",
  "tools.directions.searchHeading": "Add a stop by search",
  "tools.directions.searchForm": "Search for a stop",
  "tools.directions.searchInput": "Search for a place to add as a stop",
  "tools.directions.searchPlaceholder": "Search for a place",
  "tools.directions.placesFound": "Places found",
  "tools.directions.addPlace": "Add {place}",
  "tools.directions.areaHeading": "Travel time area",
  "tools.directions.areaHint":
    "Shows how far you can get from stop A in the time you choose.",
  "tools.directions.showArea":
    "Show the area reachable within {count} minute|Show the area reachable within {count} minutes",
  "tools.directions.findingRoute": "Finding a route...",
  "tools.directions.findingArea": "Finding the area...",
  "tools.directions.clear": "Clear directions",
  "tools.directions.legs": "Legs",
  "tools.directions.reachesArea": "Reaches an area of {area} from stop A.",
  "tools.directions.routeSummary":
    "{mode}, {how}, through {count} stop.|{mode}, {how}, through {count} stops.",
  "tools.directions.leg": "{from} to {to}: {distance}, {duration}",
  // Layers
  "layers.title": "Layers",
  "layers.intro":
    "Open data from public providers. Nothing is requested until you turn a layer on.",
  "layers.theFeature": "the feature",
  "layers.tryAgain": "Try again",
  "layers.usesCost": "Uses {cost}.",
  "layers.keyFor": "Key for {name}",
  "layers.status.loading": "Loading",
  "layers.status.updated": "Updated {time}, {count} shown",
  "layers.status.updatedCapped":
    "Updated {time}. Showing the first {count}. Zoom in to see more.",
  "layers.status.updatedEmpty": "Updated {time}. {text}",
  "layers.status.loadFailedNetwork": "Could not load. Check your connection.",
  "layers.status.loadFailedOffline": "Could not load. You are offline.",
  "layers.status.loadFailedInvalid":
    "Could not load: the provider sent something unexpected.",
  "layers.identify.hint": "Tap the map to see details for this layer.",
  "layers.identify.cap": "Only the first {count} layers are asked on one tap.",
  "layers.identify.lookingUp": "Looking up what is here",
  "layers.list.summary": "List of {count} on the map",
  "layers.list.sortBy": "Sort by",
  "layers.list.showOnMap": "show on map",
  "layers.list.showAll": "Show all {count}",
  "layers.save.group": "Save the features of {name}",
  "layers.save.geojson": "Save as GeoJSON",
  "layers.save.csv": "Save as CSV",
  "layers.save.note":
    "Saves the loaded features, up to {max}, with credit and date. Nothing is sent.",
  "layers.save.done":
    "Saved {count} feature of {name} as {filename}.|Saved {count} features of {name} as {filename}.",
  "layers.save.doneCapped":
    "Saved the first {count} of {total} features of {name} as {filename}.",
  "layers.save.failed": "The file could not be saved.",
  "layers.card.close": "Close card",
  "layers.card.opensInNewTab": "(opens in a new tab)",
  "layers.card.back": "Back to list",
  "layers.card.showOnMap": "Show on map",
  "layers.card.hideArea": "Hide affected area",
  "layers.card.areaFailed": "The affected area could not load.",
  "layers.choices.heading": "{count} feature here|{count} features here",
  "layers.choices.close": "Close list",
  "layers.choices.hint": "Choose one to see its details.",
  "layers.choices.openDetails": "open details",
  "layers.turnOff.all": "Turn off all layers",
  "layers.turnOff.count": "{count} on",
  "layers.turnOff.group": "Turn off {count} in {group}",
  "layers.turnOff.doneAll":
    "Turned off {count} layer.|Turned off {count} layers.",
  "layers.turnOff.undo": "Undo",
  "layers.turnOff.undoAll":
    "Undo turning off {count} layer|Undo turning off {count} layers",
  "layers.turnOff.doneGroup": "Turned off {count} in {group}.",
  "layers.turnOff.undoGroup": "Undo turning off {count} in {group}",
  "layers.key.title": "Map key",
  "layers.key.toggle": "Key, {count} layer|Key, {count} layers",
  "layers.key.chip": "Key, {count} layer|Key, {count} layers",
  "layers.key.scrolling": "Layer keys",
  "layers.key.showing": "Showing {time}",
  "layers.key.nameKey": "{name} key",
  "layers.time.date": "Date (UTC)",
  "layers.time.time": "Time (UTC)",
  "layers.time.status":
    "Showing {slot}. Newest available: {newest}. Newer times may not be out yet, so they are not offered.",
  // Definition text: layer and basemap fields, keyboard help
  "layer.cyclones.name": "Tropical cyclones",
  "layer.cyclones.description":
    "Current tropical storms and cyclones with their strongest winds. Show affected area draws the track and wind zones.",
  "layer.cyclones.emptyText": "No tropical cyclone alerts right now.",
  "layer.group.floodsStormsAndDroughts": "Floods, storms and droughts",
  "layer.drought-alerts.name": "Drought alerts",
  "layer.drought-alerts.description":
    "Current droughts that GDACS rates for their impact on people.",
  "layer.drought-alerts.emptyText": "No drought alerts right now.",
  "layer.group.imagery": "Imagery",
  "layer.control.opacity": "Opacity",
  "layer.earthquakes.name": "Earthquakes",
  "layer.earthquakes.description":
    "Earthquakes recorded by the US Geological Survey worldwide, updated about every minute.",
  "layer.earthquakes.emptyText": "No earthquakes in this period.",
  "layer.group.earthquakesAndVolcanoes": "Earthquakes and volcanoes",
  "layer.earthquakes.control.window.label": "Period",
  "layer.earthquakes.control.window.option.hour": "Hour",
  "layer.earthquakes.control.window.option.day": "Day",
  "layer.earthquakes.control.window.option.week": "Week",
  "layer.earthquakes.control.small.label": "Include smaller earthquakes",
  "layer.earthquakes.control.small.description":
    "Below magnitude 2.5, for the past day. Up to about 130 KB.",
  "layer.earthquakes.key.1": "Below 2.5",
  "layer.earthquakes.key.2": "2.5 to 4.4",
  "layer.earthquakes.key.3": "4.5 to 5.9",
  "layer.earthquakes.key.4": "6 to 6.9",
  "layer.earthquakes.key.5": "7 and above",
  "layer.earthquakes.card.link": "Details on the USGS site",
  "layer.earthquakes.sort.newest": "Newest",
  "layer.earthquakes.sort.strongest": "Strongest",
  "layer.fire-alerts.name": "Fire alerts",
  "layer.fire-alerts.description":
    "Current wildfires that GDACS rates for their impact on people, with the area burnt.",
  "layer.fire-alerts.emptyText": "No wildfire alerts right now.",
  "layer.group.fires": "Fires",
  "layer.fire-hotspots-viirs.name": "Fire hotspots, sharper",
  "layer.fire-hotspots-viirs.description":
    "The same kind of heat marks from the VIIRS sensor on the NOAA-21 satellite, at about 375 m. Uses about five times more data.",
  "layer.control.date": "Date",
  "layer.fire-hotspots.name": "Fire hotspots",
  "layer.fire-hotspots.description":
    "Places where the MODIS sensor on the Terra satellite saw unusual heat on the chosen day, such as fires. Each mark is about 1 km.",
  "layer.flood-alerts.name": "Flood alerts",
  "layer.flood-alerts.description":
    "Current floods that GDACS rates for their impact on people.",
  "layer.flood-alerts.emptyText": "No flood alerts right now.",
  "layer.imagery.name": "Satellite imagery",
  "layer.imagery.description":
    "A daily true-colour picture of the whole Earth from the NOAA-21 satellite, with that day's clouds, unlike the Satellite basemap. Detail stops at about 300 m.",
  "layer.population.name": "Where people live",
  "layer.population.description":
    "Population density across the world in 2020, from dark and empty to bright and crowded. Detail stops at about 5 km. Antarctica is not shown.",
  "layer.group.people": "People",
  "layer.rainfall-half-hourly.name": "Rainfall, half-hourly",
  "layer.rainfall-half-hourly.description":
    "Rain estimated from satellites for the whole Earth, as the rain rate in one half hour in millimetres per hour (mm per hour). Rain runs from green (light, up to about 1) through yellow and orange (about 1 to 4) to red (about 5 to 20) and dark red (heavy, over 20; the scale stops at 53). Snow and other frozen precipitation use pale cyan, blue and purple over the same steps. Nothing is drawn below 0.1. Each half hour arrives six to seven hours late, and detail stops at about 10 km.",
  "layer.rainfall-half-hourly.disclaimer":
    "Not a forecast, and not for warnings. It is a satellite estimate, coarser than radar, and can miss or overstate rain. Recent half hours are early estimates that NASA revises later. For warnings, use your national weather service.",
  "layer.rainfall-half-hourly.control.time.label": "Half hour shown",
  "layer.rainfall-half-hourly.control.time.description":
    "A few half hours have no data. If tiles fail to load, try another time.",
  "layer.rainfall.name": "Rainfall",
  "layer.rainfall.description":
    "Rain estimated from satellites for the whole Earth, as the rain rate for the chosen day in millimetres per hour (mm per hour). Rain runs from green (light, up to about 1) through yellow and orange (about 1 to 4) to red (about 5 to 20) and dark red (heavy, over 20; the scale stops at 53). Snow and other frozen precipitation use pale cyan, blue and purple over the same steps. Nothing is drawn below 0.1. Each day arrives two to three days late, and detail stops at about 10 km.",
  "layer.rainfall.disclaimer":
    "Not a forecast, and not for warnings. It is a satellite estimate, coarser than radar, and can miss or overstate rain. For warnings, use your national weather service.",
  "layer.rainfall.control.date.description":
    "A few days have no data. If tiles fail to load, try the day before or after.",
  "layer.sea-temperature-anomaly.name": "Sea temperature compared with normal",
  "layer.sea-temperature-anomaly.description":
    "Warm colours, from yellow to dark red, show sea water warmer than usual for the time of year. Grey is about normal, and cyan to blue is cooler. Unusually warm water along the equator in the Pacific is the sign of El Niño, and unusually cool water is La Niña. Detail stops at about 5 km.",
  "layer.group.oceans": "Oceans",
  "layer.volcano-alerts.name": "Volcano alerts",
  "layer.volcano-alerts.description":
    "Current volcanic eruptions that GDACS rates for their impact on people.",
  "layer.volcano-alerts.emptyText": "No volcano alerts right now.",
  "layer.world-countries.name": "Countries by population",
  "layer.world-countries.description":
    "Country outlines shaded by estimated population, from Natural Earth.",
  "layer.world-countries.disclaimer":
    "Population figures are estimates, not official counts.",
  "layer.world-countries.emptyText": "No countries could be shown.",
  "layer.group.boundaries": "Boundaries",
  "layer.world-countries.key.1": "Under 1 million",
  "layer.world-countries.key.2": "1 to 10 million",
  "layer.world-countries.key.3": "10 to 50 million",
  "layer.world-countries.key.4": "50 to 200 million",
  "layer.world-countries.key.5": "200 million and above",
  "layer.world-countries.sort.name": "Name",
  "layer.world-countries.sort.population": "Most people",
  "layer.gdacs.disclaimer":
    "GDACS alerts are automatic estimates from models. Check official sources before you act.",
  "layer.gdacs.key.1": "Green alert",
  "layer.gdacs.key.2": "Orange alert",
  "layer.gdacs.key.3": "Red alert",
  "layer.gdacs.key.4": "No alert level",
  "layer.gdacs.card.link": "Report on GDACS",
  "layer.gdacs.sort.newest": "Newest",
  "layer.gdacs.sort.alert": "Highest alert",
  "layer.gdacs.detail.label": "Show affected area",
  "layer.gdacs.detail.dataCost": "about 300 KB",
  "basemap.bright.name": "Bright",
  "basemap.liberty.name": "Liberty",
  "basemap.colorful.name": "Colorful",
  "basemap.fiord.name": "Fiord",
  "basemap.dark.name": "Dark",
  "basemap.positron.name": "Positron",
  "basemap.osm.name": "Streets",
  "keyHelp.keys.arrowKeys": "Arrow keys",
  "keyHelp.keys.shiftUpDown": "Shift with up or down arrow",
  "keyHelp.keys.shiftLeftRight": "Shift with left or right arrow",
  "keyHelp.keys.plusMinus": "Plus or minus",
  "keyHelp.keys.homeOr0": "Home or 0",
  "keyHelp.keys.p": "P",
  "keyHelp.keys.i": "I",
  "keyHelp.keys.escape": "Escape",
  "keyHelp.keys.space": "Space",
  "keyHelp.keys.enter": "Enter",
  "keyHelp.keys.squareBrackets": "Square bracket keys",
  "keyHelp.keys.deleteBackspace": "Delete or Backspace",
  "keyHelp.keys.undo": "Control or Command with Z",
  "keyHelp.map.pan": "Pan the map",
  "keyHelp.map.panFurther": "Pan the map further",
  "keyHelp.map.rotate": "Rotate the map",
  "keyHelp.map.zoom": "Zoom in or out",
  "keyHelp.map.north": "Point the map north again",
  "keyHelp.map.pin": "Drop a pin at the centre of the map",
  "keyHelp.map.identify": "Show what is at the centre of the map",
  "keyHelp.map.escape": "Close the open panel",
  "keyHelp.draw.addPoint":
    "While drawing, add a point at the map centre, or move the selected point there",
  "keyHelp.draw.finish": "While drawing, finish the shape",
  "keyHelp.draw.nudge":
    "With a point selected, move it a little; hold Shift for more",
  "keyHelp.draw.selectPoint": "Select the previous or next point",
  "keyHelp.draw.remove":
    "Remove the selected point or shape, or the last point while drawing",
  "keyHelp.draw.undo": "Undo; add Shift to redo",
  "keyHelp.draw.escape":
    "Step back: leave a point, cancel the shape, then close drawing",
  "host.map.keyInstruction": "{keys}: {description}.",
  "host.notes.privacy":
    "MapCairn has no accounts, sets no cookies and counts page views without tracking you. Map tiles come from the map provider you choose. As you type in search, the text so far is sent to the Photon service, run by komoot, to suggest places. Pressing Enter or Search sends your query to OpenStreetMap's Nominatim service, and Look up address on a pin sends the pin's position, to about 11 m, to Nominatim too. A search and an address lookup also send this site's address to Nominatim as the referrer. Nothing is sent to either service until you type in search or ask for an address, and a search that reads as coordinates is not sent to them (text that does not, such as a typo, is searched by name), though showing the place loads map tiles for that area, as any move of the map does. A data layer contacts its provider only while it is on. Your settings stay on this device.",
  "host.notes.pinLookup":
    "Sends the pin's position, to about 11 m, and this site's address as the referrer, to OpenStreetMap's Nominatim service.",
  "host.notes.routing":
    "Nothing is sent until you ask. Get route sends the stops and the way of travelling, and a travel time area sends the first stop, with your IP address and this site's address as the referrer, to the Valhalla routing service run by FOSSGIS. It uses OpenStreetMap data.",
  "host.credits.fixTheMap": "Fix the map",
  "host.credits.about": "About MapCairn",
  "host.title.map": "Interactive map",
  "privacy.title": "Privacy policy",
  "privacy.updated": "Last updated: {date}",
  "privacy.intro":
    "MapCairn has no user accounts, no forms and no server-side database of visitor data. The site stores or sends only the following.",
  "privacy.cookies.heading": "Cookies",
  "privacy.cookies.body":
    "The site sets no cookies. Your settings are kept in local storage on your device instead, as described below.",
  "privacy.storage.heading": "Local storage",
  "privacy.storage.body":
    "Your browser's {localStorage} keeps your settings: your light or dark theme (under the key {themeKey}), your units, which language you chose, whether the zoom buttons show, whether the map is flat or a globe, your chosen basemap, where the map was last left, and whether you have answered the first-visit tour (a version number under {tourKey}). The other keys start with {keyPrefix}. The tour itself sends nothing; a layer you turn on during it loads from its provider as described below. These stay on your device and are never sent to a server. The documentation site at {docsPath} keeps its own light or dark choice under {docsThemeKey}, the key its framework uses, in its own storage. It does not read the choice you made here, and like the others it stays on your device.",
  "privacy.analytics.heading": "Analytics",
  "privacy.analytics.body":
    "This site uses Cloudflare Web Analytics for aggregate page-view counts. It is cookieless, does not fingerprint visitors, does not track you across sites and stores no personal data. Requests are made to {scriptHost} and {beaconHost}.",
  "privacy.errors.heading": "Error reporting",
  "privacy.errors.body":
    "If the app hits an unexpected error in your browser, it sends a short diagnostic report to this site's own server, where it is written to Cloudflare's operational logs so the fault can be fixed. The report holds the error message, a stack trace, the page's address without its query or the part after # (for example {exampleUrl}), and whether it was an uncaught error or a rejected promise. It never includes the map's position or yours. No cookies, personal data or persistent identifiers are attached to the report, and it is not stored in any database. One page load sends at most five reports, and the same error only once. The product page at the site's root runs no script that reports errors, so it sends no reports. The map and the other pages send them as described here.",
  "privacy.hosting.heading": "Hosting logs",
  "privacy.hosting.body":
    "Cloudflare, as host, may log standard request metadata (IP address, user agent, timestamp) as part of normal operation. See {link}.",
  "privacy.hosting.link": "Cloudflare's own privacy policy",
  "privacy.tiles.heading": "Map tiles and location search",
  "privacy.tiles.body":
    "The basemap tile providers, OpenFreeMap and, when you choose the Streets basemap, the OpenStreetMap Foundation, may log tile requests, including your IP address, as part of serving the map. This is standard for any web map. Your browser makes those requests itself: they carry your IP address, its usual request headers (such as its user agent) and this site's address as the referrer, and nothing this site has stored about you. Tiles are requested for the part of the map on screen, so the basemap's provider, and the provider of any tile layer you turn on, can tell roughly which area you are looking at, and after Locate me roughly where you are. When you search (by pressing Enter or the Search button), your query is sent to OpenStreetMap's Nominatim geocoding service, which may likewise log the query and your IP address. As you type, the text so far is also sent to Photon, a search-as-you-type geocoding service that komoot runs on OpenStreetMap data, to suggest places. A request goes out each time you pause after typing at least three characters, so one search can send several partial versions of it, and Photon may log them with your IP address. Your browser sends no cookies with these requests. A search or an address lookup sent to Nominatim also carries this site's address as the referrer: the address of the site only, not the page you are on, because the service asks for one. The suggestions sent to Photon carry no referrer. Picking a suggestion sends nothing more, and if suggestions stop working, Enter and the Search button still search through Nominatim. A search that reads as coordinates — a pair of decimal degrees or degrees, minutes and seconds, a UTM reference or an MGRS reference — is read in your browser and is not sent to the geocoder; showing the place requests map tiles for that area, as any move of the map does. Text that does not read as coordinates, such as a typo or a reference that is out of range, is searched by name. If an assistant in your browser uses this site's search or measuring tools (through WebMCP), the place names it gives are sent to Nominatim in the same way, and coordinates are again read in your browser.",
  "privacy.layers.heading": "Data layers",
  "privacy.layers.body":
    "Every data layer is off until you turn it on, and nothing is requested before that. Turning a layer on, changing its controls or pressing Try again sends a request from your browser straight to that layer's provider, which may log it with your IP address: the US Geological Survey (USGS) for earthquakes, NASA's Global Imagery Browse Services for its imagery layers (satellite imagery, rainfall, fire hotspots, where people live, Earth at night and sea temperature), the Global Disaster Alert and Coordination System (GDACS) for fire, flood, tropical cyclone, volcano and drought alerts, and the jsDelivr content delivery network for the country boundaries. Show affected area sends one more request to GDACS for that event only. Tile layers request images for the part of the map you are looking at, so the provider can tell roughly where you are looking. Their tile requests carry no referrer, unlike basemap tile requests, which keep this site's address as the referrer because a basemap provider may ask for one. Nothing passes through this site, and nothing is stored beyond the page you have open. The layers you turn on are written into the page address so a link can be shared; they are not sent anywhere else. Opening a link that has layers turned on requests those layers straight away, because the link turns them on.",
  "privacy.pins.heading": "Pin addresses",
  "privacy.pins.body":
    "Dropping a pin sends nothing. A pin's address is looked up only when you press Look up address on the pin. That sends the pin's position, rounded to about 11 m, to OpenStreetMap's Nominatim service, which may log it with your IP address and this site's address as the referrer.",
  "privacy.routes.heading": "Routes and travel-time areas",
  "privacy.routes.body":
    "When you ask for a route or a travel-time area, the request goes to the public Valhalla routing service at valhalla1.openstreetmap.de, run by the FOSSGIS community and built on OpenStreetMap data. It sends the route's coordinates (its stops, or the origin of a travel-time area) and the travel mode. Your browser makes the request itself, so the server also receives your IP address, its usual request headers (such as its user agent) and this site's address as the referrer: the address of the site only, not the page you are on or anything this site has stored. The server may log all of this. Nothing is sent before you ask. MapCairn stores nothing about the request, and the results are not saved or put in the page address.",
  "privacy.location.heading": "Your location",
  "privacy.location.body":
    "The Locate me button asks your browser for your position only when you press it. The position is used to show where you are on the map. It is not sent to this site and is not stored.",
  "privacy.contact.heading": "Contact",
  "privacy.contact.body":
    "For a question or concern about privacy, write to {email}, or open an issue on {issues}.",
  "privacy.contact.issuesLink": "GitHub",
  "privacy.backToProduct": "Back to the product page",
  "privacy.back": "Back to the map",
  "host.about.heading": "About",
  "host.about.text":
    "This site is open source software, released under the AGPL-3.0 licence. A cairn is a pile of stones that walkers add to, marking the way for whoever comes next. People have built them for thousands of years: the Cairn of Barnenez in Brittany was begun in the fifth millennium BC, and the word comes from the Gaelic càrn.",
  "host.about.link": "View the source code and licence on GitHub",
  "host.about.product": "About MapCairn, the SDK behind this map",
  "host.map.noScript":
    "The map needs JavaScript. You can still read about MapCairn, its source code and its privacy policy.",
  "host.map.summary":
    "The MapCairn playground is an interactive map built with the MapCairn SDK. Search for places or coordinates, measure distances and areas, draw and export shapes, compare basemaps and turn on open data layers.",
};
