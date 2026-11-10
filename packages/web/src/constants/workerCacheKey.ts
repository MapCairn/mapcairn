import { SECURITY_HEADERS } from "./securityHeaders";

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * A short, synchronous hash of `text`, as eight lower-case hex digits (FNV-1a).
 * It only tells two texts apart, so a changed text gives a new value; it is
 * not a security measure.
 */
export function shortHash(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Adds a `v` query carrying `key` to `url`, keeping any query it has. The
 * server ignores it, but a cache treats a new query as a new address.
 */
export function withCacheKey(url: string, key: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${key}`;
}

/**
 * Names the Content Security Policy that static assets are served with.
 * A worker script takes its policy from its own response headers, and the
 * hashed worker file is cached as immutable for a year, so a copy fetched
 * before the policy changed keeps enforcing the old one. Adding this key to
 * the worker's URL makes every policy change a new address, so no device is
 * left on a stale policy and nobody has to hard-reload.
 */
export const WORKER_CACHE_KEY = shortHash(
  SECURITY_HEADERS["Content-Security-Policy"] ?? "",
);
