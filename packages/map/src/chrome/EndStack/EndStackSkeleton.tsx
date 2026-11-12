// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  Layers,
  LocateFixed,
  Minus,
  Pentagon,
  Plus,
  Route,
  Ruler,
  Settings,
} from "lucide-react";
import { ControlGroup, IconButton } from "../../ui";
import * as styles from "./EndStack.css";

/** Props for {@link EndStackSkeleton}. */
export interface EndStackSkeletonProps {
  /** Shows the Directions button, as the live stack does when the host offers directions. */
  readonly directions?: boolean;
  /** Show the Draw shapes button, as the live stack does when its host offers drawing. */
  readonly draw?: boolean;
}

/**
 * The end stack as a decorative stand-in for the server-rendered
 * `ChromeSkeleton`: the same column, groups and buttons as {@link EndStack},
 * with the Map options, Measure, Locate me and Settings group (and Directions
 * and Draw shapes when the host sets them) and, on a device with a fine
 * pointer, the zoom group. No compass, because the map starts facing north.
 *
 * @remarks Only ever rendered inside an `aria-hidden`, `inert` container. It
 *   uses no hooks and needs no provider.
 */
export function EndStackSkeleton({
  directions = false,
  draw = false,
}: EndStackSkeletonProps) {
  return (
    <div className={styles.skeletonStack} data-skeleton="end-stack">
      <ControlGroup
        label="Map controls"
        className={styles.group}
        data-skeleton="controls"
      >
        <IconButton label="Map options" icon={Layers} tabIndex={-1} />
        <IconButton
          label="Measure distance and area"
          icon={Ruler}
          tabIndex={-1}
        />
        {directions ? (
          <IconButton label="Directions" icon={Route} tabIndex={-1} />
        ) : null}
        {draw ? (
          <IconButton label="Draw shapes" icon={Pentagon} tabIndex={-1} />
        ) : null}
        <IconButton label="Locate me" icon={LocateFixed} tabIndex={-1} />
        <IconButton label="Settings" icon={Settings} tabIndex={-1} />
      </ControlGroup>
      <div className={styles.skeletonZoom}>
        <ControlGroup
          label="Zoom controls"
          className={styles.group}
          data-skeleton="zoom"
        >
          <IconButton label="Zoom in" icon={Plus} tabIndex={-1} />
          <IconButton label="Zoom out" icon={Minus} tabIndex={-1} />
        </ControlGroup>
      </div>
    </div>
  );
}
