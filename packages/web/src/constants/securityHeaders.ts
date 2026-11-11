/**
 * Builds this app's Content-Security-Policy directive string.
 * @param nonce - When given, added to `script-src` as `'nonce-<value>'`
 *   beside the static hash. Omitted for the static default that
 *   `public/_headers` and `workers/app.ts`'s 500 fallback use, since neither
 *   has a per-request nonce or anything inline to allow.
 * @param options - `development` relaxes `style-src` and `connect-src` for
 *   the Vite dev server, which injects <style> tags and a hot-reload socket.
 *   Production never sets it.
 * @remarks The `sha256-` source allows the static inline theme script
 *   (`app/themeBootstrap.ts`, rendered by `root.tsx`);
 *   `app/themeBootstrap.test.ts` recomputes the hash. The nonce covers the
 *   streaming and hydration scripts React injects during SSR, whose content
 *   changes per request: `entry.server.tsx` makes one with
 *   {@link generateNonce} and passes it both here and to
 *   `renderToReadableStream`. `script-src` leaves out Rocket Loader
 *   (`https://ajax.cloudflare.com`), which the app does not use; enabling it
 *   on the zone would need that entry added deliberately. `frame-src 'none'`
 *   is explicit, matching `frame-ancestors 'none'`, so it does not fall back
 *   to `child-src`, which also governs workers.
 */
export function buildContentSecurityPolicy(
  nonce?: string,
  options: { development?: boolean } = {},
): string {
  const scriptSources = [
    "'self'",
    "'sha256-LIh9ryv2n74iCbLNeeyWx+zzyHDg9PKmUlheB7pt8zs='",
    ...(nonce ? [`'nonce-${nonce}'`] : []),
    "https://static.cloudflareinsights.com",
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    options.development
      ? "style-src 'self' 'unsafe-inline'"
      : "style-src 'self'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org https://tile.opentopomap.org https://tiles.maps.eox.at https://tiles.openfreemap.org https://gibs.earthdata.nasa.gov https://ows.globalfloods.eu",
    "font-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com https://tile.openstreetmap.org https://tile.opentopomap.org https://tiles.maps.eox.at https://nominatim.openstreetmap.org https://valhalla1.openstreetmap.de https://tiles.openfreemap.org https://earthquake.usgs.gov https://gibs.earthdata.nasa.gov https://www.gdacs.org https://ows.globalfloods.eu https://cdn.jsdelivr.net" +
      (options.development ? " ws://localhost:* http://localhost:*" : ""),
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Generates a fresh, per-request Content-Security-Policy nonce: 16
 * cryptographically random bytes, base64-encoded per the CSP spec's own
 * nonce format.
 * @remarks Base64's alphabet (`A-Za-z0-9+/=`) contains neither `'` nor `;`,
 *   so the result is always safe to embed directly inside a `'nonce-<value>'`
 *   CSP source without further escaping.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Security response headers applied to every request.
 * @remarks The single source of truth for this app's security headers.
 *   `public/_headers` repeats them for responses served straight from the
 *   static assets, and `securityHeaders.test.ts` keeps the two in step.
 *   `workers/app.ts` adds them to the responses the Worker renders. The
 *   `Content-Security-Policy` here is the nonce-free default; a rendered page
 *   carries its own per-request policy, which takes precedence.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "geolocation=(self), camera=(), microphone=(), interest-cohort=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": buildContentSecurityPolicy(),
};
