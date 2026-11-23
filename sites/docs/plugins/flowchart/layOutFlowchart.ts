// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Flowchart, FlowEdge, FlowNode } from "./parseFlowchart";

/** The height of a line of text in a box, in pixels. */
export const LINE_HEIGHT = 20;

/** How wide a character of the figure's text is, in pixels: a little over the average, so a line never runs out of its box. */
export const CHARACTER_WIDTH = 7;

/** The room around the text in a box, left and right. */
export const NODE_PADDING_X = 12;

/** The room around the text in a box, above and below. */
export const NODE_PADDING_Y = 10;

/** The room around the boxes in a frame, and the frame's title above them, in pixels. */
export const GROUP_PADDING = 12;
export const GROUP_TITLE_HEIGHT = 32;

const NODE_GAP_X = 16;
const NODE_GAP_Y = 36;
const UNIT_GAP_X = 24;
const UNIT_GAP_Y = 72;
const MARGIN = 16;

interface Size {
  readonly width: number;
  readonly height: number;
}

interface Offset {
  readonly x: number;
  readonly y: number;
}

type Box = Offset & Size;

/** A box with its place on the canvas. */
export interface PlacedNode extends Box {
  readonly id: string;
  readonly lines: readonly string[];
}

/** A frame with its place on the canvas. */
export interface PlacedGroup extends Box {
  readonly id: string;
  readonly title: string;
}

/** An arrow from the foot of one box to the head of another, which is below it. */
export interface PlacedEdge {
  readonly from: string;
  readonly to: string;
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}

/** A flowchart with every position worked out. */
export interface FlowLayout extends Size {
  readonly groups: readonly PlacedGroup[];
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
}

/** A group, or a box outside every group, as the rows of the canvas see it. */
interface Unit {
  readonly id: string;
  readonly title: string | undefined;
  readonly nodes: readonly FlowNode[];
}

/** A unit's size and its boxes, placed from the unit's own top-left corner. */
interface UnitContent extends Size {
  readonly nodes: ReadonlyMap<string, Box>;
}

const NOWHERE: Box = { x: 0, y: 0, width: 0, height: 0 };

/** The width of `text` as the layout takes it. */
export function textWidth(text: string): number {
  return text.length * CHARACTER_WIDTH;
}

function nodeSize(node: FlowNode): Size {
  return {
    width: Math.max(...node.lines.map(textWidth)) + 2 * NODE_PADDING_X,
    height: node.lines.length * LINE_HEIGHT + 2 * NODE_PADDING_Y,
  };
}

/**
 * The row of each id: one more than the lowest row of anything with an arrow to it.
 * @throws When the arrows run in a circle, which has no top.
 */
function rowsOf(
  ids: readonly string[],
  edges: readonly FlowEdge[],
): Map<string, number> {
  const rows = new Map<string, number>();
  const visiting = new Set<string>();
  const rowOf = (id: string): number => {
    const known = rows.get(id);
    if (known !== undefined) {
      return known;
    }
    if (visiting.has(id)) {
      throw new Error(`The flowchart has a cycle through "${id}".`);
    }
    visiting.add(id);
    const above = edges
      .filter((edge) => edge.to === id)
      .map((e) => rowOf(e.from));
    visiting.delete(id);
    const row = Math.max(-1, ...above) + 1;
    rows.set(id, row);
    return row;
  };
  ids.forEach(rowOf);
  return rows;
}

/** The items of each row, in their order, for rows 0 up. */
function inRows<T>(
  items: readonly T[],
  rows: ReadonlyMap<string, number>,
  idOf: (item: T) => string,
): T[][] {
  const grouped: T[][] = [];
  for (const item of items) {
    const row = rows.get(idOf(item)) ?? 0;
    grouped[row] = [...(grouped[row] ?? []), item];
  }
  return Array.from(grouped, (row) => row ?? []);
}

function lengthOf(sizes: readonly number[], gap: number): number {
  return (
    sizes.reduce((total, size) => total + size, 0) +
    gap * Math.max(0, sizes.length - 1)
  );
}

/** A unit's boxes in rows by the arrows between them, each row centred. */
function layOutUnit(unit: Unit, edges: readonly FlowEdge[]): UnitContent {
  const ids = unit.nodes.map((node) => node.id);
  const inside = edges.filter(
    (edge) => ids.includes(edge.from) && ids.includes(edge.to),
  );
  const framed = unit.title !== undefined;
  const padding = framed ? GROUP_PADDING : 0;
  const rows = inRows(unit.nodes, rowsOf(ids, inside), (node) => node.id).map(
    (row) => {
      const sizes = row.map(nodeSize);
      return {
        row,
        sizes,
        width: lengthOf(
          sizes.map((size) => size.width),
          NODE_GAP_X,
        ),
        height: Math.max(...sizes.map((size) => size.height)),
      };
    },
  );
  const titleWidth = framed ? textWidth(unit.title ?? "") : 0;
  const width =
    Math.max(titleWidth, ...rows.map((row) => row.width)) + 2 * padding;
  const placed = new Map<string, Box>();
  let y = framed ? GROUP_TITLE_HEIGHT : 0;
  for (const { row, sizes, width: rowWidth, height } of rows) {
    let x = (width - rowWidth) / 2;
    row.forEach((node, index) => {
      const size = sizes[index] ?? NOWHERE;
      placed.set(node.id, { x, y: y + (height - size.height) / 2, ...size });
      x += size.width + NODE_GAP_X;
    });
    y += height + NODE_GAP_Y;
  }
  return { width, height: y - NODE_GAP_Y + padding, nodes: placed };
}

