// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { renderToReadableStream } from "react-dom/server";
import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import {
  buildContentSecurityPolicy,
  generateNonce,
} from "./constants/securityHeaders";

/**
 * React Router server entry point: streams the SSR response for a request
 * via `ServerRouter`, logging (but not surfacing) render errors to the
 * console.
 * @remarks Generates one Content-Security-Policy nonce per request and: (1)
 *   sets it as this response's `Content-Security-Policy` header (via {@link
 *   buildContentSecurityPolicy}); setting it here, before rendering, means
 *   `workers/app.ts`'s `withSecurityHeaders` sees it already present on the
 *   response and leaves it alone rather than overwriting it with the
 *   nonce-free static default meant for responses with no render of their
 *   own; (2) passes it to `renderToReadableStream`'s own `nonce` option, for
 *   any inline `<script>`/`<style>` React itself injects; and (3) passes it
 *   as `<ServerRouter>`'s own `nonce` prop, which react-router threads
 *   through its internal framework context to `<Scripts>`/
 *   `<ScrollRestoration>` (rendered from `root.tsx`'s `Layout`, further down
 *   the same tree) and to its own streamed-data transfer script; none of
 *   which `renderToReadableStream`'s option alone would reach, since they're
 *   react-router's own components/injected scripts, not React's.
 */
export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  const nonce = generateNonce();
  responseHeaders.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy(nonce, { development: import.meta.env.DEV }),
  );

  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
    {
      nonce,
      signal: request.signal,
      onError(error) {
        console.error(error);
      },
    },
  );

  responseHeaders.set("Content-Type", "text/html");
  // Pages link hashed assets, so a stale page would point at old bundles.
  // `no-cache` revalidates every visit; `no-store` would also bar the
  // back/forward cache.
  responseHeaders.set("Cache-Control", "no-cache");

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
