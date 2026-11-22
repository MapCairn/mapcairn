// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CopyContext,
  copyUrl,
  type DocPage,
  llmsFullTxt,
} from "./markdownCopies";

const BARE_FENCE = /^\s*(?:```|~~~)\s*$/;
const FENCE = /^\s*(?:```|~~~)/;
const RELATIVE_LINK = /\]\((?![a-z][a-z0-9+.-]*:|\/\/)[^)\s]*\)/i;
const TABS = /<(?:Tabs|TabItem)\b/;
const BLOCKS_A_CRAWLER = /^\s*Disallow:\s*\S/im;

/** Whether a copy has an opening code fence with no language. */
function hasBareOpeningFence(text: string): boolean {
  let inFence = false;
  for (const line of text.split("\n")) {
    if (!FENCE.test(line)) {
      continue;
    }
    if (!inFence && BARE_FENCE.test(line)) {
      return true;
    }
    inFence = !inFence;
  }
  return false;
}

/** The lines of a copy outside fenced code. */
function proseOf(text: string): string {
  let inFence = false;
  return text
    .split("\n")
    .filter((line) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return false;
      }
      return !inFence;
    })
    .join("\n");
}

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** What is wrong with the text of one copy. */
function copyFindings(page: DocPage, copy: string): string[] {
  const findings: string[] = [];
  if (hasBareOpeningFence(copy)) {
    findings.push(`${page.copyPath} has a code fence with no language.`);
  }
  if (RELATIVE_LINK.test(proseOf(copy))) {
    findings.push(`${page.copyPath} has a relative link.`);
  }
  if (TABS.test(copy)) {
    findings.push(`${page.copyPath} hides content in tabs.`);
  }
  return findings;
}

/** What is wrong with the site's `robots.txt` and sitemap. */
function crawlerFindings(build: string, context: CopyContext): string[] {
  const findings: string[] = [];
  const robots = readIfExists(join(build, "robots.txt"));
  if (
    robots === null ||
    BLOCKS_A_CRAWLER.test(robots) ||
    !robots.includes(`Sitemap: ${context.origin}${context.baseUrl}sitemap.xml`)
  ) {
    findings.push(
      "robots.txt is missing, blocks a crawler or does not name the sitemap.",
    );
  }
  if (!existsSync(join(build, "sitemap.xml"))) {
    findings.push("sitemap.xml was not built.");
  }
  return findings;
}

/** What is wrong with the files and head link of one page. */
function pageFindings(
  build: string,
  page: DocPage,
  context: CopyContext,
  llms: string | null,
  full: string | null,
): string[] {
  const findings: string[] = [];
  const copy = readIfExists(join(build, page.copyPath));
  if (copy === null) {
    findings.push(`The page "${page.id}" has no Markdown copy.`);
  } else {
    findings.push(...copyFindings(page, copy));
    if (full !== null && !full.includes(copy.trimEnd())) {
      findings.push(`${page.copyPath} is not in llms-full.txt.`);
    }
  }
  if (llms !== null && !llms.includes(`(${copyUrl(page, context)})`)) {
    findings.push(`The page "${page.id}" is not in llms.txt.`);
  }
  const html = readIfExists(join(build, page.permalink.slice(1), "index.html"));
  const link = `rel="alternate" type="text/markdown" href="${context.baseUrl}${page.copyPath}"`;
  if (html !== null && !html.includes(link)) {
    findings.push(
      `${page.permalink} has no alternate link to its Markdown copy.`,
    );
  }
  return findings;
}

/**
 * What is wrong with the Markdown copies and agent files in a finished build:
 * a page with no copy, no head link, or no place in `llms.txt` and
 * `llms-full.txt`; a copy with a code fence that has no language, a relative
 * link or tabs; a `robots.txt` that blocks a crawler or omits the sitemap.
 * @param build - The build folder.
 * @param pages - Every page, in sidebar order.
 * @param context - The site's origin, base path and names.
 */
export function markdownFindings(
  build: string,
  pages: readonly DocPage[],
  context: CopyContext,
): string[] {
  const findings: string[] = [];
  const llms = readIfExists(join(build, "llms.txt"));
  const full = readIfExists(join(build, "llms-full.txt"));
  if (llms === null) {
    findings.push("llms.txt was not built.");
  }
  if (full === null) {
    findings.push("llms-full.txt was not built.");
  } else if (full !== llmsFullTxt(pages, context)) {
    findings.push(
      "llms-full.txt is not the copies of the pages in sidebar order.",
    );
  }
  for (const page of pages) {
    findings.push(...pageFindings(build, page, context, llms, full));
  }
  findings.push(...crawlerFindings(build, context));
  return findings;
}
