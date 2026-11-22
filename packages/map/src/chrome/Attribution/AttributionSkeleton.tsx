// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { Info } from "@phosphor-icons/react";
import { IconButton } from "../../ui";
import * as styles from "./Attribution.css";

/** Props for {@link AttributionSkeleton}. */
export interface AttributionSkeletonProps {
  /** The credits button's name, in the host's default language. */
  readonly label: string;
}

/**
 * The credits button as a decorative stand-in for the server-rendered
 * `ChromeSkeleton`: the same anchor and icon classes as {@link Attribution},
 * so it sits in the same box, with the popover left out.
 *
 * @remarks Only ever rendered inside an `aria-hidden`, `inert` container. It
 *   uses no hooks, so it needs no map or provider: its name arrives as `label`.
 */
export function AttributionSkeleton({ label }: AttributionSkeletonProps) {
  return (
    <div className={styles.root} data-skeleton="credits">
      <IconButton
        label={label}
        icon={Info}
        size="compact"
        className={styles.onMapIcon}
        tabIndex={-1}
      />
    </div>
  );
}
