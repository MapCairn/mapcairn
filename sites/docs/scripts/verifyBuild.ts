// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEARCH_INDEX_FILE } from "../plugins/searchIndexPlugin";
import { sidebar } from "../sidebars";
import { BASE_URL, HOST_PATHS } from "../src/siteConfig";
import {
  brokenInternalLinks,
  externalResources,
  htmlFiles,
  inlineScriptHashes,
  inlineStyleAttributes,
  scriptBytesFor,
} from "./builtSite";
import { docsMissingFromSidebar, sidebarDocIds } from "./docChecks";
import {
  EXPECTED_INLINE_SCRIPTS,
  type ExpectedInlineScript,
} from "./expectedInlineScripts";
import { TARGETED_CLASSES } from "./targetedClasses";

const SITE = fileURLToPath(new URL("..", import.meta.url));
const BUILD = join(SITE, "build");

/**
 * The most gzip-compressed script, in bytes, a documentation page may load
 * before it is readable. Plan 0017 gives the figure and how it was chosen;
 * lower it when the measure falls, and raise it only with a reason in the
 * plan.
 */
export const SCRIPT_BUDGET_BYTES = 160_000;

/** The page the budget is measured on: the front page of the documentation. */
const BUDGET_PAGE = "index.html";

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
 * the pages no longer carry, a missing or empty search index, and a page over
 * the script budget.
 * @param build - The build folder.
 * @param expected - The inline scripts the pages may carry.
 */
export function verifyBuild(
  build: string,
  expected: readonly ExpectedInlineScript[] = EXPECTED_INLINE_SCRIPTS,
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
  for (const { from, href } of brokenInternalLinks(
    build,
    BASE_URL,
    HOST_PATHS,
  )) {
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
  const bytes = scriptBytesFor(build, BASE_URL, BUDGET_PAGE);
  if (bytes > SCRIPT_BUDGET_BYTES) {
    findings.push(
      `${BUDGET_PAGE} loads ${bytes} bytes of gzip script, over the budget of ${SCRIPT_BUDGET_BYTES}.`,
    );
  }
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = verifyBuild(BUILD);
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
