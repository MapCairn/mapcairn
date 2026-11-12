// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ComponentType, SVGProps } from "react";
import { icon, spinning } from "./Icon.css";

/**
 * The shape of an icon component such as a lucide icon. Callers import the
 * icon by name from `lucide-react` and pass it in.
 */
export type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & {
    size?: number | string;
    strokeWidth?: number | string;
  }
>;

/** Props for {@link Icon}. */
export interface IconProps
  extends Omit<SVGProps<SVGSVGElement>, "ref" | "children"> {
  /** The icon component to draw, for example `Search` from `lucide-react`. */
  readonly icon: IconComponent;
  /**
   * An accessible name. Give one only when the icon is the sole content of
   * something; the icon then becomes `role="img"`. Without it the icon is
   * hidden from assistive technology.
   */
  readonly label?: string;
  /** Rotates the icon continuously. Stops under `prefers-reduced-motion`. */
  readonly spinning?: boolean;
}

/**
 * Draws one icon at the system size and stroke width. Decorative by default
 * (`aria-hidden`); pass `label` when it carries meaning on its own.
 */
export function Icon({
  icon: Glyph,
  label,
  spinning: isSpinning = false,
  className,
  ...rest
}: IconProps) {
  const classes = [icon, isSpinning ? spinning : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  const accessibility =
    label === undefined
      ? ({ "aria-hidden": true } as const)
      : ({ role: "img", "aria-label": label } as const);
  return (
    <Glyph focusable="false" {...rest} {...accessibility} className={classes} />
  );
}
