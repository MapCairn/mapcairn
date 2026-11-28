// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { style } from "@vanilla-extract/css";

/**
 * The announcer's writer makes no box of its own, so the region around its text
 * stays the one pixel that hides it, as when the text sat in the region
 * directly.
 */
export const writer = style({ display: "contents" });
