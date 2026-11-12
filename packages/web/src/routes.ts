// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { index, type RouteConfig, route } from "@react-router/dev/routes";
import { designGuideRoutes } from "./designGuideRoutes";

/**
 * This app's full route table. `home.tsx` (the map) and `privacy.tsx` are
 * the only routes with UI in production; `robots.txt.ts`/`sitemap.xml.ts`/`llms.txt.ts`
 * are resource routes serving static text built once at module scope, with
 * no loader logic that varies per request; `log-error.ts` is the only route
 * with a real per-request `action` (see `adapters/errorReporting/BeaconErrorReporter.ts`). The
 * style guide at `/design` exists only in development and e2e builds (see
 * `designGuideRoutes.ts`).
 */
export default [
  ...designGuideRoutes(import.meta.env.MODE),
  index("./routes/home.tsx"),
  route("privacy", "./routes/privacy.tsx"),
  route("robots.txt", "./routes/robots.txt.ts"),
  route("sitemap.xml", "./routes/sitemap.xml.ts"),
  route("llms.txt", "./routes/llms.txt.ts"),
  route("log-error", "./routes/log-error.ts"),
] satisfies RouteConfig;
