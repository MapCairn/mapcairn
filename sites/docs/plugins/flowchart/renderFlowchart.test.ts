// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderFlowchart } from "./renderFlowchart";

/** How many times `part` occurs in `text`. */
function count(text: string, part: string): number {
  return text.split(part).length - 1;
}

const SOURCE = `flowchart TD
  subgraph core["packages/core"]
    ports["ports (types only)"]
    logic["pure logic<br/>state machines"]
  end
  ui["ui & <hooks>"]
  ui --> ports
  ports --> logic`;

describe("renderFlowchart", () => {
  const svg = renderFlowchart(SOURCE, "figure-1");

  it("draws a picture with a title and a text alternative that names every frame and arrow", () => {
    expect(svg).toMatch(/<svg [^>]*role="img"/);
    expect(svg).toContain(
      'aria-labelledby="figure-1-title figure-1-description"',
    );
    expect(svg).toContain(
      '<title id="figure-1-title">Diagram of 3 boxes and 2 arrows</title>',
    );
    const open = '<desc id="figure-1-description">';
    const from = svg.indexOf(open) + open.length;
    const description = svg.slice(from, svg.indexOf("</desc>", from));
    expect(description).toBe(
      "packages/core holds ports (types only); pure logic state machines. ui &amp; &lt;hooks&gt; points to ports (types only). ports (types only) points to pure logic state machines.",
    );
  });

  it("writes each line of a box as its own text, escaped", () => {
    expect(svg).toContain(">pure logic</text>");
    expect(svg).toContain(">state machines</text>");
    expect(svg).toContain(">ui &amp; &lt;hooks&gt;</text>");
  });

  it("draws a frame, a box and an arrow with its head for each", () => {
    expect(count(svg, `class="flowchart-group"`)).toBe(1);
    expect(count(svg, `class="flowchart-node"`)).toBe(3);
    expect(count(svg, `class="flowchart-edge"`)).toBe(2);
    expect(count(svg, `class="flowchart-arrow"`)).toBe(2);
  });

  it("sits in a labelled region the keyboard can scroll", () => {
    expect(svg).toMatch(
      /^<div class="flowchart" role="region" aria-label="[^"]+, scrolls sideways" tabindex="0">/,
    );
  });

  it("has no script, no style attribute, no external reference and no blank line, which would end an HTML block", () => {
    const lower = svg.toLowerCase();
    for (const forbidden of ["<script", " style=", "href=", "url("]) {
      expect(lower, forbidden).not.toContain(forbidden);
    }
    expect(
      svg.split("\n").filter((line) => line.trim() === ""),
      "blank lines",
    ).toEqual([]);
  });

  it("is the same every time", () => {
    expect(renderFlowchart(SOURCE, "figure-1")).toBe(svg);
  });
});

describe("the diagram in ARCHITECTURE.md", () => {
  const document = readFileSync(
    new URL("../../../../ARCHITECTURE.md", import.meta.url),
    "utf8",
  );
  const fence = "```";
  const opening = `${fence}mermaid\n`;
  const start = document.indexOf(opening) + opening.length;
  const source = document.slice(start, document.indexOf(fence, start));

  it("is drawn, with every box and arrow of its source", () => {
    expect(source).toContain("flowchart TD");
    const drawn = renderFlowchart(source, "architecture");
    const boxes = (source.match(/^\s*\w+\["/gm) ?? []).length;
    const arrows = count(source, "-->");
    expect(count(drawn, `class="flowchart-node"`)).toBe(boxes);
    expect(count(drawn, `class="flowchart-edge"`)).toBe(arrows);
  });
});
