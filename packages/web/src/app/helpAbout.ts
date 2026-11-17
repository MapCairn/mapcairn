// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MessageCatalogue } from "@mapcairn/core";
import type { HelpAbout } from "@mapcairn/map";
import { PRODUCT_PATH, SOURCE_REPOSITORY_URL } from "../constants/siteConfig";

/**
 * The reference site's About block for Help: that the site is open source
 * under the AGPL-3.0, a link to its source code, and the way back to the
 * product page at `/`. The SDK shows it without knowing what it says.
 */
export function helpAbout(messages: MessageCatalogue): HelpAbout {
  return {
    heading: messages.t("host.about.heading", {}),
    text: messages.t("host.about.text", {}),
    link: {
      href: SOURCE_REPOSITORY_URL,
      label: messages.t("host.about.link", {}),
    },
    homeLink: {
      href: PRODUCT_PATH,
      label: messages.t("host.about.product", {}),
    },
  };
}
