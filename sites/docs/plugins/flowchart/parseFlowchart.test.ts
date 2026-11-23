// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { parseFlowchart } from "./parseFlowchart";

describe("parseFlowchart", () => {
  it("reads boxes, their lines, frames and arrows", () => {
    const chart = parseFlowchart(`flowchart TD
  subgraph web["The host"]
    root["composition root<br/>createServices()"]
    host["routes"]
  end
  theme["tokens"]
  root --> theme`);
    expect(chart.groups).toEqual([{ id: "web", title: "The host" }]);
    expect(chart.nodes).toEqual([
      {
        id: "root",
        lines: ["composition root", "createServices()"],
        group: "web",
      },
      { id: "host", lines: ["routes"], group: "web" },
      { id: "theme", lines: ["tokens"] },
    ]);
    expect(chart.edges).toEqual([{ from: "root", to: "theme" }]);
  });

  it("reads a chain of arrows as one arrow for each pair, and a box named only by its id", () => {
    const chart = parseFlowchart("graph TB\n  a --> b --> c");
    expect(chart.nodes.map((node) => node.lines)).toEqual([
      ["a"],
      ["b"],
      ["c"],
    ]);
    expect(chart.edges).toEqual([
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
  });

  it("keeps the text a box was given and the frame it was first written in", () => {
    const chart = parseFlowchart(`flowchart TD
  a --> b["later"]
  subgraph g
    b
  end`);
    expect(chart.nodes.find((node) => node.id === "b")).toEqual({
      id: "b",
      lines: ["later"],
      group: "g",
    });
    expect(chart.groups).toEqual([{ id: "g", title: "g" }]);
  });

  it("skips blank lines and comments", () => {
    const chart = parseFlowchart("flowchart TD\n\n%% note\n  a --> b");
    expect(chart.edges).toHaveLength(1);
  });

  it.each([
    ["a header that is not top-down", "flowchart LR\n a --> b", /line 1/],
    ["no header", "a --> b", /line 1/],
    ["an arrow with text", "flowchart TD\n a -->|yes| b", /line 2/],
    ["another box shape", "flowchart TD\n a(round) --> b", /line 2/],
    [
      "a frame inside a frame",
      "flowchart TD\n subgraph a\n subgraph b\n end\n end",
      /line 3/,
    ],
    ["an end with no frame", "flowchart TD\n end", /line 2/],
    ["a frame never closed", "flowchart TD\n subgraph a\n b", /never closed/],
    ["nothing", "", /empty/],
  ])(
    "refuses %s, so a diagram is never drawn wrongly",
    (_name, source, message) => {
      expect(() => parseFlowchart(source)).toThrow(message);
    },
  );
});
