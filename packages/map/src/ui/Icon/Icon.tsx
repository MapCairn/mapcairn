// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ComponentType, SVGProps } from "react";
import { icon, mirroredInRtl, spinning } from "./Icon.css";

/**
 * The shape of an icon component such as a Phosphor icon. Callers import the
 * icon by name from `@phosphor-icons/react` and pass it in.
 */
export type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & {
    size?: number | string;
    weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  }
>;

/** The weight every icon is drawn in. */
const ICON_WEIGHT = "regular";

/** The weight of an icon asked to be solid. */
const SOLID_WEIGHT = "fill";

/** Props for {@link Icon}. */
export interface IconProps
  extends Omit<SVGProps<SVGSVGElement>, "ref" | "children"> {
  /** The icon component to draw, for example `MagnifyingGlass` from `@phosphor-icons/react`. */
  readonly icon: IconComponent;
  /**
   * An accessible name. Give one only when the icon is the sole content of
   * something; the icon then becomes `role="img"`. Without it the icon is
   * hidden from assistive technology.
   */
  readonly label?: string;
  /** Draws the icon solid, as for a heart; every other icon uses the one regular weight. */
  readonly filled?: boolean;
  /** Rotates the icon continuously. Stops under `prefers-reduced-motion`. */
  readonly spinning?: boolean;
  /**
   * Flips the icon when the page reads right to left. Set it on an icon that
   * points along the reading direction, such as a back arrow or a next
   * chevron; leave it off for one that does not.
   */
  readonly mirrorInRtl?: boolean;
}

/**
 * Draws one icon at the system size and stroke width. Decorative by default
 * (`aria-hidden`); pass `label` when it carries meaning on its own.
 */
export function Icon({
  icon: Glyph,
  label,
  filled = false,
  spinning: isSpinning = false,
  mirrorInRtl = false,
  className,
  ...rest
}: IconProps) {
  const classes = [
    icon,
    isSpinning ? spinning : "",
    mirrorInRtl ? mirroredInRtl : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const accessibility =
    label === undefined
      ? ({ "aria-hidden": true } as const)
      : ({ role: "img", "aria-label": label } as const);
  return (
    <Glyph
      focusable="false"
      weight={filled ? SOLID_WEIGHT : ICON_WEIGHT}
      {...rest}
      {...accessibility}
      className={classes}
    />
  );
}
