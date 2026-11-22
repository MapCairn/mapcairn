// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import { Moon } from "@phosphor-icons/react";
import type { Props } from "@theme/Icon/DarkMode";
import type { ReactNode } from "react";
import { ICON_SIZE, ICON_WEIGHT } from "../../../iconMetrics";

/** The dark-mode icon of the colour-mode toggle, drawn with Phosphor. */
export default function IconDarkMode(props: Props): ReactNode {
  return <Moon size={ICON_SIZE} weight={ICON_WEIGHT} {...props} />;
}
