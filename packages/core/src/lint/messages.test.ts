// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { EN_GB_CATALOGUE } from "../messages/en-GB";
import type { MessageKey } from "../ports/messages";

/**
 * The placeholder names each `MessageKey` takes, kept by hand beside
 * `MessageParams` in `ports/messages.ts` (a type, so it carries no runtime
 * information this test can read). A key missing here, or whose set of
 * names does not match this list, fails the test below: that is how an
 * added `MessageKey` without a matching `MessageParams` entry, or a
 * catalogue string whose placeholder has drifted from it, fails the build
 * rather than only a review.
 */
const EXPECTED_PLACEHOLDERS: Record<MessageKey, readonly string[]> = {
  "settings.title": [],
  "settings.theme.label": [],
  "settings.theme.system": [],
  "settings.theme.light": [],
  "settings.theme.dark": [],
  "settings.units.label": [],
  "settings.units.metric": [],
  "settings.units.imperial": [],
  "settings.mapShape.label": [],
  "settings.mapShape.flat": [],
  "settings.mapShape.globe": [],
  "settings.zoomButtons.label": [],
  "settings.zoomButtons.description": [],
  "settings.saveData.label": [],
  "settings.saveData.description": [],
  "settings.notSaved": [],
  "settings.privacy.heading": [],
  "settings.privacy.link": [],
  // Common joins
  "common.followedBy": ["first", "second"],
  "common.commaJoined": ["first", "second"],
  "common.dotJoined": ["first", "second"],
  // Formatting
  "format.hemisphereNorth": [],
  "format.hemisphereSouth": [],
  "format.hemisphereEast": [],
  "format.hemisphereWest": [],
  "format.day": ["date"],
  "format.utcTime": ["time"],
  "format.utcRange": ["start", "end"],
  "format.timeOnDay": ["time", "day"],
  "search.coordinatesLabel": ["latitude", "longitude"],
  // Units and durations
  "units.metre": ["count"],
  "units.kilometre": ["count"],
  "units.foot": ["count"],
  "units.mile": ["count"],
  "units.squareMetre": ["count"],
  "units.hectare": ["count"],
  "units.squareKilometre": ["count"],
  "units.squareFoot": ["count"],
  "units.acre": ["count"],
  "units.squareMile": ["count"],
  "duration.day": ["count"],
  "duration.hour": ["count"],
  "duration.minute": ["count"],
  "duration.underMinute": [],
  "scale.label": ["distance"],
  // Errors
  "error.search.offline": [],
  "error.search.rate-limited": [],
  "error.search.failed": [],
  "error.location.denied": [],
  "error.location.unavailable": [],
  "error.location.timeout": [],
  "error.routing.network": [],
  "error.routing.rateLimited": [],
  "error.routing.noRoute": [],
  "error.routing.noReachableArea": [],
  "error.routing.invalid": [],
  "error.routing.unsupported": [],
  // Directions
  "directions.participle.drive": [],
  "directions.participle.walk": [],
  "directions.participle.cycle": [],
  // Layer status lines
  "describe.zoomIn": ["level"],
  "describe.zoomOut": ["level"],
  "describe.layersLoading": [],
  "describe.layersLoadFailed": [],
  "describe.noLayers": [],
  "describe.layersRefreshFailed": [],
  "describe.layersSkipped": ["count"],
  "describe.tilesNoImagery": ["when"],
  "describe.tilesUnavailable": [],
  "describe.tilesSlow": [],
  // Announcements
  "announce.layerLoaded": ["name", "count"],
  "announce.layerStatus": ["name", "status"],
  "announce.layerCapped": ["name", "shown"],
  "announce.layerZoomIn": ["name", "level"],
  "announce.layerZoomOut": ["name", "level"],
  "announce.layerOn": ["name"],
  "announce.layersTurnedOff": ["count"],
  "announce.layersTurnedBackOn": ["count"],
  "announce.layerLoadFailed": ["name"],
  "announce.layerInvalid": ["name"],
  "announce.tilesRecovered": ["name"],
  "announce.imageSaved": [],
  "announce.imageFailed": [],
  "announce.noFeaturesHere": [],
  "announce.featuresFound": ["count"],
  "announce.nothingFoundHere": [],
  "announce.layersDidNotAnswer": ["names"],
  "announce.askedOfAvailable": ["asked", "available"],
  "announce.layerUnavailable": ["name"],
  "announce.layersUnavailable": ["count"],
  "announce.linkLayersUnavailable": ["count"],
  "announce.layersSkipped": ["count"],
  "announce.layersAdded": ["count"],
  "announce.layersRemoved": ["count"],
  "announce.layersUpdated": ["changes"],
  "announce.featureSelected": ["title", "total"],
  "announce.featuresSelected": ["count", "total"],
  "announce.featureDeselected": ["title", "total"],
  "announce.featuresDeselected": ["count", "total"],
  "announce.selectionCleared": [],
  "announce.selectionFull": ["limit"],
  "announce.showingFeature": ["title"],
  "announce.detailShown": ["title"],
  "announce.detailError": [],
  "announce.searchResults": ["count"],
  "announce.coordinateResult": ["results", "label"],
  "announce.noResults": [],
  "announce.suggestions": ["count"],
  "announce.noSuggestions": [],
  "announce.suggestionsUnavailable": [],
  "announce.locationFound": ["accuracy"],
  "announce.copied": [],
  "announce.copyFailed": [],
  "announce.pinDropped": ["position"],
  "announce.pinCleared": [],
  "announce.measureDistance": ["distance"],
  "announce.measureArea": ["area"],
  "announce.basemapChanged": ["name"],
  "announce.projection.flat": [],
  "announce.projection.globe": [],
  "announce.zoom": ["level"],
  "announce.detent.peek": [],
  "announce.detent.half": [],
  "announce.detent.full": [],
  "announce.surfaceOpened": ["name"],
  "announce.surfaceClosed": ["name"],
  "announce.tileError": [],
  "announce.offline": [],
  "announce.addressFound": ["address"],
  "announce.addressNotFound": [],
  "announce.addressError": [],
  "announce.stopAdded": ["letter", "count"],
  "announce.stopLimit": ["max"],
  "announce.stopRemoved": ["letter"],
  "announce.stopMoved": ["position", "total", "letter"],
  "announce.routeFound": ["distance", "duration", "mode"],
  "announce.areaFound": ["count", "mode", "area"],
  "announce.routingCancelled": [],
  "announce.directionsCleared": [],
  "announce.tourSkipped": [],
  "announce.timeMoved": ["time"],
  // Drawing
  "draw.hint.point": [],
  "draw.hint.line": [],
  "draw.hint.polygon": [],
  "draw.hint.circle": [],
  "draw.issue.too-few-vertices": [],
  "draw.issue.self-intersecting": [],
  "draw.issue.degenerate": [],
  "draw.issue.radius-missing": [],
  "draw.issue.radius-too-large": [],
  "draw.measure.circle": ["radius", "area"],
  "draw.measure.line": ["length"],
  "draw.measure.polygonArea": ["area"],
  "draw.measure.polygon": ["area", "perimeter"],
  "draw.measure.radiusAndArea": ["radius", "area"],
  "draw.sentence.circle": ["radius", "area"],
  "draw.sentence.line": ["length"],
  "draw.sentence.polygonArea": ["area"],
  "draw.sentence.polygon": ["area", "perimeter"],
  "draw.vertexAdded": ["count"],
  "draw.vertexAddedTo": ["count", "label"],
  "draw.circleChanged": ["label"],
  "draw.pointMoved": ["label"],
  "draw.vertexMoved": ["index", "label"],
  "draw.vertexInserted": ["label", "index", "count"],
  "draw.vertexRemoved": ["label", "count"],
  "draw.pointAdded": ["label"],
  "draw.finished": ["label"],
  "draw.vertexSelected": ["index", "count", "label"],
  "draw.pathSelected": ["label", "count"],
  "draw.shapeSelected": ["label"],
  "draw.discarded.point": [],
  "draw.discarded.line": [],
  "draw.discarded.polygon": [],
  "draw.discarded.circle": [],
  "draw.deleted": ["label"],
  "draw.clearedOne": [],
  "draw.clearedAll": ["count"],
  "draw.undone": [],
  "draw.redone": [],
  "draw.loaded": ["count"],
  "draw.import.refusal.drawing-full": ["max"],
  "draw.import.refusal.empty": [],
  "draw.import.refusal.too-large": ["megabytes"],
  "draw.import.refusal.too-deep": [],
  "draw.import.refusal.not-recognised": [],
  "draw.import.refusal.wkt-unreadable": [],
  "draw.import.refusal.too-many-shapes": ["max"],
  "draw.import.refusal.too-many-points": ["max"],
  "draw.import.refusalWithDetail": ["refusal", "detail"],
  "draw.import.skip.self-intersecting": ["count"],
  "draw.import.skip.degenerate": ["count"],
  "draw.import.skip.too-few-vertices": ["count"],
  "draw.import.skip.radius-missing": ["count"],
  "draw.import.skip.radius-too-large": ["count"],
  "draw.import.skip.out-of-range": ["count"],
  "draw.import.skip.too-many-points": ["count", "max"],
  "draw.import.skip.malformed": ["count"],
  "draw.import.skip.unsupported": ["count"],
  "draw.import.skip.other-srid": ["count", "srid"],
  "draw.import.skipped": ["total", "reasons"],
  "draw.import.noShapes": [],
  "draw.import.noneImported": [],
  "draw.import.imported": ["count"],
  "draw.import.holesLeftOut": ["count"],
  "common.itemCount": ["count"],
};

/** Every `{name}` placeholder used in `value`, deduplicated. */
function placeholdersIn(value: string): string[] {
  return [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? ""))];
}

describe("the English message catalogue", () => {
  it("has exactly the keys this test expects", () => {
    expect(Object.keys(EN_GB_CATALOGUE).sort()).toEqual(
      Object.keys(EXPECTED_PLACEHOLDERS).sort(),
    );
  });

  it.each(Object.keys(EXPECTED_PLACEHOLDERS) as MessageKey[])(
    "%s has a non-empty value whose placeholders match MessageParams",
    (key) => {
      const value = EN_GB_CATALOGUE[key];
      expect(value.length).toBeGreaterThan(0);
      const forms = value.split("|");
      const expected = [...EXPECTED_PLACEHOLDERS[key]].sort();
      for (const form of forms) {
        expect(placeholdersIn(form).sort()).toEqual(expected);
      }
    },
  );

  it("gives every key with plural forms a count to choose the form from", () => {
    for (const key of Object.keys(EXPECTED_PLACEHOLDERS) as MessageKey[]) {
      if (EN_GB_CATALOGUE[key].includes("|")) {
        expect(EXPECTED_PLACEHOLDERS[key], key).toContain("count");
      }
    }
  });
});
