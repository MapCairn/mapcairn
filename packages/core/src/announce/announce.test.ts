// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { FakeMessageCatalogue } from "../fakes/FakeMessageCatalogue";
import { describeSlotStart } from "../layers/dateTime";
import { formatMessage } from "../messages/formatMessage";
import type { Message } from "../ports/messages";
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
  announceLayerOffline,
  announceLayerOn,
  announceLayersTurnedBackOn,
  announceLayersTurnedOff,
  announceLayerZoomIn,
  announceLayerZoomOut,
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
  announceSearchPicked,
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
  announceTilesSlow,
  announceTilesUnavailable,
  announceTimeMoved,
  announceTourSkipped,
  announceZoom,
  type CatalogueChange,
  describeLayersLoadFailed,
  describeLayersLoading,
  describeLayersRefreshFailed,
  describeLayersSkipped,
  describeNoLayers,
  describeTilesSlow,
  describeTilesUnavailable,
  describeZoomIn,
  describeZoomOut,
} from "./index";

/** The English text of a message, as the live region would say it; null stays null. */
const english = (value: Message | null) =>
  value === null ? null : formatMessage(new FakeMessageCatalogue(), value);

/** A chosen slot, as the layer's status line words it. */
const WHEN = describeSlotStart("2026-11-11t1300");

describe("search announcements", () => {
  it("counts results with the right plural", () => {
    expect(english(announceSearchResults(3))).toBe("3 results");
    expect(english(announceSearchResults(1))).toBe("1 result");
    expect(english(announceSearchResults(1200))).toBe("1,200 results");
  });

  it("names the place when the one result is a pair of coordinates", () => {
    expect(
      english(announceCoordinateResult("Coordinates 26.20410° S, 28.04730° E")),
    ).toBe("1 result, Coordinates 26.20410° S, 28.04730° E");
  });

  it("says when there are none", () => {
    expect(english(announceNoResults())).toBe("No results");
  });

  it("names the place the map went to when a search found only one", () => {
    expect(english(announceSearchPicked("Cape Town"))).toBe(
      "Showing Cape Town on the map.",
    );
  });

  it("counts suggestions with the right plural", () => {
    expect(english(announceSuggestions(5))).toBe("5 suggestions");
    expect(english(announceSuggestions(1))).toBe("1 suggestion");
  });

  it("says when typing finds no suggestion, and when suggestions stop working", () => {
    expect(english(announceNoSuggestions())).toBe("No suggestions");
    expect(english(announceSuggestionsUnavailable())).toBe(
      "Suggestions are unavailable. Press Enter to search.",
    );
  });

  it("says what happened and what to do for each error", () => {
    expect(english(announceSearchError("offline"))).toBe(
      "You appear to be offline. Check your connection and try again.",
    );
    expect(english(announceSearchError("rate-limited"))).toBe(
      "Too many searches in a short time. Wait a moment and try again.",
    );
    expect(english(announceSearchError("failed"))).toBe(
      "Search did not work. Try again in a moment.",
    );
  });
});

describe("location announcements", () => {
  it("reports the accuracy in the chosen units", () => {
    expect(english(announceLocationFound(20, "metric"))).toBe(
      "Location found, accuracy about 20 metres",
    );
    expect(english(announceLocationFound(1, "metric"))).toBe(
      "Location found, accuracy about 1 metre",
    );
    expect(english(announceLocationFound(5000, "metric"))).toBe(
      "Location found, accuracy about 5 kilometres",
    );
    expect(english(announceLocationFound(20, "imperial"))).toBe(
      "Location found, accuracy about 66 feet",
    );
  });

  it("gives a next step for each location error", () => {
    expect(english(announceLocationError("denied"))).toBe(
      "Location access is blocked. Allow it in your browser settings, or search for a place instead.",
    );
    expect(english(announceLocationError("unavailable"))).toBe(
      "Your location is not available right now. Check that location services are on, or search for a place instead.",
    );
    expect(english(announceLocationError("timeout"))).toBe(
      "Finding your location took too long. Try again, or search for a place instead.",
    );
  });
});

