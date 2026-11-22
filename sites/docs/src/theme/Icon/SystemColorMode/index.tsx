// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import type { Props } from "@theme/Icon/SystemColorMode";
import { Monitor } from "lucide-react";
import type { ReactNode } from "react";
import { ICON_SIZE, ICON_STROKE } from "../../../iconMetrics";

/** The follow-the-system icon of the colour-mode toggle, drawn with Lucide. */
export default function IconSystemColorMode(props: Props): ReactNode {
  return <Monitor size={ICON_SIZE} strokeWidth={ICON_STROKE} {...props} />;
}
