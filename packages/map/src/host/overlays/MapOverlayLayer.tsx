// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ReactNode } from "react";
import * as styles from "./overlays.css";

/** Props for {@link MapOverlayLayer}. */
export interface MapOverlayLayerProps {
  /** SVG overlays such as `PinMarker` and `MeasureOverlay`. */
  readonly children?: ReactNode;
  readonly testId?: string;
}

/**
 * The single layer every map overlay draws into: one SVG spanning the map
 * host, above the engine and below the chrome. Place it inside `MapView`.
 *
 * @remarks It is hidden from assistive technology and never takes pointer
 *   events. Overlays are pictures of state that the interface also gives in
 *   text (the pin's coordinates, the measured distance, the location accuracy).
 */
export function MapOverlayLayer({ children, testId }: MapOverlayLayerProps) {
  return (
    <div className={styles.layer} aria-hidden="true" data-testid={testId}>
      <svg className={styles.canvas} aria-hidden="true" focusable="false">
        {children}
      </svg>
    </div>
  );
}
