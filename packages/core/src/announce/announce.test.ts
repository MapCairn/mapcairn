// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  announceAddressError,
  announceAddressFound,
  announceAddressNotFound,
  announceAreaFound,
  announceBasemap,
  announceCatalogueChange,
  announceCoordinateResult,
  announceCopied,
  announceDetailError,
  announceDetailShown,
  announceDetent,
  announceDirectionsCleared,
  announceFeatureDeselected,
  announceFeatureSelected,
  announceFeaturesDeselected,
  announceFeaturesFound,
  announceFeaturesSelected,
  announceImageFailed,
  announceImageSaved,
  announceLayerCapped,
  announceLayerEmpty,
  announceLayerError,
  announceLayerLoaded,
  announceLayerOn,
  announceLayersTurnedBackOn,
  announceLayersTurnedOff,
  announceLayerZoomIn,
  announceLocationError,
  announceLocationFound,
  announceMeasureTotal,
  announceNoFeaturesHere,
  announceNoResults,
  announceNoSuggestions,
  announceOffline,
  announcePinCleared,
  announcePinDropped,
  announceProjection,
  announceRouteFound,
  announceRoutingCancelled,
  announceRoutingError,
  announceSearchError,
  announceSearchResults,
  announceSelectionCleared,
  announceSelectionFull,
  announceShowingFeature,
  announceStopAdded,
  announceStopLimit,
  announceStopMoved,
  announceStopRemoved,
  announceSuggestions,
  announceSuggestionsUnavailable,
  announceSurfaceClosed,
  announceSurfaceOpened,
  announceTileError,
  announceTilesRecovered,
  announceTilesUnavailable,
  announceTimeMoved,
  announceTourSkipped,
  announceZoom,
  describeTilesUnavailable,
} from "./index";

describe("search announcements", () => {
  it("counts results with the right plural", () => {
    expect(announceSearchResults(3)).toBe("3 results");
    expect(announceSearchResults(1)).toBe("1 result");
    expect(announceSearchResults(1200)).toBe("1,200 results");
  });

  it("names the place when the one result is a pair of coordinates", () => {
    expect(
      announceCoordinateResult("Coordinates 26.20410° S, 28.04730° E"),
    ).toBe("1 result, Coordinates 26.20410° S, 28.04730° E");
  });

  it("says when there are none", () => {
    expect(announceNoResults()).toBe("No results");
  });

  it("counts suggestions with the right plural", () => {
    expect(announceSuggestions(5)).toBe("5 suggestions");
    expect(announceSuggestions(1)).toBe("1 suggestion");
  });

  it("says when typing finds no suggestion, and when suggestions stop working", () => {
    expect(announceNoSuggestions()).toBe("No suggestions");
    expect(announceSuggestionsUnavailable()).toBe(
      "Suggestions are unavailable. Press Enter to search.",
    );
  });

  it("says what happened and what to do for each error", () => {
    expect(announceSearchError("offline")).toBe(
      "You appear to be offline. Check your connection and try again.",
    );
    expect(announceSearchError("rate-limited")).toBe(
      "Too many searches in a short time. Wait a moment and try again.",
    );
    expect(announceSearchError("failed")).toBe(
      "Search did not work. Try again in a moment.",
    );
  });
});

describe("location announcements", () => {
  it("reports the accuracy in the chosen units", () => {
    expect(announceLocationFound(20, "metric")).toBe(
      "Location found, accuracy about 20 metres",
    );
    expect(announceLocationFound(1, "metric")).toBe(
      "Location found, accuracy about 1 metre",
    );
    expect(announceLocationFound(5000, "metric")).toBe(
      "Location found, accuracy about 5 kilometres",
    );
    expect(announceLocationFound(20, "imperial")).toBe(
      "Location found, accuracy about 66 feet",
    );
  });

  it("gives a next step for each location error", () => {
    expect(announceLocationError("denied")).toBe(
      "Location access is blocked. Allow it in your browser settings, or search for a place instead.",
    );
    expect(announceLocationError("unavailable")).toBe(
      "Your location is not available right now. Check that location services are on, or search for a place instead.",
    );
    expect(announceLocationError("timeout")).toBe(
      "Finding your location took too long. Try again, or search for a place instead.",
    );
  });
});

