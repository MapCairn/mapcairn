// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useMap } from "../MapContext";
import { roundPixel } from "./geometry";
import * as styles from "./overlays.css";

/** Half the length of each crosshair arm, in pixels. */
export const CROSSHAIR_ARM_PX = 10;

/** Props for {@link CentreCrosshair}. */
export interface CentreCrosshairProps {
  /**
   * Where to draw it, in pixels from the map's top left. Defaults to the
   * centre of the whole map; a tool whose panel covers part of the map passes
   * the middle of what is left.
   */
  readonly at?: { readonly x: number; readonly y: number };
  readonly testId?: string;
}

/**
 * A small crosshair at the centre of the map, shown while measuring so "Add
 * point at map centre" has a visible target. Render it inside
 * `MapOverlayLayer` only while measuring.
 */
export function CentreCrosshair({ at, testId }: CentreCrosshairProps) {
  const { adapter, view } = useMap();
  if (!adapter) {
    return null;
  }
  const centre = at ?? adapter.project(view.center);
  const x = roundPixel(centre.x);
  const y = roundPixel(centre.y);
  const arm = CROSSHAIR_ARM_PX;
  const lines = (className: string) => (
    <>
      <line className={className} x1={x - arm} y1={y} x2={x + arm} y2={y} />
      <line className={className} x1={x} y1={y - arm} x2={x} y2={y + arm} />
    </>
  );
  return (
    <g data-testid={testId}>
      {lines(styles.crosshairHalo)}
      {lines(styles.crosshairLine)}
    </g>
  );
}
