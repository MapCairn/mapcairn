// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LatLng } from "@mapcairn/core";
import {
  ChromeLayoutProvider,
  type ChromeLayoutValue,
  type MapReadoutProps,
} from "@mapcairn/map";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppReadout } from "./AppReadout";

/** Stands in for the SDK readout and reports the props the host gave it. */
vi.mock("@mapcairn/map", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@mapcairn/map")>()),
  MapReadout: ({ latlng, showZoom, onCursorLeave }: MapReadoutProps) => (
    <button
      type="button"
      data-testid="readout"
      data-latlng={latlng ? `${latlng.lat},${latlng.lng}` : "none"}
      data-show-zoom={String(showZoom)}
      onClick={onCursorLeave}
    />
  ),
}));

const CURSOR: LatLng = { lat: 1, lng: 2 };

function renderReadout(
  layout: Partial<ChromeLayoutValue>,
  onCursorLeave?: () => void,
) {
  const value: ChromeLayoutValue = {
    layout: "sheet",
    viewport: { width: 1280, height: 720 },
    finePointer: true,
    panelEdge: null,
    publishSheetTop: () => {},
    ...layout,
  };
  render(
    <ChromeLayoutProvider value={value}>
      <AppReadout
        units="metric"
        cursor={CURSOR}
        onCursorLeave={onCursorLeave}
      />
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

  it("passes on the host's way to clear the cursor once the pointer leaves the readout", () => {
    const onCursorLeave = vi.fn();
    fireEvent.click(renderReadout({}, onCursorLeave));
    expect(onCursorLeave).toHaveBeenCalledOnce();
  });
});
