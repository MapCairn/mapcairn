// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";

/** A link in a built page that points nowhere. */
export interface BrokenLink {
  /** The page, relative to the build folder. */
  readonly from: string;
  /** The `href` as written. */
  readonly href: string;
}

/** The `type` values of a script that runs, as opposed to a data block. */
const EXECUTABLE_SCRIPT_TYPES = new Set(["", "module", "text/javascript"]);

/**
 * Every HTML file under a folder, as paths relative to it with forward slashes.
 * @param root - The build folder.
 */
export function htmlFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith(".html")) {
        files.push(relative(root, path).split(sep).join("/"));
      }
    }
  };
  walk(root);
  return files;
}

/** The text of every tag of one name in a page: `[attributes, body]` pairs. */
function tagsOf(html: string, name: string): Array<[string, string]> {
  const pattern = new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)</${name}>`, "gi");
  return [...html.matchAll(pattern)].map((match) => [
    match[1] ?? "",
    match[2] ?? "",
  ]);
}

/** The value of one attribute in a tag's attribute text, or null. */
function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(
    ` ${attributes}`,
  );
  return match ? (match[1] ?? "") : null;
}

/**
 * The Content-Security-Policy hash of each inline script that runs, written as
 * `sha256-<base64>`. Data blocks such as JSON-LD are not scripts to the policy.
 * @param html - One page.
 */
export function inlineScriptHashes(html: string): string[] {
  return tagsOf(html, "script")
    .filter(
      ([attributes]) =>
        attribute(attributes, "src") === null &&
        EXECUTABLE_SCRIPT_TYPES.has(attribute(attributes, "type") ?? ""),
    )
    .map(
      ([, body]) =>
        `sha256-${createHash("sha256").update(body).digest("base64")}`,
    );
}

/**
 * How many elements in a page carry a `style` attribute, which a policy
 * without `unsafe-inline` blocks.
 * @param html - One page.
 */
export function inlineStyleAttributes(html: string): number {
  return [...html.matchAll(/<[a-z][^>]*\sstyle\s*=/gi)].length;
}

/**
 * The scripts, styles, images and fonts a page fetches from another origin.
 * A link the reader follows is not one.
 * @param html - One page.
 */
export function externalResources(html: string): string[] {
  const isExternal = (url: string | null): url is string =>
    url !== null && /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url);
  const fetched: string[] = [];
  for (const [attributes] of tagsOf(html, "script")) {
    const src = attribute(attributes, "src");
    if (isExternal(src)) {
      fetched.push(src);
    }
  }
  for (const match of html.matchAll(
    /<(link|img|source|video|audio)\b([^>]*)>/gi,
  )) {
    const attributes = match[2] ?? "";
    const url =
      match[1]?.toLowerCase() === "link"
        ? attribute(attributes, "href")
        : attribute(attributes, "src");
    const rel = attribute(attributes, "rel") ?? "";
    if (
      isExternal(url) &&
      (match[1]?.toLowerCase() !== "link" ||
        /stylesheet|preload|modulepreload|icon/i.test(rel))
    ) {
      fetched.push(url);
    }
  }
  return fetched;
}

/** Whether a built page or file exists for a path under the build folder. */
function builtFileExists(root: string, path: string): boolean {
  const candidates = [path, `${path}.html`, join(path, "index.html")];
  return candidates.some((candidate) => {
    const full = join(root, candidate);
    return existsSync(full) && statSync(full).isFile();
  });
}

/**
 * Every `href` that starts with `/` in the built pages and resolves to no
 * built page or file. A link under the base path must exist in the build; a
 * link outside it must be one of the reference site's own paths.
 * @param root - The build folder.
 * @param baseUrl - The base path, with both slashes.
 * @param hostPaths - The paths outside the base path the site may link to.
 */
export function brokenInternalLinks(
  root: string,
  baseUrl: string,
  hostPaths: readonly string[],
): BrokenLink[] {
  const broken: BrokenLink[] = [];
  for (const page of htmlFiles(root)) {
    const html = readFileSync(join(root, page), "utf8");
    for (const match of html.matchAll(/<a\b[^>]*\shref\s*=\s*"(\/[^"]*)"/gi)) {
      const href = match[1] ?? "";
      if (href.startsWith("//")) {
        continue;
      }
      const path = decodeURI(href.split(/[?#]/)[0] ?? "");
      const known = path.startsWith(baseUrl)
        ? builtFileExists(root, path.slice(baseUrl.length))
        : hostPaths.includes(path);
      if (!known) {
        broken.push({ from: page, href });
      }
    }
  }
  return broken;
}

/**
 * The gzip size, in bytes, of every script a page loads: each `script` with a
 * `src` and each `modulepreload` link, once. It is the transfer a visitor pays
 * for before the page can use any script.
 * @param root - The build folder.
 * @param baseUrl - The base path, with both slashes.
 * @param page - The page, relative to the build folder.
 */
export function scriptBytesFor(
  root: string,
  baseUrl: string,
  page: string,
): number {
  const html = readFileSync(join(root, page), "utf8");
  const urls = new Set<string>();
  for (const [attributes] of tagsOf(html, "script")) {
    const src = attribute(attributes, "src");
    if (src) {
      urls.add(src);
    }
  }
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = match[1] ?? "";
    if (/modulepreload/i.test(attribute(attributes, "rel") ?? "")) {
      urls.add(attribute(attributes, "href") ?? "");
    }
  }
  let total = 0;
  for (const url of urls) {
    if (url.startsWith(baseUrl)) {
      total += gzipSync(
        readFileSync(join(root, url.slice(baseUrl.length))),
      ).length;
    }
  }
  return total;
}

/**
 * Removes the framework's hidden SVG sprite, a `display: none` element it
 * writes at the top of every page. The only icon in it is the one the theme
 * draws with `Icon/ExternalLink`, which this site replaces, and the style
 * attribute is one the Content-Security-Policy would block.
 * @param html - One page.
 */
export function stripHiddenSprite(html: string): string {
  return html.replace(
    /<svg style="display: ?none;?">\s*<defs>[\s\S]*?<\/defs>\s*<\/svg>/,
    "",
  );
}
