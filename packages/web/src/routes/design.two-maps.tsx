// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MetaFunction } from "react-router";
import { useSearchParams } from "react-router";
import { ClientOnly } from "../app/ClientOnly";
import { TwoMaps } from "../designGuide/TwoMaps";

/**
 * The query that leaves the two maps without a `label`, so a browser test can
 * show what a page gets without it.
 */
export const UNLABELLED_QUERY = "unlabelled";

/**
 * React Router route module export: the page's title, kept out of search
 * engines. The route exists only in development and e2e builds.
 */
export const meta: MetaFunction = () => [
  { title: "Two maps | MapCairn" },
  { name: "robots", content: "noindex" },
];

/**
 * React Router route module export: two maps on one page, for the browser
 * tests of their landmarks. Never bundled in production; see
 * `designGuideRoutes.ts`.
 */
export default function TwoMapsRoute() {
  const [params] = useSearchParams();
  return (
    <ClientOnly fallback={null}>
      <TwoMaps unlabelled={params.has(UNLABELLED_QUERY)} />
    </ClientOnly>
  );
}
