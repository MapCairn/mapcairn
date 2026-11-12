// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LatLng } from "@mapcairn/core";
import {
  ChromeLayoutProvider,
  type ChromeLayoutValue,
  type MapReadoutProps,
} from "@mapcairn/map";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppReadout } from "./AppReadout";

/** Stands in for the SDK readout and reports the props the host gave it. */
vi.mock("@mapcairn/map", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@mapcairn/map")>()),
  MapReadout: ({ latlng, showZoom }: MapReadoutProps) => (
    <div
      data-testid="readout"
      data-latlng={latlng ? `${latlng.lat},${latlng.lng}` : "none"}
      data-show-zoom={String(showZoom)}
    />
  ),
}));

const CURSOR: LatLng = { lat: 1, lng: 2 };

function renderReadout(layout: Partial<ChromeLayoutValue>) {
  const value: ChromeLayoutValue = {
    layout: "sheet",
    viewport: { width: 1280, height: 720 },
    finePointer: true,
    panelEdge: null,
    publishSheetTop: () => {},
    publishToolbarTop: () => {},
    ...layout,
  };
  render(
    <ChromeLayoutProvider value={value}>
      <AppReadout units="metric" cursor={CURSOR} />
    </ChromeLayoutProvider>,
  );
  return screen.getByTestId("readout");
}

describe("AppReadout", () => {
  it("shows the coordinates and the zoom with a fine pointer in the side panel layout", () => {
    const readout = renderReadout({ finePointer: true, layout: "panel" });
    expect(readout).toHaveAttribute("data-latlng", "1,2");
    expect(readout).toHaveAttribute("data-show-zoom", "true");
  });

  it("shows the coordinates but not the zoom with a fine pointer in the sheet layout", () => {
    const readout = renderReadout({ finePointer: true, layout: "sheet" });
    expect(readout).toHaveAttribute("data-latlng", "1,2");
    expect(readout).toHaveAttribute("data-show-zoom", "false");
  });

  it("shows neither with a coarse pointer, even in the side panel layout", () => {
    const readout = renderReadout({ finePointer: false, layout: "panel" });
    expect(readout).toHaveAttribute("data-latlng", "none");
    expect(readout).toHaveAttribute("data-show-zoom", "false");
  });
});
