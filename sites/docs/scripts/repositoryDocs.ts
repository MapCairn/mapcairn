// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { posix } from "node:path";
import { REPOSITORY_URL } from "../src/siteConfig";
import type { SidebarEntry } from "./docChecks";
import { leadOf } from "./markdownSummary";
import {
  type DocPart,
  headingsOf,
  PART_CEILING,
  type PreambleNote,
  type SplitDocument,
  slugifyHeading,
  splitDocument,
  splitPreamble,
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
  /** What the page holds, in plain words and a short paragraph at most. */
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
      "The layers and their dependency rules, the ports, how the map adapter works and how to add an adapter of your own.",
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
      "The tokens, the layout slots, the accessibility contracts every component keeps and what the lint checks. To see the colours, type scale and spacing drawn in both themes, with their contrast ratios, open [Design tokens, visually](../design-visual.md).",
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
const SITE_GUIDE = /^https:\/\/docs\.mapcairn\.com\/guides\/([\w-]+)\/(#.*)?$/;
const OTHER_DOCUMENT = /^(ARCHITECTURE\.md|DESIGN\.md)(?:#(.*))?$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const FENCE = /^\s*(?:```|~~~)/;
const HEADING = /^(#{1,6}) /;
const UNMARKED_CODE_FENCE = /^(\s*(?:```|~~~)(?:ts|tsx))\s*$/;
const CODE_SPAN = /(`[^`\n]*`)/;

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
 * The text of a part for its own page: the heading at `titleLevel` is the
 * page's title, so its line is dropped with the blank line after it, and each
 * heading below moves up one level.
 */
function raiseHeadings(text: string, titleLevel: number): string {
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
    } else if (level === titleLevel) {
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

/** The file of a preamble note, relative to the generated folder. */
function noteFile(doc: RepositoryDoc, note: PreambleNote): string {
  return `${folderOf(doc)}/${note.stem}.md`;
}

/**
 * The preamble of a document cut into the text that stays on the overview
 * page and the notes that get a page each, whose stems differ from the parts'.
 */
function preambleOf(split: SplitDocument): ReturnType<typeof splitPreamble> {
  return splitPreamble(
    split.preamble,
    split.parts.map((part) => part.stem),
  );
}

/** Where each heading of a document ends up: its title and the start of its preamble on the overview page, a note's or section's heading as the title of its page, the rest on the page that holds them. */
function anchorsOf(
  doc: RepositoryDoc,
  split: SplitDocument,
): Map<string, AnchorTarget> {
  const { lead, notes } = preambleOf(split);
  const anchors = new Map<string, AnchorTarget>();
  const add = (id: string, target: AnchorTarget): void => {
    if (!anchors.has(id)) {
      anchors.set(id, target);
    }
  };
  const overview = { file: doc.output, fragment: false };
  anchors.set("", overview);
  add(slugifyHeading(split.title), overview);
  for (const { id } of headingsOf(lead)) {
    add(id, { file: doc.output, fragment: true });
  }
  for (const note of notes) {
    const file = noteFile(doc, note);
    for (const { id, level } of headingsOf(note.markdown)) {
      add(id, { file, fragment: level > 3 });
    }
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

/**
 * What a section is about, in a few plain words: the sentence that opens it
 * ({@link leadOf}), or an empty string when it opens with a list, a table or
 * code, or when the part is not the first of its section.
 */
function summaryOf(part: DocPart): string {
  return part.part === 1 ? leadOf(part.markdown) : "";
}

/** The parts of each section, in order. */
function sectionsOf(parts: readonly DocPart[]): DocPart[][] {
  const sections: DocPart[][] = [];
  for (const part of parts) {
    if (part.part === 1) {
      sections.push([part]);
    } else {
      sections[sections.length - 1]?.push(part);
    }
  }
  return sections;
}

/** A section's line in the overview: a link to its first page and its lead, and for a section cut into parts, a nested line that links each. */
function overviewItem(doc: RepositoryDoc, section: readonly DocPart[]): string {
  const [first] = section;
  if (!first) {
    return "";
  }
  const summary = summaryOf(first);
  const anchor = `<span id="${slugifyHeading(first.sectionTitle)}"></span>`;
  const title = first.parts === 1 ? first.title : first.sectionTitle;
  const entry = `- ${anchor}[${title}](${partFile(doc, first)})${summary === "" ? "" : `: ${summary}`}`;
  if (first.parts === 1) {
    return entry;
  }
  const links = section
    .map((part) => `[${part.part}](${partFile(doc, part)})`)
    .join(", ");
  return `${entry}\n  - In ${first.parts} parts: ${links}`;
}

/** A preamble note's line in the overview: a link to its page and its lead. */
function noteItem(doc: RepositoryDoc, note: PreambleNote): string {
  const summary = leadOf(note.markdown);
  const anchor = `<span id="${slugifyHeading(note.title)}"></span>`;
  return `- ${anchor}[${note.title}](${noteFile(doc, note)})${summary === "" ? "" : `: ${summary}`}`;
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
  const { lead, notes } = preambleOf(split);
  const items = [
    ...notes.map((note) => noteItem(doc, note)),
    ...sectionsOf(split.parts).map((section) => overviewItem(doc, section)),
  ];
  const preamble = markCodeNotChecked(
    relinkRepositoryDoc(lead.trim(), context),
  );
  const sections = [
    `# ${split.title}`,
    doc.intro,
    `This page is built from [${doc.source}](${BLOB}${doc.source}) in the repository, which is where it is edited.`,
    `## At a glance`,
    `The document is long, so the site gives each section its own page. A section that is still long is cut into numbered parts.`,
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

/** What differs between the pages under a document's overview. */
interface PageContent {
  readonly title: string;
  readonly label: string;
  readonly description: string;
  readonly stem: string;
  /** The page's text, from its own heading line, which is `titleLevel`. */
  readonly markdown: string;
  readonly titleLevel: number;
}

/** A page under an overview: front matter, where it belongs, then its text. */
function pageUnder(
  doc: RepositoryDoc,
  content: PageContent,
  context: LinkContext,
): string {
  const opening = `Part of [${doc.title}](${posix.relative(posix.dirname(context.fromFile), doc.output)}), which is built from [${doc.source}](${BLOB}${doc.source}) in the repository, where it is edited.`;
  const body = relinkRepositoryDoc(
    raiseHeadings(content.markdown, content.titleLevel).trim(),
    context,
  );
  return `${frontMatter({
    title: content.title,
    sidebar_label: content.label,
    description: content.description,
    slug: `${doc.slug}/${content.stem}`,
  })}\n${opening}\n\n${markCodeNotChecked(body)}\n`;
}

/** The page for one part. */
function partPage(
  doc: RepositoryDoc,
  part: DocPart,
  context: LinkContext,
): string {
  return pageUnder(
    doc,
    {
      title: part.title,
      label:
        part.parts === 1
          ? part.title
          : `${part.sectionTitle} (${part.part} of ${part.parts})`,
      description: summaryOf(part) || `${part.sectionTitle}, in ${doc.title}.`,
      stem: part.stem,
      markdown: part.tableHeader + part.markdown,
      titleLevel: 2,
    },
    context,
  );
}

/** The page for one preamble note. */
function notePage(
  doc: RepositoryDoc,
  note: PreambleNote,
  context: LinkContext,
): string {
  return pageUnder(
    doc,
    {
      title: note.title,
      label: note.title,
      description: leadOf(note.markdown) || `${note.title}, in ${doc.title}.`,
      stem: note.stem,
      markdown: note.markdown,
      titleLevel: 3,
    },
    context,
  );
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
    const { notes } = preambleOf(split);
    files.set(doc.output, overviewPage(doc, split, at(doc.output)));
    for (const note of notes) {
      const file = noteFile(doc, note);
      files.set(file, notePage(doc, note, at(file)));
    }
    for (const part of split.parts) {
      const file = partFile(doc, part);
      files.set(file, partPage(doc, part, at(file)));
    }
    sidebar.push({
      type: "category",
      label: doc.sidebarLabel,
      link: { type: "doc", id: `${GENERATED_FOLDER}/${folderOf(doc)}` },
      items: [
        ...notes.map((note) => noteFile(doc, note)),
        ...split.parts.map((part) => partFile(doc, part)),
      ].map((file) => `${GENERATED_FOLDER}/${file.replace(/\.md$/, "")}`),
    });
  });
  return { files, sidebar };
}
