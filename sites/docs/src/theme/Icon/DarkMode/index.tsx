// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import type { Props } from "@theme/Icon/DarkMode";
import { Moon } from "lucide-react";
import type { ReactNode } from "react";

/** The dark-mode icon of the colour-mode toggle, drawn with Lucide. */
export default function IconDarkMode(props: Props): ReactNode {
  return <Moon size={24} strokeWidth={1.75} {...props} />;
}
