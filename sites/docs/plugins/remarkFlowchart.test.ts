// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { remarkFlowchart } from "./remarkFlowchart";

interface Node {
  type: string;
  lang?: string | null;
  value?: string;
  children?: Node[];
}

const CHART = "flowchart TD\n a --> b";

function run(tree: Node): void {
  remarkFlowchart()()(tree);
}

describe("remarkFlowchart", () => {
  it("replaces a mermaid block with the drawn diagram, wherever it sits", () => {
    const tree: Node = {
      type: "root",
      children: [
        { type: "paragraph", children: [] },
        {
          type: "blockquote",
          children: [{ type: "code", lang: "mermaid", value: CHART }],
        },
      ],
    };
    run(tree);
    const replaced = tree.children?.[1]?.children?.[0];
    expect(replaced?.type).toBe("html");
    expect(replaced?.value).toContain("<svg");
  });

  it("gives each diagram on a page its own ids", () => {
    const code = { type: "code", lang: "mermaid", value: CHART };
    const tree: Node = { type: "root", children: [{ ...code }, { ...code }] };
    run(tree);
    expect(tree.children?.[0]?.value).toContain('id="flowchart-1-title"');
    expect(tree.children?.[1]?.value).toContain('id="flowchart-2-title"');
  });

  it("leaves other code blocks alone", () => {
    const block = { type: "code", lang: "ts", value: "const a = 1;" };
    const tree: Node = { type: "root", children: [{ ...block }] };
    run(tree);
    expect(tree.children).toEqual([block]);
  });

  it("fails the build on syntax it cannot draw, rather than showing a wrong picture", () => {
    const tree: Node = {
      type: "root",
      children: [{ type: "code", lang: "mermaid", value: "sequenceDiagram" }],
    };
    expect(() => run(tree)).toThrow(/Unsupported flowchart syntax/);
  });

  it("names the document and the diagram when one cannot be drawn, such as one too wide", () => {
    const wide = `flowchart TD\n a["${"x".repeat(60)}"]`;
    const tree: Node = {
      type: "root",
      children: [
        { type: "code", lang: "mermaid", value: CHART },
        { type: "code", lang: "mermaid", value: wide },
      ],
    };
    expect(() => remarkFlowchart()()(tree, { path: "docs/guide.md" })).toThrow(
      /docs\/guide\.md, diagram 2: .*too wide/,
    );
  });
});
