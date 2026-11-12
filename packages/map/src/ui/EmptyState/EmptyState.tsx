// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { HTMLAttributes, ReactNode } from "react";
import { Icon, type IconComponent } from "../Icon";
import { action, body, emptyIcon, emptyState, heading } from "./EmptyState.css";

/** Props for {@link EmptyState}. */
export interface EmptyStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** A decorative icon above the heading, imported by name from `lucide-react`. */
  readonly icon?: IconComponent;
  /** The heading text. A blank heading renders no heading element at all. */
  readonly heading: string;
  /** The heading level, 2 to 6. Pick the level that fits the page outline. */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** The explanation, rendered as one paragraph. */
  readonly children?: ReactNode;
  /** An optional next step, usually a `Button`. */
  readonly action?: ReactNode;
}

/**
 * What a list or panel shows when it has nothing to show: an icon, a real
 * heading, an explanation and an optional action. The heading is never empty,
 * because a blank heading is announced as a heading with no name.
 */
export function EmptyState({
  icon,
  heading: headingText,
  headingLevel = 2,
  children,
  action: actionNode,
  className,
  ...rest
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      {...rest}
      className={className ? `${emptyState} ${className}` : emptyState}
    >
      {icon ? <Icon icon={icon} className={emptyIcon} /> : null}
      {headingText.trim() === "" ? null : (
        <Heading className={heading}>{headingText}</Heading>
      )}
      {children ? <p className={body}>{children}</p> : null}
      {actionNode ? <div className={action}>{actionNode}</div> : null}
    </div>
  );
}
