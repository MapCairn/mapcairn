import {
  assignVars,
  createGlobalTheme,
  createThemeContract,
  type GlobalStyleRule,
  globalStyle,
} from "@vanilla-extract/css";
import {
  blurValue,
  type ColourRoles,
  colourRoleNames,
  focusWidth,
  focusWidthContrastMore,
  fontFamily,
  fontWeight,
  forcedColors,
  inset,
  motion,
  radius,
  size,
  space,
  type ThemeName,
  type ThemeValues,
  themeValues,
  typeScale,
  zIndex,
} from "./tokenValues";

/** The `[data-theme]` attribute selector for a theme. */
const attribute = (theme: ThemeName): string => `[data-theme="${theme}"]`;

/** Light theme selector. It is also the default when no attribute is set. */
const LIGHT = `:root, ${attribute("light")}`;
/** Dark theme selector for an explicit `data-theme="dark"`. */
const DARK = attribute("dark");
/**
 * Dark values for a no-script load: with no `data-theme` attribute the page
 * follows the operating system. Specificity (0,2,0) beats the plain `:root`
 * light block, which is why every override below is also emitted in this
 * context.
 */
const OS_DARK_SELECTOR = ":root:not([data-theme])";
const OS_DARK_QUERY = "(prefers-color-scheme: dark)";

const colourContract = Object.fromEntries(
  colourRoleNames.map((name) => [name, null]),
) as { [Role in keyof ColourRoles]: null };

/**
 * The whole token contract: every custom property that components may read.
 * Colours, shadows and the blur change with the theme; everything else is
 * assigned once on `:root`.
 *
 * Components use these references in vanilla-extract styles, so a typo is a
 * type error rather than a silently missing variable.
 */
export const tokens = createThemeContract({
  color: colourContract,
  shadow: { floating: null, sheet: null },
  effect: { blur: null },
  space: {
    xxs: null,
    xs: null,
    sm: null,
    md: null,
    lg: null,
    xl: null,
    inset: null,
  },
  radius: { pill: null, sheet: null, control: null, inner: null, round: null },
  type: {
    family: null,
    weight: { regular: null, semibold: null },
    small: { size: null, lineHeight: null, tracking: null },
    body: { size: null, lineHeight: null, tracking: null },
    large: { size: null, lineHeight: null, tracking: null },
    title: { size: null, lineHeight: null, tracking: null },
  },
  size: {
    control: null,
    minTarget: null,
    gapBetweenTargets: null,
    icon: null,
    iconStroke: null,
  },
  focus: { innerWidth: null, outerWidth: null },
  motion: {
    duration: { fast: null, base: null, slow: null },
    easing: null,
    spring: null,
  },
  z: {
    map: null,
    mapOverlay: null,
    chrome: null,
    chromeRaised: null,
    sheet: null,
    toolbar: null,
    popover: null,
    toast: null,
  },
});

/** The groups of the contract that change with the theme. */
const themedContract = {
  color: tokens.color,
  shadow: tokens.shadow,
  effect: tokens.effect,
};

/** The groups assigned once, on `:root`. */
const staticContract = {
  space: tokens.space,
  radius: tokens.radius,
  type: tokens.type,
  size: tokens.size,
  focus: tokens.focus,
  motion: tokens.motion,
  z: tokens.z,
};

/** Themed values for one theme, taking colours from the given set. */
function themedValues(
  theme: ThemeName,
  set: "colour" | "opaque" | "contrastMore" = "colour",
  blur: string = blurValue,
): {
  color: ColourRoles;
  shadow: ThemeValues["shadow"];
  effect: { blur: string };
} {
  const values = themeValues[theme];
  return { color: values[set], shadow: values.shadow, effect: { blur } };
}

createGlobalTheme(":root", staticContract, {
  space: {
    ...space,
    inset,
  },
  radius,
  type: {
    family: fontFamily,
    weight: fontWeight,
    small: typeScale.small,
    body: typeScale.body,
    large: typeScale.large,
    title: typeScale.title,
  },
  size,
  focus: { innerWidth: focusWidth.inner, outerWidth: focusWidth.outer },
  motion: {
    duration: motion.duration,
    easing: motion.easing,
    spring: motion.spring,
  },
  z: zIndex,
});

createGlobalTheme(LIGHT, themedContract, themedValues("light"));
createGlobalTheme(DARK, themedContract, themedValues("dark"));
globalStyle(OS_DARK_SELECTOR, {
  "@media": {
    [OS_DARK_QUERY]: { vars: assignVars(themedContract, themedValues("dark")) },
  },
});

/** A condition under which a set of variables is overridden. */
type Condition = { media: string } | { supports: string };

