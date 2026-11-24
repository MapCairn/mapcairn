// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type ContrastFinding,
  checkThemeContrast,
  type InvalidColour,
  type InvalidColourReason,
  type ThemeColours,
  type ThemeContrastCheck,
  type ThemeOverride,
} from "./checkThemeContrast";
import { compositeOver, parseColour, toHex } from "./contrast";
import { readFontFamily } from "./fontFamily";
import { readShape, SHAPE_RADIUS_ROLES } from "./shape";
import { surfaceBlurSupported, tokens } from "./tokens.css";
import {
  colourRoleNames,
  fontFamily as sdkFontFamily,
  type ThemeName,
  themeValues,
} from "./tokenValues";

/** Where a theme override applies. */
export interface ThemeStylesheetOptions {
  /**
   * The selector of the element that wraps the SDK's interface, written as
   * `:root`, `#id` or `.class` with an ASCII name. It must be an element the
   * host owns and puts around the map: the SDK adds no markup or attribute of
   * its own for this. The page's theme is read from `data-theme` on the root
   * element, which is where the SDK sets it, so a theme change reaches the
   * scope without any script.
   *
   * A `#id` or `.class` scope is matched as a descendant of `:root`, so a class
   * on `<html>` itself does nothing: use `:root` to theme the whole page.
   *
   * Two maps on one page take two scopes and two calls.
   */
  scope: string;
}

/** A theme override that was accepted: the stylesheet and what was measured. */
export interface ThemeStylesheetCreated {
  /** True: the override passed and `css` holds the stylesheet. */
  ok: true;
  /**
   * The stylesheet text, to serve as a same-origin file. It is empty when the
   * override sets no colour, font or shape.
   */
  css: string;
  /**
   * One finding for each pair, theme and backdrop, measured on the colours
   * written to `css` with the surface as written (translucent). Every one
   * passes. The opaque surfaces written for reduced transparency are checked
   * as well, and a failure there refuses the theme, so no finding for them is
   * listed here.
   */
  findings: ContrastFinding[];
}

/** A theme override that was refused, with the reasons and no stylesheet. */
export interface ThemeStylesheetRefused {
  /** False: nothing was written. */
  ok: false;
  /** Always `undefined`: a refused theme produces no CSS. */
  css: undefined;
  /**
   * The pairs that could be measured, passing and failing. Where a colour
   * or the scope could not be used, the pairs that depend on a colour are
   * missing, as in {@link checkThemeContrast}.
   */
  findings: ContrastFinding[];
  /**
   * The colours and keys that could not be used, and why. A `fontFamily` that
   * could not be used is listed here with the role `fontFamily` and no theme:
   * the reason is `malformed` when it is not a string and `unparseable` when
   * it is anything but a list of family names (see
   * {@link ThemeOverride.fontFamily}).
   */
  invalid: InvalidColour[];
  /** True when `scope` is not `:root`, `#id` or `.class`, or could not be read. */
  invalidScope: boolean;
}

/** The result of {@link createThemeStylesheet}. */
export type ThemeStylesheet = ThemeStylesheetCreated | ThemeStylesheetRefused;

/** A colour set for one theme, as the roles the host chose. */
type ColourSet = Partial<ThemeColours>;

const themeNames: readonly ThemeName[] = ["light", "dark"];

