import { compositeOver, toHex } from "./contrast";

/**
 * Every design-token value as plain typed data, with no vanilla-extract in
 * sight. `tokens.css.ts` turns this into CSS custom properties; the unit
 * tests (`contrast.test.ts`) and the documentation read it directly.
 *
 * Colours are `oklch()` strings so the palette is built from lightness steps
 * rather than hand-picked hex. Every colour stays inside the sRGB gamut, which
 * `contrast.test.ts` enforces so the contrast maths matches what any display
 * renders.
 */

/**
 * Neutral ramp with a faint cool tint (hue 250, chroma at most 0.012).
 * Steps run light to dark; the number is the usual 50 to 950 scale.
 */
export const neutral = {
  50: "oklch(0.975 0.003 250)",
  100: "oklch(0.955 0.004 250)",
  200: "oklch(0.915 0.005 250)",
  300: "oklch(0.86 0.007 250)",
  400: "oklch(0.74 0.009 250)",
  500: "oklch(0.62 0.011 250)",
  600: "oklch(0.53 0.012 250)",
  700: "oklch(0.44 0.012 250)",
  800: "oklch(0.34 0.011 250)",
  850: "oklch(0.28 0.01 250)",
  900: "oklch(0.22 0.01 250)",
  950: "oklch(0.17 0.008 250)",
} as const;

/**
 * The one accent: a clear blue at hue 255. Chroma follows the sRGB gamut edge
 * at each lightness, which is why it peaks in the middle of the ramp.
 * Step 600 is the map overlay blue and the light focus ring; 700 is the light
 * accent used for text and fills; 300 is the dark accent.
 */
export const accent = {
  50: "oklch(0.97 0.013 255)",
  100: "oklch(0.93 0.032 255)",
  200: "oklch(0.87 0.06 255)",
  300: "oklch(0.8 0.095 255)",
  400: "oklch(0.74 0.125 255)",
  500: "oklch(0.66 0.17 255)",
  600: "oklch(0.55 0.175 255)",
  700: "oklch(0.46 0.15 255)",
  800: "oklch(0.39 0.125 255)",
  900: "oklch(0.32 0.095 255)",
} as const;

/** Red used only for errors and destructive actions. */
const red = {
  tintLight: "oklch(0.95 0.024 25)",
  textLight: "oklch(0.48 0.17 27)",
  tintDark: "oklch(0.3 0.07 25)",
  textDark: "oklch(0.82 0.095 25)",
} as const;

/**
 * Backdrops that surface contrast is measured over. A translucent surface
 * takes on whatever map is under it, so tests composite over both extremes,
 * plus the light basemaps for the things drawn on the map. Every built-in
 * basemap is light; pure black stands in for any dark map a host adds.
 */
export const representativeBackdrops = {
  white: "#ffffff",
  black: "#000000",
  /** Close to a light OpenStreetMap or Positron land colour. */
  lightMap: "#f2efe9",
  /**
   * The land (background layer) colour of OpenFreeMap Liberty, the default
   * basemap in both themes. It must equal `DEFAULT_BASEMAP_BACKGROUND` in
   * `@karta/core`, which this package cannot import; a test in
   * `packages/web` checks that they agree.
   */
  liberty: "#f8f4f0",
} as const;

