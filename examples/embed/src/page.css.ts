/**
 * The page's base styles. `MapChrome` fills its container, so the page gives
 * it the whole viewport. Using `tokens` here is also what brings the token
 * stylesheet into the page: `@mapcairn/theme` is side-effect free, so only a
 * used import keeps its CSS.
 */
import { tokens } from "@mapcairn/theme";
import { globalStyle } from "@vanilla-extract/css";

globalStyle("*, *::before, *::after", {
  boxSizing: "border-box",
});

globalStyle("html, body, #root", {
  height: "100%",
  margin: 0,
  overflow: "hidden",
});

globalStyle("body", {
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  color: tokens.color.text,
  backgroundColor: tokens.color.pageBackground,
});
