// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { index, type RouteConfig, route } from "@react-router/dev/routes";
import { designGuideRoutes } from "./designGuideRoutes";

/**
 * This app's full route table. The pages with UI in production are the
 * product page at `/` (`product.tsx`, English only, no map code), the
 * playground at `/map` (`map.tsx`) and `privacy.tsx`. `robots.txt.ts`,
 * `sitemap.xml.ts`, `llms.txt.ts`, `llms-full.txt.ts` and `index.md.ts` (the
 * product page as Markdown) are resource routes serving static text built
 * once at module scope, with no loader logic that varies per request;
 * `log-error.ts` is the only route with a real per-request `action` (see
 * `adapters/errorReporting/BeaconErrorReporter.ts`). The style guide at
 * `/design` exists only in development and e2e builds (see
 * `designGuideRoutes.ts`). A link to the map from before it moved to `/map`
 * keeps its state in the hash, which the server never sees, so the product
 * page sends it on in the browser (`app/mapLinkRedirect.ts`).
 */
export default [
  ...designGuideRoutes(import.meta.env.MODE),
  index("./routes/product.tsx"),
  route("map", "./routes/map.tsx"),
  route("privacy", "./routes/privacy.tsx"),
  route("robots.txt", "./routes/robots.txt.ts"),
  route("sitemap.xml", "./routes/sitemap.xml.ts"),
  route("llms.txt", "./routes/llms.txt.ts"),
  route("llms-full.txt", "./routes/llms-full.txt.ts"),
  route("index.md", "./routes/index.md.ts"),
  route("log-error", "./routes/log-error.ts"),
] satisfies RouteConfig;
