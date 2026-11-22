// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { SDK_VERSION_TOKEN } from "../plugins/remarkSdkVersion";

/** One documentation page, read from its source file. */
export interface DocPage {
  /** The page's path under `docs/` without the extension. */
  readonly id: string;
  readonly title: string;
  /** The one-line description the front matter gives. */
  readonly description: string;
  /** The page's path under the base path, with both slashes (`/` for the front page). */
  readonly permalink: string;
  /** Where the Markdown copy goes, relative to the build folder. */
  readonly copyPath: string;
  /** The source after the front matter. */
  readonly body: string;
}

/** What the copies and the files need to know about the site. */
export interface CopyContext {
  /** The origin, with no trailing slash. */
  readonly origin: string;
  /** The base path, with both slashes. */
  readonly baseUrl: string;
  /** The SDK's version, which replaces the version token. */
  readonly version: string;
  readonly title: string;
  readonly tagline: string;
}

/** A front matter block, after the blank line some pages leave below its opening line. */
const FRONT_MATTER = /^---\r?\n(?:\s*\r?\n)?([\s\S]*?)\r?\n---\r?\n/;
const FENCE = /^\s*(```|~~~)/;
const LINK_TARGET = /\]\(([^)\s]+)\)/g;
const HAS_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const MARKDOWN_PAGE = /\.mdx?$/;

/** The folder part of a page id, with its trailing slash, or "". */
function folderOf(id: string): string {
  return id.slice(0, id.lastIndexOf("/") + 1);
}

function frontMatterOf(source: string): Map<string, string> {
  const values = new Map<string, string>();
  const block = FRONT_MATTER.exec(source);
  for (const line of (block?.[1] ?? "").split(/\r?\n/)) {
    const match = /^([\w-]+):\s*(.*)$/.exec(line);
    if (match) {
      values.set(
        match[1] ?? "",
        (match[2] ?? "").replace(/^(["'])(.*)\1$/, "$2"),
      );
    }
  }
  return values;
}

function permalinkOf(id: string, slug: string | undefined): string {
  // A folder's `index` page is the folder's own address, as the framework serves it.
  const path = slug === undefined ? `/${id.replace(/(^|\/)index$/, "")}` : slug;
  const absolute = path.startsWith("/") ? path : `/${folderOf(id)}${path}`;
  const trimmed = absolute.replace(/\/+$/, "");
  return trimmed === "" ? "/" : `${trimmed}/`;
}

/**
 * Reads a page's source: the title and description its front matter must give
 * (the llms.txt files list both), its permalink and the body.
 * @param id - The page's path under `docs/` without the extension.
 * @param source - The file's text.
 */
export function parseDocSource(id: string, source: string): DocPage {
  const values = frontMatterOf(source);
  const title = values.get("title");
  const description = values.get("description");
  if (!title) {
    throw new Error(`The page "${id}" has no title in its front matter.`);
  }
  if (!description) {
    throw new Error(`The page "${id}" has no description in its front matter.`);
  }
  const permalink = permalinkOf(id, values.get("slug"));
  return {
    id,
    title,
    description,
    permalink,
    copyPath: permalink === "/" ? "index.md" : `${permalink.slice(1, -1)}.md`,
    body: source.replace(FRONT_MATTER, "").trimStart(),
  };
}

/** The absolute URL of a page's Markdown copy. */
export function copyUrl(page: DocPage, context: CopyContext): string {
  return `${context.origin}${context.baseUrl}${page.copyPath}`;
}

function resolveTarget(
  target: string,
  page: DocPage,
  pages: readonly DocPage[],
  context: CopyContext,
): string {
  if (HAS_SCHEME.test(target)) {
    return target;
  }
  if (target.startsWith("#")) {
    return `${copyUrl(page, context)}${target}`;
  }
  if (target.startsWith("/")) {
    return `${context.origin}${target}`;
  }
  const [path = "", hash] = target.split("#");
  const suffix = hash === undefined ? "" : `#${hash}`;
  if (!MARKDOWN_PAGE.test(path)) {
    const pageUrl = `${context.origin}${context.baseUrl.slice(0, -1)}${page.permalink}`;
    return `${new URL(path, pageUrl).href}${suffix}`;
  }
  const id = new URL(path, `http://x/${folderOf(page.id)}`).pathname
    .slice(1)
    .replace(MARKDOWN_PAGE, "");
  const linked = pages.find((other) => other.id === id);
  if (!linked) {
    throw new Error(
      `The page "${page.id}" links to "${id}", which is not a page.`,
    );
  }
  return `${copyUrl(linked, context)}${suffix}`;
}

/**
 * The Markdown copy of a page: the version token resolved, every link
 * absolute (a link to another page points at that page's copy), and fenced
 * code left as written. It carries no site chrome because it is written from
 * the source, not the HTML.
 * @param page - The page.
 * @param pages - Every page, to resolve links between them.
 * @param context - The site's origin, base path and version.
 */
export function copyText(
  page: DocPage,
  pages: readonly DocPage[],
  context: CopyContext,
): string {
  let inFence = false;
  const lines = page.body
    .split(SDK_VERSION_TOKEN)
    .join(context.version)
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) {
        return line;
      }
      return line.replace(
        LINK_TARGET,
        (_, target: string) =>
          `](${resolveTarget(target, page, pages, context)})`,
      );
    });
  return `${lines.join("\n").trimEnd()}\n`;
}

function header(context: CopyContext): string {
  return `# ${context.title}\n\n> ${context.tagline}\n`;
}

/**
 * `llms.txt`: the llmstxt.org layout, one line for each page in the order
 * given, with its description and a link to its Markdown copy.
 * @param pages - The pages, in sidebar order.
 * @param context - The site's origin, base path and names.
 */
export function llmsTxt(
  pages: readonly DocPage[],
  context: CopyContext,
): string {
  const lines = pages.map(
    (page) =>
      `- [${page.title}](${copyUrl(page, context)}): ${page.description}`,
  );
  return `${header(context)}\nEvery page is also a plain Markdown file, linked below. The whole text is in ${context.origin}${context.baseUrl}llms-full.txt.\n\n## Pages\n\n${lines.join("\n")}\n`;
}

/**
 * `llms-full.txt`: the whole copy of every page, in the order given.
 * @param pages - The pages, in sidebar order.
 * @param context - The site's origin, base path, version and names.
 */
export function llmsFullTxt(
  pages: readonly DocPage[],
  context: CopyContext,
): string {
  const copies = pages.map((page) => copyText(page, pages, context).trimEnd());
  return `${header(context)}\n${copies.join("\n\n---\n\n")}\n`;
}

/**
 * `robots.txt` for the site: every crawler is welcome, and the sitemap is named.
 * @param context - The site's origin and base path.
 */
export function robotsTxt(context: CopyContext): string {
  return `# Open source documentation. Search engines and AI crawlers are welcome.\nUser-agent: *\nAllow: /\n\nSitemap: ${context.origin}${context.baseUrl}sitemap.xml\n`;
}