/** The semantic colour roles. Components use these and never a ramp step. */
export interface ColourRoles {
  /** Floating chrome (search pill, control groups, sheet). Translucent by default. */
  surface: string;
  /** A surface raised inside another surface (inputs, cards). */
  surfaceRaised: string;
  /** Body text and icons. */
  text: string;
  /** Secondary text. Never used below 13px and never as the only cue. */
  textMuted: string;
  /** The accent: links, selected state, switch-on, selected basemap outline. */
  accent: string;
  /** Opaque tint behind selected rows and chips. */
  accentTint: string;
  /** Text and icons placed on `accent`. */
  accentContrast: string;
  /** Dividers inside lists and between grouped controls. Decorative. */
  hairline: string;
  /** The edge of an input, switch track or slider track, where the edge identifies the control. */
  controlBoundary: string;
  /** Border for floating chrome. Transparent by default so forced colours can paint it. */
  chromeBorder: string;
  /** Error text and icons. */
  danger: string;
  /** Opaque tint behind an error message. */
  dangerTint: string;
  /** Veil behind a modal sheet. */
  scrim: string;
  /** Outer tone of the two-tone focus ring. */
  focusRing: string;
  /** Inner tone of the focus ring, in the surface colour. */
  focusRingInner: string;
  /**
   * Full pages that are not the map (privacy, errors, the style guide) and
   * the document behind everything. Follows the theme.
   */
  pageBackground: string;
  /**
   * Colour of the map region before the map draws: the default basemap's
   * land colour, the same in both themes, so the first view does not flash a
   * different colour before the basemap appears.
   */
  mapBackground: string;
  /** Dropped pin. */
  mapPin: string;
  /** Measurement line. */
  mapMeasureLine: string;
  /** Measured area fill. Translucent by design. */
  mapMeasureFill: string;
  /** Location accuracy circle outline. */
  mapAccuracy: string;
  /** Location accuracy circle fill. Translucent by design. */
  mapAccuracyFill: string;
  /** Outline that separates a pin or line from the map beneath. */
  mapHalo: string;
  /** Scale bar line. */
  mapScaleLine: string;
}

/** Names of the colour roles, in declaration order. */
export const colourRoleNames = [
  "surface",
  "surfaceRaised",
  "text",
  "textMuted",
  "accent",
  "accentTint",
  "accentContrast",
  "hairline",
  "controlBoundary",
  "chromeBorder",
  "danger",
  "dangerTint",
  "scrim",
  "focusRing",
  "focusRingInner",
  "pageBackground",
  "mapBackground",
  "mapPin",
  "mapMeasureLine",
  "mapMeasureFill",
  "mapAccuracy",
  "mapAccuracyFill",
  "mapHalo",
  "mapScaleLine",
] as const satisfies readonly (keyof ColourRoles)[];

/** The two themes. */
export type ThemeName = "light" | "dark";

/** Everything that differs between light and dark. */
export interface ThemeValues {
  /** Default colours. Surfaces are translucent and sit behind a backdrop blur. */
  colour: ColourRoles;
  /**
   * The same roles with opaque surfaces. Used where `backdrop-filter` is not
   * supported and under `prefers-reduced-transparency`.
   */
  opaque: ColourRoles;
  /**
   * `prefers-contrast: more`: opaque surfaces, muted text and hairlines raised
   * to at least 4.5:1 and 3:1. Fully merged so tests can treat every set alike.
   */
  contrastMore: ColourRoles;
  /** The two elevation shadows. Dark values are stronger and add a faint top highlight. */
  shadow: { floating: string; sheet: string };
}

const lightColour: ColourRoles = {
  surface: "oklch(1 0 0 / 0.82)",
  surfaceRaised: "oklch(1 0 0 / 0.94)",
  text: neutral[900],
  textMuted: neutral[700],
  accent: accent[700],
  accentTint: accent[100],
  accentContrast: "oklch(1 0 0)",
  hairline: "oklch(0.22 0.01 250 / 0.12)",
  controlBoundary: neutral[600],
  chromeBorder: "transparent",
  danger: red.textLight,
  dangerTint: red.tintLight,
  scrim: "oklch(0 0 0 / 0.4)",
  focusRing: accent[600],
  focusRingInner: "oklch(1 0 0)",
  pageBackground: "oklch(0.95 0.008 85)",
  mapBackground: representativeBackdrops.liberty,
  mapPin: accent[600],
  mapMeasureLine: accent[600],
  mapMeasureFill: "oklch(0.55 0.175 255 / 0.18)",
  mapAccuracy: accent[600],
  mapAccuracyFill: "oklch(0.55 0.175 255 / 0.12)",
  mapHalo: "oklch(1 0 0)",
  mapScaleLine: "oklch(0.56 0.008 250)",
};

