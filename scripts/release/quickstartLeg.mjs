// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The pure parts of the consumer check's quickstart leg (`quickstartRun.mjs`):
 * which files and policy it takes from the README, how the policy is changed
 * to see a directive matter, and what the requests of a run must show. Kept
 * apart so unit tests can cover them without a browser.
 */

import { violationProblems } from "./browserLeg.mjs";
import { OPEN_FREE_MAP_ORIGIN } from "./openFreeMapFixtures.mjs";

/** The section of the README the quickstart is in. */
const SECTION = "## Embed a map";

/**
 * The first fenced block of a language in a text.
 *
 * @param {string} text
 * @param {string} language
 * @returns {string | undefined}
 */
function firstBlock(text, language) {
  const match = new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\`\`\``).exec(text);
  return match?.[1];
}

/**
 * The page, its style sheet, the entry file and the policy line the README's
 * "Embed a map" section gives. The leg builds and runs exactly these, so the
 * README and what is tested cannot drift apart.
 *
 * @param {string} readme The README's text.
 * @returns {{ html: string, css: string, tsx: string, policy: string }}
 * @throws When the section or one of its blocks is missing.
 */
export function readmeQuickstart(readme) {
  const start = readme.indexOf(SECTION);
  if (start === -1) {
    throw new Error(`The README has no "${SECTION}" section.`);
  }
  const section = readme.slice(start);
  const [html, css, tsx, policy] = ["html", "css", "tsx", "text"].map(
    (language) => firstBlock(section, language),
  );
  if (!html || !css || !tsx || !policy) {
    throw new Error(
      "The README's quickstart section lacks its html, css, tsx or text (policy) block.",
    );
  }
  return { html, css, tsx, policy: policy.trim() };
}

/**
 * The policy with one source taken out of one directive, to see that the
 * directive is needed.
 *
 * @param {string} policy
 * @param {string} directive For example `connect-src`.
 * @param {string} source The source to take out.
 * @returns {string}
 * @throws When the policy has no such directive or the directive no such
 *   source, so a mutation can never change nothing.
 */
export function policyWithout(policy, directive, source) {
  const parts = policy.split("; ");
  const index = parts.findIndex((part) => part.startsWith(`${directive} `));
  if (index === -1) {
    throw new Error(`The policy has no ${directive} directive.`);
  }
  const sources = parts[index].split(" ").slice(1);
  if (!sources.includes(source)) {
    throw new Error(`The ${directive} directive does not list ${source}.`);
  }
  const kept = sources.filter((each) => each !== source);
  return parts
    .map((part, at) => (at === index ? [directive, ...kept].join(" ") : part))
    .join("; ");
}

/**
 * The changes the leg makes to the README's policy, one run each. Each must
 * make the page report a violation, or the directive is not doing what the
 * README says.
 */
export const QUICKSTART_REFUSALS = [
  { directive: "connect-src", source: OPEN_FREE_MAP_ORIGIN },
  { directive: "worker-src", source: "'self'" },
];

/**
 * What a run of the README's page must have fetched from the default
 * basemap's origin.
 *
 * @type {{ kind: string, matches: (path: string) => boolean }[]}
 */
const REQUIRED = [
  { kind: "style", matches: (path) => path.startsWith("/styles/") },
  { kind: "tile set", matches: (path) => path === "/planet" },
  {
    kind: "vector tile",
    matches: (path) => path.startsWith("/planet/") && path.endsWith(".pbf"),
  },
  { kind: "sprite", matches: (path) => path.startsWith("/sprites/") },
  { kind: "glyph", matches: (path) => path.startsWith("/fonts/") },
];

/**
 * The problems with a run of the README's page: a kind of request the default
 * basemap needs that was never made (so the map did not draw it), a request
 * to anywhere but the page and the basemap's origin, and anything the page
 * reported about itself.
 *
 * @param {{ origin: string, requests: string[], violations: { violatedDirective: string, blockedURI: string }[], consoleErrors: string[], pageErrors: string[] }} run
 * @returns {string[]}
 */
export function quickstartProblems({
  origin,
  requests,
  violations,
  consoleErrors,
  pageErrors,
}) {
  const basemap = requests
    .filter((url) => url.startsWith(`${OPEN_FREE_MAP_ORIGIN}/`))
    .map((url) => new URL(url).pathname);
  const missing = REQUIRED.filter(
    ({ matches }) => !basemap.some((path) => matches(path)),
  ).map(
    ({ kind }) =>
      `the page never requested a ${kind} from ${OPEN_FREE_MAP_ORIGIN}`,
  );
  const elsewhere = requests
    .filter(
      (url) =>
        !url.startsWith("data:") &&
        !url.startsWith("blob:") &&
        new URL(url).origin !== origin &&
        new URL(url).origin !== OPEN_FREE_MAP_ORIGIN,
    )
    .map(
      (url) =>
        `a request to ${url} was refused: the page may reach only its own origin and ${OPEN_FREE_MAP_ORIGIN}`,
    );
  return [
    ...missing,
    ...elsewhere,
    ...violationProblems({ violations, consoleErrors, pageErrors }),
  ];
}
