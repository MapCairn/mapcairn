import "@fontsource-variable/public-sans/wght.css";
import "@fontsource-variable/source-serif-4/wght.css";
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
import { buildPageMeta } from "./buildPageMeta";
import { SITE_URL } from "./constants/siteConfig";
import { THEME_COLOR, THEME_STORAGE_KEY } from "./constants/themeConfig";
import "./index.css";
import * as styles from "./root.css";

/**
 * Pre-hydration theme-bootstrap script: reads the stored theme preference
 * and sets `data-theme` before first paint, avoiding a flash of the wrong
 * theme. Inlined (rather than an external `/theme-bootstrap.js` file) so it
 * runs without an extra render-blocking network request; the exact source
 * below is hashed into `_headers`' `Content-Security-Policy` `script-src`;
 * changing this string requires recomputing that hash (see `_headers`).
 */
const THEME_BOOTSTRAP_SCRIPT = `(() => {
  const stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  if (stored === "light" || stored === "dark") {
    document.documentElement.dataset.theme = stored;
  }
})();`;

/**
 * React Router route module export: page `<title>`/`<meta>` tags, including
 * Open Graph, Twitter card, and `Dataset` JSON-LD structured data, all
 * derived by `buildPageMeta` from this route's own title/description/URL.
 */
export const meta: MetaFunction = () =>
  buildPageMeta({
    title: "Karta | Interactive map",
    description:
      "Explore an interactive map. Search places, compare basemaps and measure distances or areas.",
    url: SITE_URL,
  });

/**
 * React Router route module export: `<link>` tags for favicons, the
 * manifest and a preconnect to the default basemap's tile host. Esri tiles
 * are only needed after the reader switches basemap, so they get no
 * preconnect.
 * @remarks Deliberately preloads no layer GeoJSON, not even a
 *   `defaultVisible` layer's. Nothing can consume that data until the map
 *   bundle has downloaded, hydrated, and mounted Leaflet, so a `preload`
 *   only puts hundreds of kilobytes of it on the wire *alongside* the very
 *   scripts and stylesheets that gate the map's first paint; measured via
 *   Lighthouse, preloading the default choropleth (~600KB compressed) cost
 *   ~0.9s of LCP and ~1.7s of Speed Index under throttled mobile
 *   conditions, because it starved the render-critical requests of
 *   bandwidth. `App`/`useLayerData` request it after hydration instead,
 *   where it competes with nothing.
 */
export const links: LinksFunction = () => [
  { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
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
  { rel: "manifest", href: "/site.webmanifest" },
  { rel: "preconnect", href: "https://tiles.openfreemap.org" },
];

/**
 * React Router route module export: the document shell (`<html>`/`<head>`/`<body>`)
 * wrapping every route. Sets the pre-hydration `theme-color` meta tags and
 * inlines `THEME_BOOTSTRAP_SCRIPT` to apply the stored theme before paint.
 * The document language is fixed to British English.
 * `<Scripts>`/`<ScrollRestoration>` need no explicit `nonce` prop here: they
 * read it themselves from react-router's own framework context, populated
 * by `entry.server.tsx`'s `<ServerRouter nonce={nonce}>` further up this
 * same tree.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="theme-color"
          content={THEME_COLOR.light}
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content={THEME_COLOR.dark}
          media="(prefers-color-scheme: dark)"
        />
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static, module-scope literal; see THEME_BOOTSTRAP_SCRIPT
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

/** React Router route module export: the root route component. */
export default function Root() {
  return <Outlet />;
}

/**
 * React Router route module export: the top-level error boundary. Catches
 * any render, loader, or action error uncaught by a more specific route
 * (there is currently only the one index route, so in practice this is the
 * whole app) and unmatched-route 404s, replacing `<Outlet />` inside
 * `Layout` with a recoverable fallback instead of a blank page.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  console.error(error);

  const isNotFound = isRouteErrorResponse(error) && error.status === 404;
  const { title, message } = isNotFound
    ? {
        title: "Page not found",
        message: "The page you're looking for doesn't exist.",
      }
    : {
        title: "Something went wrong",
        message:
          "An unexpected error occurred. Reloading the page usually fixes it.",
      };

  return (
    <div className={styles.errorBoundary} role="alert">
      <h1>{title}</h1>
      <p>{message}</p>
      <button type="button" onClick={() => window.location.reload()}>
        Reload page
      </button>
    </div>
  );
}