describe("coordinate and pin announcements", () => {
  it("says whether the copy worked", () => {
    expect(english(announceCopied(true))).toBe("Coordinates copied");
    expect(english(announceCopied(false))).toBe(
      "Could not copy. Select the coordinates and copy them manually.",
    );
  });

  it("includes the coordinates when a pin is dropped", () => {
    expect(english(announcePinDropped({ lat: -26.2041, lng: 28.0473 }))).toBe(
      "Pin dropped at -26.20410, 28.04730",
    );
    expect(english(announcePinCleared())).toBe("Pin removed");
  });
});

describe("address lookup announcements", () => {
  it("says the address that was found", () => {
    expect(english(announceAddressFound("1 Main Street, Johannesburg"))).toBe(
      "Address found: 1 Main Street, Johannesburg",
    );
  });

  it("says when there is no address", () => {
    expect(english(announceAddressNotFound())).toBe("No address found here");
  });

  it("says what went wrong and what to do next", () => {
    expect(english(announceAddressError())).toBe(
      "Could not look up the address. Check your connection and try again.",
    );
  });
});

describe("measurement announcements", () => {
  it("reads distance and area totals in words", () => {
    expect(english(announceMeasureTotal("distance", 1250, "metric"))).toBe(
      "Total distance 1.25 kilometres",
    );
    expect(
      english(announceMeasureTotal("distance", 1609.344, "imperial")),
    ).toBe("Total distance 1 mile");
    expect(english(announceMeasureTotal("area", 12_500, "metric"))).toBe(
      "Total area 1.25 hectares",
    );
    expect(
      english(announceMeasureTotal("area", 4046.8564224, "imperial")),
    ).toBe("Total area 1 acre");
  });
});

describe("map and panel announcements", () => {
  it("names the basemap and the zoom level", () => {
    expect(english(announceBasemap("Streets"))).toBe(
      "Basemap changed to Streets",
    );
    expect(english(announceProjection("globe"))).toBe("Map shape: globe");
    expect(english(announceProjection("flat"))).toBe("Map shape: flat");
    expect(english(announceZoom(12))).toBe("Zoom level 12");
    expect(english(announceZoom(12.46))).toBe("Zoom level 12.5");
  });

  it("describes the panel height", () => {
    expect(english(announceDetent("peek"))).toBe("Panel minimised");
    expect(english(announceDetent("half"))).toBe("Panel half height");
    expect(english(announceDetent("full"))).toBe("Panel full height");
  });

  it("announces surfaces opening and closing", () => {
    expect(english(announceSurfaceOpened("Settings"))).toBe("Settings opened");
    expect(english(announceSurfaceClosed("Settings"))).toBe("Settings closed");
  });

  it("reports connection problems plainly", () => {
    expect(english(announceTileError())).toBe(
      "Some of the map could not load. Check your connection.",
    );
    expect(english(announceOffline())).toBe(
      "You are offline. Parts of the map may not load.",
    );
  });
});

