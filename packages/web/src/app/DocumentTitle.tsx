// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useMessages } from "@mapcairn/map";
import { useEffect } from "react";
import { useMatches } from "react-router";
import { composeTitle, pageTitleHandle } from "../i18n/pageTitle";

/**
 * Keeps the browser tab's title in the language the interface speaks. The
 * server renders the English title from each route's `meta`; once the app
 * runs, this sets `document.title` from the catalogue text of the page name
 * the route's `handle` gives (`PageTitleHandle`). A page whose route has no
 * such handle keeps the title it has. It renders nothing.
 */
export function DocumentTitle() {
  const messages = useMessages();
  const handle = pageTitleHandle(useMatches());
  const key = handle?.titleKey;
  const brand = handle?.brand;
  useEffect(() => {
    if (key !== undefined && brand !== undefined) {
      document.title = composeTitle(messages.t(key, {}), brand);
    }
  }, [messages, key, brand]);
  return null;
}