/** Wraps variables in a condition, optionally nested under the OS-dark query. */
function conditional(
  condition: Condition,
  vars: Record<string, string>,
  osDark: boolean,
): GlobalStyleRule {
  if ("media" in condition) {
    const query = osDark
      ? `${OS_DARK_QUERY} and ${condition.media}`
      : condition.media;
    return { "@media": { [query]: { vars } } };
  }
  const supports = { "@supports": { [condition.supports]: { vars } } };
  return osDark ? { "@media": { [OS_DARK_QUERY]: supports } } : supports;
}

/**
 * Overrides variables under a condition in all three theme contexts, so the
 * override wins over the matching base block however the theme was chosen:
 * the light block, an explicit dark attribute, or the OS dark preference with
 * no attribute. Callers must emit overrides from least to most important,
 * because later rules of equal specificity win.
 */
function overrideInEveryTheme(
  condition: Condition,
  varsFor: (theme: ThemeName) => Record<string, string>,
): void {
  globalStyle(LIGHT, conditional(condition, varsFor("light"), false));
  globalStyle(DARK, conditional(condition, varsFor("dark"), false));
  globalStyle(OS_DARK_SELECTOR, conditional(condition, varsFor("dark"), true));
}

/** Variables for an opaque colour set with the blur turned off. */
function opaqueVars(
  theme: ThemeName,
  set: "opaque" | "contrastMore",
): Record<string, string> {
  return assignVars(
    { color: tokens.color, effect: tokens.effect },
    { color: themeValues[theme][set], effect: { blur: "none" } },
  );
}

/**
 * The support test for `backdrop-filter` in both spellings. Surfaces are
 * translucent only where this holds.
 */
export const surfaceBlurSupported =
  "(backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))";

/** The negation of {@link surfaceBlurSupported}, as an `@supports` condition. */
const surfaceBlurUnsupported =
  "not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))";

/**
 * Without `backdrop-filter` a translucent surface would show the map through
 * text, so these browsers get the opaque colours instead.
 */
overrideInEveryTheme({ supports: surfaceBlurUnsupported }, (theme) =>
  opaqueVars(theme, "opaque"),
);

overrideInEveryTheme(
  { media: "(prefers-reduced-transparency: reduce)" },
  (theme) => opaqueVars(theme, "opaque"),
);

overrideInEveryTheme({ media: "(prefers-contrast: more)" }, (theme) =>
  opaqueVars(theme, "contrastMore"),
);

/**
 * Forced colours replace author colours with the user's palette. Mapping the
 * roles to system colours keeps SVG fills and anything with
 * `forced-color-adjust: none` consistent with it.
 */
overrideInEveryTheme({ media: "(forced-colors: active)" }, () => ({
  ...Object.fromEntries(
    Object.entries(forcedColors).map(([role, value]) => [
      tokens.color[role as keyof ColourRoles],
      value,
    ]),
  ),
  ...assignVars({ blur: tokens.effect.blur }, { blur: "none" }),
}));

globalStyle(":root", {
  "@media": {
    "(prefers-contrast: more)": {
      vars: {
        [tokens.focus.innerWidth]: focusWidthContrastMore.inner,
        [tokens.focus.outerWidth]: focusWidthContrastMore.outer,
      },
    },
    "(prefers-reduced-motion: reduce)": {
      vars: {
        [tokens.motion.duration.fast]: motion.durationReduced,
        [tokens.motion.duration.base]: motion.durationReduced,
        [tokens.motion.duration.slow]: motion.durationReduced,
      },
    },
  },
});

/** The backdrop blur applied behind translucent surfaces, or `none` when they are opaque. */
export const blur = tokens.effect.blur;

/**
 * Surface styling for floating chrome: the translucent surface colour with
 * its backdrop blur, with the `-webkit-` spelling Safari needs. Spread it
 * into a vanilla-extract style.
 */
export const surfaceBlurStyle = {
  backgroundColor: tokens.color.surface,
  backdropFilter: tokens.effect.blur,
  WebkitBackdropFilter: tokens.effect.blur,
} as const;

/**
 * Two-tone focus ring for every interactive element and the focused map.
 * The inner ring is a shadow in the surface colour and the outer ring is an
 * outline, so that `forced-colors: active` (which removes shadows but keeps
 * outlines) still shows a ring, recoloured to `Highlight`.
 */
export const focusRing = {
  outline: `${tokens.focus.outerWidth} solid ${tokens.color.focusRing}`,
  outlineOffset: tokens.focus.innerWidth,
  boxShadow: `0 0 0 ${tokens.focus.innerWidth} ${tokens.color.focusRingInner}`,
} as const;
