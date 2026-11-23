// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { LoadContext, Plugin } from "@docusaurus/types";
import { sidebarDocIds } from "../scripts/docChecks";
import {
  type CopyContext,
  copyText,
  type DocPage,
  llmsFullFiles,
  llmsTxt,
  parseDocSource,
  robotsTxt,
} from "../scripts/markdownCopies";
import { sidebar } from "../sidebars";

/**
 * Reads the pages the sidebar lists, in its order.
 * @param docsDir - The folder the docs plugin reads.
 */
export function readDocPages(docsDir: string): DocPage[] {
  return sidebarDocIds(sidebar).map((id) =>
    parseDocSource(id, readFileSync(join(docsDir, `${id}.md`), "utf8")),
  );
}

/**
 * Writes the agent-facing files into a finished build: a Markdown copy of
 * every page, `llms.txt`, the `llms-full-<area>` files and `robots.txt`, and, in each
 * page's head, a link to its copy. All static files: nothing negotiates on a
 * request header.
 * @param outDir - The build folder.
 * @param pages - Every page, in sidebar order.
 * @param context - The site's origin, base path, version and names.
 */
export function writeMarkdownFiles(
  outDir: string,
  pages: readonly DocPage[],
  context: CopyContext,
): void {
  for (const page of pages) {
    const target = join(outDir, page.copyPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, copyText(page, pages, context));
    const html = join(outDir, page.permalink.slice(1), "index.html");
    writeFileSync(
      html,
      readFileSync(html, "utf8").replace(
        "</head>",
        `<link rel="alternate" type="text/markdown" href="${context.baseUrl}${page.copyPath}"></head>`,
      ),
    );
  }
  writeFileSync(join(outDir, "llms.txt"), llmsTxt(pages, context));
  for (const file of llmsFullFiles(pages, context)) {
    writeFileSync(join(outDir, file.name), file.text);
  }
  writeFileSync(join(outDir, "robots.txt"), robotsTxt(context));
}

/**
 * The Docusaurus plugin that runs {@link writeMarkdownFiles} after the build.
 * @param siteVersion - The SDK's version, which pages name.
 */
export default function markdownCopiesPlugin(
  siteVersion: string,
): (context: LoadContext) => Plugin {
  return ({ siteDir, siteConfig }) => ({
    name: "mapcairn-markdown-copies",
    postBuild({ outDir }) {
      writeMarkdownFiles(outDir, readDocPages(join(siteDir, "docs")), {
        origin: siteConfig.url,
        baseUrl: siteConfig.baseUrl,
        version: siteVersion,
        title: siteConfig.title,
        tagline: siteConfig.tagline,
      });
    },
  });
}
