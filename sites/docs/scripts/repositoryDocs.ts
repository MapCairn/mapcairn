// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { posix } from "node:path";
import { REPOSITORY_URL } from "../src/siteConfig";
import type { SidebarEntry } from "./docChecks";
import { firstSentenceOf } from "./markdownSummary";
import {
  type DocPart,
  headingsOf,
  PART_CEILING,
  plainHeading,
  type SplitDocument,
  slugifyHeading,
  splitDocument,
} from "./repositoryDocParts";

/** A Markdown file of the repository that the site shows as a set of pages. */
export interface RepositoryDoc {
  /** The file's path from the repository root. */
  readonly source: string;
  /** The file name, under the generated folder, of the page that gives the document's overview. */
  readonly output: string;
  readonly title: string;
  readonly sidebarLabel: string;
  readonly description: string;
  /** The overview page's address under the site's base path, starting with `/`. Its parts are under it. */
  readonly slug: string;
  /** What the page is for and what the reader will have, in one paragraph. */
  readonly intro: string;
}

/**
 * The repository files shown on the site. They stay in the repository because
 * lint rules and the agents' skills read them by path; the site builds pages
 * from each, so there is no second copy to edit. Each becomes an overview page
 * at its `slug` and a page for each section under it.
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

/** Where a link target lands: the page's file (relative to the generated folder) and whether the link keeps its `#` fragment. */
interface AnchorTarget {
  readonly file: string;
  readonly fragment: boolean;
}

/** For each document's source path, where each of its heading ids now is; the empty id is the document's own page. */
type AnchorIndex = ReadonlyMap<string, ReadonlyMap<string, AnchorTarget>>;

interface LinkContext {
  /** The page the text is written to, relative to the generated folder. */
  readonly fromFile: string;
  /** The source path of the document the text comes from. */
  readonly source: string;
  readonly anchors: AnchorIndex;
}

const BLOB = `${REPOSITORY_URL}/blob/main/`;
const LINK_TARGET = /\]\(([^)\s]+)\)/g;
const SITE_GUIDE =
  /^https:\/\/mapcairn\.timothybrits\.co\.za\/docs\/guides\/([\w-]+)\/(#.*)?$/;
const OTHER_DOCUMENT = /^(ARCHITECTURE\.md|DESIGN\.md)(?:#(.*))?$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const FENCE = /^\s*(?:```|~~~)/;
const HEADING = /^(#{1,6}) /;
const TABLE_LINE = /^\s*\|/;
const UNMARKED_CODE_FENCE = /^(\s*(?:```|~~~)(?:ts|tsx))\s*$/;
const CODE_SPAN = /(`[^`\n]*`)/;
const BYTES_IN_KB = 1000;

/** The link to a page from another, with the heading's fragment when the page holds more than that heading. */
function linkTo(fromFile: string, target: AnchorTarget, id: string): string {
  const path = posix.relative(posix.dirname(fromFile), target.file);
  return target.fragment ? `${path}#${id}` : path;
}

/** One link target, rewritten for a page in the generated folder. */
function relinkTarget(target: string, context: LinkContext): string {
  const guide = SITE_GUIDE.exec(target);
  if (guide) {
    const depth = context.fromFile.split("/").length - 1;
    return `${"../".repeat(depth + 1)}guides/${guide[1]}.md${guide[2] ?? ""}`;
  }
  if (target.startsWith("#")) {
    const id = target.slice(1);
    const found = context.anchors.get(context.source)?.get(id);
    return found ? linkTo(context.fromFile, found, id) : target;
  }
  if (SCHEME.test(target)) {
    return target;
  }
  const other = OTHER_DOCUMENT.exec(target);
  if (other) {
    const anchors = context.anchors.get(other[1] ?? "");
    const id = other[2] ?? "";
    const found = anchors?.get(id) ?? anchors?.get("");
    return found ? linkTo(context.fromFile, found, id) : `${BLOB}${target}`;
  }
  return `${BLOB}${target.replace(/^\.\//, "")}`;
}

/** The text outside code spans with its links rewritten. */
function relinkLine(line: string, context: LinkContext): string {
  return line
    .split(CODE_SPAN)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(
            LINK_TARGET,
            (_link, target: string) => `](${relinkTarget(target, context)})`,
          ),
    )
    .join("");
}

/**
 * Rewrites the links of a repository document for a page of the site: a link
 * to a heading of either document points at the page that now holds it, a
 * link to a guide points at the guide's page, and a link to any other file or
 * folder points at its page on the repository. Code spans and fenced blocks
 * are left as written.
 * @param text - The Markdown to rewrite.
 * @param context - The page it is written to and the document it comes from.
 */
function relinkRepositoryDoc(text: string, context: LinkContext): string {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : relinkLine(line, context);
    })
    .join("\n");
}

/**
 * Marks each `ts` or `tsx` block that has no marker `no-check`: the code in a
 * repository document is not a snippet of the site, so the snippet check does
 * not compile it.
 */
function markCodeNotChecked(text: string): string {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (!FENCE.test(line)) {
        return line;
      }
      inFence = !inFence;
      return inFence ? line.replace(UNMARKED_CODE_FENCE, "$1 no-check") : line;
    })
    .join("\n");
}

