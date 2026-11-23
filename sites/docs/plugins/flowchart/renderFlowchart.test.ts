// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_DIAGRAM_WIDTH, renderFlowchart } from "./renderFlowchart";

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

  it("sits in a plain box that never scrolls, so the keyboard has nothing to reach", () => {
    expect(svg).toMatch(/^<div class="flowchart">\n<svg /);
    expect(svg).not.toContain("tabindex");
    expect(svg).not.toContain("scrolls");
  });

  it("is as wide as it was laid out, so it is never drawn larger than it was planned", () => {
    expect(Number(/ width="([\d.]+)"/.exec(svg)?.[1])).toBeLessThanOrEqual(
      MAX_DIAGRAM_WIDTH,
    );
  });

  it("refuses a diagram too wide for a phone, naming the width and the limit", () => {
    const wide = `flowchart TD
  a["${"x".repeat(60)}"]
  b["${"y".repeat(60)}"]
  a --> b`;
    expect(() => renderFlowchart(wide, "wide")).toThrow(
      new RegExp(`too wide.*${MAX_DIAGRAM_WIDTH}`),
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

const REPOSITORY = new URL("../../../../", import.meta.url);
const FENCE = "```";
const OPENING = `${FENCE}mermaid\n`;

/** The text of each `mermaid` block in a document. */
function diagramsIn(document: string): string[] {
  const sources: string[] = [];
  let from = document.indexOf(OPENING);
  while (from !== -1) {
    const start = from + OPENING.length;
    const end = document.indexOf(FENCE, start);
    sources.push(document.slice(start, end));
    from = document.indexOf(OPENING, end);
  }
  return sources;
}

/** The documents the site draws: the two repository documents it builds pages from, and its own pages (not the generated ones). */
function documentPaths(): URL[] {
  const pages = readdirSync(new URL("sites/docs/docs/", REPOSITORY), {
    recursive: true,
    encoding: "utf8",
  }).filter(
    (path) => path.endsWith(".md") && !/^(api|generated)([\\/]|$)/.test(path),
  );
  return [
    new URL("ARCHITECTURE.md", REPOSITORY),
    new URL("DESIGN.md", REPOSITORY),
    ...pages.map((path) => new URL(`sites/docs/docs/${path}`, REPOSITORY)),
  ];
}

describe("the diagrams in the documents", () => {
  const found = documentPaths().flatMap((path) =>
    diagramsIn(readFileSync(path, "utf8")).map((source) => ({
      name: `${path.pathname.split("/").pop()}, ${source.split("\n")[1]?.trim()}`,
      source,
    })),
  );

  it("exist", () => {
    expect(found.length).toBeGreaterThan(0);
  });

  it.each(found)(
    "$name is drawn within a phone's width, with every box and arrow of its source and a text alternative",
    ({ source }) => {
      const drawn = renderFlowchart(source, "document");
      const boxes = (source.match(/^\s*\w+\["/gm) ?? []).length;
      expect(count(drawn, `class="flowchart-node"`)).toBe(boxes);
      expect(count(drawn, `class="flowchart-edge"`)).toBe(count(source, "-->"));
      expect(drawn).toMatch(/<title id="document-title">[^<]+<\/title>/);
      expect(drawn).toMatch(/<desc id="document-description">[^<]+<\/desc>/);
    },
  );
});
