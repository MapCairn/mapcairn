// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * WCAG contrast maths with no dependencies. It parses the colour syntaxes the
 * token file uses (hex, `rgb()`/`rgba()` and `oklch()`), composites alpha the
 * way browsers do and computes relative luminance and contrast ratios. The
 * token tests use it to enforce AA over the worst-case map backdrops.
 */

/** A colour in gamma-encoded sRGB. Channels are 0 to 255, alpha is 0 to 1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A colour as the token files write it, or one already parsed. */
export type ColourInput = string | Rgba;

const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// Padding inside the brackets is dropped by `splitArguments`, so the capture
// takes everything up to the closing bracket. A lazy group between two `\s*`
// runs backtracks quadratically on a long run of spaces.
const RGB_RE = /^rgba?\(([^)]*)\)$/i;
const OKLCH_RE = /^oklch\(([^)]*)\)$/i;

/**
 * Parses a CSS alpha value written as a number (`0.5`) or a percentage
 * (`50%`), defaulting to opaque when it is absent.
 */
function parseAlpha(value: string | undefined): number {
  if (value === undefined || value === "") {
    return 1;
  }
  return value.endsWith("%")
    ? Number.parseFloat(value) / 100
    : Number.parseFloat(value);
}

/** Splits the inside of a functional colour on commas, spaces and `/`. */
function splitArguments(inner: string): string[] {
  return inner.split(/[\s,/]+/).filter((part) => part !== "");
}

/** Converts a gamma-encoded sRGB channel (0 to 1) to linear light. */
function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Converts a linear-light channel to gamma-encoded sRGB (0 to 1). */
function linearToSrgb(channel: number): number {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/**
 * Converts OKLCH to linear sRGB using Björn Ottosson's matrices. Channels
 * outside 0 to 1 are out of the sRGB gamut and are returned unclipped.
 */
function oklchToLinearSrgb(
  lightness: number,
  chroma: number,
  hueDegrees: number,
): [number, number, number] {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Reads the `L C H [/ alpha]` arguments of an `oklch()` colour. */
function readOklch(colour: string): {
  lightness: number;
  chroma: number;
  hue: number;
  alpha: number;
} {
  const match = OKLCH_RE.exec(colour.trim());
  if (!match) {
    throw new Error(`Cannot parse colour: ${colour}`);
  }
  const [rawL, rawC, rawH, rawAlpha] = splitArguments(match[1] ?? "");
  if (rawL === undefined || rawC === undefined || rawH === undefined) {
    throw new Error(`Cannot parse colour: ${colour}`);
  }
  return {
    lightness: rawL.endsWith("%")
      ? Number.parseFloat(rawL) / 100
      : Number.parseFloat(rawL),
    chroma: Number.parseFloat(rawC),
    hue: Number.parseFloat(rawH),
    alpha: parseAlpha(rawAlpha),
  };
}

/**
 * Whether an `oklch()` colour fits inside the sRGB gamut without clipping.
 * Token colours must, otherwise a wide-gamut display would render a colour
 * the contrast maths never measured. Non-OKLCH colours are always in gamut.
 */
export function isInSrgbGamut(colour: string): boolean {
  if (!OKLCH_RE.test(colour.trim())) {
    parseColour(colour);
    return true;
  }
  const { lightness, chroma, hue } = readOklch(colour);
  const epsilon = 1e-4;
  return oklchToLinearSrgb(lightness, chroma, hue).every(
    (channel) => channel >= -epsilon && channel <= 1 + epsilon,
  );
}

/**
 * Parses a hex, `rgb()`/`rgba()` or `oklch()` colour to gamma-encoded sRGB.
 * OKLCH colours that fall outside the gamut are clipped per channel; use
 * {@link isInSrgbGamut} to keep tokens from relying on that.
 * @throws When the string is not in a supported syntax.
 */
export function parseColour(colour: string): Rgba {
  const text = colour.trim();
  if (text.toLowerCase() === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const hex = HEX_RE.exec(text);
  if (hex) {
    let digits = hex[1] ?? "";
    if (digits.length <= 4) {
      digits = [...digits].map((digit) => digit + digit).join("");
    }
    const channel = (index: number): number =>
      Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16);
    return {
      r: channel(0),
      g: channel(1),
      b: channel(2),
      a: digits.length === 8 ? channel(3) / 255 : 1,
    };
  }

  const rgb = RGB_RE.exec(text);
  if (rgb) {
    const [r, g, b, alpha] = splitArguments(rgb[1] ?? "");
    if (r === undefined || g === undefined || b === undefined) {
      throw new Error(`Cannot parse colour: ${colour}`);
    }
    return {
      r: Number.parseFloat(r),
      g: Number.parseFloat(g),
      b: Number.parseFloat(b),
      a: parseAlpha(alpha),
    };
  }

  if (OKLCH_RE.test(text)) {
    const { lightness, chroma, hue, alpha } = readOklch(text);
    const [r, g, b] = oklchToLinearSrgb(lightness, chroma, hue).map(
      (channel) =>
        Math.min(
          1,
          Math.max(0, linearToSrgb(Math.min(1, Math.max(0, channel)))),
        ) * 255,
    ) as [number, number, number];
    return { r, g, b, a: alpha };
  }

  throw new Error(`Cannot parse colour: ${colour}`);
}

/** Coerces a string or parsed colour to {@link Rgba}. */
function toRgba(colour: ColourInput): Rgba {
  return typeof colour === "string" ? parseColour(colour) : colour;
}

/**
 * Composites `foreground` over `backdrop` in gamma-encoded sRGB, which is
 * what browsers do for `rgba()` and `oklch(... / a)`. The result is opaque
 * whenever the backdrop is.
 */
export function compositeOver(
  foreground: ColourInput,
  backdrop: ColourInput,
): Rgba {
  const top = toRgba(foreground);
  const bottom = toRgba(backdrop);
  const alpha = top.a + bottom.a * (1 - top.a);
  if (alpha === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const mix = (front: number, back: number): number =>
    (front * top.a + back * bottom.a * (1 - top.a)) / alpha;
  return {
    r: mix(top.r, bottom.r),
    g: mix(top.g, bottom.g),
    b: mix(top.b, bottom.b),
    a: alpha,
  };
}

/** WCAG 2.x relative luminance of an opaque colour, from 0 (black) to 1. */
export function relativeLuminance(colour: Rgba): number {
  return (
    0.2126 * srgbToLinear(colour.r / 255) +
    0.7152 * srgbToLinear(colour.g / 255) +
    0.0722 * srgbToLinear(colour.b / 255)
  );
}

/**
 * WCAG contrast ratio, from 1 to 21, between two opaque colours.
 * @throws When either colour is translucent. Composite it over a backdrop
 *   with {@link compositeOver} first, because the ratio depends on it.
 */
export function contrastRatio(a: ColourInput, b: ColourInput): number {
  const first = toRgba(a);
  const second = toRgba(b);
  if (first.a < 1 || second.a < 1) {
    throw new Error("Cannot compute contrast for a translucent colour");
  }
  const [lighter, darker] = [
    relativeLuminance(first),
    relativeLuminance(second),
  ].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Formats a colour as `#rrggbb`, or `#rrggbbaa` when it is translucent. */
export function toHex(colour: Rgba): string {
  const byte = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0");
  const alpha = colour.a < 1 ? byte(colour.a * 255) : "";
  return `#${byte(colour.r)}${byte(colour.g)}${byte(colour.b)}${alpha}`;
}
