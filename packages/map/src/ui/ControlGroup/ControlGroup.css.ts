import { tokens } from "@mapcairn/theme";
import { globalStyle, style } from "@vanilla-extract/css";

/**
 * A vertical stack of icon buttons on one surface. The group is not clipped
 * (a clip would cut off the focus ring), so the first and last button carry
 * the group's corner radius and the others are square.
 */
export const controlGroup = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  width: "fit-content",
});

globalStyle(`${controlGroup} > button`, { borderRadius: 0 });

globalStyle(`${controlGroup} > button:first-child`, {
  borderStartStartRadius: tokens.radius.control,
  borderStartEndRadius: tokens.radius.control,
});

globalStyle(`${controlGroup} > button:last-child`, {
  borderEndStartRadius: tokens.radius.control,
  borderEndEndRadius: tokens.radius.control,
});

/**
 * Hairline divider between neighbours. `content-box` keeps the 1px line from
 * eating into the 48px target height.
 */
globalStyle(`${controlGroup} > button + button`, {
  boxSizing: "content-box",
  borderBlockStart: `1px solid ${tokens.color.hairline}`,
});