/** The groups and the boxes outside every group, in the order each is first written. */
function unitsOf(chart: Flowchart): Unit[] {
  const units = new Map<string, Unit>();
  for (const node of chart.nodes) {
    const id = node.group ?? node.id;
    const known = units.get(id);
    if (known) {
      units.set(id, { ...known, nodes: [...known.nodes, node] });
      continue;
    }
    const group = chart.groups.find((candidate) => candidate.id === node.group);
    units.set(id, { id, title: group?.title, nodes: [node] });
  }
  return [...units.values()];
}

/** The arrows between units: those between boxes of different units, as arrows between the units. */
function unitEdges(chart: Flowchart, units: readonly Unit[]): FlowEdge[] {
  const unitOf = new Map(
    units.flatMap((unit) => unit.nodes.map((node) => [node.id, unit.id])),
  );
  return chart.edges.flatMap((edge) => {
    const from = unitOf.get(edge.from) ?? edge.from;
    const to = unitOf.get(edge.to) ?? edge.to;
    return from === to ? [] : [{ from, to }];
  });
}

/** The x for the `index`th of `count` arrows along the edge of `box`, so none share a point. */
function along(box: Box, index: number, count: number): number {
  return box.x + (box.width * (index + 1)) / (count + 1);
}

/** Each arrow from the foot of its source to the head of its target, spread along both boxes. */
function placeEdges(
  edges: readonly FlowEdge[],
  boxes: ReadonlyMap<string, Box>,
): PlacedEdge[] {
  const centre = (id: string): number => {
    const box = boxes.get(id) ?? NOWHERE;
    return box.x + box.width / 2;
  };
  const leaving = (id: string): FlowEdge[] =>
    edges
      .filter((edge) => edge.from === id)
      .sort((a, b) => centre(a.to) - centre(b.to));
  const arriving = (id: string): FlowEdge[] =>
    edges
      .filter((edge) => edge.to === id)
      .sort((a, b) => centre(a.from) - centre(b.from));
  return edges.map((edge) => {
    const source = boxes.get(edge.from) ?? NOWHERE;
    const target = boxes.get(edge.to) ?? NOWHERE;
    const out = leaving(edge.from);
    const into = arriving(edge.to);
    return {
      from: edge.from,
      to: edge.to,
      startX: along(source, out.indexOf(edge), out.length),
      startY: source.y + source.height,
      endX: along(target, into.indexOf(edge), into.length),
      endY: target.y,
    };
  });
}

/**
 * Places a flowchart on a canvas: groups and loose boxes in rows by the
 * arrows between them, each group's boxes in rows by the arrows inside it,
 * every arrow running down from the foot of one box to the head of another.
 * The text is not measured: a character is taken to be {@link CHARACTER_WIDTH}
 * wide, so the layout is the same on every machine.
 * @param chart - The parsed flowchart.
 * @throws When the arrows run in a circle.
 */
export function layOutFlowchart(chart: Flowchart): FlowLayout {
  const units = unitsOf(chart);
  const contents = new Map(
    units.map((unit) => [unit.id, layOutUnit(unit, chart.edges)]),
  );
  const rows = inRows(
    units,
    rowsOf(
      units.map((unit) => unit.id),
      unitEdges(chart, units),
    ),
    (unit) => unit.id,
  );
  const rowWidths = rows.map((row) =>
    lengthOf(
      row.map((unit) => contents.get(unit.id)?.width ?? 0),
      UNIT_GAP_X,
    ),
  );
  const width = Math.max(...rowWidths) + 2 * MARGIN;
  const groups: PlacedGroup[] = [];
  const boxes = new Map<string, Box>();
  let y = MARGIN;
  rows.forEach((row, index) => {
    let x = (width - (rowWidths[index] ?? 0)) / 2;
    let rowHeight = 0;
    for (const unit of row) {
      const content = contents.get(unit.id) ?? { ...NOWHERE, nodes: new Map() };
      if (unit.title !== undefined) {
        groups.push({
          id: unit.id,
          title: unit.title,
          x,
          y,
          width: content.width,
          height: content.height,
        });
      }
      for (const [id, box] of content.nodes) {
        boxes.set(id, { ...box, x: x + box.x, y: y + box.y });
      }
      x += content.width + UNIT_GAP_X;
      rowHeight = Math.max(rowHeight, content.height);
    }
    y += rowHeight + UNIT_GAP_Y;
  });
  return {
    width,
    height: y - UNIT_GAP_Y + MARGIN,
    groups,
    nodes: chart.nodes.map((node) => ({
      id: node.id,
      lines: node.lines,
      ...(boxes.get(node.id) ?? NOWHERE),
    })),
    edges: placeEdges(chart.edges, boxes),
  };
}
