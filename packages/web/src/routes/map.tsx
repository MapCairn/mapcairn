// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE } from "@mapcairn/core";
import { SkipLink, useMessages, VisuallyHidden } from "@mapcairn/map";
import type { LinksFunction, MetaFunction } from "react-router";
import { App } from "../App";
import { ClientOnly } from "../app/ClientOnly";
import { MAP_REGION_ID } from "../app/initialView";
import { MapPlaceholder } from "../app/MapPlaceholder";
import { hiddenWithoutScripts } from "../app/shell.css";
import { buildPageMeta } from "../buildPageMeta";
import { PLAYGROUND_PATH, SITE_URL } from "../constants/siteConfig";
import {
  englishTitle,
  MAP_TITLE,
  type PageTitleHandle,
} from "../i18n/pageTitle";
import {
  breadcrumbNode,
  HOME_CRUMB,
  jsonLdGraph,
  playgroundNode,
  websiteNode,
} from "../structuredData";

/** The playground's canonical URL. */
const MAP_URL = `${SITE_URL}${PLAYGROUND_PATH}`;

/** What the playground is, in the words its page gives readers that do not run it. */
const MAP_DESCRIPTION = EN_GB_CATALOGUE["host.map.summary"];

/**
 * React Router route module export: the playground's title, description,
 * Open Graph and Twitter tags and structured data (a `WebApplication`, the
 * site and the trail back to the product page). The server renders the
 * English title and the browser shows it in the visitor's language (see
 * `DocumentTitle`); the description and the other tags are read by crawlers
 * and link previews, not shown in the app, so they stay English.
 */
export const meta: MetaFunction = () =>
  buildPageMeta({
    title: englishTitle(MAP_TITLE),
    description: MAP_DESCRIPTION,
    url: MAP_URL,
    image: "map",
    structuredData: jsonLdGraph([
      websiteNode(),
      playgroundNode(MAP_DESCRIPTION),
      breadcrumbNode([HOME_CRUMB, { name: "Playground", url: MAP_URL }]),
    ]),
  });

/** React Router route module export: the catalogue key of the map page's tab title. */
export const handle: PageTitleHandle = MAP_TITLE;

/**
 * React Router route module export: the canonical link and a preconnect to
 * the default basemap's tile host. Only this page loads tiles, so only it
 * opens the connection; OpenStreetMap tiles are needed only after the reader
 * picks Streets, so they get none.
 */
export const links: LinksFunction = () => [
  { rel: "canonical", href: MAP_URL },
  {
    rel: "preconnect",
    href: "https://tiles.openfreemap.org",
    crossOrigin: "anonymous",
  },
];

/**
 * What the playground is, for a crawler or a model that reads the server's
 * HTML without running the app: one paragraph in the page header, hidden on
 * screen and read by assistive technology after the page heading.
 */
function PlaygroundSummary() {
  const { t } = useMessages();
  return <VisuallyHidden as="p">{t("host.map.summary", {})}</VisuallyHidden>;
}

/**
 * React Router route module export: the playground at `/map`.
 *
 * @remarks The server renders a static shell only: the skip link (the first
 *   focusable element), the page's hidden h1 and the playground's description
 *   in a `header` (so they are inside a landmark, like everything else on the
 *   page) and a `main` in the map's background colour, holding the decorative
 *   `ChromeSkeleton` (the search pill, map controls and credits button in
 *   their final places). The app mounts after hydration, because it depends
 *   on stored settings and device preferences the server cannot know;
 *   rendering it on the server would make the two disagree. It keeps the
 *   placeholder up until `MapView` draws, and its own `main` (inside
 *   `MapChrome`) then replaces the placeholder and the skeleton in the same
 *   boxes.
 */
export default function MapRoute() {
  return (
    <>
      <SkipLink targetId={MAP_REGION_ID} className={hiddenWithoutScripts} />
      <header>
        <VisuallyHidden as="h1">MapCairn</VisuallyHidden>
        <PlaygroundSummary />
      </header>
      <ClientOnly fallback={<MapPlaceholder />}>
        <App />
      </ClientOnly>
    </>
  );
}
