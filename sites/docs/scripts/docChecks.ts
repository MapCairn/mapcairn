// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** The Markdown extensions Docusaurus reads as pages. */
const PAGE_EXTENSION = /\.mdx?$/;

/** One entry of a Docusaurus sidebar, in the shapes this site uses. */
export type SidebarEntry =
  | string
  | { readonly type: "doc"; readonly id: string }
  | { readonly type: "link"; readonly label: string; readonly href: string }
  | {
      readonly type: "category";
      readonly label: string;
      readonly link?: { readonly type: "doc"; readonly id: string };
      readonly items: readonly SidebarEntry[];
    };

/**
 * The id of every page under a docs folder: its path without the extension,
 * with forward slashes. A file or folder whose name starts with `_` is a
 * partial or an ignored folder, and Docusaurus does not build it as a page.
 * @param docsDir - The folder the docs plugin reads.
 */
export function docIdsOnDisk(docsDir: string): string[] {
  const ids: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith("_")) {
        continue;
      }
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (PAGE_EXTENSION.test(entry.name)) {
        ids.push(
          relative(docsDir, path)
            .replace(PAGE_EXTENSION, "")
            .split(sep)
            .join("/"),
        );
      }
    }
  };
  walk(docsDir);
  return ids;
}

/**
 * Every page id a sidebar lists, in strings, `doc` items, category links and
 * nested categories.
 * @param entries - The sidebar's items.
 */
export function sidebarDocIds(entries: readonly SidebarEntry[]): string[] {
  return entries.flatMap((entry) => {
    if (typeof entry === "string") {
      return [entry];
    }
    if (entry.type === "doc") {
      return [entry.id];
    }
    if (entry.type === "category") {
      return [
        ...(entry.link ? [entry.link.id] : []),
        ...sidebarDocIds(entry.items),
      ];
    }
    return [];
  });
}

/**
 * The pages on disk that no sidebar entry lists. A page nobody can reach from
 * the navigation is a documentation bug, so the build refuses one.
 * @param docsDir - The folder the docs plugin reads.
 * @param listed - The ids the sidebars list.
 */
export function docsMissingFromSidebar(
  docsDir: string,
  listed: readonly string[],
): string[] {
  const known = new Set(listed);
  return docIdsOnDisk(docsDir).filter((id) => !known.has(id));
}