describe("layer announcements", () => {
  it("says how many features loaded, by layer", () => {
    expect(english(announceLayerLoaded("Earthquakes", 43))).toBe(
      "Earthquakes: 43 shown on the map.",
    );
  });

  it("says a tile layer is on", () => {
    expect(english(announceLayerOn("Satellite imagery"))).toBe(
      "Satellite imagery is on.",
    );
  });

  it("says how many layers a batch turned off, in the singular for one", () => {
    expect(english(announceLayersTurnedOff(3))).toBe(
      "3 layers turned off. Undo available",
    );
    expect(english(announceLayersTurnedOff(1))).toBe(
      "1 layer turned off. Undo available",
    );
  });

  it("says how many layers an undo turned back on, in the singular for one", () => {
    expect(english(announceLayersTurnedBackOn(2))).toBe(
      "2 layers turned back on",
    );
    expect(english(announceLayersTurnedBackOn(1))).toBe(
      "1 layer turned back on",
    );
  });

  describe("a change to the catalogue", () => {
    const NOTHING: CatalogueChange = {
      turnedOff: [],
      linkUnavailable: 0,
      skipped: 0,
      added: 0,
      removed: 0,
      empty: false,
    };

    it("names the one layer that is no longer available", () => {
      expect(
        english(
          announceCatalogueChange({ ...NOTHING, turnedOff: ["Rainfall"] }),
        ),
      ).toBe("Rainfall is no longer available and was turned off.");
    });

    it("counts several layers that are no longer available", () => {
      expect(
        english(
          announceCatalogueChange({
            ...NOTHING,
            turnedOff: ["Rainfall", "Wind"],
          }),
        ),
      ).toBe("2 layers are no longer available and were turned off.");
    });

    it("says how many layers in the link are not available, in the singular for one", () => {
      expect(
        english(announceCatalogueChange({ ...NOTHING, linkUnavailable: 1 })),
      ).toBe("1 layer in the link is not available.");
      expect(
        english(announceCatalogueChange({ ...NOTHING, linkUnavailable: 3 })),
      ).toBe("3 layers in the link are not available.");
    });

    it("says how many layers could not be shown, in the singular for one", () => {
      expect(english(announceCatalogueChange({ ...NOTHING, skipped: 1 }))).toBe(
        "1 layer could not be shown.",
      );
      expect(english(announceCatalogueChange({ ...NOTHING, skipped: 3 }))).toBe(
        "3 layers could not be shown.",
      );
    });

    it("says what an update added and removed, leaving out a part that is zero", () => {
      expect(
        english(announceCatalogueChange({ ...NOTHING, added: 1, removed: 1 })),
      ).toBe("Layers updated: 1 added, 1 removed.");
      expect(english(announceCatalogueChange({ ...NOTHING, added: 2 }))).toBe(
        "Layers updated: 2 added.",
      );
      expect(
        english(announceCatalogueChange({ ...NOTHING, removed: 12_345 })),
      ).toBe("Layers updated: 12,345 removed.");
    });

    it("says there are no layers when the first list is empty", () => {
      expect(
        english(announceCatalogueChange({ ...NOTHING, empty: true })),
      ).toBe("No layers are available.");
    });

    it("composes one message in a fixed order: layers turned off, the link note, the skipped count, updated, then empty", () => {
      expect(
        english(
          announceCatalogueChange({
            turnedOff: ["Rainfall"],
            linkUnavailable: 2,
            skipped: 1,
            added: 1,
            removed: 1,
            empty: true,
          }),
        ),
      ).toBe(
        "Rainfall is no longer available and was turned off. 2 layers in the link are not available. 1 layer could not be shown. Layers updated: 1 added, 1 removed. No layers are available.",
      );
    });

    it("has nothing to say when nothing changed", () => {
      expect(english(announceCatalogueChange(NOTHING))).toBeNull();
    });
  });

  describe("the state of the catalogue", () => {
    it("words the layers still loading, the failed load and the failed refresh", () => {
      expect(english(describeLayersLoading())).toBe("Loading layers");
      expect(english(describeNoLayers())).toBe("No layers are available.");
      expect(english(describeLayersLoadFailed())).toBe(
        "Layers could not be loaded.",
      );
      expect(english(describeLayersRefreshFailed())).toBe(
        "Layers could not be updated. Showing the last list.",
      );
    });

    it("words the skipped count the same for the section and for the live region", () => {
      expect(english(describeLayersSkipped(1))).toBe(
        "1 layer could not be shown",
      );
      expect(english(describeLayersSkipped(2))).toBe(
        "2 layers could not be shown",
      );
    });
  });

  it("passes the layer's own empty text through", () => {
    expect(
      english(
        announceLayerEmpty("Volcano alerts", "No volcano alerts right now."),
      ),
    ).toBe("Volcano alerts: No volcano alerts right now.");
  });

  it("says whether the map image was saved", () => {
    expect(english(announceImageSaved())).toBe("Map image saved.");
    expect(english(announceImageFailed())).toBe(
      "The map image could not be saved. Try again.",
    );
  });

  it("says when the keyboard route finds nothing", () => {
    expect(english(announceNoFeaturesHere())).toBe(
      "No features at the centre of the map.",
    );
  });

  it("says several features were found together and a list opened", () => {
    expect(english(announceFeaturesFound(3))).toBe(
      "3 features here. Choose one from the list.",
    );
  });

  it("says a query layer is capped and what to do about it", () => {
    expect(english(announceLayerCapped("Places", 1500))).toBe(
      "Places: showing the first 1,500. Zoom in to see more.",
    );
    expect(english(announceLayerZoomIn("Places", 9))).toBe(
      "Places: zoom in to level 9 or closer to load this layer.",
    );
    expect(english(announceLayerZoomOut("Places", 12))).toBe(
      "Places: zoom out below level 12 to see this layer.",
    );
  });

  it("says the zoom level a layer needs, in the status line and the announcement", () => {
    expect(english(describeZoomIn(9))).toBe(
      "Zoom in to level 9 or closer to load this layer.",
    );
    expect(english(describeZoomOut(12))).toBe(
      "Zoom out below level 12 to see this layer.",
    );
    expect(english(describeZoomIn(9.04))).toBe(
      "Zoom in to level 9.1 or closer to load this layer.",
    );
    expect(english(describeZoomOut(12.26))).toBe(
      "Zoom out below level 12.2 to see this layer.",
    );
    expect(english(describeZoomIn(9.5))).toBe(
      "Zoom in to level 9.5 or closer to load this layer.",
    );
  });

  it("says a layer failed and what to do", () => {
    expect(english(announceLayerError("Earthquakes", "network"))).toBe(
      "Earthquakes could not load. Check your connection and try again.",
    );
    expect(english(announceLayerError("Earthquakes", "invalid"))).toBe(
      "Earthquakes could not load: the provider sent something unexpected. Try again later.",
    );
  });

  it("says a layer did not load because the device is offline, without blaming the provider", () => {
    expect(english(announceLayerOffline("Earthquakes"))).toBe(
      "Earthquakes did not load because you are offline. Try again when you are back online.",
    );
  });

  it("says a tile layer found no imagery for the chosen time, or could not load", () => {
    expect(english(describeTilesUnavailable(WHEN))).toBe(
      "No imagery was found for 13:00 UTC on 11 November 2026. Try another.",
    );
    expect(english(describeTilesUnavailable(null))).toBe(
      "Could not load. Check your connection.",
    );
    expect(english(announceTilesUnavailable("Rainfall", WHEN))).toBe(
      "Rainfall: No imagery was found for 13:00 UTC on 11 November 2026. Try another.",
    );
    expect(english(announceTilesUnavailable("Rainfall", null))).toBe(
      "Rainfall: Could not load. Check your connection.",
    );
  });

  it("says a tile layer is still waiting for imagery, in the status line and aloud", () => {
    expect(english(describeTilesSlow())).toBe(
      "Still waiting for imagery. The provider may be slow or not answering.",
    );
    expect(english(announceTilesSlow("Rainfall"))).toBe(
      "Rainfall: Still waiting for imagery. The provider may be slow or not answering.",
    );
  });

  it("says a tile layer that had found no tiles is showing again", () => {
    expect(english(announceTilesRecovered("Rainfall"))).toBe(
      "Rainfall: imagery is showing again.",
    );
  });

  it("says which feature the map now shows", () => {
    expect(english(announceShowingFeature("Flood in Portugal"))).toBe(
      "Showing Flood in Portugal on the map.",
    );
  });

  it("says when an affected area is shown or failed", () => {
    expect(english(announceDetailShown("Flood in Portugal"))).toBe(
      "Affected area of Flood in Portugal shown on the map.",
    );
    expect(english(announceDetailError())).toBe(
      "The affected area could not load. Try again.",
    );
  });
});

