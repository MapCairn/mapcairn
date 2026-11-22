// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { MagnifyingGlass } from "@phosphor-icons/react";
import { IconButton } from "../../ui/IconButton";
import { Surface } from "../../ui/Surface";
import * as styles from "./SearchPill.css";

/** The words of {@link SearchPillSkeleton}, in the host's default language. */
export interface SearchPillSkeletonCopy {
  /** The input's placeholder, as the live pill's. */
  readonly placeholder: string;
  /** The Search button's name. */
  readonly searchLabel: string;
}

/** Props for {@link SearchPillSkeleton}. */
export interface SearchPillSkeletonProps {
  readonly copy: SearchPillSkeletonCopy;
}

/**
 * The search pill as a decorative stand-in for the server-rendered
 * `ChromeSkeleton`: the same wrapper, pill and input classes as
 * {@link SearchPill}, so it fills the same box, with nothing wired up.
 *
 * @remarks Only ever rendered inside an `aria-hidden`, `inert` container. It
 *   uses no hooks and needs no provider: its words arrive as `copy`. The Search button is disabled, as the
 *   real one is while the box is empty.
 */
export function SearchPillSkeleton({ copy }: SearchPillSkeletonProps) {
  return (
    <div className={styles.root} data-skeleton="search">
      <Surface radius="pill" className={styles.pill}>
        <input
          className={styles.input}
          type="text"
          readOnly
          tabIndex={-1}
          placeholder={copy.placeholder}
        />
        <IconButton
          label={copy.searchLabel}
          icon={MagnifyingGlass}
          size="compact"
          disabled
          tabIndex={-1}
        />
      </Surface>
    </div>
  );
}
