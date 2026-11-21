// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { EMBED_EXAMPLE_FILES } from "./embedExampleFiles";
import { type CodeRun, highlightCode } from "./highlightCode";

/** The text of a list of runs, joined. */
function join(runs: readonly CodeRun[]): string {
  return runs.map((run) => (typeof run === "string" ? run : run.text)).join("");
}

describe("highlightCode", () => {
  it("keeps every character of each file of the embedding example, in order", () => {
    for (const { code } of EMBED_EXAMPLE_FILES) {
      expect(join(highlightCode(code))).toBe(code);
    }
  });

  it("marks keywords, strings, numbers, comments and capitalised names, and leaves the rest plain", () => {
    expect(
      highlightCode(
        'import { useMap } from "@mapcairn/map";\nconst zoom = 11; // start\n<MapView />',
      ),
    ).toEqual([
      { kind: "keyword", text: "import" },
      " { useMap } ",
      { kind: "keyword", text: "from" },
      " ",
      { kind: "string", text: '"@mapcairn/map"' },
      ";\n",
      { kind: "keyword", text: "const" },
      " zoom = ",
      { kind: "number", text: "11" },
      "; ",
      { kind: "comment", text: "// start" },
      "\n<",
      { kind: "name", text: "MapView" },
      " />",
    ]);
  });

  it("does not split a word that holds a keyword or a digit", () => {
    expect(highlightCode("imported layer2")).toEqual(["imported layer2"]);
  });

  it("reads a quote inside a comment, and an unclosed quote, as plain text rather than a string", () => {
    expect(highlightCode("/* it's */ x = 'a")).toEqual([
      { kind: "comment", text: "/* it's */" },
      " x = 'a",
    ]);
  });
});