describe("coordinate and pin announcements", () => {
  it("says whether the copy worked", () => {
    expect(announceCopied(true)).toBe("Coordinates copied");
    expect(announceCopied(false)).toBe(
      "Could not copy. Select the coordinates and copy them manually.",
    );
  });

  it("includes the coordinates when a pin is dropped", () => {
    expect(announcePinDropped({ lat: -26.2041, lng: 28.0473 })).toBe(
      "Pin dropped at -26.20410, 28.04730",
    );
    expect(announcePinCleared()).toBe("Pin removed");
  });
});

describe("address lookup announcements", () => {
  it("says the address that was found", () => {
    expect(announceAddressFound("1 Main Street, Johannesburg")).toBe(
      "Address found: 1 Main Street, Johannesburg",
    );
  });

  it("says when there is no address", () => {
    expect(announceAddressNotFound()).toBe("No address found here");
  });

  it("says what went wrong and what to do next", () => {
    expect(announceAddressError()).toBe(
      "Could not look up the address. Check your connection and try again.",
    );
  });
});

describe("measurement announcements", () => {
  it("reads distance and area totals in words", () => {
    expect(announceMeasureTotal("distance", 1250, "metric")).toBe(
      "Total distance 1.25 kilometres",
    );
    expect(announceMeasureTotal("distance", 1609.344, "imperial")).toBe(
      "Total distance 1 mile",
    );
    expect(announceMeasureTotal("area", 12_500, "metric")).toBe(
      "Total area 1.25 hectares",
    );
    expect(announceMeasureTotal("area", 4046.8564224, "imperial")).toBe(
      "Total area 1 acre",
    );
  });
});

describe("map and panel announcements", () => {
  it("names the basemap and the zoom level", () => {
    expect(announceBasemap("Streets")).toBe("Basemap changed to Streets");
    expect(announceProjection("globe")).toBe("Map shape: globe");
    expect(announceProjection("flat")).toBe("Map shape: flat");
    expect(announceZoom(12)).toBe("Zoom level 12");
    expect(announceZoom(12.46)).toBe("Zoom level 12.5");
  });

  it("describes the panel height", () => {
    expect(announceDetent("peek")).toBe("Panel minimised");
    expect(announceDetent("half")).toBe("Panel half height");
    expect(announceDetent("full")).toBe("Panel full height");
  });

  it("announces surfaces opening and closing", () => {
    expect(announceSurfaceOpened("Settings")).toBe("Settings opened");
    expect(announceSurfaceClosed("Settings")).toBe("Settings closed");
  });

  it("reports connection problems plainly", () => {
    expect(announceTileError()).toBe(
      "Some of the map could not load. Check your connection.",
    );
    expect(announceOffline()).toBe(
      "You are offline. Parts of the map may not load.",
    );
  });
});

