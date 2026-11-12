// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LinksFunction, MetaFunction } from "react-router";
import { PRIVACY_POLICY_TITLE, PrivacyPage } from "../app/PrivacyPage";
import { buildPageMeta } from "../buildPageMeta";
import { SITE_URL } from "../constants/siteConfig";

/** This route's own meta description, distinct from the root route's site-wide one. */
const PRIVACY_POLICY_DESCRIPTION =
  "MapCairn's privacy policy: a map with no accounts, no forms, and no server-side database of visitor data.";

/** Canonical URL of this route, shared by its `meta` and `links` exports. */
const PRIVACY_URL = `${SITE_URL}/privacy`;

/**
 * React Router route module export: the `/privacy` route's `<title>`/`<meta>`
 * tags, via the same `buildPageMeta` the root route uses, so this page's
 * Open Graph, Twitter and JSON-LD tags describe itself rather than inheriting
 * the root route's.
 */
export const meta: MetaFunction = () =>
  buildPageMeta({
    title: `${PRIVACY_POLICY_TITLE} | MapCairn`,
    description: PRIVACY_POLICY_DESCRIPTION,
    url: PRIVACY_URL,
  });

/** React Router route module export: the `/privacy` route's canonical `<link>`. */
export const links: LinksFunction = () => [
  { rel: "canonical", href: PRIVACY_URL },
];

/** React Router route module export: the `/privacy` route, rendering the privacy policy. */
export default function PrivacyRoute() {
  return <PrivacyPage />;
}
