// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { BASE_URL } from "../src/siteConfig";

/** A parsed Content-Security-Policy: each directive with its sources. */
export type Directives = Record<string, string[]>;

/**
 * Splits a Content-Security-Policy into its directives.
 * @param policy - The header value.
 */
export function parseDirectives(policy: string): Directives {
  const directives: Directives = {};
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) {
      directives[name] = sources;
    }
  }
  return directives;
}

/** The origin the zone's cookieless page count script and beacon come from. */
const PAGE_COUNT_SCRIPT = "https://static.cloudflareinsights.com";
const PAGE_COUNT_BEACON = "https://cloudflareinsights.com";

/**
 * The site's Content-Security-Policy. It is the reference site's policy with
 * what a static documentation page does not need removed (no map, no provider
 * origins, no worker): the only third-party origins are the two the zone's
 * cookieless page count uses, which the reference site also allows. Inline
 * scripts are allowed one by one, by hash, and there is no inline style.
 * @param scriptHashes - `sha256-` hashes of the inline scripts the pages carry.
 */
export function buildContentSecurityPolicy(
  scriptHashes: readonly string[],
): string {
  const scriptSources = [
    "'self'",
    ...scriptHashes.map((hash) => `'${hash}'`),
    PAGE_COUNT_SCRIPT,
  ];
  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${PAGE_COUNT_BEACON} ${PAGE_COUNT_SCRIPT}`,
    "worker-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** A year, in seconds, for files whose names carry a content hash. */
const IMMUTABLE_SECONDS = 31536000;

/**
 * The text of the `_headers` file for the built site: the reference site's
 * security headers with the policy above, and a long cache for the hashed
 * build assets. Paths are the public ones, so they include the base path.
 * @param scriptHashes - Hashes of the inline scripts the pages carry.
 */
export function buildHeadersFile(scriptHashes: readonly string[]): string {
  return `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=(), browsing-topics=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Content-Security-Policy: ${buildContentSecurityPolicy(scriptHashes)}

${BASE_URL}assets/*
  Cache-Control: public, max-age=${IMMUTABLE_SECONDS}, immutable
`;
}
