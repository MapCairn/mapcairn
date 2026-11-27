// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
export {
  type AccentFailure,
  type AccentResolution,
  type AccentRole,
  type DerivedRole,
  type DerivedSource,
  resolveAccent,
} from "./accent";
export {
  type ContrastFinding,
  checkThemeContrast,
  type InvalidColour,
  type InvalidColourReason,
  type ThemeColours,
  type ThemeContrastCheck,
  type ThemeOverride,
} from "./checkThemeContrast";
export {
  type ColourInput,
  compositeOver,
  contrastRatio,
  parseColour,
  type Rgba,
  toHex,
} from "./contrast";
export type {
  BackdropName,
  ContrastBackground,
  PairKind,
  ThemeColourRole,
} from "./contrastPairs";
export {
  createThemeStylesheet,
  type ThemeStylesheet,
  type ThemeStylesheetCreated,
  type ThemeStylesheetOptions,
  type ThemeStylesheetRefused,
} from "./createThemeStylesheet";
export { mapOverlayTokens } from "./mapOverlayTokens";
export {
  blur,
  focusRing,
  surfaceBlurStyle,
  surfaceBlurSupported,
  tokens,
} from "./tokens.css";
export type { ThemeName, ZLayerName } from "./tokenValues";
/**
 * Every design-token value as plain typed data: the oklch colours, spacing,
 * sizes and type scale that `tokens` turns into CSS custom properties. Read it
 * where the value itself is needed, such as in a contrast calculation.
 */
export * as tokenValues from "./tokenValues";
export { zLayer } from "./zLayer";
