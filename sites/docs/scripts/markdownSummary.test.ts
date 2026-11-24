// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { LEAD_MAX_LENGTH, leadOf } from "./markdownSummary";

describe("leadOf", () => {
  it("is the first sentence of the prose that follows the heading, as plain text", () => {
    expect(
      leadOf(
        "## Layout\n\nThe **chrome** owns [the slots](slots.md). It also does more.\n",
      ),
    ).toBe("The chrome owns the slots.");
  });

  it("is empty when the heading is followed by a list", () => {
    expect(
      leadOf("## Tokens\n\n- **Colour:** one.\n- **Basemap:** two.\n"),
    ).toBe("");
  });

  it("is empty when the heading is followed by a table, a code block or a quote", () => {
    expect(leadOf("## T\n\n| A | B |\n| - | - |\n| 1 | 2 |\n")).toBe("");
    expect(leadOf("## T\n\n```ts\nconst a = 1;\n```\n")).toBe("");
    expect(leadOf("## T\n\n> A quote.\n")).toBe("");
  });

  it("never reads a table that sits inside a list item, though prose comes later", () => {
    const body = [
      "## Tokens",
      "",
      "- **Syntax palette:** the colours of code.",
      "",
      "  | Role | Light |",
      "  | ---- | ----- |",
      "  | Keyword | 7.8 |",
      "",
      "Some prose after the list.",
      "",
    ].join("\n");
    expect(leadOf(body)).toBe("");
  });

  it("is empty when the prose only introduces a list or starts with code", () => {
    expect(leadOf("## E\n\nThese surfaces are exempt:\n\n- one\n")).toBe("");
    expect(leadOf("## E\n\n`/design` renders every token.\n")).toBe("");
  });

  it("is empty when the sentence is longer than a line of a phone", () => {
    const long = `${"word ".repeat(LEAD_MAX_LENGTH)}ends.`;
    expect(leadOf(`## L\n\n${long}\n`)).toBe("");
  });

  it("gives a sentence of exactly the longest length", () => {
    const sentence = `${"a".repeat(LEAD_MAX_LENGTH - 1)}.`;
    expect(leadOf(`## L\n\n${sentence}\n`)).toBe(sentence);
  });

  it("is empty for a body with no prose", () => {
    expect(leadOf("## Empty\n")).toBe("");
    expect(leadOf("")).toBe("");
  });

  it("does not look past a sub-heading for prose", () => {
    expect(leadOf("## A\n\n### B\n\nProse under B.\n")).toBe("");
  });
});
