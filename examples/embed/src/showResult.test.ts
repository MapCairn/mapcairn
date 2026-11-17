// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import { RESULT_MAX_ZOOM, RESULT_ZOOM, showResult } from "./showResult";

function adapter() {
  return { setView: vi.fn(), fitBounds: vi.fn() };
}

describe("showResult", () => {
  it("centres on the point of a result with no extent", () => {
    const map = adapter();

    showResult(map, { id: "a", label: "A", centre: { lat: 1, lng: 2 } });

    expect(map.setView).toHaveBeenCalledWith({
      center: { lat: 1, lng: 2 },
      zoom: RESULT_ZOOM,
    });
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("fits the extent of a result that has one", () => {
    const map = adapter();
    const bounds = { south: 0, west: 1, north: 3, east: 4 };

    showResult(map, {
      id: "a",
      label: "A",
      centre: { lat: 1, lng: 2 },
      bounds,
    });

    expect(map.fitBounds).toHaveBeenCalledWith(bounds, {
      maxZoom: RESULT_MAX_ZOOM,
    });
    expect(map.setView).not.toHaveBeenCalled();
  });
});
