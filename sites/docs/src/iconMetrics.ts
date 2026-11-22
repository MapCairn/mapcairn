// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokenValues } from "@mapcairn/theme";

/** The icon size in pixels, from the `size.icon` token (`"24px"`). */
export const ICON_SIZE = Number.parseInt(tokenValues.size.icon, 10);

/** The one weight every icon is drawn in, as in the SDK's `Icon`. */
export const ICON_WEIGHT = "regular";

/** The size of the mark on a link that leaves the site, a little under the icon size so it sits beside text. */
export const EXTERNAL_MARK_SIZE = 14;
