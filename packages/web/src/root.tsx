// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import "./fonts/fonts.css";
import "./global.css";
import { languageDirection, THEME_COLOR_META } from "@mapcairn/core";
import { type ReactNode, useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  type LinksFunction,
  Meta,
  type MetaFunction,
  Outlet,
  Scripts,
  ScrollRestoration,
  useMatches,
  useRouteError,
} from "react-router";
import { ErrorPage } from "./app/ErrorPage";
import { THEME_BOOTSTRAP_SCRIPT } from "./app/themeBootstrap";
import { buildPageMeta } from "./buildPageMeta";
import { reportCaughtError } from "./composition/errorReporting";
import { BRAND_COLOUR } from "./constants/brandColour";
import { PRODUCT_DESCRIPTION, SITE_URL } from "./constants/siteConfig";
import { fontPreloadLinks } from "./fonts/fontPreload";
import { DEFAULT_LANGUAGE, OFFERED_LANGUAGES } from "./i18n/hostLanguages";
import { fixedPageLanguage } from "./i18n/pageLanguage";
import { jsonLdGraph, websiteNode } from "./structuredData";

/**
 * React Router route module export: the site's own title and meta tags, for a
 * page with none of its own (the error pages). Each page's route exports its
 * own `meta`, which replaces these (see `buildPageMeta`). They are read by
 * crawlers and link previews, so they stay English.
 */
export const meta: MetaFunction = () =>
  buildPageMeta({
    title: "MapCairn",
    description: PRODUCT_DESCRIPTION,
    url: `${SITE_URL}/`,
    image: "product",
    structuredData: jsonLdGraph([websiteNode()]),
  });

/**
 * React Router route module export: the font preload, icons and manifest,
 * which every page needs. A page that loads more (the map's tile host) adds
 * its own links.
 */
export const links: LinksFunction = () => [
  ...fontPreloadLinks,
  {
    rel: "icon",
    href: "/favicon.svg",
    type: "image/svg+xml",
    sizes: "any",
  },
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
  {
    rel: "icon",
    type: "image/png",
    sizes: "32x32",
    href: "/favicon-32x32.png",
  },
  {
    rel: "icon",
    type: "image/png",
    sizes: "16x16",
    href: "/favicon-16x16.png",
  },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  { rel: "mask-icon", href: "/safari-pinned-tab.svg", color: BRAND_COLOUR },
  { rel: "manifest", href: "/site.webmanifest" },
];

/**
 * React Router route module export: the document shell around every route
 * and the error boundary. British English, the two `theme-color` tags, the
 * Windows tile tags and the inline theme script, which runs before the
 * stylesheets so the first paint is in the right theme.
 *
 * @remarks The theme script sets `data-theme` and `color-scheme` on `<html>`,
 *   sets `lang` and `dir` there when the stored language is one the host offers
 *   and the page has no fixed language, and
 *   rewrites a `theme-color` tag before React hydrates, so those two
 *   elements suppress the hydration warning for their own attributes.
 *   `<Scripts>` and `<ScrollRestoration>` take the CSP nonce from React
 *   Router's context, set by `entry.server.tsx`.
 */
export function Layout({ children }: { readonly children: ReactNode }) {
  const fixed = fixedPageLanguage(useMatches());
  const language = fixed ?? DEFAULT_LANGUAGE;
  const direction =
    fixed === undefined
      ? languageDirection(DEFAULT_LANGUAGE, OFFERED_LANGUAGES)
      : languageDirection(fixed);
  return (
    <html
      lang={language}
      dir={direction}
      data-fixed-language={fixed === undefined ? undefined : "true"}
      suppressHydrationWarning
    >
      <head>
        <meta charSet="utf-8" />
        <meta
          name="theme-color"
          content={THEME_COLOR_META.light}
          media="(prefers-color-scheme: light)"
          suppressHydrationWarning
        />
        <meta
          name="theme-color"
          content={THEME_COLOR_META.dark}
          media="(prefers-color-scheme: dark)"
          suppressHydrationWarning
        />
        <meta name="msapplication-TileColor" content={BRAND_COLOUR} />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string built by core and allowed by its CSP hash; see THEME_BOOTSTRAP_SCRIPT.
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Keeps `<html lang dir>` on a page's fixed language after client navigation.
 * The server render and pre-paint script already preserve it on first load. A
 * page that follows the interface's language is kept in step by the app
 * layout (`routes/app.tsx`) instead.
 */
function FixedDocumentLanguage() {
  const fixed = fixedPageLanguage(useMatches());
  useEffect(() => {
    if (fixed !== undefined) {
      document.documentElement.lang = fixed;
      document.documentElement.dir = languageDirection(fixed);
    }
  }, [fixed]);
  return null;
}

/**
 * React Router route module export: the root route. It renders the matched
 * route and nothing else, so a page that needs no services (the product page)
 * loads none of them: the services, the announcer and tooltips belong to the
 * app layout around the playground and the privacy page (`routes/app.tsx`).
 */
export default function Root() {
  return (
    <>
      <FixedDocumentLanguage />
      <Outlet />
    </>
  );
}

/**
 * React Router route module export: the error boundary for every route. It
 * shows a friendly page, never the raw error, and in the browser logs the
 * error to the console and reports it to `/log-error`, once per error
 * however often the boundary renders. On the server it adds no log of its
 * own: React Router's request handler and `entry.server.tsx` already log
 * there (Workers Logs). A missing page is not logged. A route error
 * response thrown on purpose with another status (`throw data(..., { status:
 * 500 })`) is not logged by React Router on the server either, so it reaches
 * only this effect in the browser; nothing in the app throws one today.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (!notFound) {
      console.error(error);
      reportCaughtError(error);
    }
  }, [error, notFound]);

  return <ErrorPage kind={notFound ? "not-found" : "unexpected"} />;
}
