import "./fonts/fonts.css";
import "./global.css";
import { THEME_COLOR_META } from "@karta/core";
import {
  LiveRegionProvider,
  ServicesProvider,
  TooltipProvider,
} from "@karta/map";
import { type ReactNode, useEffect, useState } from "react";
import {
  isRouteErrorResponse,
  Links,
  type LinksFunction,
  Meta,
  type MetaFunction,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "react-router";
import { ErrorPage } from "./app/ErrorPage";
import { THEME_BOOTSTRAP_SCRIPT } from "./app/themeBootstrap";
import { buildPageMeta } from "./buildPageMeta";
import { createServices } from "./composition/createServices";
import { reportCaughtError } from "./composition/errorReporting";
import { SITE_URL } from "./constants/siteConfig";
import { fontPreloadLinks } from "./fonts/fontPreload";

/** The brand colour for pinned tabs and Windows tiles, matching the favicon. */
const BRAND_COLOUR = "#0d70d4";

/**
 * React Router route module export: the page title and meta tags, including
 * the viewport, Open Graph, Twitter card and JSON-LD, from `buildPageMeta`.
 */
export const meta: MetaFunction = () =>
  buildPageMeta({
    title: "Karta | Interactive map",
    description:
      "Explore an interactive map. Search places, compare basemaps and measure distances or areas.",
    url: SITE_URL,
  });

/**
 * React Router route module export: the font preload, icons, manifest and a
 * preconnect to the default basemap's tile host. Esri tiles are needed only
 * after the reader picks a raster basemap, so they get no preconnect.
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
  { rel: "preconnect", href: "https://tiles.openfreemap.org" },
];

/**
 * React Router route module export: the document shell around every route
 * and the error boundary. British English, the two `theme-color` tags, the
 * Windows tile tags and the inline theme script, which runs before the
 * stylesheets so the first paint is in the right theme.
 *
 * @remarks The theme script sets `data-theme` and `color-scheme` on `<html>`
 *   and rewrites a `theme-color` tag before React hydrates, so those two
 *   elements suppress the hydration warning for their own attributes.
 *   `<Scripts>` and `<ScrollRestoration>` take the CSP nonce from React
 *   Router's context, set by `entry.server.tsx`.
 */
export function Layout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
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
 * React Router route module export: the root route. Builds the services once
 * per app instance (once per request on the server, once in the browser) and
 * mounts the app-wide providers: services, the one announcer and tooltips.
 *
 * @remarks `createServices` is safe on the server: adapters touch no browser
 *   API until used. Their values differ between server and browser (stored
 *   settings, device preferences), so nothing rendered from them is in the
 *   server HTML; the home route mounts the map after hydration.
 */
export default function Root() {
  const [services] = useState(() => createServices());
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <TooltipProvider>
          <Outlet />
        </TooltipProvider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
}

/**
 * React Router route module export: the error boundary for every route. It
 * shows a friendly page, never the raw error, and logs the error: on the
 * server to the console (Workers Logs), in the browser to `/log-error`.
 * A missing page is not logged.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (!notFound) {
      reportCaughtError(error);
    }
  }, [error, notFound]);

  if (!notFound) {
    console.error(error);
  }
  return <ErrorPage kind={notFound ? "not-found" : "unexpected"} />;
}
