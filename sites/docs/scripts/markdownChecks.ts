// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CopyContext,
  type DocPage,
  LLMS_FULL_CEILING,
  llmsFullFiles,
  llmsTxt,
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
): string[] {
  const findings: string[] = [];
  const copy = readIfExists(join(build, page.copyPath));
  if (copy === null) {
    findings.push(`The page "${page.id}" has no Markdown copy.`);
  } else {
    findings.push(...copyFindings(page, copy));
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

/** What is wrong with `llms.txt` and the `llms-full` files: one missing, not what the pages give, or (for `llms.txt`) over the ceiling. */
function llmsFindings(
  build: string,
  pages: readonly DocPage[],
  context: CopyContext,
): string[] {
  const findings: string[] = [];
  const index = llmsTxt(pages, context);
  if (Buffer.byteLength(index) > LLMS_FULL_CEILING) {
    findings.push(`llms.txt is over ${LLMS_FULL_CEILING} bytes.`);
  }
  const expected = [
    { name: "llms.txt", text: index },
    ...llmsFullFiles(pages, context).map(({ name, text }) => ({ name, text })),
  ];
  for (const { name, text } of expected) {
    const written = readIfExists(join(build, name));
    if (written === null) {
      findings.push(`${name} was not built.`);
    } else if (written !== text) {
      findings.push(`${name} is not what the pages give, in sidebar order.`);
    }
  }
  return findings;
}

/**
 * What is wrong with the Markdown copies and agent files in a finished build:
 * a page with no copy or no head link; `llms.txt` or an `llms-full` file that
 * is missing, differs from what the pages give, or an `llms.txt` over the size ceiling; a
 * copy with a code fence that has no language, a relative link or tabs; a
 * `robots.txt` that blocks a crawler or omits the sitemap.
 * @param build - The build folder.
 * @param pages - Every page, in sidebar order.
 * @param context - The site's origin, base path and names.
 */
export function markdownFindings(
  build: string,
  pages: readonly DocPage[],
  context: CopyContext,
): string[] {
  const findings = llmsFindings(build, pages, context);
  for (const page of pages) {
    findings.push(...pageFindings(build, page, context));
  }
  findings.push(...crawlerFindings(build, context));
  return findings;
}
