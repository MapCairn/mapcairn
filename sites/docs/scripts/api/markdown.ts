// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * A node of a parsed TSDoc comment, in the little this module reads. The
 * parser's own classes are not imported, so the site depends only on the
 * API model package and a node is recognised by its `kind`.
 */
export interface DocNodeLike {
  readonly kind: string;
  getChildNodes(): readonly (DocNodeLike | undefined)[];
}

/**
 * Turns the name written in a `{@link}` tag into the address of the page that
 * documents it, or `undefined` when no page does.
 */
export type LinkResolver = (identifier: string) => string | undefined;

/** The fields a node of each kind carries that this module reads. */
interface NodeFields {
  readonly text?: string;
  readonly decodedText?: string;
  readonly code?: string;
  readonly language?: string;
  readonly linkText?: string;
  readonly urlDestination?: string;
  readonly codeDestination?: {
    readonly memberReferences: readonly {
      readonly memberIdentifier?: { readonly identifier: string };
    }[];
  };
}

/** Escapes the characters that would start markup in Markdown with MDX. */
export function escapeText(text: string): string {
  return text
    .replaceAll("<", "&lt;")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}");
}

/** Wraps text in a code span long enough that a backtick inside cannot end it. */
export function codeSpan(code: string): string {
  const longest = Math.max(
    0,
    ...(code.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longest + 1);
  const pad = code.startsWith("`") || code.endsWith("`") ? " " : "";
  return `${fence}${pad}${code}${pad}${fence}`;
}

/**
 * A fenced code block. A blank line inside it is written as one space: the
 * framework draws an empty line with a `style` attribute, which the site's
 * Content-Security-Policy does not allow, and a line with a space in it is
 * drawn without one.
 * @param code - The code.
 * @param language - The language name for highlighting.
 */
export function fencedCode(code: string, language: string): string {
  const lines = code
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => (line === "" ? " " : line));
  return `\`\`\`${language}\n${lines.join("\n")}\n\`\`\``;
}

function renderLink(node: NodeFields, resolve: LinkResolver): string {
  if (node.urlDestination) {
    const label = node.linkText ?? node.urlDestination;
    return `[${escapeText(label)}](${node.urlDestination})`;
  }
  const identifier =
    node.codeDestination?.memberReferences[0]?.memberIdentifier?.identifier;
  if (identifier === undefined) {
    return escapeText(node.linkText ?? "");
  }
  const label = node.linkText ?? identifier;
  const target = resolve(identifier);
  return target === undefined
    ? codeSpan(label)
    : `[${node.linkText === undefined ? codeSpan(label) : escapeText(label)}](${target})`;
}

/**
 * Renders a TSDoc node as Markdown that MDX accepts: text is escaped, a link
 * to an export becomes a link to its page (or plain code when it has none),
 * and a code span or fenced block is kept. Line breaks are kept, so a list
 * the author wrote as Markdown stays a list.
 * @param node - The node, usually a section of a comment.
 * @param resolve - Finds the page for a name in a `{@link}`.
 */
export function renderDocNode(
  node: DocNodeLike,
  resolve: LinkResolver,
): string {
  const fields = node as unknown as NodeFields;
  switch (node.kind) {
    case "PlainText":
    case "ErrorText":
      return escapeText(fields.text ?? "");
    case "EscapedText":
      return escapeText(fields.decodedText ?? "");
    case "SoftBreak":
      return "\n";
    case "CodeSpan":
      return codeSpan(fields.code ?? "");
    case "FencedCode":
      return `\n${fencedCode(fields.code ?? "", fields.language ?? "")}\n`;
    case "LinkTag":
      return renderLink(fields, resolve);
    case "Excerpt":
    case "BlockTag":
      return "";
    case "Paragraph":
      return children(node, resolve).trim();
    case "Section":
    case "Block":
      return node
        .getChildNodes()
        .map((child) => (child ? renderDocNode(child, resolve) : ""))
        .filter((part) => part.trim() !== "")
        .join("\n\n");
    default:
      return children(node, resolve);
  }
}

function children(node: DocNodeLike, resolve: LinkResolver): string {
  return node
    .getChildNodes()
    .map((child) => (child ? renderDocNode(child, resolve) : ""))
    .join("");
}

/**
 * Indents every line after the first, so a multi-line description stays part
 * of the list item it follows.
 * @param text - The Markdown text.
 * @param spaces - How many spaces a continued line gets.
 */
export function indentContinuation(text: string, spaces = 2): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line, index) => (index === 0 || line === "" ? line : pad + line))
    .join("\n");
}
