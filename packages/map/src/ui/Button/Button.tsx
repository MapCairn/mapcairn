import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { Icon, type IconComponent } from "../Icon";
import { button } from "./Button.css";

/** Props for {@link Button}. */
export interface ButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-busy" | "aria-disabled" | "disabled"
  > {
  /** `primary` is the filled accent button, `quiet` has no fill. Defaults to `primary`. */
  readonly variant?: "primary" | "secondary" | "quiet";
  /** A leading icon, imported by name from `lucide-react`. */
  readonly icon?: IconComponent;
  /**
   * Replaces the leading icon with a loader and sets `aria-busy`. Clicks are
   * ignored while busy. The visible label stays, so the name is stable.
   */
  readonly busy?: boolean;
  /**
   * Disables the action with `aria-disabled`. The button stays focusable and
   * clicks do nothing.
   */
  readonly disabled?: boolean;
}

/**
 * A text button, 48 px tall at least. Defaults to `type="button"` so it never
 * submits a form by accident.
 */
export function Button({
  variant = "primary",
  icon,
  busy = false,
  disabled = false,
  type = "button",
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const classes = button({ variant });
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (disabled || busy) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  const leading = busy ? LoaderCircle : icon;
  return (
    <button
      {...rest}
      type={type}
      className={className ? `${classes} ${className}` : classes}
      aria-busy={busy ? true : undefined}
      aria-disabled={disabled ? true : undefined}
      onClick={handleClick}
    >
      {leading ? <Icon icon={leading} spinning={busy} /> : null}
      {children}
    </button>
  );
}
