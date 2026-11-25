// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SDK_PACKAGES } from "../../../scripts/sdkPackages.mjs";
import config from "../docusaurus.config";
import { readDocPages } from "../plugins/markdownCopiesPlugin";
import { SEARCH_INDEX_FILE } from "../plugins/searchIndexPlugin";
import { sidebar } from "../sidebars";
import { BASE_URL, SITE_ORIGIN } from "../src/siteConfig";
import {
  brokenInternalLinks,
  externalResources,
  htmlFiles,
  inlineScriptHashes,
  inlineStyleAttributes,
  scriptBytesFor,
} from "./builtSite";
import { designTokensFindings } from "./designTokensChecks";
import { docsMissingFromSidebar, sidebarDocIds } from "./docChecks";
import {
  EXPECTED_INLINE_SCRIPTS,
  type ExpectedInlineScript,
} from "./expectedInlineScripts";
import { machineDataFindings } from "./machineDataChecks";
import { markdownFindings } from "./markdownChecks";
import type { DocPage } from "./markdownCopies";
import { noticeFindings } from "./noticeChecks";
import { roadmapFindings } from "./roadmapChecks";
import { SDK_VERSION } from "./sdkVersion";
import { TARGETED_CLASSES } from "./targetedClasses";

const SITE = fileURLToPath(new URL("..", import.meta.url));
const BUILD = join(SITE, "build");

/** The repository's attributions document, which publishes the bundled notices. */
const ATTRIBUTIONS_FILE = join(SITE, "..", "..", "ATTRIBUTIONS.md");

/**
 * The most gzip-compressed script, in bytes, a documentation page may load
 * before it is readable, for a site with no generated pages. Plan 0017 gives
 * the figure and how it was chosen; lower it when the measure falls, and raise
 * it only with a reason in the plan.
 */
export const SCRIPT_BUDGET_BYTES = 160_000;

/**
 * What each generated API page adds to the budget, in gzip bytes. The framework
 * lists every page's route, its content chunk and its metadata in the script
 * every page loads (about 95 bytes of gzip for each, measured on the API
 * reference), so the script grows with the page count however small the pages
 * are. Plan 0017 ("API reference generator") records the measure.
 */
export const API_PAGE_ALLOWANCE_BYTES = 100;

/** The folder of the build that holds the generated API reference. */
const API_BUILD_FOLDER = "api";

/**
 * The script budget for a build: the base budget, and the allowance for each
 * generated API page in it.
 * @param apiPages - How many pages the API reference has.
 */
export function scriptBudgetFor(apiPages: number): number {
  return SCRIPT_BUDGET_BYTES + apiPages * API_PAGE_ALLOWANCE_BYTES;
}

/** The page the budget is measured on: the front page of the documentation. */
const BUDGET_PAGE = "index.html";

/** How many pages the build holds under the API reference's folder. */
function apiPageCount(build: string): number {
  return htmlFiles(build).filter((page) =>
    page.startsWith(`${API_BUILD_FOLDER}/`),
  ).length;
}

/** A finding for each package whose API reference section was not built. */
function missingApiSections(
  build: string,
  sections: readonly string[],
): string[] {
  return sections
    .filter(
      (dir) => !existsSync(join(build, API_BUILD_FOLDER, dir, "index.html")),
    )
    .map(
      (dir) =>
        `The API reference has no section for packages/${dir}: ${API_BUILD_FOLDER}/${dir}/index.html was not built.`,
    );
}

/** One problem found in the build, as a line for the log. */
type Finding = string;

