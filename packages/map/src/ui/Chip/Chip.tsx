// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { Check } from "lucide-react";
import type { HTMLAttributes, MouseEventHandler, ReactNode } from "react";
import { Icon, type IconComponent } from "../Icon";
import { chip, selectedMark } from "./Chip.css";

/** Props for {@link Chip}. */
export interface ChipProps
  extends Omit<HTMLAttributes<HTMLElement>, "children" | "onClick"> {
  /** The chip text. */
  readonly children: ReactNode;
  /** A leading icon, imported by name from `lucide-react`. */
  readonly icon?: IconComponent;
  /**
   * Whether the chip is on. Shown with a check icon in place of the leading
   * icon. On a chip with `onClick` it is also `aria-pressed`.
   */
  readonly selected?: boolean;
  /** Makes the chip a toggle button. Without it the chip is a plain label. */
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
}

/**
 * A small pill. With `onClick` it is a toggle `button` with `aria-pressed`;
 * without it, a static `span` that only labels.
 */
export function Chip({
  children,
  icon,
  selected = false,
  onClick,
  className,
  ...rest
}: ChipProps) {
  const actionable = onClick !== undefined;
  const classes = chip({ actionable, selected });
  const merged = className ? `${classes} ${className}` : classes;
  const leadingIcon = icon ? <Icon icon={icon} /> : null;
  const glyph = selected ? (
    <Icon icon={Check} className={selectedMark} />
  ) : (
    leadingIcon
  );
  if (actionable) {
    return (
      <button
        {...rest}
        type="button"
        className={merged}
        aria-pressed={selected}
        onClick={onClick}
      >
        {glyph}
        {children}
      </button>
    );
  }
  return (
    <span {...rest} className={merged}>
      {glyph}
      {children}
    </span>
  );
}
