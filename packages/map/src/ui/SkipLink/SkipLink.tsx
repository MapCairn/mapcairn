// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { visuallyHidden } from "../VisuallyHidden/VisuallyHidden.css";
import { skipLink } from "./SkipLink.css";

/** Props for {@link SkipLink}. */
export interface SkipLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href"> {
  /** The id of the element to move focus to. It must be focusable. */
  readonly targetId: string;
  /** The link text. Defaults to "Skip to map". */
  readonly children?: ReactNode;
}

/**
 * The first focusable element on the page. It is visually hidden (with the
 * shared `visuallyHidden` class) until it receives focus, then shows with the
 * focus ring. Activating it moves focus to the
 * target, which must be focusable (for example a region with `tabIndex={-1}`).
 * @remarks The native hash jump is only prevented when the target exists, so
 *   the link still works as an ordinary anchor if the target is missing.
 */
export function SkipLink({
  targetId,
  children = "Skip to map",
  className,
  onClick,
  ...rest
}: SkipLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }
    const target = event.currentTarget.ownerDocument.getElementById(targetId);
    if (target) {
      event.preventDefault();
      target.focus();
    }
  };
  return (
    <a
      {...rest}
      href={`#${targetId}`}
      className={
        className
          ? `${visuallyHidden} ${skipLink} ${className}`
          : `${visuallyHidden} ${skipLink}`
      }
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
