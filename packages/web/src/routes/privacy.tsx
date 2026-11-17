// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LinksFunction, MetaFunction } from "react-router";
import { PrivacyPage } from "../app/PrivacyPage";
import { buildPageMeta } from "../buildPageMeta";
import { SITE_URL } from "../constants/siteConfig";
import {
  englishTitle,
  type PageTitleHandle,
  PRIVACY_TITLE,
} from "../i18n/pageTitle";
import {
  breadcrumbNode,
  HOME_CRUMB,
  jsonLdGraph,
  webPageNode,
  websiteNode,
} from "../structuredData";

/** This route's own meta description, distinct from the root route's site-wide one. */
const PRIVACY_POLICY_DESCRIPTION =
  "MapCairn's privacy policy: a map with no accounts, no forms, and no server-side database of visitor data.";

/** Canonical URL of this route, shared by its `meta` and `links` exports. */
const PRIVACY_URL = `${SITE_URL}/privacy`;

/**
 * React Router route module export: the `/privacy` route's `<title>`/`<meta>`
 * tags, via the same `buildPageMeta` every route uses, so this page's Open
 * Graph, Twitter and JSON-LD tags (a `WebPage` and the trail back to the
 * product page) describe itself rather than inheriting the root route's. The server always renders the English title; the browser
 * shows it in the visitor's language through `handle` (see `DocumentTitle`).
 * The description and the other tags are read by crawlers and link previews,
 * not shown in the app, so they stay English.
 */
export const meta: MetaFunction = () =>
  buildPageMeta({
    title: englishTitle(PRIVACY_TITLE),
    description: PRIVACY_POLICY_DESCRIPTION,
    url: PRIVACY_URL,
    image: "map",
    structuredData: jsonLdGraph([
      websiteNode(),
      webPageNode(
        englishTitle(PRIVACY_TITLE),
        PRIVACY_POLICY_DESCRIPTION,
        PRIVACY_URL,
      ),
      breadcrumbNode([
        HOME_CRUMB,
        { name: "Privacy policy", url: PRIVACY_URL },
      ]),
    ]),
  });

/** React Router route module export: the catalogue key of this page's tab title. */
export const handle: PageTitleHandle = PRIVACY_TITLE;

/** React Router route module export: the `/privacy` route's canonical `<link>`. */
export const links: LinksFunction = () => [
  { rel: "canonical", href: PRIVACY_URL },
];

/** React Router route module export: the `/privacy` route, rendering the privacy policy. */
export default function PrivacyRoute() {
  return <PrivacyPage />;
}
