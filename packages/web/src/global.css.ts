/**
 * The page's base styles: the one global stylesheet besides the tokens and
 * the engine style file. Imported by `root.tsx`, so it is linked in the server
 * HTML and the first paint already has the theme's colours and type.
 *
 * Importing `tokens` here (and using it) also pulls the token stylesheet into
 * the page, because `@mapcairn/theme` is side-effect free and only a used import
 * keeps its CSS.
 */
import { focusRing, tokens } from "@mapcairn/theme";
import { globalStyle } from "@vanilla-extract/css";

const DARK = ':root[data-theme="dark"]';
/** No `data-theme` means the pre-paint script did not run, so the system decides. */
const NO_SCRIPT = ":root:not([data-theme])";

globalStyle("*, *::before, *::after", {
  boxSizing: "border-box",
});

// The app is a full-screen map: the document never scrolls or bounces, and
// pages that need to scroll (the privacy policy) scroll their own container.
globalStyle("html, body", {
  position: "fixed",
  inset: 0,
  margin: 0,
  height: "100dvh",
  overflow: "hidden",
  overscrollBehavior: "none",
  "@supports": {
    "not (height: 100dvh)": {
      height: "100vh",
    },
  },
});

globalStyle("html", {
  colorScheme: "light",
  backgroundColor: tokens.color.pageBackground,
  WebkitTextSizeAdjust: "100%",
  textSizeAdjust: "100%",
  // Pinch zoom stays available; this only removes the double-tap delay. The
  // map region sets its own `touch-action: none` and handles gestures itself.
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
  scrollbarColor: `${tokens.color.textMuted} transparent`,
  "@media": {
    "(forced-colors: active)": {
      scrollbarColor: "auto",
    },
  },
});

globalStyle(DARK, {
  colorScheme: "dark",
});

globalStyle(NO_SCRIPT, {
  "@media": {
    "(prefers-color-scheme: dark)": {
      colorScheme: "dark",
    },
  },
});

globalStyle("body", {
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
  fontWeight: tokens.type.weight.regular,
  color: tokens.color.text,
  backgroundColor: tokens.color.pageBackground,
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",
});

// Flex and grid children of the page and of the chrome may shrink below
// their content, so long text wraps or truncates instead of widening a slot.
globalStyle(":where(body > *, [data-chrome-root] > *)", {
  minWidth: 0,
});

globalStyle("::selection", {
  backgroundColor: tokens.color.accentTint,
  color: tokens.color.text,
});

// The default ring for anything a component has not styled. `:where` keeps
// it at zero specificity, so every component's own focus style wins. Only the
// outline is set: components that move the ring elsewhere (the search pill
// rings the pill, not its input) clear the outline, and an inner shadow here
// would survive and draw a second ring.
globalStyle(":where(:focus-visible)", {
  outline: focusRing.outline,
  outlineOffset: focusRing.outlineOffset,
});
