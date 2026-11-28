// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type DrawKind,
  type DrawShape,
  hintFor,
  type MessageCatalogue,
} from "@mapcairn/core";
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  CaretLeft,
  CaretRight,
  Check,
  Crosshair,
  Minus,
  MinusCircle,
  Plus,
  PlusCircle,
  Shapes,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import { type KeyboardEvent, useCallback, useRef } from "react";
import { useFocusTarget } from "../../chrome/focusRegistry";
import { useScrollEdges } from "../../chrome/useScrollEdges";
import { useLandmarkName } from "../../host/useLandmarkName";
import { useFocusWhenDrawn } from "../../lit/useFocusWhenDrawn";
import { useFormatMessage, useMessages } from "../../services";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { Surface } from "../../ui/Surface";
import { VisuallyHidden } from "../../ui/VisuallyHidden";
import * as styles from "./DrawToolbar.css";
import type { UseDraw } from "./useDraw";

/** Props for {@link DrawToolbar}. */
export interface DrawToolbarProps {
  /** The drawing state from `useDraw`. */
  readonly draw: UseDraw;
  /** Called by "Done". */
  readonly onDone: () => void;
  /** Called by "Shapes and export", which opens the list of shapes in the sheet. */
  readonly onOpenShapes: () => void;
}

function modeOptions(
  t: MessageCatalogue["t"],
): readonly { value: DrawKind; label: string }[] {
  return [
    { value: "point", label: t("tools.draw.mode.point", {}) },
    { value: "line", label: t("tools.draw.mode.line", {}) },
    { value: "polygon", label: t("tools.draw.mode.polygon", {}) },
    { value: "circle", label: t("tools.draw.mode.circle", {}) },
  ];
}

/** The keys the selected shape's group handles itself, because its buttons do not use them. */
const GROUP_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Delete",
  "Backspace",
  "[",
  "]",
]);

function selectedGroupLabel(
  messages: MessageCatalogue,
  shape: DrawShape,
  vertex: number | null,
): string {
  if (shape.kind !== "line" && shape.kind !== "polygon") {
    return shape.label;
  }
  const total = shape.vertices.length;
  return vertex === null
    ? messages.plural("tools.draw.selectedPoints", {
        label: shape.label,
        count: total,
      })
    : messages.t("tools.draw.selectedPoint", {
        label: shape.label,
        index: vertex + 1,
        total,
      });
}

interface SelectedGroupProps {
  readonly draw: UseDraw;
  readonly shape: DrawShape;
}

/**
 * The controls for the selected shape: step between its points, move one to
 * the map centre, add or remove one, or change a circle's radius. Each is a
 * single tap, and the arrow keys move the selected point.
 */
function SelectedGroup({ draw, shape }: SelectedGroupProps) {
  const messages = useMessages();
  const { t } = messages;
  const vertex = draw.selection?.vertex ?? null;
  const path = shape.kind === "line" || shape.kind === "polygon";
  const circle = shape.kind === "circle";
  const hasVertex = vertex !== null;
  return (
    <fieldset
      className={styles.group}
      data-testid="draw-selected-group"
      data-draw-group=""
    >
      <legend className={styles.groupLabel} data-testid="draw-selected-label">
        {selectedGroupLabel(messages, shape, vertex)}
      </legend>
      <div className={styles.actions}>
        {path ? (
          <>
            <IconButton
              label={t("tools.draw.previousPoint", {})}
              icon={CaretLeft}
              mirrorInRtl
              data-testid="draw-vertex-prev"
              onClick={() => draw.stepVertex(-1)}
            />
            <IconButton
              label={t("tools.draw.nextPoint", {})}
              icon={CaretRight}
              mirrorInRtl
              data-testid="draw-vertex-next"
              onClick={() => draw.stepVertex(1)}
            />
          </>
        ) : null}
        {path ? (
          <>
            <IconButton
              label={t("tools.draw.insertPoint", {})}
              icon={PlusCircle}
              disabled={!hasVertex}
              data-testid="draw-vertex-insert"
              onClick={draw.insertAtCentre}
            />
            <IconButton
              label={t("tools.draw.removePoint", {})}
              icon={MinusCircle}
              disabled={!hasVertex}
              data-testid="draw-vertex-remove"
              onClick={draw.removeVertex}
            />
          </>
        ) : null}
        {circle ? (
          <>
            <IconButton
              label={t("tools.draw.smallerRadius", {})}
              icon={Minus}
              data-testid="draw-radius-smaller"
              onClick={() => draw.scaleRadius(1 / 1.1)}
            />
            <IconButton
              label={t("tools.draw.largerRadius", {})}
              icon={Plus}
              data-testid="draw-radius-larger"
              onClick={() => draw.scaleRadius(1.1)}
            />
            <IconButton
              label={t("tools.draw.radiusToCentre", {})}
              icon={Crosshair}
              data-testid="draw-radius-centre"
              onClick={draw.setRadiusToCentre}
            />
          </>
        ) : null}
      </div>
    </fieldset>
  );
}

