// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createRequestHandler } from "react-router";
import { SECURITY_HEADERS } from "../src/constants/securityHeaders";
import {
  DOCS_URL,
  REDIRECTED_HOSTNAMES,
  SITE_URL,
} from "../src/constants/siteConfig";
import { describeServerError } from "../src/serverErrors";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env?.MODE ?? "production",
);

/** The path the documentation had on this origin before it had its own. */
const DOCS_PREFIX = "/docs";

/**
 * The address of `path` and `search` on `base`'s origin. The address is joined
 * as text with exactly one leading slash on the path, never parsed against the
 * base: a path such as `//example.com` would otherwise be read as another
 * host and make the redirect leave the site.
 */
function addressOn(base: string, path: string, search: string): string {
  return `${new URL(base).origin}/${path.replace(/^\/+/, "")}${search}`;
}

/**
 * The address a page request should be sent to for good, or null when this
 * Worker answers it. A path under `/docs` goes to the documentation site on
 * any hostname, and any other path on a redirected hostname goes to the same
 * path on {@link SITE_URL}.
 */
function permanentTarget(url: URL): string | null {
  const { pathname, search } = url;
  if (pathname === DOCS_PREFIX || pathname.startsWith(`${DOCS_PREFIX}/`)) {
    return addressOn(DOCS_URL, pathname.slice(DOCS_PREFIX.length), search);
  }
  if (REDIRECTED_HOSTNAMES.includes(url.hostname)) {
    return addressOn(SITE_URL, pathname, search);
  }
  return null;
}

/**
 * Permanently redirects a page request that belongs on another address, or
 * returns null for any other request.
 * @remarks The address carries no fragment, so the browser keeps the
 *   visitor's own (the map view, basemap and layers live in it). Only GET and
 *   HEAD are redirected: a report from a page still open on a redirected
 *   address is a POST, which the app accepts from every origin it serves.
 */
function redirectMovedPage(request: Request): Response | null {
  const isPageRequest = request.method === "GET" || request.method === "HEAD";
  if (!isPageRequest) {
    return null;
  }
  const target = permanentTarget(new URL(request.url));
  return target === null ? null : Response.redirect(target, 301);
}

/**
 * The Cloudflare Workers entry point. Redirects a moved page to its address, then delegates every other request to the built React Router
 * server bundle. There are no Cloudflare bindings to thread through, so the
 * request is passed on with no `RouterContextProvider`.
 * @remarks The `try`/`catch` around `requestHandler` is a last-resort net,
 *   not the primary error path; the `handleError` in `entry.server.tsx`
 *   logs loader and action errors, and its `onError` logs render errors,
 *   via `console.error`
 *   before this ever sees them. This only fires
 *   for a failure outside that render lifecycle entirely (e.g. the dynamic
 *   `import("virtual:react-router/server-build")` itself failing), where an
 *   unhandled throw would otherwise surface as a bare Workers runtime
 *   exception instead of a logged error and a response.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const redirect = redirectMovedPage(request);
    if (redirect) {
      return redirect;
    }
    try {
      return withSecurityHeaders(await requestHandler(request));
    } catch (error) {
      console.error(describeServerError(error));
      return withSecurityHeaders(
        new Response("Internal Server Error", { status: 500 }),
      );
    }
  },
} satisfies ExportedHandler;

/**
 * Adds this app's `SECURITY_HEADERS` to `response`, filling in only the
 * ones `response` does not already set.
 * @remarks `public/_headers` reaches only responses served straight from the
 *   static assets, so the Worker adds the headers to the responses it renders
 *   itself. A header already set wins, so the per-request, nonce-bearing
 *   `Content-Security-Policy` from `entry.server.tsx` survives; the 500
 *   fallback has none and gets the nonce-free default.
 */
function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (headers.has(name)) {
      continue;
    }
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