/** `:root`, `#id` or `.class`, with an ASCII name. Nothing else can be a scope. */
const SCOPE_PATTERN = /^(?::root|[#.][A-Za-z_][A-Za-z0-9_-]*)$/;

/**
 * High-contrast and forced-colours users keep the SDK's own values, so every
 * rule is written inside these conditions. A browser that does not know a
 * feature treats the negated condition as false, and so does not apply the
 * override either.
 */
const HIGH_CONTRAST_GUARDS = [
  "(not (prefers-contrast: more))",
  "(not (forced-colors: active))",
];

const REDUCED_TRANSPARENCY = "(prefers-reduced-transparency: reduce)";
const BLUR_UNSUPPORTED = `@supports not (${surfaceBlurSupported})`;

/** The surfaces that are translucent by default and so get an opaque form. */
const surfaceRoles = ["surface", "surfaceRaised"] as const;

/** A place a theme applies: a selector on the root element and the media it needs. */
interface Context {
  /** The part of the selector that matches the root element. */
  rootState: string;
  /** Media conditions the context needs, ahead of the guards. */
  media: readonly string[];
}

/**
 * The four places the page's theme can come from. They never overlap, so a
 * role set for one theme cannot show in the other: a declaration on the scope
 * element would otherwise beat the SDK's own value however the theme was
 * chosen.
 */
const contexts: Record<ThemeName, readonly Context[]> = {
  light: [
    { rootState: '[data-theme="light"]', media: [] },
    {
      rootState: ":not([data-theme])",
      media: ["(not (prefers-color-scheme: dark))"],
    },
  ],
  dark: [
    { rootState: '[data-theme="dark"]', media: [] },
    {
      rootState: ":not([data-theme])",
      media: ["(prefers-color-scheme: dark)"],
    },
  ],
};

function readScope(options: ThemeStylesheetOptions): string | undefined {
  try {
    const { scope } = options;
    return typeof scope === "string" && SCOPE_PATTERN.test(scope)
      ? scope
      : undefined;
  } catch {
    return undefined;
  }
}

/** The custom property a `var(--name)` token reference points at. */
function customPropertyName(reference: string): string {
  const name = /^var\((--[\w-]+)\)$/.exec(reference)?.[1];
  if (name === undefined) {
    throw new Error(`Unexpected token reference: ${reference}`);
  }
  return name;
}

/** The custom property behind a colour role, taken from the built contract. */
function propertyName(role: keyof ThemeColours): string {
  return customPropertyName(tokens.color[role]);
}

/** Writes every colour the host gave as `#rrggbb` or `#rrggbbaa`. */
function normalise(override: ThemeOverride): Record<ThemeName, ColourSet> {
  const sets: Record<ThemeName, ColourSet> = { light: {}, dark: {} };
  for (const theme of themeNames) {
    for (const [role, value] of Object.entries(
      override.colour?.[theme] ?? {},
    )) {
      if (value !== undefined) {
        Object.assign(sets[theme], { [role]: toHex(parseColour(value)) });
      }
    }
  }
  return sets;
}

/** The colour flattened over the theme's page background, which a host cannot change. */
function flatten(theme: ThemeName, colour: string): string {
  return toHex(compositeOver(colour, themeValues[theme].colour.pageBackground));
}

/** What one theme writes: the colours, and the opaque surfaces for where blur is off. */
interface ThemeColourSets {
  colours: ColourSet;
  opaque: ColourSet;
}

/**
 * Derives the opaque surfaces by flattening each translucent surface the host
 * set over the page background, and defaults the inner focus ring to the
 * opaque surface so the two-tone ring follows a changed surface.
 */
function derive(theme: ThemeName, set: ColourSet): ThemeColourSets {
  const opaque: ColourSet = {};
  for (const role of surfaceRoles) {
    const colour = set[role];
    if (colour !== undefined) {
      opaque[role] = flatten(theme, colour);
    }
  }
  const colours = { ...set };
  if (opaque.surface !== undefined && set.focusRingInner === undefined) {
    colours.focusRingInner = opaque.surface;
  }
  return { colours, opaque };
}

function checkSets(sets: Record<ThemeName, ColourSet>): ThemeContrastCheck {
  return checkThemeContrast({ colour: sets });
}

function declarationsOf(set: ColourSet): string[] {
  return colourRoleNames.flatMap((role) => {
    const value = (set as Partial<Record<string, string>>)[role];
    return value === undefined
      ? []
      : [`${propertyName(role as keyof ThemeColours)}: ${value};`];
  });
}

/** One rule, wrapped in the at-rules around it, each nested in the one before. */
function renderRule(
  [outer, ...inner]: readonly string[],
  selector: string,
  declarations: readonly string[],
): string {
  if (outer !== undefined) {
    const body = renderRule(inner, selector, declarations)
      .split("\n")
      .map((line) => `  ${line}`);
    return [`${outer} {`, ...body, "}"].join("\n");
  }
  return [
    `${selector} {`,
    ...declarations.map((declaration) => `  ${declaration}`),
    "}",
  ].join("\n");
}

/**
 * The selector for a context. The root scope is written twice over so it
 * outranks the SDK's own rules on the same element whatever the link order.
 */
function selectorFor(scope: string, rootState = ""): string {
  return scope === ":root"
    ? `:root:root${rootState}`
    : `:root${rootState} ${scope}`;
}

function mediaRule(context: Context, ...extra: string[]): string {
  return `@media ${[...context.media, ...extra, ...HIGH_CONTRAST_GUARDS].join(" and ")}`;
}

/** The rules for one theme: its colours, then its opaque surfaces where blur is off. */
function renderTheme(
  theme: ThemeName,
  scope: string,
  { colours, opaque }: ThemeColourSets,
): string[] {
  const rules: string[] = [];
  for (const context of contexts[theme]) {
    const selector = selectorFor(scope, context.rootState);
    const base = declarationsOf(colours);
    const flat = declarationsOf(opaque);
    if (base.length > 0) {
      rules.push(renderRule([mediaRule(context)], selector, base));
    }
    if (flat.length > 0) {
      rules.push(
        renderRule([mediaRule(context), BLUR_UNSUPPORTED], selector, flat),
        renderRule([mediaRule(context, REDUCED_TRANSPARENCY)], selector, flat),
      );
    }
  }
  return rules;
}

/** The declarations the non-colour fields write, or why one was refused. */
interface StaticReading {
  declarations: string[];
  invalid: InvalidColour[];
}

/** One field of an override that may be anything, or `undefined` when it has none. */
function fieldOf(override: unknown, key: "fontFamily" | "shape"): unknown {
  return typeof override === "object" && override !== null
    ? (override as Record<string, unknown>)[key]
    : undefined;
}

function refusedField(
  role: "fontFamily" | "shape",
  value: unknown,
  reason: InvalidColourReason,
): StaticReading {
  return {
    declarations: [],
    invalid: [{ theme: null, role, value, reason }],
  };
}

/**
 * Reads `fontFamily`. The list is written with the SDK's own stack after it,
 * so a face the host's font lacks falls back to the SDK's choice rather than
 * the browser's default.
 */
function readFont(value: unknown): StaticReading {
  if (value === undefined) {
    return { declarations: [], invalid: [] };
  }
  const reading = readFontFamily(value);
  if (!reading.ok) {
    return refusedField(
      "fontFamily",
      value,
      reading.reason === "not-a-string" ? "malformed" : "unparseable",
    );
  }
  return {
    declarations: [
      `${customPropertyName(tokens.type.family)}: ${reading.value}, ${sdkFontFamily};`,
    ],
    invalid: [],
  };
}

/** Reads `shape`: the four radii of a preset, written through the radius tokens. */
function readShapeField(value: unknown): StaticReading {
  if (value === undefined) {
    return { declarations: [], invalid: [] };
  }
  const reading = readShape(value);
  if (!reading.ok) {
    return refusedField("shape", value, reading.reason);
  }
  const { radii } = reading;
  return {
    declarations:
      radii === undefined
        ? []
        : SHAPE_RADIUS_ROLES.map(
            (role) =>
              `${customPropertyName(tokens.radius[role])}: ${radii[role]};`,
          ),
    invalid: [],
  };
}

/** Reads the fields that are not colours: the font family and the shape. */
function readStaticFields(override: unknown): StaticReading {
  const readings = [
    readFont(fieldOf(override, "fontFamily")),
    readShapeField(fieldOf(override, "shape")),
  ];
  return {
    declarations: readings.flatMap((reading) => reading.declarations),
    invalid: readings.flatMap((reading) => reading.invalid),
  };
}

/** The rule that sets the font and the corners once for the scope, in every theme. */
function renderStatic(scope: string, declarations: string[]): string[] {
  if (declarations.length === 0) {
    return [];
  }
  return [renderRule([], selectorFor(scope), declarations)];
}

function refused(
  findings: ContrastFinding[],
  invalid: InvalidColour[],
  invalidScope: boolean,
): ThemeStylesheetRefused {
  return { ok: false, css: undefined, findings, invalid, invalidScope };
}

/**
 * Generates the stylesheet that applies a colour override to the SDK's
 * interface inside `options.scope`, or refuses.
 *
 * The host serves the result as a same-origin file, linked after the SDK's
 * own stylesheet: it holds no inline style, needs no nonce and shows no flash
 * under a strict policy. The names it writes are resolved from the built
 * `tokens`, so they match the SDK's stylesheet only for the same installed
 * version of this package, and the host never writes one.
 *
 * A theme below WCAG 2.2 AA is refused: the result carries the findings and
 * no CSS, so a host fixes its colours first. The check measures the colours
 * as written to the stylesheet, with the inner focus ring and the opaque
 * surfaces derived. The opaque surface is the surface flattened over the
 * theme's page background, used where `backdrop-filter` is not supported and
 * under `prefers-reduced-transparency`. The page background, the map overlay
 * roles and the data palette are not overridable.
 *
 * Every rule is written for `(not (prefers-contrast: more))` and
 * `(not (forced-colors: active))`, so high-contrast and forced-colours users
 * keep the SDK's own values. A colour is written back as `#rrggbb` or
 * `#rrggbbaa`, parsed with the same strict reader as
 * {@link checkThemeContrast}, so nothing else can enter the stylesheet.
 *
 * `shape` (`square`, `default` or `round`) sets the pill, sheet, control and
 * inner radii once for the scope, in the same rule as the font. `default`
 * writes nothing. The circular role stays circular and the round preset keeps
 * the search pill a pill. Any other value refuses the override, listed in
 * `invalid` with the role `shape`. The browser tests check every chrome state
 * at phone, tablet and desktop sizes in both themes for each preset, so
 * nothing overlaps and no corner cuts text, an icon, a field or a focus ring.
 *
 * `fontFamily` is written once for the scope, outside those conditions, since
 * a typeface does not change with the theme or with high contrast. It must be
 * a list of plain family names and generic families; anything else refuses the
 * override, listed in `invalid`. The SDK's own stack follows the list as its
 * fallback. The host loads the font file: it must be same-origin
 * or allowed by the host's `font-src`, and the stylesheet must be linked,
 * because a strict policy blocks an inline `<style>`. How wide a font is
 * cannot be known here, so the layout holds instead: the browser tests put a
 * deliberately wide face on the chrome and check that no control gets smaller
 * and nothing overlaps. Text in a control may be cut short.
 *
 * Total: it never throws. A tooltip renders in a portal outside the scope, so
 * it keeps the SDK's colours in a `#id` or `.class` scope.
 *
 * @param override - The colours to change, per theme, and the font family.
 * @param options - The scope to apply them in.
 * @returns The stylesheet and the findings, or the reasons it was refused.
 */
export function createThemeStylesheet(
  override: ThemeOverride,
  options: ThemeStylesheetOptions,
): ThemeStylesheet {
  const scope = readScope(options);
  try {
    const initial = checkThemeContrast(override);
    const fields = readStaticFields(override);
    const invalid = [...initial.invalid, ...fields.invalid];
    if (invalid.length > 0 || scope === undefined) {
      return refused(initial.findings, invalid, scope === undefined);
    }
    return create(override, scope, fields.declarations);
  } catch {
    return refused(
      [],
      [{ theme: null, role: "colour", value: undefined, reason: "unreadable" }],
      scope === undefined,
    );
  }
}

function create(
  override: ThemeOverride,
  scope: string,
  fields: string[],
): ThemeStylesheet {
  const sets = normalise(override);
  const derived = {
    light: derive("light", sets.light),
    dark: derive("dark", sets.dark),
  };
  const check = checkSets({
    light: derived.light.colours,
    dark: derived.dark.colours,
  });
  const opaqueCheck = checkSets({
    light: { ...derived.light.colours, ...derived.light.opaque },
    dark: { ...derived.dark.colours, ...derived.dark.opaque },
  });
  const findings = [
    ...check.findings,
    ...opaqueCheck.findings.filter((finding) => !finding.passes),
  ];
  if (!check.passes || !opaqueCheck.passes) {
    return refused(findings, [...check.invalid, ...opaqueCheck.invalid], false);
  }
  const css = [
    ...themeNames.flatMap((theme) => renderTheme(theme, scope, derived[theme])),
    ...renderStatic(scope, fields),
  ].join("\n");
  return { ok: true, css: css === "" ? css : `${css}\n`, findings };
}