describe("directions announcements", () => {
  it("names the stop that was added, moved or removed by its letter", () => {
    expect(english(announceStopAdded(0, 1))).toBe("Stop A added, 1 stop");
    expect(english(announceStopAdded(2, 3))).toBe("Stop C added, 3 stops");
    expect(english(announceStopRemoved(1))).toBe("Stop B removed");
    expect(english(announceStopMoved(0, 3))).toBe(
      "Stop moved to position 1 of 3, now stop A",
    );
  });

  it("gives a route's distance, time and mode in words", () => {
    expect(english(announceRouteFound(12_400, 1080, "drive", "metric"))).toBe(
      "Route found, 12.4 kilometres, 18 minutes driving",
    );
    expect(
      english(announceRouteFound(1609.344, 3900, "walk", "imperial")),
    ).toBe("Route found, 1 mile, 1 hour 5 minutes walking");
  });

  it("gives an area's time, mode and size in words", () => {
    expect(english(announceAreaFound(15, 3_200_000, "cycle", "metric"))).toBe(
      "Area reachable within 15 minutes cycling found, covering 3.2 square kilometres",
    );
    expect(
      english(announceAreaFound(1, 3_200_000, "cycle", "metric")),
    ).toContain("within 1 minute cycling");
  });

  it("repeats the visible error text", () => {
    expect(english(announceRoutingError("rate-limited", "route"))).toMatch(
      /busy/,
    );
  });

  it("confirms a cancel and a clear", () => {
    expect(english(announceRoutingCancelled())).toBe("Cancelled");
    expect(english(announceDirectionsCleared())).toBe("Directions cleared");
  });
});