const darkColour: ColourRoles = {
  surface: "oklch(0.19 0.008 250 / 0.8)",
  surfaceRaised: "oklch(0.25 0.009 250 / 0.88)",
  text: neutral[50],
  textMuted: neutral[300],
  accent: accent[300],
  accentTint: "oklch(0.3 0.06 255)",
  accentContrast: neutral[950],
  hairline: "oklch(1 0 0 / 0.14)",
  controlBoundary: "oklch(0.7 0.01 250)",
  chromeBorder: "transparent",
  danger: red.textDark,
  dangerTint: red.tintDark,
  scrim: "oklch(0 0 0 / 0.6)",
  focusRing: accent[500],
  focusRingInner: "oklch(0.19 0.008 250)",
  pageBackground: "oklch(0.24 0.008 250)",
  mapBackground: representativeBackdrops.liberty,
  mapPin: accent[600],
  mapMeasureLine: accent[600],
  mapMeasureFill: "oklch(0.55 0.175 255 / 0.28)",
  mapAccuracy: accent[600],
  mapAccuracyFill: "oklch(0.55 0.175 255 / 0.2)",
  mapHalo: "oklch(0.19 0.008 250)",
  mapScaleLine: "oklch(0.56 0.008 250)",
};

/** Light and dark values for every themed token. */
export const themeValues: Record<ThemeName, ThemeValues> = {
  light: {
    colour: lightColour,
    opaque: {
      ...lightColour,
      surface: "oklch(0.995 0.002 250)",
      surfaceRaised: "oklch(1 0 0)",
    },
    contrastMore: {
      ...lightColour,
      surface: "oklch(1 0 0)",
      surfaceRaised: "oklch(1 0 0)",
      text: "oklch(0.15 0.01 250)",
      textMuted: neutral[800],
      hairline: neutral[600],
      controlBoundary: neutral[700],
      chromeBorder: neutral[700],
    },
    shadow: {
      floating:
        "0 1px 2px oklch(0.2 0.02 250 / 0.12), 0 4px 16px oklch(0.2 0.02 250 / 0.14)",
      sheet:
        "0 0 2px oklch(0.2 0.02 250 / 0.1), 0 -4px 24px oklch(0.2 0.02 250 / 0.16), 0 8px 32px oklch(0.2 0.02 250 / 0.12)",
    },
  },
  dark: {
    colour: darkColour,
    opaque: {
      ...darkColour,
      surface: "oklch(0.2 0.008 250)",
      surfaceRaised: "oklch(0.26 0.009 250)",
    },
    contrastMore: {
      ...darkColour,
      surface: "oklch(0.17 0.008 250)",
      surfaceRaised: "oklch(0.17 0.008 250)",
      text: "oklch(1 0 0)",
      textMuted: neutral[100],
      hairline: neutral[400],
      controlBoundary: neutral[300],
      chromeBorder: neutral[300],
      focusRingInner: "oklch(0.17 0.008 250)",
    },
    shadow: {
      floating:
        "0 1px 2px oklch(0 0 0 / 0.4), 0 4px 16px oklch(0 0 0 / 0.45), inset 0 1px 0 oklch(1 0 0 / 0.07)",
      sheet:
        "0 0 2px oklch(0 0 0 / 0.4), 0 -4px 24px oklch(0 0 0 / 0.5), 0 8px 32px oklch(0 0 0 / 0.4), inset 0 1px 0 oklch(1 0 0 / 0.07)",
    },
  },
};

/**
 * Colours for `forced-colors: active`, written as CSS system colours. Only the
 * chrome roles are mapped; map overlay colours stay as they are because the
 * map is drawn on a canvas that forced colours does not recolour.
 */
export const forcedColors: Partial<ColourRoles> = {
  surface: "Canvas",
  surfaceRaised: "Canvas",
  text: "CanvasText",
  textMuted: "CanvasText",
  accent: "Highlight",
  accentTint: "Canvas",
  accentContrast: "HighlightText",
  hairline: "CanvasText",
  controlBoundary: "ButtonBorder",
  chromeBorder: "CanvasText",
  danger: "CanvasText",
  dangerTint: "Canvas",
  focusRing: "Highlight",
  focusRingInner: "Canvas",
  pageBackground: "Canvas",
  mapBackground: "Canvas",
};

