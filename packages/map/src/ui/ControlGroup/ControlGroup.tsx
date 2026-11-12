// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { HTMLAttributes } from "react";
import { Surface } from "../Surface";
import { controlGroup } from "./ControlGroup.css";

/** Props for {@link ControlGroup}. */
export interface ControlGroupProps
  extends Omit<HTMLAttributes<HTMLElement>, "aria-label" | "role"> {
  /** The accessible name of the group, for example "Zoom". */
  readonly label: string;
}

/**
 * Icon buttons stacked on one floating surface, separated by hairlines. It is
 * a plain `group`, not a toolbar, so it adds no arrow-key behaviour.
 * @remarks Children should be `IconButton`s, which keep their 48 px targets.
 *   Pass `data-chrome` through for the layout owner.
 */
export function ControlGroup({
  label,
  className,
  children,
  ...rest
}: ControlGroupProps) {
  return (
    <Surface
      {...rest}
      role="group"
      aria-label={label}
      radius="control"
      className={className ? `${controlGroup} ${className}` : controlGroup}
    >
      {children}
    </Surface>
  );
}
