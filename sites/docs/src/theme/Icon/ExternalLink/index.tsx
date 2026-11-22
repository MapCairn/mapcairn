// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { translate } from "@docusaurus/Translate";
import { ArrowSquareOut } from "@phosphor-icons/react";
import type { Props } from "@theme/Icon/ExternalLink";
import type { ReactNode } from "react";
import { EXTERNAL_MARK_SIZE, ICON_WEIGHT } from "../../../iconMetrics";

/**
 * The mark on a link that leaves the site, drawn with Phosphor. The framework's
 * own icon reads a hidden sprite that the build removes, because the sprite's
 * style attribute is not allowed by the Content-Security-Policy.
 */
export default function IconExternalLink({
  width = EXTERNAL_MARK_SIZE,
  height = EXTERNAL_MARK_SIZE,
}: Props): ReactNode {
  return (
    <ArrowSquareOut
      width={width}
      height={height}
      weight={ICON_WEIGHT}
      aria-label={translate({
        id: "theme.IconExternalLink.ariaLabel",
        message: "(opens in new tab)",
        description: "The ARIA label for the external link icon",
      })}
    />
  );
}
