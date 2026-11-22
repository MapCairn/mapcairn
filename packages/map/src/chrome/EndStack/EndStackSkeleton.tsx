// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  Gear,
  GpsFix,
  Minus,
  Path,
  Plus,
  Polygon,
  Ruler,
  Stack,
} from "@phosphor-icons/react";
import { ControlGroup, IconButton } from "../../ui";
import * as styles from "./EndStack.css";

/** The names of the controls {@link EndStackSkeleton} draws, in the host's default language. */
export interface EndStackSkeletonCopy {
  readonly controls: string;
  readonly mapOptions: string;
  readonly measure: string;
  readonly directions: string;
  readonly draw: string;
  readonly locate: string;
  readonly settings: string;
  readonly zoomControls: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
}

/** Props for {@link EndStackSkeleton}. */
export interface EndStackSkeletonProps {
  readonly copy: EndStackSkeletonCopy;
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
 *   uses no hooks and needs no provider: the names arrive as `copy`.
 */
export function EndStackSkeleton({
  copy,
  directions = false,
  draw = false,
}: EndStackSkeletonProps) {
  return (
    <div className={styles.skeletonStack} data-skeleton="end-stack">
      <ControlGroup
        label={copy.controls}
        className={styles.group}
        data-skeleton="controls"
      >
        <IconButton label={copy.mapOptions} icon={Stack} tabIndex={-1} />
        <IconButton label={copy.measure} icon={Ruler} tabIndex={-1} />
        {directions ? (
          <IconButton label={copy.directions} icon={Path} tabIndex={-1} />
        ) : null}
        {draw ? (
          <IconButton label={copy.draw} icon={Polygon} tabIndex={-1} />
        ) : null}
        <IconButton label={copy.locate} icon={GpsFix} tabIndex={-1} />
        <IconButton label={copy.settings} icon={Gear} tabIndex={-1} />
      </ControlGroup>
      <div className={styles.skeletonZoom}>
        <ControlGroup
          label={copy.zoomControls}
          className={styles.group}
          data-skeleton="zoom"
        >
          <IconButton label={copy.zoomIn} icon={Plus} tabIndex={-1} />
          <IconButton label={copy.zoomOut} icon={Minus} tabIndex={-1} />
        </ControlGroup>
      </div>
    </div>
  );
}
