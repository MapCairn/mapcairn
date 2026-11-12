// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { Icon, type IconComponent } from "../Icon";
import { iconButton, iconSlot, pressedBar } from "./IconButton.css";

/** Props for {@link IconButton}. */
export interface IconButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    | "aria-busy"
    | "aria-controls"
    | "aria-disabled"
    | "aria-expanded"
    | "aria-label"
    | "aria-pressed"
    | "children"
    | "disabled"
    | "type"
  > {
  /** The accessible name. Describe the action, for example "Zoom in". */
  readonly label: string;
  /** The icon to show, imported by name from `lucide-react`. */
  readonly icon: IconComponent;
  /**
   * Makes it a toggle. Renders `aria-pressed` and a shape change (tinted fill
   * plus a bar under the icon). Leave undefined for a plain action button.
   */
  readonly pressed?: boolean;
  /**
   * Shows a loader in place of the icon and sets `aria-busy`. Clicks are
   * ignored while busy. The loader spins only when motion is allowed.
   */
  readonly busy?: boolean;
  /**
   * Disables the action with `aria-disabled`. The button stays focusable so
   * its name is still discoverable, and clicks do nothing.
   */
  readonly disabled?: boolean;
  /** Sets `aria-expanded` for a button that opens a popover or panel. */
  readonly expanded?: boolean;
  /** Sets `aria-controls` to the id of the element it opens or changes. */
  readonly controls?: string;
  /** `control` is 48 px square and `compact` is 44 px. Defaults to `control`. */
  readonly size?: "control" | "compact";
}

/**
 * A button that shows only an icon. It activates on click (pointer up or
 * keyboard) and never on pointer down, so a press can be cancelled by moving
 * away before release.
 */
export function IconButton({
  label,
  icon,
  pressed,
  busy = false,
  disabled = false,
  expanded,
  controls,
  size = "control",
  className,
  onClick,
  ...rest
}: IconButtonProps) {
  const classes = iconButton({ size, pressed: pressed === true });
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (disabled || busy) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      {...rest}
      type="button"
      className={className ? `${classes} ${className}` : classes}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-busy={busy ? true : undefined}
      aria-disabled={disabled ? true : undefined}
      onClick={handleClick}
    >
      <Icon
        icon={busy ? LoaderCircle : icon}
        spinning={busy}
        className={iconSlot}
      />
      {pressed === true ? (
        <span className={pressedBar} aria-hidden="true" />
      ) : null}
    </button>
  );
}
