// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { Info } from "lucide-react";
import { IconButton } from "../../ui";
import * as styles from "./Attribution.css";

/**
 * The credits button as a decorative stand-in for the server-rendered
 * `ChromeSkeleton`: the same anchor and icon classes as {@link Attribution},
 * so it sits in the same box, with the popover left out.
 *
 * @remarks Only ever rendered inside an `aria-hidden`, `inert` container. It
 *   uses no hooks, so it needs no map or provider.
 */
export function AttributionSkeleton() {
  return (
    <div className={styles.root} data-skeleton="credits">
      <IconButton
        label="Map credits"
        icon={Info}
        size="compact"
        className={styles.onMapIcon}
        tabIndex={-1}
      />
    </div>
  );
}