describe("layer announcements", () => {
  it("says how many features loaded, by layer", () => {
    expect(announceLayerLoaded("Earthquakes", 43)).toBe(
      "Earthquakes: 43 shown on the map.",
    );
  });

  it("says a tile layer is on", () => {
    expect(announceLayerOn("Satellite imagery")).toBe(
      "Satellite imagery is on.",
    );
  });

  it("says how many layers a batch turned off, in the singular for one", () => {
    expect(announceLayersTurnedOff(3)).toBe(
      "3 layers turned off. Undo available",
    );
    expect(announceLayersTurnedOff(1)).toBe(
      "1 layer turned off. Undo available",
    );
  });

  it("says how many layers an undo turned back on, in the singular for one", () => {
    expect(announceLayersTurnedBackOn(2)).toBe("2 layers turned back on");
    expect(announceLayersTurnedBackOn(1)).toBe("1 layer turned back on");
  });

  describe("a change to the catalogue", () => {
    it("names the one layer that is no longer available", () => {
      expect(
        announceCatalogueChange({
          turnedOff: ["Rainfall"],
          linkUnavailable: 0,
        }),
      ).toBe("Rainfall is no longer available and was turned off.");
    });

    it("counts several layers that are no longer available", () => {
      expect(
        announceCatalogueChange({
          turnedOff: ["Rainfall", "Wind"],
          linkUnavailable: 0,
        }),
      ).toBe("2 layers are no longer available and were turned off.");
    });

    it("says how many layers in the link are not available, in the singular for one", () => {
      expect(
        announceCatalogueChange({ turnedOff: [], linkUnavailable: 1 }),
      ).toBe("1 layer in the link is not available.");
      expect(
        announceCatalogueChange({ turnedOff: [], linkUnavailable: 3 }),
      ).toBe("3 layers in the link are not available.");
    });

    it("composes one message, the layers turned off first and the link note after", () => {
      expect(
        announceCatalogueChange({
          turnedOff: ["Rainfall"],
          linkUnavailable: 2,
        }),
      ).toBe(
        "Rainfall is no longer available and was turned off. 2 layers in the link are not available.",
      );
    });

    it("has nothing to say when nothing changed", () => {
      expect(
        announceCatalogueChange({ turnedOff: [], linkUnavailable: 0 }),
      ).toBeNull();
    });
  });

  it("passes the layer's own empty text through", () => {
    expect(
      announceLayerEmpty("Volcano alerts", "No volcano alerts right now."),
    ).toBe("Volcano alerts: No volcano alerts right now.");
  });

  it("says whether the map image was saved", () => {
    expect(announceImageSaved()).toBe("Map image saved.");
    expect(announceImageFailed()).toBe(
      "The map image could not be saved. Try again.",
    );
  });

  it("says when the keyboard route finds nothing", () => {
    expect(announceNoFeaturesHere()).toBe(
      "No features at the centre of the map.",
    );
  });

  it("says several features were found together and a list opened", () => {
    expect(announceFeaturesFound(3)).toBe(
      "3 features here. Choose one from the list.",
    );
  });

  it("says a query layer is capped and what to do about it", () => {
    expect(announceLayerCapped("Places", 1500)).toBe(
      "Places: showing the first 1,500. Zoom in to see more.",
    );
    expect(announceLayerZoomIn("Places")).toBe(
      "Places: zoom in to load this layer.",
    );
  });

  it("says a layer failed and what to do", () => {
    expect(announceLayerError("Earthquakes", "network")).toBe(
      "Earthquakes could not load. Check your connection and try again.",
    );
    expect(announceLayerError("Earthquakes", "invalid")).toBe(
      "Earthquakes could not load: the provider sent something unexpected. Try again later.",
    );
  });

  it("says a tile layer found no imagery for the chosen time, or could not load", () => {
    expect(describeTilesUnavailable("13:00 UTC on 11 November 2026")).toBe(
      "No imagery was found for 13:00 UTC on 11 November 2026. Try another.",
    );
    expect(describeTilesUnavailable(null)).toBe(
      "Could not load. Check your connection.",
    );
    expect(
      announceTilesUnavailable("Rainfall", "13:00 UTC on 11 November 2026"),
    ).toBe(
      "Rainfall: No imagery was found for 13:00 UTC on 11 November 2026. Try another.",
    );
    expect(announceTilesUnavailable("Rainfall", null)).toBe(
      "Rainfall: Could not load. Check your connection.",
    );
  });

  it("says a tile layer that had found no tiles is showing again", () => {
    expect(announceTilesRecovered("Rainfall")).toBe(
      "Rainfall: imagery is showing again.",
    );
  });

  it("says which feature the map now shows", () => {
    expect(announceShowingFeature("Flood in Portugal")).toBe(
      "Showing Flood in Portugal on the map.",
    );
  });

  it("says when an affected area is shown or failed", () => {
    expect(announceDetailShown("Flood in Portugal")).toBe(
      "Affected area of Flood in Portugal shown on the map.",
    );
    expect(announceDetailError()).toBe(
      "The affected area could not load. Try again.",
    );
  });
});

