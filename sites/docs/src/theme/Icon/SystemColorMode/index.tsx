// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import { Monitor } from "@phosphor-icons/react";
import type { Props } from "@theme/Icon/SystemColorMode";
import type { ReactNode } from "react";
import { ICON_SIZE, ICON_WEIGHT } from "../../../iconMetrics";

/** The follow-the-system icon of the colour-mode toggle, drawn with Phosphor. */
export default function IconSystemColorMode(props: Props): ReactNode {
  return <Monitor size={ICON_SIZE} weight={ICON_WEIGHT} {...props} />;
}
