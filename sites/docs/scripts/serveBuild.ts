// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { extname, posix, sep } from "node:path";
import { BASE_URL } from "../src/siteConfig";

/** What a path in the build folder is. */
export type PathKind = "file" | "directory" | "none";

/** What to do with a request: send a file, redirect, or send the 404 page. */
export type Target =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "redirect"; readonly location: string }
  | { readonly kind: "missing"; readonly path: string };

/** The page sent, with status 404, for an address the build does not hold. */
const NOT_FOUND_PAGE = "404.html";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/**
 * Decodes the percent escapes of a request path, or returns null when one is
 * malformed (the caller answers 400).
 * @param pathname - The path of the request URL.
 */
export function decodePathname(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

/**
 * Whether an absolute path lies inside a folder, as a last check after the
 * path has been resolved.
 * @param folder - The absolute folder.
 * @param path - The absolute path to test.
 */
export function insideFolder(folder: string, path: string): boolean {
  return path.startsWith(`${folder}${sep}`);
}

/**
 * The media type of a file by its extension, binary when the build holds no
 * such type.
 * @param path - A file path.
 */
export function contentTypeOf(path: string): string {
  return CONTENT_TYPES[extname(path)] ?? "application/octet-stream";
}

/**
 * Decides what the Worker's static assets would do with a request: the same
 * rules as `htmlHandling: "auto-trailing-slash"` and `notFoundHandling:
 * "404-page"` in `cloudflare.config.ts`. A folder answers with its
 * `index.html` when asked with a trailing slash and is redirected to one
 * otherwise, a file is sent as it is with no slash added, and anything else,
 * including every address outside the base path, gets the 404 page.
 * @param pathname - The path of the request URL.
 * @param kindOf - Says what a path relative to the build folder is.
 */
export function resolveTarget(
  pathname: string,
  kindOf: (relativePath: string) => PathKind,
): Target {
  const missing: Target = { kind: "missing", path: NOT_FOUND_PAGE };
  const base = BASE_URL.replace(/\/$/, "");
  if (pathname !== base && !pathname.startsWith(`${base}/`)) {
    return missing;
  }
  const relative = posix.normalize(pathname.slice(base.length).slice(1));
  if (relative.startsWith("..")) {
    return missing;
  }
  const trimmed = relative.replace(/\/$/, "").replace(/^\.$/, "");
  const kind = trimmed === "" ? "directory" : kindOf(trimmed);
  if (kind === "file") {
    return { kind: "file", path: trimmed };
  }
  if (kind === "directory" && pathname.endsWith("/")) {
    return { kind: "file", path: posix.join(trimmed, "index.html") };
  }
  if (kind === "directory") {
    return { kind: "redirect", location: `${pathname}/` };
  }
  return missing;
}
