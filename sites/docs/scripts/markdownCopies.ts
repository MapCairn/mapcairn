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
/** A line that holds nothing but HTML tags, such as the wrapper a page puts around its blocks. */
const TAGS_ONLY = /^\s*(?:<\/?[A-Za-z][^>]*>\s*)+$/;

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
 * absolute (a link to another page points at that page's copy), lines that
 * hold only HTML tags (the wrappers a page uses for its layout) dropped, and
 * fenced code left as written. It carries no site chrome because it is written from
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
  let afterDropped = false;
  const lines: string[] = [];
  const source = page.body.split(SDK_VERSION_TOKEN).join(context.version);
  for (const line of source.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
    }
    const drop = !inFence && !FENCE.test(line) && TAGS_ONLY.test(line);
    const blankAfterDrop: boolean = afterDropped && line.trim() === "";
    afterDropped = drop || blankAfterDrop;
    if (!drop && !blankAfterDrop) {
      lines.push(inFence ? line : absoluteLinks(line, page, pages, context));
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** A line of prose with every link target made absolute; a fence line has none. */
function absoluteLinks(
  line: string,
  page: DocPage,
  pages: readonly DocPage[],
  context: CopyContext,
): string {
  return line.replace(
    LINK_TARGET,
    (_, target: string) => `](${resolveTarget(target, page, pages, context)})`,
  );
}

function header(context: CopyContext): string {
  return `# ${context.title}\n\n> ${context.tagline}\n`;
}

/**
 * The most bytes an `llms-full-<area>` file may hold, so a model with a small
 * context can read one file whole. A file that holds a single page may be
 * larger, because a page is never cut.
 */
export const LLMS_FULL_CEILING = 150_000;

/** The most bytes `llms.txt` may hold: it is the file a reader opens first, so it must stay small. */
export const LLMS_INDEX_CEILING = 150_000;

const PAGE_SEPARATOR = "\n\n---\n\n";

const textEncoder = new TextEncoder();

/** The size of a text in bytes, as a file or a download counts it. */
function byteLength(text: string): number {
  return textEncoder.encode(text).length;
}

/**
 * The area a page belongs to: the package for an API reference page, the
 * name of a page generated from `ARCHITECTURE.md` or `DESIGN.md` (its overview
 * and each of its parts),
 * `changelog`, and `guides` for every other page.
 * @param id - The page's path under `docs/` without the extension.
 */
export function areaOf(id: string): string {
  const [first, second = ""] = id.split("/");
  const depth = id.split("/").length;
  if (first === "api" && depth > 2) {
    return second;
  }
  if (first === "generated" && depth >= 2) {
    return second;
  }
  return first === "changelog" ? "changelog" : "guides";
}

/**
 * Whether `llms.txt` lists the page. The API reference has a page for every
 * export, which would make the index larger than the files it points to, so
 * it lists the reference's front page and each package's page, and each
 * package's page lists its members.
 * @param id - The page's path under `docs/` without the extension.
 */
export function isListedInIndex(id: string): boolean {
  const segments = id.split("/");
  if (segments[0] !== "api") {
    return true;
  }
  return (
    segments.length === 2 || (segments.length === 3 && segments[2] === "index")
  );
}

/** One `llms-full-<area>` file: the copies of some pages of one area. */
export interface LlmsFullFile {
  /** The file's name in the build folder. */
  readonly name: string;
  readonly area: string;
  /** This file's place among the area's files, from 1. */
  readonly part: number;
  /** How many files the area has. */
  readonly parts: number;
  readonly pages: readonly DocPage[];
  readonly text: string;
  /** The size of `text` in bytes. */
  readonly bytes: number;
}

interface PageCopy {
  readonly page: DocPage;
  readonly text: string;
}

/** The start of an area's file. */
function fileHead(area: string, context: CopyContext): string {
  return `${header(context)}\nThe ${area} pages of the documentation. Every file and the size of each is listed in ${context.origin}${context.baseUrl}llms.txt.\n\n`;
}

/** The bytes a file holds after its head: the closing newline of the file. */
const FILE_END_BYTES = 1;

/**
 * Splits an area's copies into runs whose files fit the ceiling exactly (head,
 * the copies, a separator between each two and the closing newline); a run of
 * one page may exceed it.
 */
function packCopies(
  copies: readonly PageCopy[],
  headBytes: number,
  ceiling: number,
): PageCopy[][] {
  const separatorBytes = byteLength(PAGE_SEPARATOR);
  const runs: PageCopy[][] = [];
  let run: PageCopy[] = [];
  let size = headBytes + FILE_END_BYTES;
  const addedBy = (copy: PageCopy): number =>
    byteLength(copy.text) + (run.length > 0 ? separatorBytes : 0);
  for (const copy of copies) {
    if (run.length > 0 && size + addedBy(copy) > ceiling) {
      runs.push(run);
      run = [];
      size = headBytes + FILE_END_BYTES;
    }
    size += addedBy(copy);
    run.push(copy);
  }
  if (run.length > 0) {
    runs.push(run);
  }
  return runs;
}

/**
 * The `llms-full` files: the whole copy of every page, grouped by area
 * ({@link areaOf}, in the order the areas first appear) and split so no file
 * exceeds `ceiling` unless it is a single page. A lone file is
 * `llms-full-<area>.txt`; an area split in several is `llms-full-<area>-<n>.txt`.
 * @param pages - The pages, in sidebar order.
 * @param context - The site's origin, base path, version and names.
 * @param ceiling - The most bytes a file holds, {@link LLMS_FULL_CEILING} by default.
 */
export function llmsFullFiles(
  pages: readonly DocPage[],
  context: CopyContext,
  ceiling: number = LLMS_FULL_CEILING,
): LlmsFullFile[] {
  const byArea = new Map<string, PageCopy[]>();
  for (const page of pages) {
    const copies = byArea.get(areaOf(page.id)) ?? [];
    copies.push({ page, text: copyText(page, pages, context).trimEnd() });
    byArea.set(areaOf(page.id), copies);
  }
  const files: LlmsFullFile[] = [];
  for (const [area, copies] of byArea) {
    const head = fileHead(area, context);
    const runs = packCopies(copies, byteLength(head), ceiling);
    runs.forEach((run, index) => {
      const text = `${head}${run.map((copy) => copy.text).join(PAGE_SEPARATOR)}\n`;
      files.push({
        name: `llms-full-${area}${runs.length === 1 ? "" : `-${index + 1}`}.txt`,
        area,
        part: index + 1,
        parts: runs.length,
        pages: run.map((copy) => copy.page),
        text,
        bytes: byteLength(text),
      });
    });
  }
  return files;
}

/** One line of the full-text list: what the file holds and how big it is. */
function fullFileLine(file: LlmsFullFile, context: CopyContext): string {
  const first = file.pages[0]?.title ?? "";
  const last = file.pages[file.pages.length - 1]?.title ?? "";
  const part = file.parts === 1 ? "" : `, part ${file.part} of ${file.parts}`;
  const range = file.pages.length === 1 ? first : `${first} to ${last}`;
  return `- [${file.name}](${context.origin}${context.baseUrl}${file.name}): ${file.area}${part} (${range}), ${file.pages.length} ${file.pages.length === 1 ? "page" : "pages"}, ${file.bytes} bytes`;
}

/**
 * `llms.txt`: the llmstxt.org layout. It lists the `llms-full` files with
 * their sizes and one line for each page {@link isListedInIndex} names, in the
 * order given, with its description, a link to its Markdown copy and the size
 * of that copy.
 * @param pages - The pages, in sidebar order.
 * @param context - The site's origin, base path, version and names.
 */
export function llmsTxt(
  pages: readonly DocPage[],
  context: CopyContext,
): string {
  const base = `${context.origin}${context.baseUrl}`;
  const files = llmsFullFiles(pages, context).map((file) =>
    fullFileLine(file, context),
  );
  const lines = pages
    .filter((page) => isListedInIndex(page.id))
    .map(
      (page) =>
        `- [${page.title}](${copyUrl(page, context)}): ${page.description} (${byteLength(copyText(page, pages, context))} bytes)`,
    );
  return `${header(context)}\nEvery page is also a plain Markdown file, linked below with its size. The full text is split by area into the files listed first, none larger than ${LLMS_FULL_CEILING} bytes unless it is a single page: read this index, then fetch only the file or page you need. The API reference has a page for every export, so only its front page and each package's page are listed here; a package's page links its members, and their text is in that package's files. The pages and the API reference are also data, in ${base}pages.json and ${base}api.json; the Machine-readable data page describes them.\n\n## Full text by area\n\n${files.join("\n")}\n\n## Pages\n\n${lines.join("\n")}\n`;
}

/**
 * `llms-full.txt`: the file this address held when the whole text was one
 * file. It holds no page content, only where the text is now: the index and
 * each area file with its size.
 * @param pages - The pages, in sidebar order.
 * @param context - The site's origin, base path, version and names.
 */
export function llmsFullIndexTxt(
  pages: readonly DocPage[],
  context: CopyContext,
): string {
  const files = llmsFullFiles(pages, context).map((file) =>
    fullFileLine(file, context),
  );
  return `${header(context)}\nThe full text is no longer one file: it is split by area so a reader can fetch only the part it needs. The index, with every page and its size, is ${context.origin}${context.baseUrl}llms.txt. The files:\n\n${files.join("\n")}\n`;
}

/**
 * `robots.txt` for the site: every crawler is welcome, and the sitemap is named.
 * @param context - The site's origin and base path.
 */
export function robotsTxt(context: CopyContext): string {
  return `# Open source documentation. Search engines and AI crawlers are welcome.\nUser-agent: *\nAllow: /\n\nSitemap: ${context.origin}${context.baseUrl}sitemap.xml\n`;
}
