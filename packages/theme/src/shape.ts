// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import type { ThemeOverride } from "./checkThemeContrast";

/** The corner presets a host can choose: the values `ThemeOverride.shape` takes. */
export type ThemeShape = NonNullable<ThemeOverride["shape"]>;

/** The radius roles a preset sets. The circular role (`round`) is never one of them. */
export const SHAPE_RADIUS_ROLES = [
  "pill",
  "sheet",
  "control",
  "inner",
] as const;

/** One of {@link SHAPE_RADIUS_ROLES}. */
export type ShapeRadiusRole = (typeof SHAPE_RADIUS_ROLES)[number];

/**
 * The radii of the presets that differ from the SDK's own. `default` has no
 * entry: it writes nothing. The round preset keeps the pill at its own radius,
 * which is half the height of the 48px search row, so it is still a pill, and
 * keeps the controls and rows under half their 44px minimum height, so a
 * corner never reaches the content inside it (checked by
 * `packages/web/e2e/theme-shape.spec.ts`).
 */
export const SHAPE_RADII: Readonly<
  Record<
    Exclude<ThemeShape, "default">,
    Readonly<Record<ShapeRadiusRole, string>>
  >
> = {
  square: { pill: "4px", sheet: "4px", control: "2px", inner: "2px" },
  round: { pill: "24px", sheet: "28px", control: "22px", inner: "16px" },
};

/** The result of reading a shape from a host. */
export type ShapeReading =
  | { ok: true; radii: Readonly<Record<ShapeRadiusRole, string>> | undefined }
  | { ok: false; reason: "malformed" | "unparseable" };

/**
 * Reads the shape a host chose: one of the three preset names, exactly as
 * written. A value that is not a string is malformed and any other string is
 * unparseable. `default` reads as no radii, since the SDK's own apply.
 */
export function readShape(value: unknown): ShapeReading {
  if (typeof value !== "string") {
    return { ok: false, reason: "malformed" };
  }
  switch (value) {
    case "default":
      return { ok: true, radii: undefined };
    case "square":
    case "round":
      return { ok: true, radii: SHAPE_RADII[value] };
    default:
      return { ok: false, reason: "unparseable" };
  }
}
