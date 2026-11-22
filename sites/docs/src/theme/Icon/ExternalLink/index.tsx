// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { translate } from "@docusaurus/Translate";
import type { Props } from "@theme/Icon/ExternalLink";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The mark on a link that leaves the site, drawn with Lucide. The framework's
 * own icon reads a hidden sprite that the build removes, because the sprite's
 * style attribute is not allowed by the Content-Security-Policy.
 */
export default function IconExternalLink({
  width = 14,
  height = 14,
}: Props): ReactNode {
  return (
    <ExternalLink
      width={width}
      height={height}
      strokeWidth={1.75}
      aria-label={translate({
        id: "theme.IconExternalLink.ariaLabel",
        message: "(opens in new tab)",
        description: "The ARIA label for the external link icon",
      })}
    />
  );
}