/**
 * The text of a part for its own page: the section's heading is the page's
 * title, so its line is dropped with the blank line after it, and each
 * heading below moves up one level.
 */
function raiseHeadings(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const level = (HEADING.exec(line)?.[1] ?? "").length;
    if (FENCE.test(line)) {
      inFence = !inFence;
    }
    if (inFence || level === 0) {
      kept.push(line);
    } else if (level === 2) {
      index += lines[index + 1]?.trim() === "" ? 1 : 0;
    } else {
      kept.push(line.slice(1));
    }
  }
  return kept.join("\n");
}

/** The name of a document's folder of parts: its overview file's name without the extension. */
function folderOf(doc: RepositoryDoc): string {
  return doc.output.replace(/\.md$/, "");
}

/** The file of a part, relative to the generated folder. */
function partFile(doc: RepositoryDoc, part: DocPart): string {
  return `${folderOf(doc)}/${part.stem}.md`;
}

/** Where each heading of a document ends up: its title and preamble on the overview page, a section's heading as the title of its page, the rest on the page that holds them. */
function anchorsOf(
  doc: RepositoryDoc,
  split: SplitDocument,
): Map<string, AnchorTarget> {
  const anchors = new Map<string, AnchorTarget>();
  const add = (id: string, target: AnchorTarget): void => {
    if (!anchors.has(id)) {
      anchors.set(id, target);
    }
  };
  const overview = { file: doc.output, fragment: false };
  anchors.set("", overview);
  add(slugifyHeading(split.title), overview);
  for (const { id } of headingsOf(split.preamble)) {
    add(id, { file: doc.output, fragment: true });
  }
  for (const part of split.parts) {
    const file = partFile(doc, part);
    if (part.part === 1) {
      add(slugifyHeading(part.sectionTitle), { file, fragment: false });
    }
    for (const { id, level } of headingsOf(part.markdown)) {
      add(id, { file, fragment: level > 2 });
    }
  }
  return anchors;
}

/** The size of a part as the overview shows it, such as `25.3 KB`. */
function sizeOf(part: DocPart): string {
  return `${(part.bytes / BYTES_IN_KB).toFixed(1)} KB`;
}

/** The first cell of a table row, as plain text. */
function firstCell(row: string): string {
  return plainHeading(row.split("|")[1] ?? "");
}

/** What a part that starts with a table covers: its first and last row. */
function tableSummary(part: DocPart): string {
  const lines = part.markdown
    .split("\n")
    .filter((line) => TABLE_LINE.test(line));
  const rows = part.tableHeader === "" ? lines.slice(2) : lines;
  const first = firstCell(rows[0] ?? "");
  const last = firstCell(rows[rows.length - 1] ?? "");
  return rows.length < 2
    ? `Table row ${first}.`
    : `Table rows ${first} to ${last}.`;
}

/**
 * What a part is about, built from its text: the first sentence of its first
 * paragraph, or for a part that begins with a table, its first and last row.
 * An empty string when it has neither.
 */
function summaryOf(part: DocPart): string {
  const first = part.markdown
    .split("\n")
    .find((line) => line.trim() !== "" && !HEADING.test(line));
  return first && TABLE_LINE.test(first)
    ? tableSummary(part)
    : firstSentenceOf(part.markdown);
}

function frontMatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(
    ([key, value]) => `${key}: ${JSON.stringify(value)}`,
  );
  return ["---", ...lines, "---", ""].join("\n");
}

