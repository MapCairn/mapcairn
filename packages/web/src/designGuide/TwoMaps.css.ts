// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** The page's one `main`: two equal rows, one for each map. */
export const page = style({
  display: "grid",
  gridTemplateRows: "1fr 1fr",
  gap: tokens.space.sm,
  height: "100%",
  backgroundColor: tokens.color.pageBackground,
});

/** The box one map fills. */
export const cell = style({
  position: "relative",
  minHeight: 0,
});
