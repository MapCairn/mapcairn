import type { HTMLAttributes } from "react";
import { surface } from "./Surface.css";

/** Props for {@link Surface}. */
export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  /** The element to render. Defaults to `div`. */
  readonly as?: "div" | "section" | "aside" | "nav";
  /**
   * `floating` has the floating shadow, `raised` uses the raised surface
   * colour with no shadow, `flat` has neither. Defaults to `floating`.
   */
  readonly variant?: "floating" | "raised" | "flat";
  /** Corner radius role. Defaults to `control`. */
  readonly radius?: "pill" | "control" | "sheet";
}

/**
 * A translucent surface with backdrop blur, used by every floating control.
 * Floating surfaces carry a shadow rather than a visible border.
 * @remarks Pass `data-chrome` and `data-testid` straight through; a
 *   `section`, `aside` or `nav` needs an accessible name from the caller.
 */
export function Surface({
  as: Component = "div",
  variant = "floating",
  radius = "control",
  className,
  ...rest
}: SurfaceProps) {
  const classes = surface({ variant, radius });
  return (
    <Component
      {...rest}
      className={className ? `${classes} ${className}` : classes}
    />
  );
}
