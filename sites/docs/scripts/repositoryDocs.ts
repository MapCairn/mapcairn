// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { REPOSITORY_URL } from "../src/siteConfig";

/** A Markdown file of the repository that the site shows as a page. */
export interface RepositoryDoc {
  /** The file's path from the repository root. */
  readonly source: string;
  /** The page's file name under the generated folder. */
  readonly output: string;
  readonly title: string;
  readonly sidebarLabel: string;
  readonly description: string;
  /** The page's address under the site's base path, starting with `/`. */
  readonly slug: string;
  /** What the page is for and what the reader will have, in one paragraph. */
  readonly intro: string;
}

/**
 * The repository files shown on the site. They stay in the repository because
 * lint rules and the agents' skills read them by path; the site builds a page
 * from each, so there is no second copy to edit.
 */
export const REPOSITORY_DOCS: readonly RepositoryDoc[] = [
  {
    source: "ARCHITECTURE.md",
    output: "architecture.md",
    title: "Architecture",
    sidebarLabel: "Architecture",
    description:
      "The layers, the ports, the map adapter, data layers and drawing, and how to add an adapter.",
    slug: "/architecture",
    intro:
      "This page is for a developer who changes the SDK or adds an adapter of their own. By the end you will know the layers and their dependency rules, the ports, how the map adapter works and how to add an adapter.",
  },
  {
    source: "DESIGN.md",
    output: "design.md",
    title: "Design system",
    sidebarLabel: "Design system",
    description:
      "The tokens, the layout slots and the accessibility contracts the interface keeps, and what the lint checks.",
    slug: "/design",
    intro:
      "This page is for a developer who changes or themes the interface. By the end you will know the tokens, the layout slots, the accessibility contracts every component keeps and what the lint checks.",
  },
];

/** The folder under `docs/` that the generated pages are written to. It is git-ignored. */
export const GENERATED_FOLDER = "generated";

const BLOB = `${REPOSITORY_URL}/blob/main/`;
const LINK_TARGET = /\]\(([^)\s]+)\)/g;
const SITE_GUIDE =
  /^https:\/\/mapcairn\.timothybrits\.co\.za\/docs\/guides\/([\w-]+)\/(#.*)?$/;
const OTHER_DOCUMENT = /^(ARCHITECTURE|DESIGN)\.md(#.*)?$/;
const SCHEME_OR_ANCHOR = /^(?:[a-z][a-z0-9+.-]*:|#)/i;
const FENCE = /^\s*(?:```|~~~)/;
const CODE_SPAN = /(`[^`\n]*`)/;

/** One link target, rewritten for a page in the generated folder. */
function relinkTarget(target: string): string {
  const guide = SITE_GUIDE.exec(target);
  if (guide) {
    return `../guides/${guide[1]}.md${guide[2] ?? ""}`;
  }
  if (SCHEME_OR_ANCHOR.test(target)) {
    return target;
  }
  const other = OTHER_DOCUMENT.exec(target);
  if (other) {
    return `${(other[1] ?? "").toLowerCase()}.md${other[2] ?? ""}`;
  }
  return `${BLOB}${target.replace(/^\.\//, "")}`;
}

/** The text outside code spans with its links rewritten. */
function relinkLine(line: string): string {
  return line
    .split(CODE_SPAN)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(
            LINK_TARGET,
            (_link, target: string) => `](${relinkTarget(target)})`,
          ),
    )
    .join("");
}

/**
 * Rewrites the links of a repository document for the site: a link between the
 * two documents points at the other page, a link to a guide points at the
 * guide's page, and a link to any other file or folder points at its page on
 * the repository. Code spans and fenced blocks are left as written.
 * @param text - The document's Markdown.
 */
export function relinkRepositoryDoc(text: string): string {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : relinkLine(line);
    })
    .join("\n");
}

/**
 * The page the site builds from a repository document: front matter, the
 * document's own heading, a paragraph that says what the page is for, where it
 * is edited and which version it was checked against, then the body with its
 * links rewritten.
 * @param text - The document's Markdown.
 * @param doc - Where it comes from and how the page describes it.
 * @throws When the document has no heading to put the opening under.
 */
export function renderRepositoryDoc(text: string, doc: RepositoryDoc): string {
  const heading = /^# .*$/m.exec(text);
  if (!heading) {
    throw new Error(`${doc.source} has no top-level heading.`);
  }
  const frontMatter = [
    "---",
    `title: ${doc.title}`,
    `sidebar_label: ${doc.sidebarLabel}`,
    `description: ${doc.description}`,
    `slug: ${doc.slug}`,
    "---",
    "",
  ].join("\n");
  const opening = [
    doc.intro,
    "",
    `This page is built from [${doc.source}](${BLOB}${doc.source}) in the repository, which is where it is edited. Checked against \`@mapcairn/sdk\` %sdkVersion%, the version in this repository.`,
  ].join("\n");
  const headingEnd = heading.index + heading[0].length;
  const body = relinkRepositoryDoc(
    `${text.slice(0, headingEnd)}\n\n${opening}${text.slice(headingEnd)}`,
  );
  return `${frontMatter}\n${body}`;
}
