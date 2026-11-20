// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import { createThemeStylesheet } from "@mapcairn/theme";
import type { LoaderFunctionArgs } from "react-router";
import { DESIGN_GUIDE_MARKER } from "../designGuide/DesignGuide";
import { HOST_THEMES } from "../designGuide/hostThemes";

/**
 * React Router resource route: serves the stylesheet that
 * `createThemeStylesheet` makes for one of the style guide's host themes, as
 * a host would serve its own from a route or a static file. The names it
 * writes come from the same build as the page's own stylesheet, which is what
 * a host needs. Exists only in development and e2e builds, with the page it
 * belongs to; the guide's marker in a header lets `verifyNoTestSeam.mjs` see
 * it in a production build.
 */
export function loader({ params }: LoaderFunctionArgs): Response {
  const theme = Object.hasOwn(HOST_THEMES, params.name ?? "")
    ? HOST_THEMES[params.name ?? ""]
    : undefined;
  if (theme === undefined) {
    return new Response("Not found", { status: 404 });
  }
  const result = createThemeStylesheet(theme.override, { scope: theme.scope });
  if (!result.ok) {
    return new Response("The theme was refused", { status: 500 });
  }
  return new Response(result.css, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Mapcairn-Design-Guide": DESIGN_GUIDE_MARKER,
    },
  });
}
