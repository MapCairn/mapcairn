// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PRIORITY_NOT_SCHEDULE } from "./roadmapPage";

const LANES = ["Now", "Next", "Later"];
const LANE_CLASS = "roadmap__lane";

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** What is wrong with the built roadmap page. */
function pageFindings(html: string | null): string[] {
  if (html === null) {
    return ["The roadmap page was not built."];
  }
  const findings: string[] = [];
  const lanes = html.split(`class="${LANE_CLASS}"`).length - 1;
  if (lanes !== LANES.length) {
    findings.push(
      `The roadmap page has ${lanes} lanes, and should have ${LANES.length}.`,
    );
  }
  if (!html.includes(PRIORITY_NOT_SCHEDULE)) {
    findings.push(`The roadmap page does not say "${PRIORITY_NOT_SCHEDULE}".`);
  }
  return findings;
}

/** What is wrong with the roadmap's Markdown copy. */
function copyFindings(copy: string | null): string[] {
  if (copy === null) {
    return ["roadmap.md was not built."];
  }
  return [...LANES.map((name) => `## ${name}`), PRIORITY_NOT_SCHEDULE]
    .filter((text) => !copy.includes(text))
    .map((text) => `roadmap.md does not carry "${text}".`);
}

/**
 * What is wrong with the roadmap page in a finished build: it is missing,
 * lacks one of the three lanes or the sentence that says the order is a
 * priority, not a schedule, or its Markdown copy leaves a lane out.
 * @param build - The build folder.
 */
export function roadmapFindings(build: string): string[] {
  return [
    ...pageFindings(readIfExists(join(build, "roadmap", "index.html"))),
    ...copyFindings(readIfExists(join(build, "roadmap.md"))),
  ];
}
