// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import type { Props } from "@theme/Icon/LightMode";
import { Sun } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The light-mode icon of the colour-mode toggle, drawn with Lucide like the
 * rest of the project's interface.
 */
export default function IconLightMode(props: Props): ReactNode {
  return <Sun size={24} strokeWidth={1.75} {...props} />;
}