describe("directions announcements", () => {
  it("names the stop that was added, moved or removed by its letter", () => {
    expect(announceStopAdded(0, 1)).toBe("Stop A added, 1 stop");
    expect(announceStopAdded(2, 3)).toBe("Stop C added, 3 stops");
    expect(announceStopRemoved(1)).toBe("Stop B removed");
    expect(announceStopMoved(0, 3)).toBe(
      "Stop moved to position 1 of 3, now stop A",
    );
  });

  it("gives a route's distance, time and mode in words", () => {
    expect(announceRouteFound(12_400, 1080, "drive", "metric")).toBe(
      "Route found, 12.4 kilometres, 18 minutes driving",
    );
    expect(announceRouteFound(1609.344, 3900, "walk", "imperial")).toBe(
      "Route found, 1 mile, 1 hour 5 minutes walking",
    );
  });

  it("gives an area's time, mode and size in words", () => {
    expect(announceAreaFound(15, 3_200_000, "cycle", "metric")).toBe(
      "Area reachable within 15 minutes cycling found, covering 3.2 square kilometres",
    );
    expect(announceAreaFound(1, 3_200_000, "cycle", "metric")).toContain(
      "within 1 minute cycling",
    );
  });

  it("repeats the visible error text", () => {
    expect(announceRoutingError("rate-limited", "route")).toMatch(/busy/);
  });

  it("confirms a cancel and a clear", () => {
    expect(announceRoutingCancelled()).toBe("Cancelled");
    expect(announceDirectionsCleared()).toBe("Directions cleared");
  });
});

describe("stop limit, tour and time announcements", () => {
  it("says how many stops the directions hold and what to do", () => {
    expect(announceStopLimit(10)).toBe(
      "You can add up to 10 stops. Remove one to add another.",
    );
  });

  it("says how to start a skipped tour again", () => {
    expect(announceTourSkipped()).toBe(
      "Tour skipped. Help, in Settings, can start it again.",
    );
  });

  it("names the nearest time a layer moved to", () => {
    expect(announceTimeMoved("2026-11-09t0600")).toBe(
      "Time moved to 06:00 UTC on 9 November 2026, the nearest available.",
    );
  });
});

describe("selection announcements", () => {
  it("names the feature that was added and carries the total", () => {
    expect(announceFeatureSelected("Gauge 4", 5)).toBe(
      "Added Gauge 4. 5 selected.",
    );
  });

  it("counts features that were added, in the singular for one", () => {
    expect(announceFeaturesSelected(12, 17)).toBe(
      "12 features added. 17 selected.",
    );
    expect(announceFeaturesSelected(1, 1)).toBe("1 feature added. 1 selected.");
    expect(announceFeaturesSelected(1200, 1500)).toBe(
      "1,200 features added. 1,500 selected.",
    );
  });

  it("names the feature that was removed and carries the total", () => {
    expect(announceFeatureDeselected("Gauge 4", 4)).toBe(
      "Removed Gauge 4. 4 selected.",
    );
    expect(announceFeatureDeselected("Gauge 4", 0)).toBe(
      "Removed Gauge 4. 0 selected.",
    );
  });

  it("counts features that were removed, in the singular for one", () => {
    expect(announceFeaturesDeselected(3, 2)).toBe(
      "3 features removed. 2 selected.",
    );
    expect(announceFeaturesDeselected(1, 2)).toBe(
      "1 feature removed. 2 selected.",
    );
  });

  it("says when the selection was cleared", () => {
    expect(announceSelectionCleared()).toBe("Selection cleared.");
  });

  it("says the limit and that nothing was added when an addition is refused", () => {
    expect(announceSelectionFull(200)).toBe(
      "The selection holds 200 at most. Nothing was added.",
    );
    expect(announceSelectionFull(1500)).toBe(
      "The selection holds 1,500 at most. Nothing was added.",
    );
  });
});