describe("stop limit, tour and time announcements", () => {
  it("says how many stops the directions hold and what to do", () => {
    expect(english(announceStopLimit(10))).toBe(
      "You can add up to 10 stops. Remove one to add another.",
    );
  });

  it("says how to start a skipped tour again", () => {
    expect(english(announceTourSkipped())).toBe(
      "Tour skipped. Help, in Settings, can start it again.",
    );
  });

  it("names the nearest time a layer moved to", () => {
    expect(english(announceTimeMoved("2026-11-09t0600"))).toBe(
      "Time moved to 06:00 UTC on 9 November 2026, the nearest available.",
    );
  });
});

describe("selection announcements", () => {
  it("names the feature that was added and carries the total", () => {
    expect(english(announceFeatureSelected("Gauge 4", 5))).toBe(
      "Added Gauge 4. 5 selected.",
    );
  });

  it("counts features that were added, in the singular for one", () => {
    expect(english(announceFeaturesSelected(12, 17))).toBe(
      "12 features added. 17 selected.",
    );
    expect(english(announceFeaturesSelected(1, 1))).toBe(
      "1 feature added. 1 selected.",
    );
    expect(english(announceFeaturesSelected(1200, 1500))).toBe(
      "1,200 features added. 1,500 selected.",
    );
  });

  it("names the feature that was removed and carries the total", () => {
    expect(english(announceFeatureDeselected("Gauge 4", 4))).toBe(
      "Removed Gauge 4. 4 selected.",
    );
    expect(english(announceFeatureDeselected("Gauge 4", 0))).toBe(
      "Removed Gauge 4. 0 selected.",
    );
  });

  it("counts features that were removed, in the singular for one", () => {
    expect(english(announceFeaturesDeselected(3, 2))).toBe(
      "3 features removed. 2 selected.",
    );
    expect(english(announceFeaturesDeselected(1, 2))).toBe(
      "1 feature removed. 2 selected.",
    );
  });

  it("says when the selection was cleared", () => {
    expect(english(announceSelectionCleared())).toBe("Selection cleared.");
  });

  it("says the limit and that nothing was added when an addition is refused", () => {
    expect(english(announceSelectionFull(200))).toBe(
      "The selection holds 200 at most. Nothing was added.",
    );
    expect(english(announceSelectionFull(1500))).toBe(
      "The selection holds 1,500 at most. Nothing was added.",
    );
  });
});

describe("announcements are keys and parameters, formatted at the edge", () => {
  it("carries a distance as a nested message, not as text", () => {
    expect(announceLocationFound(25, "metric")).toEqual({
      key: "announce.locationFound",
      params: { accuracy: { key: "units.metre", params: { count: 25 } } },
    });
  });

  it("rounds a zoom level to one decimal for the catalogue to format", () => {
    expect(announceZoom(12.46)).toEqual({
      key: "announce.zoom",
      params: { level: 12.5 },
    });
  });

  it("groups a count for the language of the catalogue that formats it", () => {
    const german = new FakeMessageCatalogue({ language: "de" });
    expect(formatMessage(german, announceLayerLoaded("Erdbeben", 12_345))).toBe(
      "Erdbeben: 12.345 shown on the map.",
    );
    expect(
      formatMessage(german, announceMeasureTotal("distance", 1250, "metric")),
    ).toBe("Total distance 1,25 kilometres");
  });

  it("names a pin's position the same way in every language", () => {
    const german = new FakeMessageCatalogue({ language: "de" });
    expect(
      formatMessage(
        german,
        announcePinDropped({ lat: -26.2041, lng: 28.0473 }),
      ),
    ).toBe("Pin dropped at -26.20410, 28.04730");
  });
});
