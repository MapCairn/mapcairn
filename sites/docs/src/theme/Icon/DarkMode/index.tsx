// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import type { Props } from "@theme/Icon/DarkMode";
import { Moon } from "lucide-react";
import type { ReactNode } from "react";
import { ICON_SIZE, ICON_STROKE } from "../../../iconMetrics";

/** The dark-mode icon of the colour-mode toggle, drawn with Lucide. */
export default function IconDarkMode(props: Props): ReactNode {
  return <Moon size={ICON_SIZE} strokeWidth={ICON_STROKE} {...props} />;
}