/**
 * Opaque colours for the `theme-color` meta tag: the default surface
 * flattened over each theme's page background, so the browser chrome keeps
 * the theme's own lightness above the map and on every other page.
 */
export const themeColor: Record<ThemeName, string> = {
  light: toHex(
    compositeOver(
      themeValues.light.colour.surface,
      themeValues.light.colour.pageBackground,
    ),
  ),
  dark: toHex(
    compositeOver(
      themeValues.dark.colour.surface,
      themeValues.dark.colour.pageBackground,
    ),
  ),
};

/** Backdrop blur applied behind translucent surfaces. */
export const blurValue = "blur(20px) saturate(150%)";

/** Spacing scale in pixels, plus the screen inset. */
export const space = {
  xxs: "4px",
  xs: "8px",
  sm: "12px",
  md: "16px",
  lg: "24px",
  xl: "32px",
} as const;

/** Distance from the screen edge to floating chrome. */
export const inset = "12px";

/** Corner radii by role. */
export const radius = {
  pill: "24px",
  sheet: "20px",
  control: "14px",
  inner: "10px",
  round: "50%",
} as const;

/**
 * Type scale. Sizes are in rem so they follow the user's font size; line
 * height is unitless and tracking is in em. Only weights 400 and 600 exist.
 */
export const typeScale = {
  small: { size: "0.8125rem", lineHeight: "1.4", tracking: "0.01em" },
  body: { size: "0.9375rem", lineHeight: "1.45", tracking: "0em" },
  large: { size: "1.0625rem", lineHeight: "1.4", tracking: "-0.005em" },
  title: { size: "1.375rem", lineHeight: "1.25", tracking: "-0.015em" },
} as const;

/** Font weights. Nothing else is declared in `@font-face`. */
export const fontWeight = { regular: "400", semibold: "600" } as const;

/**
 * The font stack: the self-hosted variable face, its metric-matched fallback
 * (declared in `packages/web/src/fonts/fonts.css`) and then system fonts that
 * also cover non-Latin place names.
 */
export const fontFamily =
  '"IBM Plex Sans Variable", "IBM Plex Sans Fallback", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Interactive sizes and the icon system. */
export const size = {
  control: "3rem",
  minTarget: "2.75rem",
  gapBetweenTargets: "0.5rem",
  icon: "24px",
  iconStroke: "1.75",
} as const;

/** Focus ring widths. `prefers-contrast: more` raises both. */
export const focusWidth = { inner: "2px", outer: "2px" } as const;

/** Focus ring widths under `prefers-contrast: more`. */
export const focusWidthContrastMore = { inner: "3px", outer: "3px" } as const;

/**
 * A critically damped-ish spring (damping ratio 0.72) sampled to `linear()`,
 * peaking about 3.5% over. Used for the sheet only.
 */
export const spring =
  "linear(0, 0.229, 0.593, 0.858, 0.992, 1.035, 1.035, 1.021, 1.009, 1.002, 0.999, 0.999, 0.999, 0.999, 1, 1, 1, 1, 1)";

/** Motion tokens. Only transform and opacity animate. */
export const motion = {
  duration: { fast: "120ms", base: "200ms", slow: "320ms" },
  /** Durations when `prefers-reduced-motion: reduce` is set. */
  durationReduced: "0.01ms",
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  spring,
} as const;

/** Z layers from bottom to top, with room between for local adjustments. */
export const zIndex = {
  map: "0",
  mapOverlay: "10",
  chrome: "20",
  chromeRaised: "30",
  sheet: "40",
  toolbar: "50",
  popover: "60",
  toast: "70",
} as const;

/** Name of a z layer. */
export type ZLayerName = keyof typeof zIndex;

/** Z layer names in stacking order, bottom to top. */
export const zLayerOrder = [
  "map",
  "mapOverlay",
  "chrome",
  "chromeRaised",
  "sheet",
  "toolbar",
  "popover",
  "toast",
] as const satisfies readonly ZLayerName[];
