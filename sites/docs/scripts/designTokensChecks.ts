// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { THEME_CLASS } from "./designTokensCss";
import { DESIGN_TOKENS_SLUG } from "./designTokensPage";

/** The folder and name of the page in the build, from its slug. */
const PAGE_PATH = DESIGN_TOKENS_SLUG.slice(1);

/** Text the Markdown copy must carry: the first pair table's header and its heading. */
const COPY_MUST_HAVE = [
  "#### Contrast of the pairs, light theme",
  "| Pair | Used as | Ratio |",
];

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** What is wrong with the built page: it is missing, shows one theme only or states no result. */
function pageFindings(html: string | null): string[] {
  if (html === null) {
    return ["The design tokens page was not built."];
  }
  const findings: string[] = [];
  for (const theme of ["light", "dark"]) {
    if (!html.includes(`class="${THEME_CLASS}" data-theme="${theme}"`)) {
      findings.push(
        `The design tokens page has no block drawn in the ${theme} theme.`,
      );
    }
  }
  if (!html.includes("Pass")) {
    findings.push(
      'The design tokens page states no contrast result ("Pass" is nowhere in it).',
    );
  }
  return findings;
}

/** What is wrong with the page's Markdown copy. */
function copyFindings(copy: string | null): string[] {
  if (copy === null) {
    return [`${PAGE_PATH}.md was not built.`];
  }
  return COPY_MUST_HAVE.filter((text) => !copy.includes(text)).map(
    (text) => `${PAGE_PATH}.md does not carry "${text}".`,
  );
}

/**
 * What is wrong with the visual design page in a finished build: it is
 * missing, has no block in one of the two themes or no contrast result, or
 * its Markdown copy leaves out the tables that are its text version.
 * @param build - The build folder.
 */
export function designTokensFindings(build: string): string[] {
  return [
    ...pageFindings(readIfExists(join(build, PAGE_PATH, "index.html"))),
    ...copyFindings(readIfExists(join(build, `${PAGE_PATH}.md`))),
  ];
}
