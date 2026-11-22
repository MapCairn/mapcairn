// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import { Sun } from "@phosphor-icons/react";
import type { Props } from "@theme/Icon/LightMode";
import type { ReactNode } from "react";
import { ICON_SIZE, ICON_WEIGHT } from "../../../iconMetrics";

/**
 * The light-mode icon of the colour-mode toggle, drawn with Phosphor like the
 * rest of the project's interface.
 */
export default function IconLightMode(props: Props): ReactNode {
  return <Sun size={ICON_SIZE} weight={ICON_WEIGHT} {...props} />;
}
