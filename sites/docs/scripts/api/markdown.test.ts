// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  codeSpan,
  type DocNodeLike,
  escapeText,
  fencedCode,
  indentContinuation,
  renderDocNode,
} from "./markdown";

/** A node with the fields a test sets and the children it holds. */
function node(
  kind: string,
  fields: Record<string, unknown> = {},
  children: DocNodeLike[] = [],
): DocNodeLike {
  return { kind, getChildNodes: () => children, ...fields };
}

const noPages = (): undefined => undefined;

describe("escapeText", () => {
  it("escapes what would start markup in a page the framework reads as MDX", () => {
    expect(escapeText("a < b {c}")).toBe("a &lt; b \\{c\\}");
  });
});

describe("codeSpan", () => {
  it("is long enough that a backtick inside cannot end it", () => {
    expect(codeSpan("a`b")).toBe("``a`b``");
    expect(codeSpan("`a")).toBe("`` `a ``");
    expect(codeSpan("plain")).toBe("`plain`");
  });
});

describe("fencedCode", () => {
  it("writes a blank line as a space, so the page needs no style attribute", () => {
    expect(fencedCode("a();\n\nb();\n", "ts")).toBe(
      "```ts\na();\n \nb();\n```",
    );
  });
});

describe("indentContinuation", () => {
  it("indents every line after the first, and leaves blank lines empty", () => {
    expect(indentContinuation("one\ntwo\n\nthree")).toBe(
      "one\n  two\n\n  three",
    );
  });
});

describe("renderDocNode", () => {
  it("keeps line breaks, so a list the author wrote stays a list", () => {
    const paragraph = node("Paragraph", {}, [
      node("PlainText", { text: "Reads:" }),
      node("SoftBreak"),
      node("PlainText", { text: "- one" }),
      node("SoftBreak"),
      node("PlainText", { text: "- two" }),
    ]);
    expect(renderDocNode(paragraph, noPages)).toBe("Reads:\n- one\n- two");
  });

  it("separates paragraphs with a blank line and drops empty ones", () => {
    const section = node("Section", {}, [
      node("Paragraph", {}, [node("PlainText", { text: "First." })]),
      node("Paragraph", {}, [node("PlainText", { text: "  " })]),
      node("Paragraph", {}, [node("PlainText", { text: "Second." })]),
    ]);
    expect(renderDocNode(section, noPages)).toBe("First.\n\nSecond.");
  });

  it("links a {@link} to the page the resolver names, and writes plain code when it has none", () => {
    const link = node("LinkTag", {
      codeDestination: {
        memberReferences: [{ memberIdentifier: { identifier: "Thing" } }],
      },
    });
    expect(renderDocNode(link, (name) => `api-link:${name}`)).toBe(
      "[`Thing`](api-link:Thing)",
    );
    expect(renderDocNode(link, noPages)).toBe("`Thing`");
  });

  it("keeps a link's own text and an address written out", () => {
    const named = node("LinkTag", {
      linkText: "the guide",
      urlDestination: "https://example.com/g",
    });
    expect(renderDocNode(named, noPages)).toBe(
      "[the guide](https://example.com/g)",
    );
  });

  it("escapes text that is not code, and keeps a code span and a fenced block", () => {
    const paragraph = node("Paragraph", {}, [
      node("PlainText", { text: "x < y " }),
      node("CodeSpan", { code: "{a}" }),
      node("ErrorText", { text: "{" }),
    ]);
    expect(renderDocNode(paragraph, noPages)).toBe("x &lt; y `{a}`\\{");
    const fenced = node("FencedCode", { language: "ts", code: "f();\n" });
    expect(renderDocNode(fenced, noPages)).toBe("\n```ts\nf();\n```\n");
  });
});
