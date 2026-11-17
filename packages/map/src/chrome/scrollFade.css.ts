// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** A mask that fades the given ends of a box out over one spacing step. */
function fade(start: boolean, end: boolean): string {
  const edge = tokens.space.md;
  const startStop = start ? `transparent, black ${edge}` : "black, black";
  const endStop = end
    ? `black calc(100% - ${edge}), transparent`
    : "black, black";
  return `linear-gradient(to bottom, ${startStop}, ${endStop})`;
}

/**
 * For a scroll container whose scrollbar is hidden: fades the edge that has
 * more content behind it, so a control cut off there reads as "scroll for
 * more" and not as the end of the group. `useScrollEdges` sets
 * `data-scroll-more` on the container. The fade is a mask, so it takes no room
 * and the controls under it stay clickable. Where forced colours are active
 * the mask is removed, so every edge is at full strength, and the browser's
 * own focus ring and borders show as they are. Put it on a scroller inside the
 * element that carries the shadow, which a mask would cut away.
 */
export const scrollFade = style({
  // A control scrolled into view (by Tab) stops clear of the fade.
  scrollPaddingBlock: tokens.space.md,
  selectors: {
    '&[data-scroll-more="below"]': {
      WebkitMaskImage: fade(false, true),
      maskImage: fade(false, true),
    },
    '&[data-scroll-more="above"]': {
      WebkitMaskImage: fade(true, false),
      maskImage: fade(true, false),
    },
    '&[data-scroll-more="both"]': {
      WebkitMaskImage: fade(true, true),
      maskImage: fade(true, true),
    },
  },
  "@media": {
    // High contrast wants every edge at full strength, not faded away.
    "(forced-colors: active)": {
      selectors: {
        "&[data-scroll-more]": {
          WebkitMaskImage: "none",
          maskImage: "none",
        },
      },
    },
  },
});
