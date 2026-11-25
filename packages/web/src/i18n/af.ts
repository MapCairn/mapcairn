// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MessageKey } from "@mapcairn/core";

/**
 * The Afrikaans messages, one for every key, in the same order as
 * `EN_GB_CATALOGUE`. The review is credited in `ATTRIBUTIONS.md` ("Translations").
 *
 * @remarks The register is everyday Afrikaans with "jy" and "jou". One word
 *   stands for one idea throughout: Lae (layers), Basiskaart (basemap),
 *   Instellings (settings), Aanwysings (directions), Vorms (shapes), Speld
 *   (pin), Voer in and Voer uit (import and export), item (a map feature),
 *   kaartmiddel (map centre) and aflyn (offline). Units after a number stay
 *   singular ("5 meter"), as Afrikaans writes them. `web/src/i18n/af.test.ts`
 *   checks the keys, the placeholders and the plural forms against English.
 */
export const AF_CATALOGUE: Record<MessageKey, string> = {
  "settings.title": "Instellings",
  "settings.theme.label": "Tema",
  "settings.theme.system": "Stelsel",
  "settings.theme.light": "Lig",
  "settings.theme.dark": "Donker",
  "settings.units.label": "Eenhede",
  "settings.units.metric": "Metriek",
  "settings.units.imperial": "Imperiaal",
  "settings.mapShape.label": "Kaartvorm",
  "settings.mapShape.flat": "Plat",
  "settings.mapShape.globe": "Aardbol",
  "settings.zoomButtons.label": "Wys zoemknoppies",
  "settings.zoomButtons.description":
    "Gewoonlik aan met 'n muis en af op raakskerms.",
  "settings.notSaved": "Veranderinge word nie op hierdie toestel onthou nie.",
  "settings.privacy.heading": "Privaatheid",
  "settings.privacy.link": "Lees die privaatheidsbeleid",
  "settings.privacy.default":
    "Die privaatheidsbeleid sê wat elke diens wat hierdie kaart gebruik, ontvang.",
  // Common joins
  "common.followedBy": "{first} {second}",
  "common.commaJoined": "{first}, {second}",
  "common.dotJoined": "{first} · {second}",
  // Formatting
  "format.hemisphereNorth": "N",
  "format.hemisphereSouth": "S",
  "format.hemisphereEast": "O",
  "format.hemisphereWest": "W",
  "format.wordNorth": "noord",
  "format.wordSouth": "suid",
  "format.wordEast": "oos",
  "format.wordWest": "wes",
  "format.wordDegree": "graad grade",
  "format.wordMinute": "minuut minute",
  "format.wordSecond": "sekonde sekondes",
  "format.day": "{date}",
  "format.utcTime": "{time} UTC",
  "format.utcRange": "{start} tot {end} UTC",
  "format.timeOnDay": "{time} op {day}",
  "search.coordinatesLabel": "Koördinate {latitude}, {longitude}",
  // Units and durations
  "units.metre": "{count} meter|{count} meter",
  "units.kilometre": "{count} kilometer|{count} kilometer",
  "units.foot": "{count} voet|{count} voet",
  "units.mile": "{count} myl|{count} myl",
  "units.squareMetre": "{count} vierkante meter|{count} vierkante meter",
  "units.hectare": "{count} hektaar|{count} hektaar",
  "units.squareKilometre":
    "{count} vierkante kilometer|{count} vierkante kilometer",
  "units.squareFoot": "{count} vierkante voet|{count} vierkante voet",
  "units.acre": "{count} akker|{count} akker",
  "units.squareMile": "{count} vierkante myl|{count} vierkante myl",
  "units.symbol.metre": "m",
  "units.symbol.kilometre": "km",
  "units.symbol.foot": "ft",
  "units.symbol.mile": "myl",
  "units.symbol.squareMetre": "m²",
  "units.symbol.hectare": "ha",
  "units.symbol.squareKilometre": "km²",
  "units.symbol.squareFoot": "ft²",
  "units.symbol.acre": "akker",
  "units.symbol.squareMile": "myl²",
  "units.reading": "{number} {symbol}",
  "duration.day": "{count} dag|{count} dae",
  "duration.hour": "{count} uur|{count} uur",
  "duration.minute": "{count} minuut|{count} minute",
  "duration.underMinute": "minder as 'n minuut",
  "scale.label": "Skaal: {distance}",
  // Errors
  "error.search.offline":
    "Dit lyk of jy aflyn is. Kyk na jou verbinding en probeer weer.",
  "error.search.rate-limited":
    "Te veel soektogte in 'n kort tyd. Wag 'n oomblik en probeer weer.",
  "error.search.failed":
    "Die soektog het nie gewerk nie. Probeer oor 'n oomblik weer.",
  "error.location.denied":
    "Toegang tot jou ligging is geblokkeer. Laat dit toe in jou blaaier se instellings, of soek eerder 'n plek.",
  "error.location.unavailable":
    "Jou ligging is nou nie beskikbaar nie. Kyk of liggingdienste aan is, of soek eerder 'n plek.",
  "error.location.timeout":
    "Dit het te lank gevat om jou ligging te kry. Probeer weer, of soek eerder 'n plek.",
  "error.routing.network":
    "Die roetediens kon nie bereik word nie. Jy is dalk aflyn. Kyk na jou verbinding en probeer weer.",
  "error.routing.rateLimited":
    "Die roetediens is besig. Wag 'n oomblik en probeer weer.",
  "error.routing.noRoute":
    "Geen roete tussen hierdie stoppe gevind nie. Skuif 'n stop nader aan 'n pad of paadjie, of kies 'n ander manier om te reis.",
  "error.routing.noReachableArea":
    "Niks is in daardie tyd van die eerste stop af bereikbaar nie. Skuif dit nader aan 'n pad of paadjie, of kies 'n ander manier om te reis.",
  "error.routing.invalid":
    "Die roetediens kon nie daardie stoppe gebruik nie. Skuif hulle en probeer weer.",
  "error.routing.unsupported":
    "Daardie manier van reis is nie hier beskikbaar nie. Kies 'n ander een.",
  // Directions
  "directions.participle.drive": "met die motor",
  "directions.participle.walk": "te voet",
  "directions.participle.cycle": "per fiets",
  // Layer status lines
  "describe.zoomIn":
    "Zoem in tot vlak {level} of nader om hierdie laag te laai.",
  "describe.zoomOut":
    "Zoem uit tot onder vlak {level} om hierdie laag te sien.",
  "describe.layersLoading": "Lae word gelaai",
  "describe.layersLoadFailed": "Die lae kon nie laai nie.",
  "describe.noLayers": "Geen lae is beskikbaar nie.",
  "describe.layersRefreshFailed":
    "Die lae kon nie opdateer nie. Die vorige lys word gewys.",
  "describe.layersSkipped":
    "{count} laag kon nie gewys word nie|{count} lae kon nie gewys word nie",
  "describe.tilesNoImagery":
    "Geen beelde vir {when} gevind nie. Probeer 'n ander een.",
  "describe.tilesUnavailable": "Kon nie laai nie. Kyk na jou verbinding.",
  "describe.tilesSlow":
    "Wag nog op beelde. Die verskaffer is dalk stadig of antwoord nie.",
  // Announcements
  "announce.layerLoaded": "{name}: {count} op die kaart gewys.",
  "announce.layerStatus": "{name}: {status}",
  "announce.layerCapped":
    "{name}: die eerste {shown} word gewys. Zoem in om meer te sien.",
  "announce.layerZoomIn":
    "{name}: zoem in tot vlak {level} of nader om hierdie laag te laai.",
  "announce.layerZoomOut":
    "{name}: zoem uit tot onder vlak {level} om hierdie laag te sien.",
  "announce.layerOn": "{name} is aan.",
  "announce.layersTurnedOff":
    "{count} laag afgeskakel. Jy kan dit ontdoen|{count} lae afgeskakel. Jy kan dit ontdoen",
  "announce.layersTurnedBackOn":
    "{count} laag weer aangeskakel|{count} lae weer aangeskakel",
  "announce.layerLoadFailed":
    "{name} kon nie laai nie. Kyk na jou verbinding en probeer weer.",
  "announce.layerInvalid":
    "{name} kon nie laai nie: die verskaffer het iets onverwags gestuur. Probeer later weer.",
  "announce.layerOffline":
    "{name} het nie gelaai nie omdat jy aflyn is. Probeer weer wanneer jy weer aanlyn is.",
  "announce.tilesRecovered": "{name}: die beelde wys weer.",
  "announce.imageSaved": "Kaartprent gestoor.",
  "announce.imageFailed":
    "Die kaartprent kon nie gestoor word nie. Probeer weer.",
  "announce.noFeaturesHere": "Geen items in die middel van die kaart nie.",
  "announce.featuresFound": "{count} items hier. Kies een uit die lys.",
  "announce.nothingFoundHere": "Niks hier gevind nie.",
  "announce.layersDidNotAnswer": "{names} het nie geantwoord nie.",
  "announce.askedOfAvailable": "{asked} van {available} lae gevra.",
  "announce.layerUnavailable":
    "{name} is nie meer beskikbaar nie en is afgeskakel.",
  "announce.layersUnavailable":
    "{count} lae is nie meer beskikbaar nie en is afgeskakel.",
  "announce.linkLayersUnavailable":
    "{count} laag in die skakel is nie beskikbaar nie.|{count} lae in die skakel is nie beskikbaar nie.",
  "announce.layersSkipped":
    "{count} laag kon nie gewys word nie.|{count} lae kon nie gewys word nie.",
  "announce.layersAdded": "{count} bygevoeg",
  "announce.layersRemoved": "{count} verwyder",
  "announce.layersUpdated": "Lae opgedateer: {changes}.",
  "announce.featureSelected": "{title} bygevoeg. {total} gekies.",
  "announce.featuresSelected":
    "{count} item bygevoeg. {total} gekies.|{count} items bygevoeg. {total} gekies.",
  "announce.featureDeselected": "{title} verwyder. {total} gekies.",
  "announce.featuresDeselected":
    "{count} item verwyder. {total} gekies.|{count} items verwyder. {total} gekies.",
  "announce.selectionCleared": "Keuse skoongemaak.",
  "announce.selectionFull":
    "Jy kan hoogstens {limit} kies. Niks is bygevoeg nie.",
  "announce.showingFeature": "{title} word op die kaart gewys.",
  "announce.detailShown": "Geraakte gebied van {title} op die kaart gewys.",
  "announce.detailError": "Die geraakte gebied kon nie laai nie. Probeer weer.",
  "announce.searchResults": "{count} resultaat|{count} resultate",
  "announce.searchPicked": "{label} word op die kaart gewys.",
  "announce.coordinateResult": "{results}, {label}",
  "announce.noResults": "Geen resultate",
  "announce.suggestions": "{count} voorstel|{count} voorstelle",
  "announce.noSuggestions": "Geen voorstelle",
  "announce.suggestionsUnavailable":
    "Voorstelle is nie beskikbaar nie. Druk Enter om te soek.",
  "announce.locationFound": "Ligging gevind, akkuraat tot sowat {accuracy}",
  "announce.copied": "Koördinate gekopieer",
  "announce.copyFailed":
    "Kon nie kopieer nie. Kies die koördinate en kopieer hulle self.",
  "announce.pinDropped": "Speld geplaas by {position}",
  "announce.pinCleared": "Speld verwyder",
  "announce.measureDistance": "Totale afstand {distance}",
  "announce.measureArea": "Totale oppervlakte {area}",
  "announce.basemapChanged": "Basiskaart verander na {name}",
  "announce.projection.flat": "Kaartvorm: plat",
  "announce.projection.globe": "Kaartvorm: aardbol",
  "announce.zoom": "Zoemvlak {level}",
  "announce.detent.peek": "Paneel kleingemaak",
  "announce.detent.half": "Paneel op halwe hoogte",
  "announce.detent.full": "Paneel op volle hoogte",
  "announce.surfaceOpened": "{name} oopgemaak",
  "announce.surfaceClosed": "{name} toegemaak",
  "announce.tileError":
    "Sommige dele van die kaart kon nie laai nie. Kyk na jou verbinding.",
  "announce.offline": "Jy is aflyn. Dele van die kaart laai dalk nie.",
  "announce.addressFound": "Adres gevind: {address}",
  "announce.addressNotFound": "Geen adres hier gevind nie",
  "announce.addressError":
    "Kon nie die adres opsoek nie. Kyk na jou verbinding en probeer weer.",
  "announce.stopAdded":
    "Stop {letter} bygevoeg, {count} stop|Stop {letter} bygevoeg, {count} stoppe",
  "announce.stopLimit":
    "Jy kan tot {max} stoppe byvoeg. Verwyder een om nog een by te voeg.",
  "announce.stopRemoved": "Stop {letter} verwyder",
  "announce.stopMoved":
    "Stop geskuif na plek {position} van {total}, nou stop {letter}",
  "announce.routeFound": "Roete gevind, {distance}, {duration} {mode}",
  "announce.areaFound":
    "Gebied binne {count} minuut {mode} gevind, {area} groot|Gebied binne {count} minute {mode} gevind, {area} groot",
  "announce.routingCancelled": "Gekanselleer",
  "announce.directionsCleared": "Aanwysings skoongemaak",
  "announce.tourSkipped":
    "Toer oorgeslaan. Hulp, in Instellings, kan dit weer begin.",
  "announce.timeMoved": "Tyd geskuif na {time}, die naaste beskikbare.",
  // Drawing
  "draw.hint.point":
    "Tik op die kaart om 'n punt te plaas, of gebruik Plaas punt in die kaartmiddel.",
  "draw.hint.line":
    "Tik op die kaart om punte by te voeg, dan Voltooi. Of gebruik Plaas punt in die kaartmiddel.",
  "draw.hint.polygon":
    "Tik op die kaart om hoeke by te voeg, dan Voltooi. Of gebruik Plaas punt in die kaartmiddel.",
  "draw.hint.circle":
    "Tik op die middelpunt en dan op 'n tweede punt vir die radius. Of gebruik Plaas punt in die kaartmiddel.",
  "draw.issue.too-few-vertices":
    "Nog nie genoeg punte nie. 'n Lyn het twee punte nodig en 'n veelhoek drie.",
  "draw.issue.self-intersecting":
    "Die kante kruis mekaar. Skuif 'n punt sodat hulle nie kruis nie, en voltooi dan.",
  "draw.issue.degenerate":
    "Dit sal geen grootte hê nie. Kies 'n plek verder van die ander af.",
  "draw.issue.radius-missing":
    "Tik op 'n tweede punt om die sirkel se radius te stel.",
  "draw.issue.radius-too-large":
    "Daardie radius is te groot. Dit kan hoogstens 10 000 km wees.",
  "draw.measure.circle": "radius {radius}, oppervlakte {area}",
  "draw.measure.line": "lengte {length}",
  "draw.measure.polygonArea": "oppervlakte {area}",
  "draw.measure.polygon": "oppervlakte {area}, omtrek {perimeter}",
  "draw.measure.radiusAndArea": "{radius} radius · {area}",
  "draw.sentence.circle": "Radius {radius}, oppervlakte {area}.",
  "draw.sentence.line": "Lengte {length}.",
  "draw.sentence.polygonArea": "Oppervlakte {area}.",
  "draw.sentence.polygon": "Oppervlakte {area}, omtrek {perimeter}.",
  "draw.vertexAdded": "Punt {count} bygevoeg.",
  "draw.vertexAddedTo": "Punt {count} by {label} gevoeg.",
  "draw.circleChanged": "{label} verander.",
  "draw.pointMoved": "{label} geskuif.",
  "draw.vertexMoved": "Punt {index} van {label} geskuif.",
  "draw.vertexInserted": "Punt by {label} gevoeg as punt {index} van {count}.",
  "draw.vertexRemoved":
    "Punt uit {label} verwyder. {count} punt oor.|Punt uit {label} verwyder. {count} punte oor.",
  "draw.pointAdded": "{label} bygevoeg.",
  "draw.finished": "{label} voltooi.",
  "draw.vertexSelected": "Punt {index} van {count} in {label} gekies.",
  "draw.pathSelected":
    "{label} gekies. {count} punt.|{label} gekies. {count} punte.",
  "draw.shapeSelected": "{label} gekies.",
  "draw.discarded.point": "Onvoltooide punt weggegooi.",
  "draw.discarded.line": "Onvoltooide lyn weggegooi.",
  "draw.discarded.polygon": "Onvoltooide veelhoek weggegooi.",
  "draw.discarded.circle": "Onvoltooide sirkel weggegooi.",
  "draw.deleted": "{label} uitgevee. Ontdoen bring dit terug.",
  "draw.clearedOne": "1 vorm uitgevee.",
  "draw.clearedAll": "Al {count} vorms uitgevee.",
  "draw.undone": "Ontdoen.",
  "draw.redone": "Herdoen.",
  "draw.loaded":
    "{count} vorm uit die skakel gelaai.|{count} vorms uit die skakel gelaai.",
  "draw.import.refusal.drawing-full":
    "Dan sal daar meer as {max} vorms wees. Vee eers 'n paar vorms uit, of voer 'n kleiner lêer in.",
  "draw.import.refusal.empty": "Die lêer is leeg.",
  "draw.import.refusal.too-large":
    "Die lêer is groter as {megabytes} MB. Verdeel dit in kleiner lêers.",
  "draw.import.refusal.too-deep":
    "Die lêer is te diep genestel om te lees. Kyk of dit GeoJSON is.",
  "draw.import.refusal.not-recognised":
    "Dit is nie GeoJSON, WKT of 'n CSV met vorms van hierdie kaart nie. Kies 'n .geojson-, .json-, .wkt-, .txt- of .csv-lêer.",
  "draw.import.refusal.wkt-unreadable":
    "Die WKT kon nie gelees word nie, so niks uit die lêer is ingevoer nie.",
  "draw.import.refusal.too-many-shapes":
    "Die lêer het meer as {max} vorms. Voer hoogstens {max} op 'n slag in.",
  "draw.import.refusal.too-many-points":
    "Die lêer het meer as {max} punte. Vereenvoudig die vorms of verdeel die lêer.",
  "draw.import.refusalWithDetail": "{refusal} {detail}",
  "draw.import.skip.self-intersecting": "{count} met kante wat kruis",
  "draw.import.skip.degenerate": "{count} sonder lengte of oppervlakte",
  "draw.import.skip.too-few-vertices": "{count} met te min punte",
  "draw.import.skip.radius-missing": "{count} sonder radius",
  "draw.import.skip.radius-too-large":
    "{count} met 'n radius van meer as 10 000 km",
  "draw.import.skip.out-of-range": "{count} met 'n posisie buite die wêreld",
  "draw.import.skip.too-many-points": "{count} met meer as {max} punte",
  "draw.import.skip.malformed":
    "{count} met koördinate wat nie gelees kon word nie",
  "draw.import.skip.unsupported":
    "{count} van 'n soort wat nie geteken kan word nie",
  "draw.import.skip.other-srid":
    "{count} in 'n ander koördinaatstelsel as SRID {srid}",
  "draw.import.skipped": "{total} oorgeslaan: {reasons}.",
  "draw.import.noShapes": "Die lêer het geen vorms nie.",
  "draw.import.noneImported": "Geen vorms ingevoer nie.",
  "draw.import.imported": "{count} vorm ingevoer.|{count} vorms ingevoer.",
  "draw.import.holesLeftOut":
    "Gate in {count} veelhoek is uitgelaat.|Gate in {count} veelhoeke is uitgelaat.",
  "draw.import.axisHint.lat-lng":
    "Geen vorms ingevoer nie. Die eerste posisie lê buite die wêreld as lengtegraad, breedtegraad, maar dit pas as breedtegraad, lengtegraad.",
  "draw.import.axisHint.lng-lat":
    "Geen vorms ingevoer nie. Die eerste posisie lê buite die wêreld as breedtegraad, lengtegraad, maar dit pas as lengtegraad, breedtegraad.",
  "common.itemCount": "{count} item|{count} items",
  "settings.language.label": "Taal",
  "settings.language.auto": "Outomaties",
  "settings.language.loadFailed": "{language} kon nie gelaai word nie.",
  "settings.language.tryAgain": "Probeer weer",
  // Components: chrome, host, ui, panels and the app shell
  "chrome.endStack.label": "Kaartgereedskap",
  "chrome.endStack.resetBearing": "Draai kaart terug na noord",
  "chrome.endStack.controls": "Kaartbeheer",
  "chrome.endStack.mapOptions": "Kaartopsies",
  "chrome.endStack.measure": "Meet afstand en oppervlakte",
  "chrome.endStack.directions": "Aanwysings",
  "chrome.endStack.draw": "Teken vorms",
  "chrome.endStack.locate": "Vind my",
  "chrome.endStack.settings": "Instellings",
  "chrome.endStack.zoomControls": "Zoembeheer",
  "chrome.endStack.zoomIn": "Zoem in",
  "chrome.endStack.zoomOut": "Zoem uit",
  "chrome.attribution.label": "Kaarterkennings",
  "chrome.readout.label": "Kaartskaal",
  "chrome.readout.zoomShort": "z {level}",
  "chrome.readout.zoomSpoken": "Zoemvlak {level}",
  "chrome.readout.zoomSpokenAfterPosition": ", Zoemvlak {level}",
  "chrome.sheet.resize": "Verander paneelgrootte",
  "chrome.sheet.close": "Maak toe",
  "host.map.label": "Kaart",
  "host.map.named": "{name} ({label})",
  "host.map.roleDescription": "kaart",
  "ui.skipToMap": "Spring na die kaart",
  "ui.dismiss": "Maak toe",
  "panels.basemap.title": "Basiskaart",
  "panels.basemap.groupLabel": "Basiskaart",
  "panels.basemap.tryAgain": "Probeer weer",
  "panels.basemap.unavailable": "Nou nie beskikbaar nie",
  "panels.shapes.title": "Vorms",
  "panels.shapes.empty":
    "Nog niks geteken nie. Kies Teken vorms op die kaart om te begin.",
  "panels.shapes.listLabel": "Getekende vorms",
  "panels.shapes.unfinished": "{label}, onvoltooid",
  "panels.shapes.deleteSelected": "Vee gekose vorm uit",
  "panels.shapes.deleteAll": "Vee alle vorms uit",
  "panels.shapes.importHeading": "Voer in",
  "panels.shapes.import": "Voer GeoJSON, CSV of WKT in",
  "panels.shapes.axisOrderLabel": "WKT-koördinaatvolgorde",
  "panels.shapes.axisOrder.lng-lat": "Lengtegraad, breedtegraad (verstek)",
  "panels.shapes.axisOrder.lat-lng": "Breedtegraad, lengtegraad",
  "panels.shapes.axisReread.lat-lng": "Lees as breedtegraad, lengtegraad",
  "panels.shapes.axisReread.lng-lat": "Lees as lengtegraad, breedtegraad",
  "panels.shapes.exportHeading": "Voer uit",
  "panels.shapes.downloadGeoJson": "Laai GeoJSON af",
  "panels.shapes.downloadCsv": "Laai CSV af",
  "panels.shapes.downloadWkt": "Laai WKT af",
  "panels.shapes.copyLink": "Kopieer skakel met vorms",
  "panels.shapes.storageNote":
    "Vorms bly in hierdie blaaier en word nie gestoor nie. Lêers word op jou toestel gemaak en gelees, en niks word opgelaai nie. 'n Skakel met vorms hou hulle in sy adres, so enigiemand vir wie jy dit stuur, kan hulle sien.",
  "panels.help.title": "Hulp",
  "panels.help.tourHeading": "Toer",
  "panels.help.tourDescription":
    "'n Paar kort stappe wat die vernaamste beheerknoppies wys deur hulle te gebruik.",
  "panels.help.tourStart": "Begin die toer",
  "panels.help.searchHeading": "Soek",
  "panels.help.searchDescription":
    "Tik 'n pleknaam of 'n koördinaatpaar, soos -26.2041, 28.0473 of 26.2041° S, 28.0473° O, en druk dan Enter of Soek. Skryf elke waarde met 'n desimale punt of 'n gradeteken. 'n Desimale komma werk ook as 'n kommapunt die waardes skei, of as spasies dit doen en elke getal 'n komma het. Koördinate word op hierdie toestel gelees en nie na die geokodeerder gestuur nie; die kaart laai dan kaartteëls vir daardie gebied, soos met enige skuif.",
  "panels.help.keyboardHeading": "Sleutelbord",
  "panels.help.drawingHeading": "Teken",
  "panels.help.accessibilityHeading": "Toeganklikheid",
  "panels.help.accessibilityDescription":
    "MapCairn mik om aan WCAG 2.2 vlak AA te voldoen. Elke aksie wat 'n gebaar gebruik, soos 'n lang druk of 'n sleep, het ook 'n knoppie of 'n sleutelbordkortpad.",
  "panels.pin.title": "Speld",
  "panels.pin.drop": "Plaas speld in die kaartmiddel",
  "panels.pin.note": "Daar is 'n speld op die kaart.",
  "panels.export.title": "Stoor prent",
  "panels.export.description":
    "Stoor die kaart soos dit nou lyk, met sy lae en erkennings, as 'n PNG-lêer. Dit word in jou blaaier gemaak en nêrens heen gestuur nie.",
  "panels.export.save": "Stoor prent",
  "panels.export.error":
    "Die kaartprent kon nie gestoor word nie. Probeer weer.",
  "app.reload": "Herlaai",
  "app.loadingMap": "Die kaart word gelaai",
  "app.sheetTitle.directions": "Aanwysings",
  "app.sheetTitle.settings": "Instellings en hulp",
  "app.sheetTitle.mapOptions": "Kaartopsies",
  "app.error.notFound.title": "Bladsy nie gevind nie",
  "app.error.notFound.message":
    "Daar is niks by hierdie adres nie. Kyk na die skakel, of gaan terug na die kaart.",
  "app.error.notFound.link": "Gaan na die kaart",
  "app.error.unexpected.title": "Iets het skeefgeloop",
  "app.error.unexpected.message":
    "MapCairn het gestop weens 'n onverwagte probleem. Herlaai die bladsy om oor te begin. Jou instellings bly behoue.",
  "app.banner.engineFailed":
    "Die kaart kon nie begin nie. Herlaai die bladsy om weer te probeer.",
  "app.banner.engineStopped":
    "Die kaart het opgehou werk. Herlaai die bladsy om weer te probeer.",
  "app.banner.basemapFailed": "Daardie basiskaart kon nie laai nie.",
  "app.banner.basemapUnavailable": "{name} is nou nie beskikbaar nie.",
  "app.banner.retry": "Probeer weer",
  "app.banner.tryAgain": "Probeer weer",
  "app.banner.online": "Jy is weer aanlyn.",
  "app.banner.usePreviousBasemap": "Gebruik vorige basiskaart",
  "app.webgl.title": "MapCairn het WebGL nodig om die kaart te teken.",
  "app.webgl.advice":
    "Hierdie blaaier het WebGL afgeskakel of ondersteun dit nie. Probeer 'n ander blaaier, of skakel hardewareversnelling aan in jou blaaier se instellings.",
  "app.tour.layers.heading": "Skakel 'n laag aan",
  "app.tour.layers.text":
    "Maak Kaartopsies oop en skakel enige laag onder Lae aan.",
  "app.tour.mapShape.heading": "Probeer die aardbol",
  "app.tour.mapShape.text":
    "Maak Instellings oop en kies Plat of Aardbol by Kaartvorm. Hulp, net daaronder, wys die sleutels en begin die toer weer.",
  "app.tour.search.heading": "Vind 'n plek",
  "app.tour.search.text": "Tik 'n pleknaam in Soek en druk Enter.",
  "app.tour.welcome.heading": "Nuut by MapCairn?",
  "app.tour.welcome.text":
    "Data soos aardbewings en brande word eers geteken wanneer jy die laag aanskakel. Hierdie toer van drie stappe wys hoe.",
  "app.tour.welcome.announcement":
    "Nuut by MapCairn? 'n Toer van drie stappe volg ná die soekbalk, met Begin die toer en Slaan oor.",
  "app.tour.ending.heading": "Toer klaar",
  "app.tour.ending.text": "Hulp, in Instellings, kan dit weer begin.",
  // Short durations
  "duration.short.day": "{count} d",
  "duration.short.hour": "{count} uur",
  "duration.short.minute": "{count} min",
  "duration.short.underMinute": "Minder as 1 min",
  // Travel modes and stops
  "directions.mode.drive": "Ry",
  "directions.mode.walk": "Stap",
  "directions.mode.cycle": "Fiets",
  "directions.stop": "Stop {letter}, {place}",
  // Default shape labels
  "draw.shapeLabel.point": "Punt {serial}",
  "draw.shapeLabel.line": "Lyn {serial}",
  "draw.shapeLabel.polygon": "Veelhoek {serial}",
  "draw.shapeLabel.circle": "Sirkel {serial}",
  // WKT reader faults
  "wkt.atPosition": "{fault} by posisie {position}.",
  "wkt.unexpectedCharacter": "Onverwagte karakter",
  "wkt.unexpectedText": "Onverwagte teks ná die geometrie",
  "wkt.expectedKeyword": 'Het "{kind}" verwag',
  "wkt.expectedNumber": "Het 'n getal verwag",
  "wkt.invalidNumber": "Nie 'n geldige getal nie",
  "wkt.zNeedsThree": "'n Z-posisie het drie getalle nodig",
  "wkt.expectedSrid": "Het 'n SRID verwag",
  "wkt.sridDigits": "'n SRID moet 'n heelgetal van hoogstens {max} syfers wees",
  "wkt.expectedType": "Het 'n geometriesoort verwag",
  "wkt.unknownType": 'Onbekende geometriesoort "{keyword}"',
  "wkt.unexpectedWord": "Onverwagte woord",
  "wkt.nestedTooDeep": "Geometrieversamelings is te diep genestel",
  "wkt.mixedBrackets": "Punte moet almal tussen hakies staan of almal sonder",
  "wkt.measureUnsupported":
    "Koördinate met 'n meetwaarde (M) word nie ondersteun nie.",
  "wkt.typeUnsupported": "Die WKT-soort {keyword} word nie ondersteun nie.",
  "wkt.onlySrid":
    "Net SRID {supported} (WGS 84) word ondersteun, nie SRID {srid} nie.",
  // Layer formatters and class labels
  "layers.formatter.agoDay": "{count} dag gelede|{count} dae gelede",
  "layers.formatter.agoHour": "{count} uur gelede|{count} uur gelede",
  "layers.formatter.agoMinute": "{count} minuut gelede|{count} minute gelede",
  "layers.formatter.inDay": "oor {count} dag|oor {count} dae",
  "layers.formatter.inHour": "oor {count} uur|oor {count} uur",
  "layers.formatter.inMinute": "oor {count} minuut|oor {count} minute",
  "layers.formatter.justNow": "nou net",
  "layers.interval.upTo": "Tot {high}{unit}",
  "layers.interval.andAbove": "{low}{unit} en meer",
  "layers.interval.range": "{low} tot {high}{unit}",
  // Tools: shared
  "tools.done": "Klaar",
  "tools.addPointAtCentre": "Plaas punt in die kaartmiddel",
  "tools.tryAgain": "Probeer weer",
  // Tools: measure
  "tools.measure.region": "Meting",
  "tools.measure.label": "Meet",
  "tools.measure.distance": "Afstand",
  "tools.measure.area": "Oppervlakte",
  "tools.measure.total": "Totaal",
  "tools.measure.undo": "Ontdoen laaste punt",
  "tools.measure.clear": "Vee punte uit",
  "tools.measure.hint":
    "Tik op die kaart om punte by te voeg, of gebruik Plaas punt in die kaartmiddel.",
  // Tools: draw
  "tools.draw.region": "Tekening",
  "tools.draw.toolbar": "Teken",
  "tools.draw.shapeToDraw": "Vorm om te teken",
  "tools.draw.mode.point": "Punt",
  "tools.draw.mode.line": "Lyn",
  "tools.draw.mode.polygon": "Veelhoek",
  "tools.draw.mode.circle": "Sirkel",
  "tools.draw.selectedPoints": "{label}, {count} punt|{label}, {count} punte",
  "tools.draw.selectedPoint": "{label}, punt {index} van {total}",
  "tools.draw.previousPoint": "Vorige punt",
  "tools.draw.nextPoint": "Volgende punt",
  "tools.draw.insertPoint": "Plaas punt ná hierdie een in die kaartmiddel",
  "tools.draw.removePoint": "Verwyder punt",
  "tools.draw.smallerRadius": "Kleiner radius",
  "tools.draw.largerRadius": "Groter radius",
  "tools.draw.radiusToCentre": "Stel radius tot by die kaartmiddel",
  "tools.draw.movePoint": "Skuif punt na die kaartmiddel",
  "tools.draw.cancelShape": "Kanselleer vorm",
  "tools.draw.deleteShape": "Vee vorm uit",
  "tools.draw.undo": "Ontdoen",
  "tools.draw.redo": "Herdoen",
  "tools.draw.shapesAndExport": "Vorms en uitvoer",
  "tools.draw.finish": "Voltooi",
  "tools.draw.selectedHint":
    "Sleep 'n punt om dit te skuif, of gebruik die pyltjies. Escape gaan een stap terug.",
  "tools.draw.status.empty": "Nog niks geteken nie",
  "tools.draw.status.drawing": "{label}, {count} punt|{label}, {count} punte",
  "tools.draw.status.shapes": "{count} vorm|{count} vorms",
  "tools.draw.file.unreadable":
    "Die lêer kon nie gelees word nie. Kies dit weer, of 'n ander lêer.",
  "tools.draw.file.unsupported":
    "Hierdie blaaier kan nie hier lêers oopmaak nie.",
  "tools.draw.linkLimitNote":
    "'n Skakel dra hoogstens {max} vorms, so laai 'n lêer af om almal te deel.",
  "tools.draw.nothingToExport":
    "Nog niks om uit te voer nie. Voltooi eers 'n vorm.",
  "tools.draw.saved":
    "{count} vorm gestoor as {filename}.|{count} vorms gestoor as {filename}.",
  "tools.draw.saveFailed":
    "Die lêer kon nie gestoor word nie. Probeer eerder 'n skakel kopieer.",
  "tools.draw.tooManyToShare":
    "Te veel vorms om in 'n skakel te deel. Voer eerder 'n lêer uit.",
  "tools.draw.nothingToShare": "Nog niks om te deel nie. Voltooi eers 'n vorm.",
  "tools.draw.nothingToCopy":
    "Niks om te kopieer nie: {count} vorm is te klein vir 'n skakel. Voer eerder 'n lêer uit.|Niks om te kopieer nie: {count} vorms is te klein vir 'n skakel. Voer eerder 'n lêer uit.",
  "tools.draw.linkCopied": "Skakel met vorms gekopieer.",
  "tools.draw.linkCopiedLeftOut":
    "Skakel met vorms gekopieer. {count} vorm is te klein vir 'n skakel en is uitgelaat. Voer 'n lêer uit om dit te hou.|Skakel met vorms gekopieer. {count} vorms is te klein vir 'n skakel en is uitgelaat. Voer 'n lêer uit om hulle te hou.",
  "tools.draw.linkCopyFailed":
    "Die skakel kon nie gekopieer word nie. Voer eerder 'n lêer uit.",
  // Tools: pin card
  "tools.pin.heading": "Geplaasde speld",
  "tools.pin.close": "Maak speld toe",
  "tools.pin.noAddress": "Geen adres hier gevind nie.",
  "tools.pin.lookUp": "Soek adres op",
  "tools.pin.lookingUp": "Adres word opgesoek",
  "tools.pin.lookupFailed":
    "Kon nie die adres opsoek nie. Kyk na jou verbinding en probeer weer.",
  "tools.pin.lookupNote":
    "Stuur die speld se posisie, tot op sowat 11 m, na die adresdiens.",
  "tools.pin.copy": "Kopieer koördinate",
  "tools.pin.clear": "Verwyder speld",
  "tools.pin.copied": "Gekopieer",
  "tools.pin.copyFailed": "Kon nie kopieer nie",
  // Tools: search
  "tools.search.label": "Soek",
  "tools.search.places": "Soek plekke",
  "tools.search.clear": "Vee soektog uit",
  "tools.search.suggestions": "Voorstelle",
  "tools.search.results": "Soekresultate",
  "tools.search.searching": "Soek tans...",
  "tools.search.nothingMatched": "Niks gevind vir daardie soektog nie.",
  "tools.search.unavailable": "Soek werk nou nie. Probeer asseblief weer.",
  "tools.search.retry": "Probeer weer",
  // Tools: locate
  "tools.locate.locating": "Soek jou ligging...",
  // Tools: tour
  "tools.tour.progress": "Stap {step} van {total}",
  "tools.tour.take": "Begin die toer",
  "tools.tour.skip": "Slaan oor",
  "tools.tour.next": "Verder",
  "tools.tour.finish": "Klaar",
  "tools.tour.skipTour": "Slaan oor",
  "tools.tour.close": "Maak toe",
  "tools.tour.stepAnnouncement": "{progress}, {heading}. {text}",
  "tools.tour.finished": "Toer klaar.",
  // Tools: directions
  "tools.directions.note":
    "Niks word gestuur voordat jy vra nie. Kry roete stuur die stoppe en die manier van reis na die roetediens. 'n Reistydgebied stuur die eerste stop.",
  "tools.directions.stops": "Stoppe",
  "tools.directions.stopsHint":
    "Tik op die kaart om 'n stop by te voeg, of gebruik Plaas stop in die kaartmiddel.",
  "tools.directions.stopPrefix": "Stop {letter}:",
  "tools.directions.moveUp": "Skuif stop {letter} op",
  "tools.directions.moveDown": "Skuif stop {letter} af",
  "tools.directions.remove": "Verwyder stop {letter}",
  "tools.directions.addAtCentre": "Plaas stop in die kaartmiddel",
  "tools.directions.addPin": "Voeg geplaasde speld by",
  "tools.directions.droppedPin": "Geplaasde speld",
  "tools.directions.full":
    "Jy kan tot {max} stoppe byvoeg. Verwyder een om nog een by te voeg.",
  "tools.directions.route": "Roete",
  "tools.directions.travelMode": "Reiswyse",
  "tools.directions.getRoute": "Kry roete",
  "tools.directions.cancel": "Kanselleer",
  "tools.directions.needTwo":
    "Voeg ten minste twee stoppe by om 'n roete te kry.",
  "tools.directions.searchHeading": "Soek 'n stop om by te voeg",
  "tools.directions.searchForm": "Soek 'n stop",
  "tools.directions.searchInput": "Soek 'n plek om as stop by te voeg",
  "tools.directions.searchPlaceholder": "Soek 'n plek",
  "tools.directions.placesFound": "Plekke gevind",
  "tools.directions.addPlace": "Voeg {place} by",
  "tools.directions.areaHeading": "Reistydgebied",
  "tools.directions.areaHint":
    "Wys hoe ver jy van stop A af kan kom in die tyd wat jy kies.",
  "tools.directions.showArea":
    "Wys die gebied wat binne {count} minuut bereikbaar is|Wys die gebied wat binne {count} minute bereikbaar is",
  "tools.directions.findingRoute": "Soek 'n roete...",
  "tools.directions.findingArea": "Soek die gebied...",
  "tools.directions.clear": "Vee aanwysings uit",
  "tools.directions.legs": "Skofte",
  "tools.directions.reachesArea": "Bereik 'n gebied van {area} van stop A af.",
  "tools.directions.routeSummary":
    "{mode}, {how}, oor {count} stop.|{mode}, {how}, oor {count} stoppe.",
  "tools.directions.leg": "{from} na {to}: {distance}, {duration}",
  // Layers
  "layers.title": "Lae",
  "layers.intro":
    "Oop data van openbare verskaffers. Niks word opgevra voordat jy 'n laag aanskakel nie.",
  "layers.theFeature": "die item",
  "layers.tryAgain": "Probeer weer",
  "layers.usesCost": "Gebruik {cost}.",
  "layers.keyFor": "Legende vir {name}",
  "layers.status.loading": "Laai tans",
  "layers.status.updated": "Opgedateer {time}, {count} gewys",
  "layers.status.updatedCapped":
    "Opgedateer {time}. Die eerste {count} word gewys. Zoem in om meer te sien.",
  "layers.status.updatedEmpty": "Opgedateer {time}. {text}",
  "layers.status.loadFailedNetwork": "Kon nie laai nie. Kyk na jou verbinding.",
  "layers.status.loadFailedOffline": "Kon nie laai nie. Jy is aflyn.",
  "layers.status.loadFailedInvalid":
    "Kon nie laai nie: die verskaffer het iets onverwags gestuur.",
  "layers.identify.hint":
    "Tik op die kaart om besonderhede vir hierdie laag te sien.",
  "layers.identify.cap":
    "Slegs die eerste {count} lae word met een tik nagevra.",
  "layers.identify.lookingUp": "Soek tans wat hier is",
  "layers.list.summary": "Lys van {count} op die kaart",
  "layers.list.sortBy": "Sorteer volgens",
  "layers.list.showOnMap": "wys op kaart",
  "layers.list.showAll": "Wys al {count}",
  "layers.card.close": "Maak kaartjie toe",
  "layers.card.opensInNewTab": "(maak in 'n nuwe oortjie oop)",
  "layers.card.back": "Terug na lys",
  "layers.card.showOnMap": "Wys op kaart",
  "layers.card.hideArea": "Versteek geraakte gebied",
  "layers.card.areaFailed": "Die geraakte gebied kon nie laai nie.",
  "layers.choices.heading": "{count} item hier|{count} items hier",
  "layers.choices.close": "Maak lys toe",
  "layers.choices.hint": "Kies een om sy besonderhede te sien.",
  "layers.choices.openDetails": "maak besonderhede oop",
  "layers.turnOff.all": "Skakel alle lae af",
  "layers.turnOff.count": "{count} aan",
  "layers.turnOff.group": "Skakel {count} in {group} af",
  "layers.turnOff.doneAll": "{count} laag afgeskakel.|{count} lae afgeskakel.",
  "layers.turnOff.undo": "Ontdoen",
  "layers.turnOff.undoAll":
    "Ontdoen, skakel {count} laag weer aan|Ontdoen, skakel {count} lae weer aan",
  "layers.turnOff.doneGroup": "{count} in {group} afgeskakel.",
  "layers.turnOff.undoGroup": "Ontdoen, skakel {count} in {group} weer aan",
  "layers.key.title": "Kaartlegende",
  "layers.key.toggle": "Legende, {count} laag|Legende, {count} lae",
  "layers.key.chip": "Legende, {count} laag|Legende, {count} lae",
  "layers.key.scrolling": "Laaglegendes",
  "layers.key.showing": "Wys tans {time}",
  "layers.key.nameKey": "Legende vir {name}",
  "layers.time.date": "Datum (UTC)",
  "layers.time.time": "Tyd (UTC)",
  "layers.time.status":
    "Wys tans {slot}. Nuutste beskikbaar: {newest}. Nuwer tye is dalk nog nie uit nie, so jy kan hulle nie kies nie.",
  // Definition text: layer and basemap fields, keyboard help
  "layer.cyclones.name": "Tropiese siklone",
  "layer.cyclones.description":
    "Huidige tropiese storms en siklone met hul sterkste winde. Wys geraakte gebied teken die baan en die windsones.",
  "layer.cyclones.emptyText":
    "Geen waarskuwings vir tropiese siklone op die oomblik nie.",
  "layer.group.floodsStormsAndDroughts": "Vloede, storms en droogtes",
  "layer.drought-alerts.name": "Droogtewaarskuwings",
  "layer.drought-alerts.description":
    "Huidige droogtes wat GDACS gradeer volgens hul impak op mense.",
  "layer.drought-alerts.emptyText":
    "Geen droogtewaarskuwings op die oomblik nie.",
  "layer.group.imagery": "Beelde",
  "layer.control.opacity": "Ondeursigtigheid",
  "layer.earthquakes.name": "Aardbewings",
  "layer.earthquakes.description":
    "Aardbewings wêreldwyd soos die US Geological Survey dit aanteken, sowat elke minuut opgedateer.",
  "layer.earthquakes.emptyText": "Geen aardbewings in hierdie tydperk nie.",
  "layer.group.earthquakesAndVolcanoes": "Aardbewings en vulkane",
  "layer.earthquakes.control.window.label": "Tydperk",
  "layer.earthquakes.control.window.option.hour": "Uur",
  "layer.earthquakes.control.window.option.day": "Dag",
  "layer.earthquakes.control.window.option.week": "Week",
  "layer.earthquakes.control.small.label": "Wys ook kleiner aardbewings",
  "layer.earthquakes.control.small.description":
    "Onder sterkte 2,5, vir die afgelope dag. Tot sowat 130 KB.",
  "layer.earthquakes.key.1": "Onder 2,5",
  "layer.earthquakes.key.2": "2,5 tot 4,4",
  "layer.earthquakes.key.3": "4,5 tot 5,9",
  "layer.earthquakes.key.4": "6 tot 6,9",
  "layer.earthquakes.key.5": "7 en meer",
  "layer.earthquakes.card.link": "Besonderhede op die USGS-webwerf",
  "layer.earthquakes.sort.newest": "Nuutste",
  "layer.earthquakes.sort.strongest": "Sterkste",
  "layer.fire-alerts.name": "Brandwaarskuwings",
  "layer.fire-alerts.description":
    "Huidige veldbrande wat GDACS gradeer volgens hul impak op mense, met die gebied wat afgebrand het.",
  "layer.fire-alerts.emptyText":
    "Geen veldbrandwaarskuwings op die oomblik nie.",
  "layer.group.fires": "Brande",
  "layer.fire-hotspots-viirs.name": "Brandkolle, skerper",
  "layer.fire-hotspots-viirs.description":
    "Dieselfde soort hittemerke van die VIIRS-sensor op die NOAA-21-satelliet, op sowat 375 m. Gebruik sowat vyf keer meer data.",
  "layer.control.date": "Datum",
  "layer.fire-hotspots.name": "Brandkolle",
  "layer.fire-hotspots.description":
    "Plekke waar die MODIS-sensor op die Terra-satelliet op die gekose dag ongewone hitte gesien het, soos brande. Elke merk is sowat 1 km.",
  "layer.flood-alerts.name": "Vloedwaarskuwings",
  "layer.flood-alerts.description":
    "Huidige vloede wat GDACS gradeer volgens hul impak op mense.",
  "layer.flood-alerts.emptyText": "Geen vloedwaarskuwings op die oomblik nie.",
  "layer.imagery.name": "Satellietbeelde",
  "layer.imagery.description":
    "'n Daaglikse prent in ware kleur van die hele aarde van die NOAA-21-satelliet, met daardie dag se wolke, anders as die Satelliet-basiskaart. Die fynste detail is sowat 300 m.",
  "layer.population.name": "Waar mense woon",
  "layer.population.description":
    "Bevolkingsdigtheid oor die hele wêreld in 2020, van donker en leeg tot helder en druk. Die fynste detail is sowat 5 km. Antarktika word nie gewys nie.",
  "layer.group.people": "Mense",
  "layer.rainfall-half-hourly.name": "Reënval, elke halfuur",
  "layer.rainfall-half-hourly.description":
    "Reën wat uit satelliete vir die hele aarde geskat word, as die reëntempo in een halfuur in millimeter per uur (mm per uur). Reën gaan van groen (lig, tot sowat 1) deur geel en oranje (sowat 1 tot 4) na rooi (sowat 5 tot 20) en donkerrooi (swaar, oor 20; die skaal stop by 53). Sneeu en ander bevrore neerslag gebruik ligte siaan, blou en pers oor dieselfde stappe. Niks onder 0,1 word geteken nie. Elke halfuur kom ses tot sewe uur laat, en die fynste detail is sowat 10 km.",
  "layer.rainfall-half-hourly.disclaimer":
    "Nie 'n voorspelling nie, en nie vir waarskuwings nie. Dit is 'n skatting uit satelliete, growwer as radar, en kan reën mis of oorskat. Onlangse halfure is vroeë skattings wat NASA later hersien. Gebruik jou nasionale weerdiens vir waarskuwings.",
  "layer.rainfall-half-hourly.control.time.label": "Halfuur gewys",
  "layer.rainfall-half-hourly.control.time.description":
    "'n Paar halfure het geen data nie. As teëls nie laai nie, probeer 'n ander tyd.",
  "layer.rainfall.name": "Reënval",
  "layer.rainfall.description":
    "Reën wat uit satelliete vir die hele aarde geskat word, as die reëntempo vir die gekose dag in millimeter per uur (mm per uur). Reën gaan van groen (lig, tot sowat 1) deur geel en oranje (sowat 1 tot 4) na rooi (sowat 5 tot 20) en donkerrooi (swaar, oor 20; die skaal stop by 53). Sneeu en ander bevrore neerslag gebruik ligte siaan, blou en pers oor dieselfde stappe. Niks onder 0,1 word geteken nie. Elke dag kom twee tot drie dae laat, en die fynste detail is sowat 10 km.",
  "layer.rainfall.disclaimer":
    "Nie 'n voorspelling nie, en nie vir waarskuwings nie. Dit is 'n skatting uit satelliete, growwer as radar, en kan reën mis of oorskat. Gebruik jou nasionale weerdiens vir waarskuwings.",
  "layer.rainfall.control.date.description":
    "'n Paar dae het geen data nie. As teëls nie laai nie, probeer die dag voor of ná.",
  "layer.sea-temperature-anomaly.name": "Seetemperatuur teenoor normaal",
  "layer.sea-temperature-anomaly.description":
    "Warm kleure, van geel tot donkerrooi, wys seewater wat warmer as gewoonlik is vir die tyd van die jaar. Grys is omtrent normaal, en siaan tot blou is koeler. Ongewoon warm water langs die ewenaar in die Stille Oseaan is die teken van El Niño, en ongewoon koel water is La Niña. Die fynste detail is sowat 5 km.",
  "layer.group.oceans": "Oseane",
  "layer.volcano-alerts.name": "Vulkaanwaarskuwings",
  "layer.volcano-alerts.description":
    "Huidige vulkaanuitbarstings wat GDACS gradeer volgens hul impak op mense.",
  "layer.volcano-alerts.emptyText":
    "Geen vulkaanwaarskuwings op die oomblik nie.",
  "layer.world-countries.name": "Lande volgens bevolking",
  "layer.world-countries.description":
    "Landsgrense ingekleur volgens geskatte bevolking, van Natural Earth.",
  "layer.world-countries.disclaimer":
    "Bevolkingsyfers is skattings, nie amptelike tellings nie.",
  "layer.world-countries.emptyText": "Geen lande kon gewys word nie.",
  "layer.group.boundaries": "Grense",
  "layer.world-countries.key.1": "Onder 1 miljoen",
  "layer.world-countries.key.2": "1 tot 10 miljoen",
  "layer.world-countries.key.3": "10 tot 50 miljoen",
  "layer.world-countries.key.4": "50 tot 200 miljoen",
  "layer.world-countries.key.5": "200 miljoen en meer",
  "layer.world-countries.sort.name": "Naam",
  "layer.world-countries.sort.population": "Meeste mense",
  "layer.gdacs.disclaimer":
    "GDACS-waarskuwings is outomatiese skattings uit modelle. Kyk na amptelike bronne voordat jy iets doen.",
  "layer.gdacs.key.1": "Groen waarskuwing",
  "layer.gdacs.key.2": "Oranje waarskuwing",
  "layer.gdacs.key.3": "Rooi waarskuwing",
  "layer.gdacs.key.4": "Geen waarskuwingsvlak",
  "layer.gdacs.card.link": "Verslag op GDACS",
  "layer.gdacs.sort.newest": "Nuutste",
  "layer.gdacs.sort.alert": "Hoogste waarskuwing",
  "layer.gdacs.detail.label": "Wys geraakte gebied",
  "layer.gdacs.detail.dataCost": "sowat 300 KB",
  "basemap.bright.name": "Bright",
  "basemap.liberty.name": "Liberty",
  "basemap.colorful.name": "Colorful",
  "basemap.fiord.name": "Fiord",
  "basemap.dark.name": "Donker",
  "basemap.positron.name": "Positron",
  "basemap.osm.name": "Strate",
  "keyHelp.keys.arrowKeys": "Pyltjies",
  "keyHelp.keys.shiftUpDown": "Shift met pyltjie op of af",
  "keyHelp.keys.shiftLeftRight": "Shift met pyltjie links of regs",
  "keyHelp.keys.plusMinus": "Plus of minus",
  "keyHelp.keys.homeOr0": "Home of 0",
  "keyHelp.keys.p": "P",
  "keyHelp.keys.i": "I",
  "keyHelp.keys.escape": "Escape",
  "keyHelp.keys.space": "Spasiebalk",
  "keyHelp.keys.enter": "Enter",
  "keyHelp.keys.squareBrackets": "Vierkanthakies",
  "keyHelp.keys.deleteBackspace": "Delete of Backspace",
  "keyHelp.keys.undo": "Control of Command met Z",
  "keyHelp.map.pan": "Skuif die kaart",
  "keyHelp.map.panFurther": "Skuif die kaart verder",
  "keyHelp.map.rotate": "Draai die kaart",
  "keyHelp.map.zoom": "Zoem in of uit",
  "keyHelp.map.north": "Draai die kaart weer na noord",
  "keyHelp.map.pin": "Plaas 'n speld in die middel van die kaart",
  "keyHelp.map.identify": "Wys wat in die middel van die kaart is",
  "keyHelp.map.escape": "Maak die oop paneel toe",
  "keyHelp.draw.addPoint":
    "Terwyl jy teken: plaas 'n punt in die kaartmiddel, of skuif die gekose punt daarheen",
  "keyHelp.draw.finish": "Terwyl jy teken: voltooi die vorm",
  "keyHelp.draw.nudge":
    "As 'n punt gekies is: skuif dit 'n bietjie; hou Shift in vir meer",
  "keyHelp.draw.selectPoint": "Kies die vorige of volgende punt",
  "keyHelp.draw.remove":
    "Verwyder die gekose punt of vorm, of die laaste punt terwyl jy teken",
  "keyHelp.draw.undo": "Ontdoen; met Shift daarby herdoen jy",
  "keyHelp.draw.escape":
    "Gaan terug: los 'n punt, kanselleer die vorm en maak dan die tekening toe",
  "host.map.keyInstruction": "{keys}: {description}.",
  "host.notes.privacy":
    "MapCairn het geen rekeninge nie, stel geen koekies nie en tel bladsybesoeke sonder om jou te volg. Kaartteëls kom van die kaartverskaffer wat jy kies. Terwyl jy in die soekbalk tik, word die teks tot nou toe gestuur na die Photon-diens, wat komoot bedryf, om plekke voor te stel. As jy Enter of Soek druk, word jou soekvraag na OpenStreetMap se Nominatim-diens gestuur, en Soek adres op 'n speld stuur die speld se ligging, tot op sowat 11 m, ook na Nominatim. 'n Soektog en 'n adresopsoek stuur ook hierdie webwerf se adres as die verwyser na Nominatim. Niks word na een van die dienste gestuur voordat jy in die soekbalk tik of 'n adres opvra nie, en 'n paar koördinate wat jy in die soekbalk tik, word nie na hulle gestuur nie, al laai die kaart wel teëls vir daardie gebied om die plek te wys, soos by enige kaartbeweging. 'n Datalaag kontak sy verskaffer net solank dit aan is. Jou instellings bly op hierdie toestel.",
  "host.notes.pinLookup":
    "Stuur die speld se ligging, tot op sowat 11 m, en hierdie webwerf se adres as die verwyser, na OpenStreetMap se Nominatim-diens.",
  "host.notes.routing":
    "Niks word gestuur voordat jy dit vra nie. Kry roete stuur die stoppe en die manier van reis, en 'n reistydgebied stuur die eerste stop, saam met jou IP-adres en hierdie webwerf se adres as die verwyser, na die Valhalla-roetediens wat FOSSGIS bedryf. Dit gebruik OpenStreetMap-data.",
  "host.credits.fixTheMap": "Maak die kaart reg",
  "host.credits.about": "Oor MapCairn",
  "host.title.map": "Interaktiewe kaart",
  "privacy.title": "Privaatheidsbeleid",
  "privacy.updated": "Laas opgedateer: {date}",
  "privacy.intro":
    "MapCairn het geen gebruikersrekeninge, geen vorms en geen databasis met besoekerdata aan die bedienerkant nie. Die webwerf stoor of stuur net die volgende.",
  "privacy.cookies.heading": "Koekies",
  "privacy.cookies.body":
    "Die webwerf stel geen koekies nie. Jou instellings word eerder op jou toestel in plaaslike berging gehou, soos hieronder beskryf.",
  "privacy.storage.heading": "Plaaslike berging",
  "privacy.storage.body":
    "Jou blaaier se {localStorage} hou jou instellings: jou ligte of donker tema (onder die sleutel {themeKey}), jou eenhede, watter taal jy gekies het, of die zoemknoppies wys, of Spaar data aan is, of die kaart plat of 'n aardbol is, jou gekose basiskaart, waar die kaart laas gelaat is, en of jy op die toer by jou eerste besoek gereageer het ('n weergawenommer onder {tourKey}). Die ander sleutels begin met {keyPrefix}. Die toer self stuur niks nie; 'n laag wat jy daartydens aanskakel, laai van sy verskaffer soos hieronder beskryf. Dit bly op jou toestel en word nooit na 'n bediener gestuur nie. Waar jou blaaier 'n datasparer of 'n baie stadige verbinding rapporteer, lees die bladsy dit plaaslik om die verstek vir Spaar data te kies. Niks daarvan word êrens heen gestuur nie. Die dokumentasiewebwerf by {docsPath} hou sy eie ligte of donker keuse onder {docsThemeKey}, die sleutel wat sy raamwerk gebruik, in sy eie berging. Dit lees nie die keuse wat jy hier gemaak het nie, en soos die ander bly dit op jou toestel.",
  "privacy.analytics.heading": "Webanalise",
  "privacy.analytics.body":
    "Hierdie webwerf gebruik Cloudflare Web Analytics vir saamgevoegde tellings van bladsybesoeke. Dit gebruik geen koekies nie, maak nie 'n vingerafdruk van besoekers nie, volg jou nie oor webwerwe heen nie en stoor geen persoonlike data nie. Versoeke word gerig aan {scriptHost} en {beaconHost}.",
  "privacy.errors.heading": "Foutverslagdoening",
  "privacy.errors.body":
    "As die toepassing 'n onverwagte fout in jou blaaier teëkom, stuur dit 'n kort diagnostiese verslag na hierdie webwerf se eie bediener, waar dit in Cloudflare se bedryfslogboeke geskryf word sodat die fout reggemaak kan word. Die verslag bevat die foutboodskap, 'n stapelspoor, die bladsy se adres sonder sy navraag of die deel ná # (byvoorbeeld {exampleUrl}), en of dit 'n onopgevange fout of 'n verworpe belofte was. Dit bevat nooit die kaart se ligging of joune nie. Geen koekies, persoonlike data of blywende identifiseerders word by die verslag gevoeg nie, en dit word nie in enige databasis gestoor nie. Een bladsylaai stuur hoogstens vyf verslae, en dieselfde fout net een keer.",
  "privacy.hosting.heading": "Gasheerlogboeke",
  "privacy.hosting.body":
    "Cloudflare, as gasheer, mag standaard versoekmetadata (IP-adres, gebruikersagent, tydstempel) as deel van normale werking aanteken. Sien {link}.",
  "privacy.hosting.link": "Cloudflare se eie privaatheidsbeleid",
  "privacy.tiles.heading": "Kaartteëls en plekkesoektog",
  "privacy.tiles.body":
    "Die basiskaart se teëlverskaffers, OpenFreeMap en, wanneer jy die Strate-basiskaart kies, die OpenStreetMap Foundation, mag teëlversoeke, insluitend jou IP-adres, aanteken as deel van die lewering van die kaart. Dit is standaard vir enige webkaart. Jou blaaier maak daardie versoeke self: dit dra jou IP-adres, sy gewone versoekopskrifte (soos sy gebruikersagent) en hierdie webwerf se adres as die verwyser, en niks wat hierdie webwerf oor jou gestoor het nie. Teëls word aangevra vir die deel van die kaart op die skerm, so die basiskaart se verskaffer, en die verskaffer van enige teëllaag wat jy aanskakel, kan sowat aflei na watter gebied jy kyk, en ná Vind my sowat waar jy is. Wanneer jy soek (deur Enter of die Soek-knoppie te druk), word jou soekvraag gestuur na OpenStreetMap se Nominatim-geokodeerdiens, wat insgelyks die soekvraag en jou IP-adres mag aanteken. Terwyl jy tik, word die teks tot nou toe ook gestuur na Photon, 'n geokodeerdiens wat soek terwyl jy tik en wat komoot op OpenStreetMap-data bedryf, om plekke voor te stel. 'n Versoek gaan uit elke keer as jy ophou tik nadat jy minstens drie karakters getik het, so een soektog kan verskeie gedeeltelike weergawes daarvan stuur, en Photon mag hulle saam met jou IP-adres aanteken. Jou blaaier stuur geen koekies saam met hierdie versoeke nie. 'n Soektog of 'n adresopsoek wat na Nominatim gestuur word, dra ook hierdie webwerf se adres as die verwyser: net die webwerf se adres, nie die bladsy waarop jy is nie, omdat die diens daarom vra. Die voorstelle wat na Photon gestuur word, dra geen verwyser nie. As jy 'n voorstel kies, word niks meer gestuur nie, en as voorstelle ophou werk, soek Enter en die Soek-knoppie steeds deur Nominatim. 'n Soektog wat net 'n koördinaatpaar is, word in jou blaaier gelees en nie na die geokodeerder gestuur nie; om die plek te wys, vra kaartteëls vir daardie gebied aan, soos enige kaartbeweging. As 'n assistent in jou blaaier hierdie webwerf se soek- of meetgereedskap gebruik (deur WebMCP), word die plekname wat dit gee op dieselfde manier na Nominatim gestuur, en 'n koördinaatpaar word weer in jou blaaier gelees.",
  "privacy.layers.heading": "Datalae",
  "privacy.layers.body":
    "Elke datalaag is af totdat jy dit aanskakel, en niks word voor dit aangevra nie. Wanneer jy 'n laag aanskakel, sy beheer verander of Probeer weer druk, gaan 'n versoek van jou blaaier reguit na daardie laag se verskaffer, wat dit saam met jou IP-adres mag aanteken: die US Geological Survey (USGS) vir aardbewings, NASA se Global Imagery Browse Services vir sy beeldlae (satellietbeelde, reënval, brandkolle, waar mense woon, die aarde snags en seetemperatuur), die Global Disaster Alert and Coordination System (GDACS) vir waarskuwings oor brande, vloede, tropiese siklone, vulkane en droogtes, en die jsDelivr-CDN vir die landsgrense. Wys geraakte gebied stuur nog een versoek na GDACS, net vir daardie gebeurtenis. Teëllae vra prente aan vir die deel van die kaart waarna jy kyk, so die verskaffer kan sowat aflei waarheen jy kyk. Hulle teëlversoeke dra geen verwyser nie, anders as basiskaartteëlversoeke, wat hierdie webwerf se adres as die verwyser behou omdat 'n basiskaartverskaffer daarom kan vra. Niks gaan deur hierdie webwerf nie, en niks word gestoor buiten die bladsy wat jy oop het nie. Die lae wat jy aanskakel, word in die bladsyadres geskryf sodat 'n skakel gedeel kan word; hulle word nêrens anders heen gestuur nie. As jy 'n skakel oopmaak wat lae aan het, word daardie lae dadelik aangevra, omdat die skakel hulle aanskakel.",
  "privacy.pins.heading": "Speldadresse",
  "privacy.pins.body":
    "As jy 'n speld plaas, word niks gestuur nie. 'n Speld se adres word net opgesoek wanneer jy op die speld Soek adres op druk. Dit stuur die speld se ligging, afgerond tot sowat 11 m, na OpenStreetMap se Nominatim-diens, wat dit saam met jou IP-adres en hierdie webwerf se adres as die verwyser mag aanteken.",
  "privacy.routes.heading": "Roetes en reistydgebiede",
  "privacy.routes.body":
    "As jy 'n roete of 'n reistydgebied vra, gaan die versoek na die openbare Valhalla-roetediens by valhalla1.openstreetmap.de, wat die FOSSGIS-gemeenskap bedryf en wat op OpenStreetMap-data gebou is. Dit stuur die roete se koördinate (sy stoppe, of die beginpunt van 'n reistydgebied) en die manier van reis. Jou blaaier maak die versoek self, dus ontvang die bediener ook jou IP-adres, sy gewone versoekopskrifte (soos sy gebruikersagent) en hierdie webwerf se adres as die verwyser: net die webwerf se adres, nie die bladsy waarop jy is nie en niks wat hierdie webwerf gestoor het nie. Die bediener mag dit alles aanteken. Niks word gestuur voordat jy vra nie. MapCairn stoor niks oor die versoek nie, en die resultate word nie gestoor of in die bladsyadres gesit nie.",
  "privacy.location.heading": "Jou ligging",
  "privacy.location.body":
    "Die Vind my-knoppie vra jou blaaier net vir jou ligging wanneer jy dit druk. Die ligging word gebruik om te wys waar jy op die kaart is. Dit word nie na hierdie webwerf gestuur nie en word nie gestoor nie.",
  "privacy.contact.heading": "Kontak",
  "privacy.contact.body":
    "Vir 'n vraag of bekommernis oor privaatheid, skryf aan {email}, of maak 'n kwessie oop op {issues}.",
  "privacy.contact.issuesLink": "GitHub",
  "privacy.backToProduct": "Terug na die produkbladsy",
  "privacy.back": "Terug na die kaart",
  "host.about.heading": "Oor",
  "host.about.text":
    "Hierdie webwerf is oopbronsagteware wat onder die AGPL-3.0-lisensie vrygestel word. 'n Steenhoop (cairn) is 'n hoop klippe waarby stappers klippe voeg om die pad te wys vir wie ook al volgende kom. Mense bou dit al duisende jare: die Cairn van Barnenez in Bretagne is in die vyfde millennium vC begin, en die woord kom van die Gaeliese càrn.",
  "host.about.link": "Kyk na die bronkode en lisensie op GitHub",
  "host.about.product": "Oor MapCairn, die SDK agter hierdie kaart",
  "host.map.noScript":
    "Die kaart het JavaScript nodig. Jy kan steeds oor MapCairn, die bronkode en die privaatheidsbeleid lees.",
  "host.map.summary":
    "Die MapCairn-speelgrond is 'n interaktiewe kaart wat met die MapCairn-SDK gebou is. Soek plekke of koördinate, meet afstande en oppervlaktes, teken en voer vorms uit, vergelyk basiskaarte en skakel oop datalae aan.",
};
