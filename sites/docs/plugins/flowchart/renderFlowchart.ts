// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  GROUP_PADDING,
  GROUP_TITLE_HEIGHT,
  LINE_HEIGHT,
  layOutFlowchart,
  NODE_PADDING_Y,
  type PlacedEdge,
  type PlacedNode,
} from "./layOutFlowchart";
import { type Flowchart, parseFlowchart } from "./parseFlowchart";

/** The length and the half-width of an arrowhead, in pixels. */
const ARROW_LENGTH = 8;
const ARROW_HALF_WIDTH = 4;

/** The corner radius of a box and of a frame, in pixels. */
const NODE_RADIUS = 6;
const GROUP_RADIUS = 10;

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeText(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (character) => ESCAPES[character] ?? character,
  );
}

/** Numbers as short as they can be written, so the markup does not carry float noise. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function nodeName(node: { readonly lines: readonly string[] }): string {
  return node.lines.join(" ");
}

function edgeMarkup(edge: PlacedEdge): string[] {
  const tip = edge.endY;
  const stop = tip - ARROW_LENGTH;
  const middle = (edge.startY + stop) / 2;
  return [
    `<path class="flowchart-edge" d="M${n(edge.startX)} ${n(edge.startY)}C${n(edge.startX)} ${n(middle)} ${n(edge.endX)} ${n(middle)} ${n(edge.endX)} ${n(stop)}"/>`,
    `<polygon class="flowchart-arrow" points="${n(edge.endX)},${n(tip)} ${n(edge.endX - ARROW_HALF_WIDTH)},${n(stop)} ${n(edge.endX + ARROW_HALF_WIDTH)},${n(stop)}"/>`,
  ];
}

function nodeMarkup(node: PlacedNode): string[] {
  const lines = node.lines.map(
    (line, index) =>
      `<text class="flowchart-text" x="${n(node.x + node.width / 2)}" y="${n(node.y + NODE_PADDING_Y + LINE_HEIGHT * (index + 0.5))}">${escapeText(line)}</text>`,
  );
  return [
    `<rect class="flowchart-node" x="${n(node.x)}" y="${n(node.y)}" width="${n(node.width)}" height="${n(node.height)}" rx="${NODE_RADIUS}"/>`,
    ...lines,
  ];
}

/** What a reader who cannot see the picture needs: the frames and what is in them, then each arrow. */
function describeChart(chart: Flowchart): string {
  const names = new Map(chart.nodes.map((node) => [node.id, nodeName(node)]));
  const framed = chart.groups.map((group) => {
    const inside = chart.nodes
      .filter((node) => node.group === group.id)
      .map(nodeName);
    return `${group.title} holds ${inside.join("; ")}.`;
  });
  const arrows = chart.edges.map(
    (edge) =>
      `${names.get(edge.from) ?? edge.from} points to ${names.get(edge.to) ?? edge.to}.`,
  );
  return [...framed, ...arrows].join(" ");
}

/**
 * Draws the Mermaid flowchart in a document as inline SVG, at build time, so
 * the page needs no script and no inline style. The colours come from classes
 * the site's stylesheet defines (`flowchart-*`), so both themes follow the
 * site's own. The picture has a title and a description that lists every
 * frame and arrow, and sits in a keyboard-scrollable region for a narrow
 * screen.
 * @param source - The text of a `mermaid` code block.
 * @param id - A name that no other figure on the page has, which prefixes the ids the markup uses.
 * @throws When the flowchart uses syntax the site does not draw.
 */
export function renderFlowchart(source: string, id: string): string {
  const chart = parseFlowchart(source);
  const layout = layOutFlowchart(chart);
  const title = `Diagram of ${chart.nodes.length} boxes and ${chart.edges.length} arrows`;
  const frames = layout.groups.flatMap((group) => [
    `<rect class="flowchart-group" x="${n(group.x)}" y="${n(group.y)}" width="${n(group.width)}" height="${n(group.height)}" rx="${GROUP_RADIUS}"/>`,
    `<text class="flowchart-title" x="${n(group.x + GROUP_PADDING)}" y="${n(group.y + GROUP_TITLE_HEIGHT / 2)}">${escapeText(group.title)}</text>`,
  ]);
  return [
    `<div class="flowchart" role="region" aria-label="${escapeText(title)}, scrolls sideways" tabindex="0">`,
    `<svg class="flowchart-svg" role="img" aria-labelledby="${id}-title ${id}-description" viewBox="0 0 ${n(layout.width)} ${n(layout.height)}" width="${n(layout.width)}" height="${n(layout.height)}">`,
    `<title id="${id}-title">${escapeText(title)}</title>`,
    `<desc id="${id}-description">${escapeText(describeChart(chart))}</desc>`,
    ...frames,
    ...layout.edges.flatMap(edgeMarkup),
    ...layout.nodes.flatMap(nodeMarkup),
    "</svg>",
    "</div>",
  ].join("\n");
}
