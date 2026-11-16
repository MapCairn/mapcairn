// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { LintReport } from "./lint.js";
import {
  EXIT,
  exitCodeFor,
  type FileReport,
  formatJson,
  formatText,
  summarise,
} from "./report.js";
import type { Finding, Severity } from "./types.js";

function finding(severity: Severity, path = "/features/0"): Finding {
  return {
    ruleId: "winding-order",
    severity,
    confidence: "high",
    path,
    message: "Something is wrong.",
    fixable: false,
  };
}

function file(
  name: string,
  findings: Finding[],
  inputError?: LintReport["inputError"],
): FileReport {
  return { file: name, report: { findings, featureCount: 1, inputError } };
}

describe("exitCodeFor", () => {
  it("is 0 for no findings and for information only", () => {
    expect(exitCodeFor([file("a", [])])).toBe(EXIT.clean);
    expect(exitCodeFor([file("a", [finding("info")])])).toBe(EXIT.clean);
    expect(exitCodeFor([])).toBe(EXIT.clean);
  });

  it("is 1 for warnings only and 2 when any file has an error", () => {
    expect(exitCodeFor([file("a", [finding("warning")])])).toBe(EXIT.warnings);
    expect(
      exitCodeFor([
        file("a", [finding("warning")]),
        file("b", [finding("error")]),
      ]),
    ).toBe(EXIT.errors);
  });

  it("is 3 when any input could not be read, whatever else was found", () => {
    const unreadable = file("b", [], { message: "Unexpected end", offset: 10 });
    expect(exitCodeFor([file("a", [finding("error")]), unreadable])).toBe(
      EXIT.unreadable,
    );
  });
});

describe("summarise", () => {
  it("counts each severity and the unreadable inputs", () => {
    expect(
      summarise([
        file("a", [
          finding("error"),
          finding("warning"),
          finding("info"),
          finding("info"),
        ]),
        file("b", [], { message: "x", offset: 0 }),
      ]),
    ).toEqual({ files: 2, errors: 1, warnings: 1, infos: 2, unreadable: 1 });
  });
});

describe("formatText", () => {
  it("prints one greppable line for each finding and a summary", () => {
    const text = formatText([
      file("data.geojson", [finding("error", "/features/3")]),
    ]);
    expect(text).toBe(
      [
        "data.geojson: error winding-order (high confidence) /features/3 Something is wrong.",
        "1 error, 0 warnings, 0 info in 1 file.",
        "",
      ].join("\n"),
    );
  });

  it("names the document for an empty pointer and reports an unreadable input", () => {
    const text = formatText([
      file("a.geojson", [finding("warning", "")]),
      file("b.geojson", [], { message: "Unexpected end of input", offset: 42 }),
    ]);
    expect(text).toContain(
      "a.geojson: warning winding-order (high confidence) (document) Something",
    );
    expect(text).toContain(
      "b.geojson: error invalid-input could not be read past byte 42: Unexpected end of input",
    );
    expect(text).toContain("1 warning, ");
    expect(text).toContain("in 2 files.");
  });

  it("says how many inputs were unreadable next to the counts", () => {
    const text = formatText([
      file("b.geojson", [], { message: "Unexpected end of input", offset: 42 }),
    ]);
    expect(text).toContain(
      "0 errors, 0 warnings, 0 info, 1 unreadable in 1 file.",
    );
  });

  it("leaves the unreadable count out when every input was read", () => {
    expect(formatText([file("a", [])])).not.toContain("unreadable");
  });

  it("words an input that could not be read at all without a byte offset", () => {
    const text = formatText([
      file("b.geojson", [], { message: "Unexpected token", offset: 0 }),
    ]);
    expect(text).toContain(
      "b.geojson: error invalid-input could not be read: Unexpected token",
    );
  });

  it("escapes control characters in a message and a file name, so output cannot move the cursor or split a line", () => {
    const text = formatText([
      file("a\u001b[2Jb.geojson", [
        { ...finding("warning", "/x"), message: "crs is \u001b[31mred\nnext" },
      ]),
    ]);
    const codes = [...text].map((character) => character.charCodeAt(0));
    expect(codes.filter((code) => code < 0x20 && code !== 0x0a)).toEqual([]);
    expect(codes).not.toContain(0x7f);
    expect(text.split("\n")).toHaveLength(3);
    expect(text).toContain("a\\x1b[2Jb.geojson");
    expect(text).toContain("crs is \\x1b[31mred\\nnext");
  });
});

describe("formatJson", () => {
  it("is versioned, has a summary, and carries every finding", () => {
    const parsed = JSON.parse(
      formatJson([
        file("a", [finding("error")]),
        file("b", [], { message: "m", offset: 3 }),
      ]),
    );
    expect(parsed.version).toBe(1);
    expect(parsed.files[0]).toMatchObject({
      file: "a",
      featureCount: 1,
      inputError: null,
    });
    expect(parsed.files[0].findings[0]).toMatchObject({
      ruleId: "winding-order",
      path: "/features/0",
    });
    expect(parsed.files[1].inputError).toEqual({ message: "m", offset: 3 });
    expect(parsed.summary).toMatchObject({
      files: 2,
      errors: 1,
      unreadable: 1,
    });
  });
});
