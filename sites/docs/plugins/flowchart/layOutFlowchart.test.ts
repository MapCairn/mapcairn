// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  CHARACTER_WIDTH,
  type FlowLayout,
  layOutFlowchart,
  type PlacedNode,
} from "./layOutFlowchart";
import { parseFlowchart } from "./parseFlowchart";

function layOut(source: string): FlowLayout {
  return layOutFlowchart(parseFlowchart(source));
}

function node(layout: FlowLayout, id: string): PlacedNode {
  const found = layout.nodes.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`no box ${id}`);
  }
  return found;
}

function overlap(a: PlacedNode, b: PlacedNode): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

describe("layOutFlowchart", () => {
  it("puts a box below the boxes that point to it", () => {
    const layout = layOut("flowchart TD\n a --> b --> c\n a --> c");
    expect(node(layout, "b").y).toBeGreaterThan(node(layout, "a").y);
    expect(node(layout, "c").y).toBeGreaterThan(node(layout, "b").y);
  });

  it("puts boxes that nothing orders side by side in one row", () => {
    const layout = layOut("flowchart TD\n a\n b");
    expect(node(layout, "a").y).toBe(node(layout, "b").y);
    expect(node(layout, "b").x).toBeGreaterThan(
      node(layout, "a").x + node(layout, "a").width,
    );
  });

  it("sizes a box to its longest line and its number of lines", () => {
    const layout = layOut('flowchart TD\n a["x<br/>a longer line"]\n b["x"]');
    const a = node(layout, "a");
    const b = node(layout, "b");
    expect(a.width).toBeGreaterThan(b.width);
    expect(a.height).toBeGreaterThan(b.height);
  });

  it("frames the boxes of a group, and the frame holds them with room for its title", () => {
    const title = "A fairly long title for the frame";
    const layout = layOut(`flowchart TD
  subgraph g["${title}"]
    a --> b
  end`);
    const group = layout.groups[0];
    if (!group) {
      throw new Error("no frame");
    }
    for (const id of ["a", "b"]) {
      const box = node(layout, id);
      expect(box.x).toBeGreaterThanOrEqual(group.x);
      expect(box.x + box.width).toBeLessThanOrEqual(group.x + group.width);
      expect(box.y).toBeGreaterThan(group.y);
      expect(box.y + box.height).toBeLessThanOrEqual(group.y + group.height);
    }
    expect(group.width).toBeGreaterThanOrEqual(title.length * CHARACTER_WIDTH);
  });

  it("orders frames by the arrows between their boxes", () => {
    const layout = layOut(`flowchart TD
  subgraph low
    b
  end
  subgraph high
    a
  end
  a --> b`);
    const low = layout.groups.find((group) => group.id === "low");
    const high = layout.groups.find((group) => group.id === "high");
    expect(high?.y).toBeLessThan(low?.y ?? 0);
  });

  it("runs each arrow from the foot of its source to the head of its target, and no two share an end", () => {
    const layout = layOut(
      "flowchart TD\n a --> b\n a --> c\n b --> d\n c --> d",
    );
    for (const edge of layout.edges) {
      const source = node(layout, edge.from);
      expect(edge.startY).toBe(source.y + source.height);
      expect(edge.endY).toBe(node(layout, edge.to).y);
      expect(edge.endY).toBeGreaterThan(edge.startY);
    }
    const starts = layout.edges.filter((edge) => edge.from === "a");
    expect(new Set(starts.map((edge) => edge.startX)).size).toBe(2);
    const ends = layout.edges.filter((edge) => edge.to === "d");
    expect(new Set(ends.map((edge) => edge.endX)).size).toBe(2);
  });

  it("never overlaps two boxes and keeps everything on the canvas", () => {
    const layout = layOut(`flowchart TD
  subgraph one
    a --> b
    c
  end
  subgraph two
    d
    e
  end
  f
  a --> d
  b --> f
  c --> e`);
    for (const a of layout.nodes) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.width).toBeLessThanOrEqual(layout.width);
      expect(a.y + a.height).toBeLessThanOrEqual(layout.height);
      for (const b of layout.nodes.filter((other) => other.id > a.id)) {
        expect(overlap(a, b), `${a.id} and ${b.id}`).toBe(false);
      }
    }
  });

  it("refuses arrows that run in a circle", () => {
    expect(() => layOut("flowchart TD\n a --> b --> a")).toThrow(/cycle/);
  });
});
