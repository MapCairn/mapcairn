// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { API_FOLDER, type ApiEntry } from "./api/catalogue";
import { type CopyContext, copyUrl, type DocPage } from "./markdownCopies";
import { plainText } from "./searchRecords";

/**
 * The version of the layout of `pages.json` and `api.json`. Both files carry
 * it as `schemaVersion`. Before 1.0 a change only adds fields and the number
 * stays; a change that removes or renames one raises it.
 */
export const MACHINE_DATA_SCHEMA_VERSION = 1;

/** The page manifest's file name in the build folder. */
export const PAGES_FILE = "pages.json";

/** The API catalogue's file name in the build folder. */
export const API_FILE = "api.json";

/**
 * What the API generator leaves for the build: the file name, beside the
 * generated pages and git-ignored like them, and its content.
 */
export const CATALOGUE_FILE_NAME = "_catalogue.json";

/** The content of {@link CATALOGUE_FILE_NAME}. */
export interface CatalogueData {
  readonly packages: readonly PackageVersion[];
  readonly entries: readonly ApiEntry[];
}

/** A package and the version the pages were checked against. */
export interface PackageVersion {
  readonly name: string;
  readonly version: string;
}

/** One `h2` or `h3` heading of a page. */
export interface PageHeading {
  /** 2 or 3. */
  readonly level: number;
  /** The heading as plain text. */
  readonly text: string;
  /** The `id` the heading carries, so `#anchor` reaches it. */
  readonly anchor: string;
}

/** A page of the manifest. */
export interface PageManifestEntry {
  readonly title: string;
  readonly description: string;
  /** The page's address on the origin, such as `/guides/extending/`. */
  readonly path: string;
  /** The same address with the origin. */
  readonly url: string;
  /** The address of the page's Markdown copy. */
  readonly markdownUrl: string;
  /** The SDK version the page was checked against. */
  readonly checkedAgainst: string;
  readonly headings: readonly (PageHeading & { readonly url: string })[];
}

/** `pages.json`. */
export interface PagesJson {
  readonly schemaVersion: number;
  /** Every SDK package and its version in this build. */
  readonly packages: readonly PackageVersion[];
  /** Every page of the sidebar, in its order. */
  readonly pages: readonly PageManifestEntry[];
}

/** An entry of `api.json`: the catalogue's entry with the address of its page. */
export type ApiJsonEntry = Omit<ApiEntry, "page"> & {
  /** The absolute address of the export's page. */
  readonly pageUrl: string;
};

/** `api.json`. */
export interface ApiJson {
  readonly schemaVersion: number;
  readonly packages: readonly PackageVersion[];
  readonly entries: readonly ApiJsonEntry[];
}

const ARTICLE = /<article\b[^>]*>([\s\S]*?)<\/article>/i;
const HEADING = /<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;

/**
 * The `h2` and `h3` headings of a built page's article that carry an `id`, in
 * the order they appear. The `h1` is the page's title and has no entry.
 * @param html - One built page.
 */
export function headingsOf(html: string): PageHeading[] {
  const article = ARTICLE.exec(html)?.[1] ?? "";
  return [...article.matchAll(HEADING)].flatMap((match) => {
    const anchor = /\sid="([^"]*)"/.exec(match[2] ?? "")?.[1];
    return anchor === undefined
      ? []
      : [
          {
            level: Number(match[1]),
            text: plainText(match[3] ?? ""),
            anchor,
          },
        ];
  });
}

/**
 * The page manifest.
 * @param pages - Every page, in sidebar order.
 * @param headings - Each page's headings, by permalink.
 * @param packages - The SDK packages and their versions.
 * @param context - The site's origin, base path and version.
 */
export function pagesJson(
  pages: readonly DocPage[],
  headings: ReadonlyMap<string, readonly PageHeading[]>,
  packages: readonly PackageVersion[],
  context: CopyContext,
): PagesJson {
  return {
    schemaVersion: MACHINE_DATA_SCHEMA_VERSION,
    packages,
    pages: pages.map((page) => {
      const path = `${context.baseUrl.slice(0, -1)}${page.permalink}`;
      const url = `${context.origin}${path}`;
      return {
        title: page.title,
        description: page.description,
        path,
        url,
        markdownUrl: copyUrl(page, context),
        checkedAgainst: context.version,
        headings: (headings.get(page.permalink) ?? []).map((heading) => ({
          ...heading,
          url: `${url}#${heading.anchor}`,
        })),
      };
    }),
  };
}

/**
 * The API catalogue as data.
 * @param entries - Every export, from the same model the API pages come from.
 * @param packages - The SDK packages and their versions.
 * @param context - The site's origin and base path.
 */
export function apiJson(
  entries: readonly ApiEntry[],
  packages: readonly PackageVersion[],
  context: CopyContext,
): ApiJson {
  return {
    schemaVersion: MACHINE_DATA_SCHEMA_VERSION,
    packages,
    entries: entries.map(({ page, ...rest }) => ({
      ...rest,
      pageUrl: `${context.origin}${context.baseUrl}${API_FOLDER}/${page}/`,
    })),
  };
}
