// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LatLng, UnitSystem } from "@mapcairn/core";
import { MapReadout, useChromeLayout } from "@mapcairn/map";

/** Props for {@link AppReadout}. */
export interface AppReadoutProps {
  readonly units: UnitSystem;
  /** The position under the pointer, or null when there is none. */
  readonly cursor: LatLng | null;
}

/**
 * The bottom-start readout. The cursor coordinates need a fine pointer. The
 * zoom level also needs the side panel layout, so a narrow window keeps the
 * coordinates but not the zoom, and a phone has neither: the readout stays as
 * short as the scale bar and clear of the credits popover.
 */
export function AppReadout({ units, cursor }: AppReadoutProps) {
  const { finePointer, layout } = useChromeLayout();
  return (
    <MapReadout
      units={units}
      latlng={finePointer ? cursor : null}
      showZoom={finePointer && layout === "panel"}
    />
  );
}
