// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** A box in a flowchart. */
export interface FlowNode {
  readonly id: string;
  /** The box's text, one entry for each line. */
  readonly lines: readonly string[];
  /** The id of the group the box belongs to, if it is in one. */
  readonly group?: string;
}

/** A titled frame around some boxes. */
export interface FlowGroup {
  readonly id: string;
  readonly title: string;
}

/** An arrow from one box to another. */
export interface FlowEdge {
  readonly from: string;
  readonly to: string;
}

/** A flowchart as written in a Mermaid code block. */
export interface Flowchart {
  /** In the order each is first written. */
  readonly nodes: readonly FlowNode[];
  readonly groups: readonly FlowGroup[];
  readonly edges: readonly FlowEdge[];
}

const HEADER = /^(?:flowchart|graph)\s+(?:TD|TB)$/;
const GROUP_START = /^subgraph\s+(\w+)(?:\["(.*)"\])?$/;
const GROUP_END = "end";
const EDGE_ARROW = "-->";
const NODE = /^([A-Za-z_]\w*)(?:\["(.*)"\])?$/;
const LINE_BREAK = /<br\s*\/?>/i;
const COMMENT = "%%";

/** A box as written, before it is merged with what an earlier line said about it. */
interface Mention {
  readonly id: string;
  readonly label: string | undefined;
}

/** A box while the chart is read: its text and the group the first mention of it was in. */
interface Draft {
  lines: string[];
  group?: string;
}

function syntaxError(line: number, text: string): Error {
  return new Error(
    `Unsupported flowchart syntax on line ${line}: "${text}". The site draws top-down flowcharts with boxes (id["text"]), one level of subgraph and --> arrows.`,
  );
}

/** One side of an arrow, or a box on its own. */
function parseMention(part: string): Mention | undefined {
  const match = NODE.exec(part.trim());
  if (!match) {
    return undefined;
  }
  return { id: match[1] ?? "", label: match[2] };
}

/** Records what a line says about a box: its text, if it gives some, and its group. */
function record(
  drafts: Map<string, Draft>,
  found: Mention,
  group: string | undefined,
): void {
  const text = found.label?.split(LINE_BREAK);
  const known = drafts.get(found.id);
  if (!known) {
    drafts.set(found.id, {
      lines: text ?? [found.id],
      ...(group === undefined ? {} : { group }),
    });
    return;
  }
  if (text) {
    known.lines = text;
  }
  if (group !== undefined && known.group === undefined) {
    known.group = group;
  }
}

/**
 * Reads the subset of Mermaid flowchart syntax the repository's documents
 * use: a `flowchart TD` header, boxes written `id["text<br/>more"]`,
 * `subgraph id["Title"]` ... `end` frames one level deep and `a --> b`
 * arrows, which may be chained.
 * @param source - The text of a `mermaid` code block.
 * @throws On a header, shape, arrow, nested frame or line the site cannot draw, so a diagram is never drawn wrongly without notice.
 */
export function parseFlowchart(source: string): Flowchart {
  const drafts = new Map<string, Draft>();
  const groups: FlowGroup[] = [];
  const edges: FlowEdge[] = [];
  let currentGroup: string | undefined;
  let sawHeader = false;

  source.split(/\r?\n/).forEach((raw, index) => {
    const text = raw.trim();
    if (text === "" || text.startsWith(COMMENT)) {
      return;
    }
    const lineNumber = index + 1;
    if (!sawHeader) {
      if (!HEADER.test(text)) {
        throw syntaxError(lineNumber, text);
      }
      sawHeader = true;
      return;
    }
    const start = GROUP_START.exec(text);
    if (start) {
      if (currentGroup !== undefined) {
        throw syntaxError(lineNumber, text);
      }
      currentGroup = start[1] ?? "";
      groups.push({ id: currentGroup, title: start[2] ?? currentGroup });
      return;
    }
    if (text === GROUP_END) {
      if (currentGroup === undefined) {
        throw syntaxError(lineNumber, text);
      }
      currentGroup = undefined;
      return;
    }
    const parts = text.split(EDGE_ARROW).map(parseMention);
    const found = parts.filter((part): part is Mention => part !== undefined);
    if (found.length !== parts.length) {
      throw syntaxError(lineNumber, text);
    }
    for (const part of found) {
      record(drafts, part, currentGroup);
    }
    found.slice(1).forEach((to, position) => {
      edges.push({ from: found[position]?.id ?? "", to: to.id });
    });
  });

  if (!sawHeader) {
    throw new Error("The flowchart is empty.");
  }
  if (currentGroup !== undefined) {
    throw new Error(`The subgraph "${currentGroup}" is never closed with end.`);
  }
  return {
    nodes: [...drafts].map(([id, draft]) => ({ id, ...draft })),
    groups,
    edges,
  };
}
