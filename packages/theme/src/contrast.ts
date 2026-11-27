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
  /** Red, 0 to 255, gamma-encoded. */
  r: number;
  /** Green, 0 to 255, gamma-encoded. */
  g: number;
  /** Blue, 0 to 255, gamma-encoded. */
  b: number;
  /** Opacity, 0 (clear) to 1 (opaque). A translucent colour is composited over a backdrop before its contrast is measured. */
  a: number;
}

/** A colour as the token files write it, or one already parsed. */
export type ColourInput = string | Rgba;

const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// The brackets hold anything but a closing bracket, which `readArguments`
// then splits in linear time. A lazy group between two `\s*` runs backtracks
// quadratically on a long run of spaces.
const RGB_RE = /^rgba?\([^)]*\)$/i;
const OKLCH_RE = /^oklch\([^)]*\)$/i;

const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
/** `oklch()` chroma that a percentage of 100 stands for, per CSS Color 4. */
const OKLCH_CHROMA_AT_100_PERCENT = 0.4;
const MAX_CHANNEL = 255;

function cannotParse(colour: string): Error {
  return new Error(`Cannot parse colour: ${colour}`);
}

/** Reads a finite CSS number, or `undefined` when the text is not one. */
function readNumber(text: string): number | undefined {
  if (!NUMBER_RE.test(text)) {
    return undefined;
  }
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Reads a number or a percentage as a fraction of `percentBasis`, then clamps
 * it to `[min, max]` the way CSS does for out-of-range colour components.
 * Returns `undefined` for anything else, including keywords such as `none`.
 */
function readComponent(
  text: string,
  percentBasis: number,
  min: number,
  max: number,
): number | undefined {
  const isPercent = text.endsWith("%");
  const value = readNumber(isPercent ? text.slice(0, -1) : text);
  if (value === undefined) {
    return undefined;
  }
  const scaled = isPercent ? (value / 100) * percentBasis : value;
  return Math.min(max, Math.max(min, scaled));
}

/** Reads an optional alpha: a number or percentage, clamped to 0 to 1. */
function readAlpha(text: string | undefined): number | undefined {
  return text === undefined ? 1 : readComponent(text, 1, 0, 1);
}

/** Reads a hue in degrees, with or without the `deg` unit. Other units are not supported. */
function readHue(text: string): number | undefined {
  return readNumber(
    text.toLowerCase().endsWith("deg") ? text.slice(0, -3) : text,
  );
}

/** The arguments of a functional colour, tokenised. */
interface ColourArguments {
  components: [string, string, string];
  alpha: string | undefined;
  /** Whether the commas syntax was used. */
  legacy: boolean;
}

function isToken(text: string): boolean {
  return text !== "" && !/\s/.test(text);
}

/** `r, g, b` or `r, g, b, alpha`: exactly the right commas, no slash. */
function readLegacyArguments(text: string): ColourArguments | undefined {
  const parts = text.split(",").map((part) => part.trim());
  const [first, second, third, alpha] = parts;
  if (
    (parts.length !== 3 && parts.length !== 4) ||
    first === undefined ||
    second === undefined ||
    third === undefined ||
    !parts.every(isToken)
  ) {
    return undefined;
  }
  return { components: [first, second, third], alpha, legacy: true };
}

/** `a b c` or `a b c / alpha`: spaces, and the slash only before the last argument. */
function readModernArguments(text: string): ColourArguments | undefined {
  const slash = text.indexOf("/");
  const alphaText = slash < 0 ? undefined : text.slice(slash + 1).trim();
  const [first, second, third, ...surplus] = (
    slash < 0 ? text : text.slice(0, slash)
  )
    .trim()
    .split(/\s+/);
  if (
    alphaText?.includes("/") ||
    surplus.length > 0 ||
    first === undefined ||
    second === undefined ||
    third === undefined ||
    !isToken(first) ||
    !isToken(second) ||
    !isToken(third) ||
    (alphaText !== undefined && !isToken(alphaText))
  ) {
    return undefined;
  }
  return {
    components: [first, second, third],
    alpha: alphaText,
    legacy: false,
  };
}

/**
 * Tokenises the inside of a functional colour the way CSS does: the commas
 * syntax (only where `allowLegacy`) has exactly three or four comma-separated
 * values and no slash; the spaces syntax has three values and an optional
 * `/ alpha` as the last argument only. Empty arguments are refused.
 */
function readArguments(
  inner: string,
  allowLegacy: boolean,
): ColourArguments | undefined {
  const text = inner.trim();
  if (!text.includes(",")) {
    return readModernArguments(text);
  }
  return allowLegacy && !text.includes("/")
    ? readLegacyArguments(text)
    : undefined;
}

/** The text between the brackets of a matched functional colour. */
function insideBrackets(text: string): string {
  return text.slice(text.indexOf("(") + 1, -1);
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

/** An opaque colour in OKLCH: lightness 0 to 1, chroma, and hue in degrees. */
export interface Oklch {
  lightness: number;
  chroma: number;
  hue: number;
}

const HALF_TURN = 180;
const FULL_TURN = HALF_TURN * 2;
/** Bisection steps that narrow the gamut edge to well under one 8-bit channel step. */
const GAMUT_SEARCH_STEPS = 24;
/** An upper bound for the chroma of any sRGB colour. */
const MAX_SRGB_CHROMA = 0.4;

/** Converts an sRGB colour (0 to 255 channels, alpha ignored) to OKLCH. */
export function toOklch(colour: Rgba): Oklch {
  const [r, g, b] = [colour.r, colour.g, colour.b].map((channel) =>
    srgbToLinear(channel / MAX_CHANNEL),
  ) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const degrees = (Math.atan2(bAxis, a) * HALF_TURN) / Math.PI;
  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    chroma: Math.hypot(a, bAxis),
    hue: (degrees + FULL_TURN) % FULL_TURN,
  };
}

/** The largest chroma at this lightness and hue that stays inside the sRGB gamut. */
export function maxSrgbChroma(lightness: number, hue: number): number {
  const inside = (chroma: number): boolean =>
    oklchToLinearSrgb(lightness, chroma, hue).every(
      (channel) => channel >= 0 && channel <= 1,
    );
  let [low, high] = [0, MAX_SRGB_CHROMA];
  for (let step = 0; step < GAMUT_SEARCH_STEPS; step += 1) {
    const middle = (low + high) / 2;
    [low, high] = inside(middle) ? [middle, high] : [low, middle];
  }
  return low;
}

/** Reads the `L C H [/ alpha]` arguments of text already matched as `oklch()`. */
function readOklch(colour: string): {
  lightness: number;
  chroma: number;
  hue: number;
  alpha: number;
} {
  const text = colour.trim();
  const args = readArguments(insideBrackets(text), false);
  if (args === undefined) {
    throw cannotParse(colour);
  }
  const [rawL, rawC, rawH] = args.components;
  const lightness = readComponent(rawL, 1, 0, 1);
  const chroma = readComponent(rawC, OKLCH_CHROMA_AT_100_PERCENT, 0, Infinity);
  const hue = readHue(rawH);
  const alpha = readAlpha(args.alpha);
  if (
    lightness === undefined ||
    chroma === undefined ||
    hue === undefined ||
    alpha === undefined
  ) {
    throw cannotParse(colour);
  }
  return { lightness, chroma, hue, alpha };
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
 * Numbers and percentages are read strictly: each component must be a finite
 * number or percentage, the argument count must be right, and an `oklch()`
 * hue may be plain or in degrees (other angle units are refused). Components
 * outside their range are clamped as CSS does. OKLCH colours that fall outside the gamut are clipped per channel; use
 * `isInSrgbGamut` to keep tokens from relying on that.
 * @throws When the string is not in a supported syntax.
 */
export function parseColour(colour: string): Rgba {
  const text = colour.trim();
  if (text.toLowerCase() === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  if (HEX_RE.test(text)) {
    let digits = text.slice(1);
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

  if (RGB_RE.test(text)) {
    const args = readArguments(insideBrackets(text), true);
    if (args === undefined) {
      throw cannotParse(colour);
    }
    const percents = args.components.filter((part) => part.endsWith("%"));
    if (args.legacy && percents.length % 3 !== 0) {
      throw cannotParse(colour);
    }
    const [r, g, b] = args.components.map((part) =>
      readComponent(part, MAX_CHANNEL, 0, MAX_CHANNEL),
    );
    const a = readAlpha(args.alpha);
    if (
      r === undefined ||
      g === undefined ||
      b === undefined ||
      a === undefined
    ) {
      throw cannotParse(colour);
    }
    return { r, g, b, a };
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