/**
 * The draw toolbar: a switch for what to draw, the name and measures of the
 * shape under way or selected, buttons to add a point at the map centre, undo,
 * redo, cancel or delete, open the list of shapes and finish, and a group of
 * controls for the selected shape. It sits in a landmark named "Drawing", so
 * it is inside a landmark wherever the host places it.
 *
 * On mount focus moves to the chosen shape type, because the person has just
 * chosen Draw and the next thing to do is here. The bottom-centre slot it sits
 * in is what the slots below it ride above. The toolbar registers its Shapes
 * button as a focus target, so closing the sheet over a drawing puts focus
 * back on it.
 * @remarks Every pointer action has a button: Add point at map centre places a
 *   point (or moves the selected one), Previous and Next point select, the
 *   group moves, adds and removes points, and the circle group sets the
 *   radius. The arrow keys move the selected point from the map, or while
 *   focus is in the selected shape's group, and Escape and the undo keys work
 *   from anywhere in the toolbar. The primary button is Finish while a shape
 *   is being drawn and Done otherwise, in one element, so focus stays put when
 *   it changes. Cancel and Delete are one button for the same reason. The
 *   button keeps the width of the longer label and its check mark in both
 *   states, so the row does not wrap, and the toolbar does not change height,
 *   when the label changes.
 */