/** How many sections the build's search index holds; 0 when it is missing or unreadable. */
function searchIndexSize(build: string): number {
  try {
    const records: unknown = JSON.parse(
      readFileSync(join(build, SEARCH_INDEX_FILE), "utf8"),
    );
    return Array.isArray(records) ? records.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Checks a finished build and returns what is wrong with it: a page missing
 * from the sidebar, a link that goes nowhere, a style attribute or an inline
 * script that is not on the committed list (or one on it that is gone), a
 * resource from another origin, a framework class the stylesheet targets that
 * the pages no longer carry, a page without its Markdown copy or a place in
 * the llms files (`markdownChecks.ts`), a package with no API reference
 * section, a roadmap page that is missing or incomplete
 * (`roadmapChecks.ts`), a visual design page that is missing or shows one
 * theme (`designTokensChecks.ts`), `pages.json` or `api.json` missing or without a
 * page of the sidebar (`machineDataChecks.ts`), and a page over the script
 * budget, and a bundler that writes licence notice files or an
 * `ATTRIBUTIONS.md` that lacks a bundled notice (`noticeChecks.ts`).
 * @param build - The build folder.
 * @param expected - The inline scripts the pages may carry.
 * @param pages - The pages that must have a Markdown copy.
 * @param apiSections - The packages whose API reference section the build must
 *   hold, by folder name under `packages/`.
 * @param attributions - The text of `ATTRIBUTIONS.md`.
 */
export function verifyBuild(
  build: string,
  expected: readonly ExpectedInlineScript[] = EXPECTED_INLINE_SCRIPTS,
  pages: readonly DocPage[] = readDocPages(join(SITE, "docs")),
  apiSections: readonly string[] = [],
  attributions: string = readFileSync(ATTRIBUTIONS_FILE, "utf8"),
): Finding[] {
  const findings: Finding[] = [];
  const allowed = new Set(expected.map(({ hash }) => hash));
  const seen = new Set<string>();
  const markup: string[] = [];
  for (const id of docsMissingFromSidebar(
    join(SITE, "docs"),
    sidebarDocIds(sidebar),
  )) {
    findings.push(`The page "${id}" is in no sidebar.`);
  }
  for (const { from, href } of brokenInternalLinks(build, BASE_URL)) {
    findings.push(`${from} links to ${href}, which was not built.`);
  }
  const headers = readFileSync(join(build, "_headers"), "utf8");
  for (const page of htmlFiles(build)) {
    const html = readFileSync(join(build, page), "utf8");
    markup.push(html);
    if (inlineStyleAttributes(html) > 0) {
      findings.push(`${page} has a style attribute, which the policy blocks.`);
    }
    for (const url of externalResources(html)) {
      findings.push(`${page} loads ${url} from another origin.`);
    }
    for (const hash of inlineScriptHashes(html)) {
      seen.add(hash);
      if (!allowed.has(hash)) {
        findings.push(
          `${page} has an inline script (${hash}) that is not in expectedInlineScripts.ts.`,
        );
      }
    }
  }
  for (const { name, hash } of expected) {
    if (!seen.has(hash)) {
      findings.push(
        `The expected inline script "${name}" (${hash}) is in no page.`,
      );
    }
    if (!headers.includes(`'${hash}'`)) {
      findings.push(`_headers does not allow the inline script "${name}".`);
    }
  }
  const text = markup.join("\n");
  for (const name of TARGETED_CLASSES) {
    if (!text.includes(name)) {
      findings.push(
        `The stylesheet targets the framework class "${name}", which no page carries.`,
      );
    }
  }
  if (searchIndexSize(build) === 0) {
    findings.push("search-index.json is missing or holds no sections.");
  }
  findings.push(
    ...markdownFindings(build, pages, {
      origin: SITE_ORIGIN,
      baseUrl: BASE_URL,
      version: SDK_VERSION,
      title: config.title ?? "",
      tagline: config.tagline ?? "",
    }),
  );
  findings.push(...machineDataFindings(build, pages, SITE_ORIGIN, BASE_URL));
  findings.push(...missingApiSections(build, apiSections));
  findings.push(...roadmapFindings(build));
  findings.push(...designTokensFindings(build));
  findings.push(...noticeFindings(build, attributions));
  const budget = scriptBudgetFor(apiPageCount(build));
  const bytes = scriptBytesFor(build, BASE_URL, BUDGET_PAGE);
  if (bytes > budget) {
    findings.push(
      `${BUDGET_PAGE} loads ${bytes} bytes of gzip script, over the budget of ${budget}.`,
    );
  }
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = verifyBuild(
    BUILD,
    EXPECTED_INLINE_SCRIPTS,
    undefined,
    SDK_PACKAGES,
  );
  for (const finding of findings) {
    console.error(finding);
  }
  if (findings.length > 0) {
    process.exit(1);
  }
  console.log(
    `Built site checked: ${htmlFiles(BUILD).length} pages, ${scriptBytesFor(BUILD, BASE_URL, BUDGET_PAGE)} bytes of gzip script on ${BUDGET_PAGE}.`,
  );
}
