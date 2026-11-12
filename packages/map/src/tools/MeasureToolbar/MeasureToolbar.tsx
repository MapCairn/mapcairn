// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { Crosshair, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useToolbarEdge } from "../../chrome/useToolbarEdge";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { Surface } from "../../ui/Surface";
import { VisuallyHidden } from "../../ui/VisuallyHidden";
import * as styles from "./MeasureToolbar.css";
import type { MeasureMode, UseMeasure } from "./useMeasure";

/** Props for {@link MeasureToolbar}. */
export interface MeasureToolbarProps {
  /** The measurement state from `useMeasure`. */
  readonly measure: UseMeasure;
  /** Called by "Add point at map centre", the keyboard and single-tap way to place a point. */
  readonly onAddPointAtCentre: () => void;
  /** Called by "Done". */
  readonly onDone: () => void;
}

const MODE_OPTIONS = [
  { value: "distance", label: "Distance" },
  { value: "area", label: "Area" },
] as const;

/**
 * The measure toolbar: a Distance or Area switch, the running total, buttons
 * to add a point at the map centre, undo and clear, and Done. It sits in a
 * landmark named "Measurement", so it is inside a landmark wherever the host
 * places it.
 *
 * On mount focus moves to its first button, because the person has just
 * chosen Measure and the next thing to do is here. The toolbar publishes its
 * top edge with `useToolbarEdge` so the slots below it ride above, and
 * publishes `null` when it unmounts.
 * @remarks The total is plain text. It is read out by the announcer after the
 *   points settle (see `useMeasure`), not by a live region of its own.
 *   The controls are all reachable with Tab rather than a single roving tab
 *   stop, which keeps the mode switch's own arrow keys unambiguous.
 *   The published edge is `getBoundingClientRect().top`, in viewport pixels,
 *   which equals the chrome container's own coordinates when the container
 *   fills the viewport.
 */
export function MeasureToolbar({
  measure,
  onAddPointAtCentre,
  onDone,
}: MeasureToolbarProps) {
  const { mode, points, readout, setMode, undo, clear } = measure;
  const rootRef = useRef<HTMLElement>(null);
  const empty = points.length === 0;

  useEffect(() => {
    rootRef.current?.querySelector("button")?.focus();
  }, []);

  useToolbarEdge(rootRef);

  return (
    <section
      ref={rootRef}
      aria-label="Measurement"
      className={styles.root}
      data-chrome="measure-toolbar"
    >
      <Surface
        role="toolbar"
        aria-label="Measure"
        className={styles.toolbar}
        data-testid="measure-toolbar"
      >
        <div className={styles.row}>
          <SegmentedControl
            className={styles.modes}
            label="Measure"
            options={MODE_OPTIONS}
            value={mode}
            onValueChange={(next) => setMode(next as MeasureMode)}
            data-testid="measure-mode"
          />
          <p className={styles.readout}>
            <VisuallyHidden>Total </VisuallyHidden>
            <span data-testid="measure-readout">{readout}</span>
          </p>
        </div>
        <div className={styles.row}>
          <div className={styles.actions}>
            <IconButton
              label="Add point at map centre"
              icon={Crosshair}
              data-testid="measure-add-point"
              onClick={onAddPointAtCentre}
            />
            <IconButton
              label="Undo last point"
              icon={Undo2}
              disabled={empty}
              data-testid="measure-undo"
              onClick={undo}
            />
            <IconButton
              label="Clear points"
              icon={Trash2}
              disabled={empty}
              data-testid="measure-clear"
              onClick={clear}
            />
          </div>
          <Button data-testid="measure-done" onClick={onDone}>
            Done
          </Button>
        </div>
        <p className={styles.hint}>
          Tap the map to add points, or use Add point at map centre.
        </p>
      </Surface>
    </section>
  );
}
