// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  ApiExport,
  ApiMember,
  ApiParameter,
  ExportKind,
  MemberKind,
} from "./extract";
import {
  codeSpan,
  escapeText,
  fencedCode,
  indentContinuation,
} from "./markdown";

/** A link on a page, already resolved to an address relative to it. */
export interface PageLink {
  readonly label: string;
  readonly href: string;
}

/** What a page needs beyond the export's own data. */
export interface ExportPageContext {
  readonly item: ApiExport;
  /** The specifier a host imports it from, such as `@mapcairn/core/contracts`. */
  readonly specifier: string;
  /** The package's version, which the page says it was checked against. */
  readonly version: string;
  /** A link to the declaration in the repository, when it was found. */
  readonly source?: PageLink;
  /** Pages of the types the declaration names, and of what it extends or implements. */
  readonly related: readonly PageLink[];
}

const KIND_LABELS: Record<ExportKind, string> = {
  function: "a function",
  class: "a class",
  interface: "an interface",
  typeAlias: "a type alias",
  variable: "a constant",
  namespace: "a namespace",
  enum: "an enumeration",
};

const MEMBER_HEADINGS: readonly { kind: MemberKind; title: string }[] = [
  { kind: "constructor", title: "Constructors" },
  { kind: "property", title: "Properties" },
  { kind: "method", title: "Methods" },
  { kind: "callSignature", title: "Call signatures" },
  { kind: "constructSignature", title: "Construct signatures" },
  { kind: "indexSignature", title: "Index signatures" },
  { kind: "enumMember", title: "Members" },
  { kind: "variable", title: "Values" },
];

/** The longest a page's description (the one search engines show) may be. */
const DESCRIPTION_LIMIT = 160;

/** Splits the text at its first blank line: the lead paragraph and the rest. */
export function splitLead(text: string): { lead: string; rest: string } {
  const [lead = "", ...rest] = text.split(/\n\s*\n/);
  return { lead: lead.trim(), rest: rest.join("\n\n").trim() };
}

/** Removes Markdown links and code marks, so a line reads as plain text. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`+/g, "")
    .replace(/\\([{}])/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The first sentence of a text as plain words, cut at a word if it is longer
 * than a description should be.
 * @param markdown - A summary.
 * @param limit - The most characters to keep.
 */
