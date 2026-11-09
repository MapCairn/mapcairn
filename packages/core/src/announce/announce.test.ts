import { describe, expect, it } from "vitest";
import {
  announceBasemap,
  announceCopied,
  announceDetent,
  announceEngineSwitch,
  announceLocationError,
  announceLocationFound,
  announceMeasureTotal,
  announceNoResults,
  announceOffline,
  announcePinCleared,
  announcePinDropped,
  announceSearchError,
  announceSearchResults,
  announceSurfaceClosed,
  announceSurfaceOpened,
  announceTileError,
  announceZoom,
} from "./index";

describe("search announcements", () => {
  it("counts results with the right plural", () => {
    expect(announceSearchResults(3)).toBe("3 results");
    expect(announceSearchResults(1)).toBe("1 result");
    expect(announceSearchResults(1200)).toBe("1,200 results");
  });

  it("says when there are none", () => {
    expect(announceNoResults()).toBe("No results");
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
    expect(announceBasemap("Satellite")).toBe("Basemap changed to Satellite");
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

  it("reports connection and engine problems plainly", () => {
    expect(announceTileError()).toBe(
      "Some of the map could not load. Check your connection.",
    );
    expect(announceOffline()).toBe(
      "You are offline. Parts of the map may not load.",
    );
    expect(announceEngineSwitch("Liberty")).toBe(
      "Switched to Liberty. Your position on the map is unchanged.",
    );
  });
});