export function DrawToolbar({ draw, onDone, onOpenShapes }: DrawToolbarProps) {
  const rootRef = useRef<HTMLElement>(null);
  const format = useFormatMessage();
  const { t } = useMessages();
  const landmarkName = useLandmarkName("tools.draw.region");
  const registerShapes = useFocusTarget("draw-shapes");
  const scrollerRef = useRef<HTMLDivElement>(null);
  useScrollEdges(scrollerRef);

  // Coming back from the sheet, focus is put on the Shapes button before this
  // runs, and the toolbar leaves it there.
  useFocusWhenDrawn(() => {
    const root = rootRef.current;
    if (!root || root.contains(root.ownerDocument.activeElement)) {
      return;
    }
    root.querySelector<HTMLElement>('[role="radio"][data-state="on"]')?.focus();
  });

  const setRoot = useCallback(
    (root: HTMLElement | null) => {
      rootRef.current = root;
      registerShapes(
        root?.querySelector<HTMLElement>('[data-focus-target="draw-shapes"]') ??
          null,
      );
    },
    [registerShapes],
  );

  const { draft, selected, mode } = draw;
  const drawing = draft !== null;

  const toolbarKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) {
      return;
    }
    // Escape and the undo keys work anywhere in the toolbar. The arrow, delete
    // and bracket keys are the selected shape's group's, because the shape
    // switch beside it uses the arrows itself.
    const inGroup =
      event.target instanceof Element &&
      event.target.closest("[data-draw-group]") !== null;
    const handled =
      event.key === "Escape" ||
      event.ctrlKey ||
      event.metaKey ||
      (inGroup && GROUP_KEYS.has(event.key));
    if (handled && draw.keyCommand(event)) {
      event.preventDefault();
    }
  };

  const addLabel =
    draw.selection?.vertex != null
      ? t("tools.draw.movePoint", {})
      : t("tools.addPointAtCentre", {});
  const finishLabel = t("tools.draw.finish", {});
  const doneLabel = t("tools.done", {});
  const [primaryLabel, otherLabel] = drawing
    ? [finishLabel, doneLabel]
    : [doneLabel, finishLabel];
  const removeLabel = drawing
    ? t("tools.draw.cancelShape", {})
    : t("tools.draw.deleteShape", {});

  return (
    <section
      ref={setRoot}
      aria-label={landmarkName}
      className={styles.root}
      data-chrome="draw-toolbar"
    >
      <Surface
        role="toolbar"
        aria-label={t("tools.draw.toolbar", {})}
        className={styles.toolbar}
        data-testid="draw-toolbar"
        onKeyDown={toolbarKeys}
      >
        <div
          ref={scrollerRef}
          className={styles.scroller}
          data-testid="draw-toolbar-scroll"
        >
          <div className={styles.modesRow}>
            <SegmentedControl
              className={styles.modes}
              label={t("tools.draw.shapeToDraw", {})}
              options={modeOptions(t)}
              value={mode}
              onValueChange={(next) => draw.setMode(next as DrawKind)}
              data-testid="draw-mode"
            />
          </div>
          <p className={styles.readout}>
            <span className={styles.status} data-testid="draw-status">
              {draw.status}
            </span>
            {draw.measure ? (
              <span className={styles.measure} data-testid="draw-measure">
                <VisuallyHidden>, </VisuallyHidden>
                {draw.measure}
              </span>
            ) : null}
          </p>
          {draw.issueMessage ? (
            <p className={styles.issue} data-testid="draw-issue">
              <Icon icon={Warning} />
              <span>{draw.issueMessage}</span>
            </p>
          ) : null}
          <div className={styles.actionsRow}>
            <div className={styles.actions}>
              <IconButton
                label={addLabel}
                icon={Crosshair}
                data-testid="draw-add-point"
                onClick={draw.placeAtCentre}
              />
              <IconButton
                label={t("tools.draw.undo", {})}
                icon={ArrowUUpLeft}
                mirrorInRtl
                disabled={!draw.canUndo}
                data-testid="draw-undo"
                onClick={draw.undo}
              />
              <IconButton
                label={t("tools.draw.redo", {})}
                icon={ArrowUUpRight}
                mirrorInRtl
                disabled={!draw.canRedo}
                data-testid="draw-redo"
                onClick={draw.redo}
              />
              <IconButton
                label={removeLabel}
                icon={drawing ? X : Trash}
                disabled={!drawing && selected === null}
                data-testid="draw-remove"
                onClick={drawing ? draw.cancel : draw.deleteSelected}
              />
              <IconButton
                label={t("tools.draw.shapesAndExport", {})}
                icon={Shapes}
                data-focus-target="draw-shapes"
                data-testid="draw-shapes"
                onClick={onOpenShapes}
              />
            </div>
            <Button
              icon={Check}
              data-testid="draw-done"
              onClick={drawing ? draw.finish : onDone}
            >
              <span className={styles.primaryLabel} data-reserve={otherLabel}>
                {primaryLabel}
              </span>
            </Button>
          </div>
          {selected && selected.kind !== "point" && !drawing ? (
            <SelectedGroup draw={draw} shape={selected} />
          ) : null}
          <p className={styles.hint}>
            {selected && !drawing
              ? t("tools.draw.selectedHint", {})
              : format(hintFor(mode))}
          </p>
        </div>
      </Surface>
    </section>
  );
}