export function firstSentence(
  markdown: string,
  limit = DESCRIPTION_LIMIT,
): string {
  const text = plainText(splitLead(markdown).lead);
  const end = /[.!?](?=\s|$)/.exec(text);
  const sentence = end ? text.slice(0, end.index + 1) : text;
  if (sentence.length <= limit) {
    return sentence;
  }
  const cut = sentence.slice(0, limit - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

/** Front matter for a page: a title, a description and no edit link, since the file is generated. */
export function frontMatter(title: string, description: string): string {
  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    `sidebar_label: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    "custom_edit_url: null",
    "---",
  ].join("\n");
}

function importLine(item: ApiExport, specifier: string): string {
  const typeOnly = item.kind === "interface" || item.kind === "typeAlias";
  return `import ${typeOnly ? "type " : ""}{ ${item.name} } from "${specifier}";`;
}

function codeBlock(code: string): string {
  return fencedCode(code, "ts");
}

function parameterItem(parameter: ApiParameter): string {
  const name = codeSpan(
    parameter.optional ? `${parameter.name}?` : parameter.name,
  );
  const type = parameter.type === "" ? "" : ` (${codeSpan(parameter.type)})`;
  const description =
    parameter.description === ""
      ? ""
      : `: ${indentContinuation(parameter.description)}`;
  return `- ${name}${type}${description}`;
}

function parameterList(
  title: string,
  parameters: readonly ApiParameter[],
): string[] {
  return parameters.length === 0
    ? []
    : [`## ${title}`, parameters.map(parameterItem).join("\n")];
}

function memberSection(title: string, members: readonly ApiMember[]): string[] {
  if (members.length === 0) {
    return [];
  }
  return [
    `## ${title}`,
    ...members.flatMap((member) => {
      const parts = [`### ${member.name}`, codeBlock(member.signature)];
      if (member.deprecated !== "") {
        parts.push(`:::warning Deprecated\n\n${member.deprecated}\n\n:::`);
      }
      if (member.summary !== "") {
        parts.push(member.summary);
      }
      if (member.parameters.length > 0) {
        parts.push(member.parameters.map(parameterItem).join("\n"));
      }
      if (member.returns !== "") {
        parts.push(`Returns: ${indentContinuation(member.returns)}`);
      }
      return parts;
    }),
  ];
}

function exampleSection(examples: readonly string[]): string[] {
  return examples.length === 0 ? [] : ["## Examples", ...examples];
}

function seeSection(
  see: readonly string[],
  related: readonly PageLink[],
): string[] {
  const lines = [
    ...see.map((text) => `- ${indentContinuation(text)}`),
    ...related.map((link) => `- [${codeSpan(link.label)}](${link.href})`),
  ];
  return lines.length === 0 ? [] : ["## See also", lines.join("\n")];
}

function factsLine(context: ExportPageContext): string {
  const { item, version, specifier } = context;
  const since = item.since === "" ? "" : ` Added in ${item.since}.`;
  const tag =
    item.releaseTag === "public"
      ? ""
      : ` Marked ${item.releaseTag}: it may change.`;
  return `This is ${KIND_LABELS[item.kind]} exported by ${codeSpan(specifier)}, checked against version ${version}.${since}${tag}`;
}

/**
 * The Markdown of one export's page. It opens with what the export is (the
 * first paragraph of its comment), then says which package and version it was
 * checked against, and goes on to the signature, parameters, what it returns,
 * its members, examples and related pages. A link is written as the
 * `api-link:` marker `./catalogue` replaces, and the page is not final until
 * that has run.
 * @param context - The export and what surrounds it.
 */
export function renderExportPage(context: ExportPageContext): string {
  const { item, source } = context;
  const { lead, rest } = splitLead(item.summary);
  const body = [
    frontMatter(item.name, firstSentence(item.summary)),
    `# ${item.name}`,
    lead,
    factsLine(context),
  ];
  if (item.deprecated !== "") {
    body.push(`:::warning Deprecated\n\n${item.deprecated}\n\n:::`);
  }
  body.push(
    "## Signature",
    codeBlock(`${importLine(item, context.specifier)}\n\n${item.signature}`),
  );
  if (rest !== "") {
    body.push("## Description", rest);
  }
  body.push(...parameterList("Type parameters", item.typeParameters));
  body.push(...parameterList("Parameters", item.parameters));
  if (
    item.returns !== "" ||
    (item.returnType !== "" && item.kind === "function")
  ) {
    const type = item.returnType === "" ? "" : codeSpan(item.returnType);
    const text = [type, item.returns].filter((part) => part !== "").join(": ");
    body.push("## Returns", text);
  }
  if (item.throws.length > 0) {
    body.push(
      "## Throws",
      item.throws.map((text) => `- ${indentContinuation(text)}`).join("\n"),
    );
  }
  for (const { kind, title } of MEMBER_HEADINGS) {
    body.push(
      ...memberSection(
        title,
        item.members.filter((member) => member.kind === kind),
      ),
    );
  }
  body.push(...exampleSection(item.examples));
  if (item.remarks !== "") {
    body.push("## Remarks", item.remarks);
  }
  body.push(...seeSection(item.see, context.related));
  if (source) {
    body.push(`Source: [${source.label}](${source.href})`);
  }
  return `${body.join("\n\n")}\n`;
}

/** One entry of a list on an overview page. */
export interface OverviewEntry {
  readonly name: string;
  readonly href: string;
  readonly summary: string;
}

/** A titled list of entries on an overview page. */
export interface OverviewSection {
  readonly title: string;
  readonly entries: readonly OverviewEntry[];
}

/** What a package's overview page says. */
export interface OverviewContext {
  readonly title: string;
  readonly description: string;
  /** The line saying what the page lists and the version it was checked against. */
  readonly facts: string;
  /** Sections before the groups, such as the entry points. */
  readonly intro: readonly string[];
  readonly sections: readonly OverviewSection[];
}

/**
 * The Markdown of a package or entry point's overview: what it is, which
 * version was checked, and every export under its group with one line each.
 * @param context - The overview's content.
 */
export function renderOverview(context: OverviewContext): string {
  const body = [
    frontMatter(context.title, firstSentence(context.description)),
    `# ${context.title}`,
    escapeText(context.description),
    context.facts,
    ...context.intro,
  ];
  for (const section of context.sections) {
    body.push(
      `## ${section.title}`,
      section.entries
        .map((entry) => {
          const line = `- [${codeSpan(entry.name)}](${entry.href})`;
          return entry.summary === ""
            ? line
            : `${line}: ${escapeText(entry.summary)}`;
        })
        .join("\n"),
    );
  }
  return `${body.join("\n\n")}\n`;
}
