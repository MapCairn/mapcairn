// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ElementType, HTMLAttributes } from "react";
import { visuallyHidden } from "./VisuallyHidden.css";

/** Props for {@link VisuallyHidden}. */
export interface VisuallyHiddenProps extends HTMLAttributes<HTMLElement> {
  /** The element to render. Defaults to `span`. */
  readonly as?: ElementType;
}

/**
 * The one way to provide screen-reader-only text, such as a hidden heading or
 * keyboard instructions. Nothing else in the app may hide text this way.
 */
export function VisuallyHidden({
  as: Component = "span",
  className,
  ...rest
}: VisuallyHiddenProps) {
  return (
    <Component
      {...rest}
      className={className ? `${visuallyHidden} ${className}` : visuallyHidden}
    />
  );
}
