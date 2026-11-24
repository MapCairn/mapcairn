// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { defaultBasemapFor, type ViewState } from "@mapcairn/core";
import {
  Attribution,
  EndStack,
  FocusRegistryProvider,
  MapChrome,
  MapReadout,
  MapView,
  MeasureToolbar,
  SearchPill,
  useBasemaps,
  useMap,
  useMeasure,
  useSettings,
  useTheme,
  VisuallyHidden,
} from "@mapcairn/map";
import type { ReactNode } from "react";
import { DESIGN_GUIDE_MARKER } from "./marker";
import * as styles from "./TwoMaps.css";

const VIEW: ViewState = { center: { lat: 0, lng: 0 }, zoom: 2, bearing: 0 };

/** The two labels, for the two maps on the page. */
const LABELS = ["First", "Second"] as const;

const noop = () => undefined;

/** The chrome of one map: every part of it that is a landmark. */
function Chrome({ background }: { readonly background: ReactNode }) {
  const map = useMap();
  const { settings } = useSettings();
  const measure = useMeasure(settings.units);
  const basemap = useBasemapFor();
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <MapChrome
        background={background}
        modal={false}
        mainLandmark={false}
        topStart={<SearchPill onSelect={noop} />}
        endStack={
          <EndStack
            bearing={map.view.bearing}
            onResetBearing={noop}
            mapOptionsOpen={false}
            mapOptionsControls="none"
            onMapOptions={noop}
            settingsOpen={false}
            settingsControls="none"
            onSettings={noop}
            measuring={false}
            onMeasure={noop}
            locating={false}
            onLocate={noop}
            canZoomIn={map.canZoomIn}
            canZoomOut={map.canZoomOut}
            onZoomIn={noop}
            onZoomOut={noop}
          />
        }
        bottomStart={<MapReadout units={settings.units} latlng={null} />}
        bottomEnd={<Attribution basemap={basemap} layerCredits={[]} />}
        bottomCentre={
          <MeasureToolbar
            measure={measure}
            onAddPointAtCentre={noop}
            onDone={noop}
          />
        }
      />
    </FocusRegistryProvider>
  );
}

/** The basemap the page draws: the catalogue's default for the resolved theme. */
function useBasemapFor() {
  const catalogue = useBasemaps();
  const { resolved } = useTheme();
  return defaultBasemapFor(catalogue, resolved);
}

/** Props for {@link TwoMaps}. */
export interface TwoMapsProps {
  /** Whether to leave the maps without a `label`. */
  readonly unlabelled?: boolean;
}

/**
 * Two maps on one page with their chrome, for the browser tests of what a
 * page with several maps exposes to a screen reader. Each map has a `label`
 * unless `unlabelled` is set, and the page holds the one `main` landmark.
 * Served only in development and e2e builds (`designGuideRoutes.ts`).
 */
export function TwoMaps({ unlabelled = false }: TwoMapsProps) {
  const basemap = useBasemapFor();
  return (
    <main className={styles.page} data-design-guide={DESIGN_GUIDE_MARKER}>
      <VisuallyHidden as="h1">Two maps</VisuallyHidden>
      {LABELS.map((label) => (
        <div key={label} className={styles.cell}>
          <MapView
            initialView={VIEW}
            basemap={basemap}
            label={unlabelled ? undefined : label}
            chrome={(background) => <Chrome background={background} />}
          />
        </div>
      ))}
    </main>
  );
}
