// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/** The path of the living style guide, served at `/design`. */
export const DESIGN_GUIDE_PATH = "design";

/**
 * The path of the stylesheets the style guide serves for its host themes,
 * which the browser tests link in to prove a generated theme under the policy.
 */
export const DESIGN_HOST_THEME_PATH = "design/host-theme/:name";

/** The path of the page with two maps on it, for the tests of what several maps expose to a screen reader. */
export const DESIGN_TWO_MAPS_PATH = "design/two-maps";

/**
 * The build modes that serve the style guide: the Vite dev server and the
 * `--mode e2e` build the browser tests run against.
 */
const DESIGN_GUIDE_MODES: ReadonlySet<string> = new Set(["development", "e2e"]);

/**
 * Whether a build mode serves the style guide. It is an allowlist, so a
 * production build, an unknown mode or a missing one never gets the page.
 */
export function isDesignGuideEnabled(mode: string | undefined): boolean {
  return mode !== undefined && DESIGN_GUIDE_MODES.has(mode);
}

/**
 * The style guide's route entries for a build mode: the page and the host
 * theme stylesheets in development and e2e builds, none otherwise.
 *
 * @remarks `routes.ts` spreads this with `import.meta.env.MODE`, which React
 *   Router's config loader sets from the build's `--mode`. Without the entry
 *   the route module is never bundled, so a production request for `/design`
 *   falls through to the ordinary not-found page, and
 *   `scripts/verifyNoTestSeam.mjs` proves the page's marker is absent from
 *   the production build. This module must stay free of `@mapcairn/*` and
 *   `.css.ts` imports: the config loader runs it with no Vite plugins.
 */
export function designGuideRoutes(
  mode: string | undefined,
): RouteConfigEntry[] {
  return isDesignGuideEnabled(mode)
    ? [
        route(DESIGN_GUIDE_PATH, "./routes/design.tsx"),
        route(DESIGN_HOST_THEME_PATH, "./routes/design.host-theme.ts"),
        route(DESIGN_TWO_MAPS_PATH, "./routes/design.two-maps.tsx"),
      ]
    : [];
}