/** The overview page: the opening, a line for each part and the document's own introduction. */
function overviewPage(
  doc: RepositoryDoc,
  split: SplitDocument,
  context: LinkContext,
): string {
  const items = split.parts.map((part) => {
    const summary = summaryOf(part);
    return `- [${part.title}](${partFile(doc, part)}) (${sizeOf(part)})${summary === "" ? "" : `: ${summary}`}`;
  });
  const preamble = markCodeNotChecked(
    relinkRepositoryDoc(split.preamble.trim(), context),
  );
  const sections = [
    `# ${split.title}`,
    doc.intro,
    `This page is built from [${doc.source}](${BLOB}${doc.source}) in the repository, which is where it is edited. Checked against \`@mapcairn/sdk\` %sdkVersion%, the version in this repository.`,
    `## At a glance`,
    `The document is long, so the site splits it by section into the pages below, and cuts a section that is still long into numbered parts. Each line gives a page's size as Markdown and what it opens with.`,
    items.join("\n"),
    ...(preamble === "" ? [] : [`## About this document`, preamble]),
  ];
  return `${frontMatter({
    title: doc.title,
    sidebar_label: doc.sidebarLabel,
    description: doc.description,
    slug: doc.slug,
  })}\n${sections.join("\n\n")}\n`;
}

/** The page for one part: front matter, where it belongs, then its text. */
function partPage(
  doc: RepositoryDoc,
  part: DocPart,
  context: LinkContext,
): string {
  const label =
    part.parts === 1
      ? part.title
      : `${part.sectionTitle} (${part.part} of ${part.parts})`;
  const opening = `Part of [${doc.title}](${posix.relative(posix.dirname(context.fromFile), doc.output)}), which is built from [${doc.source}](${BLOB}${doc.source}) in the repository, where it is edited.`;
  const body = relinkRepositoryDoc(
    raiseHeadings(part.tableHeader + part.markdown).trim(),
    context,
  );
  return `${frontMatter({
    title: part.title,
    sidebar_label: label,
    description: summaryOf(part) || `${part.sectionTitle}, in ${doc.title}.`,
    slug: `${doc.slug}/${part.stem}`,
  })}\n${opening}\n\n${markCodeNotChecked(body)}\n`;
}

/** The pages built from the repository documents and the sidebar entries that list them. */
export interface RepositoryPages {
  /** Page text by file name, relative to the generated folder. */
  readonly files: ReadonlyMap<string, string>;
  /** One category for each document, linked to its overview page and listing its parts. */
  readonly sidebar: readonly SidebarEntry[];
}

/**
 * Builds the pages of the repository documents: for each, an overview page
 * (at the document's slug, so the address that was one long page still works)
 * and a page for each part ({@link splitDocument}), with every link to a
 * heading rewritten to the page that now holds it.
 * @param sources - The text of each document, by its path in the repository.
 * @param docs - The documents to build, {@link REPOSITORY_DOCS} by default.
 * @param ceiling - The most bytes a part holds, {@link PART_CEILING} by default.
 * @throws When a document is missing or has no first-level heading.
 */
export function buildRepositoryPages(
  sources: ReadonlyMap<string, string>,
  docs: readonly RepositoryDoc[] = REPOSITORY_DOCS,
  ceiling: number = PART_CEILING,
): RepositoryPages {
  const splits = docs.map((doc) => {
    const text = sources.get(doc.source);
    if (text === undefined) {
      throw new Error(`${doc.source} was not read.`);
    }
    try {
      return splitDocument(text, ceiling);
    } catch (error) {
      throw new Error(
        `${doc.source}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
  const anchors: AnchorIndex = new Map(
    docs.map((doc, index) => [
      doc.source,
      anchorsOf(doc, splits[index] as SplitDocument),
    ]),
  );
  const files = new Map<string, string>();
  const sidebar: SidebarEntry[] = [];
  docs.forEach((doc, index) => {
    const split = splits[index] as SplitDocument;
    const at = (fromFile: string): LinkContext => ({
      fromFile,
      source: doc.source,
      anchors,
    });
    files.set(doc.output, overviewPage(doc, split, at(doc.output)));
    for (const part of split.parts) {
      const file = partFile(doc, part);
      files.set(file, partPage(doc, part, at(file)));
    }
    sidebar.push({
      type: "category",
      label: doc.sidebarLabel,
      link: { type: "doc", id: `${GENERATED_FOLDER}/${folderOf(doc)}` },
      items: split.parts.map(
        (part) =>
          `${GENERATED_FOLDER}/${partFile(doc, part).replace(/\.md$/, "")}`,
      ),
    });
  });
  return { files, sidebar };
}
