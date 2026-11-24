// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { MAX_FONT_FAMILY_LENGTH, readFontFamily } from "./fontFamily";

describe("readFontFamily", () => {
  it.each([
    [
      '"Brand Sans", system-ui, sans-serif',
      '"Brand Sans", system-ui, sans-serif',
    ],
    ["Inter", "Inter"],
    ["'Brand Sans'", "'Brand Sans'"],
    ["Helvetica Neue, Arial, sans-serif", "Helvetica Neue, Arial, sans-serif"],
    ["  Inter ,   serif  ", "Inter, serif"],
    [
      '"Noto Sans JP", "游ゴシック", sans-serif',
      '"Noto Sans JP", "游ゴシック", sans-serif',
    ],
    ['"Source Serif 4", serif', '"Source Serif 4", serif'],
    ["-apple-system, ui-monospace", "-apple-system, ui-monospace"],
    ['"Font.Name_v2-Bold"', '"Font.Name_v2-Bold"'],
  ])("accepts %s and writes it as %s", (value, written) => {
    expect(readFontFamily(value)).toEqual({ ok: true, value: written });
  });

  it.each([
    ["a closing brace", "Inter; } body { display: none"],
    ["a semicolon", "Inter; color: red"],
    ["a brace", "Inter {"],
    ["url()", "url(https://example.invalid/font.woff2)"],
    ["var()", "var(--brand-font)"],
    ["a function", "expression(alert(1))"],
    ["a block comment", "Inter /* x */, serif"],
    ["a comment opener", "Inter, /*"],
    ["a newline", "Inter,\nserif"],
    ["a carriage return", "Inter,\rserif"],
    ["a tab", "Inter,\tserif"],
    ["a backslash escape", '"\\72 ed"'],
    ["an important flag", "Inter !important"],
    ["an at-rule", "@import 'x'"],
    ["a tag", "Inter</style><script>"],
    ["a colon", "Inter: serif"],
    ["a slash", "Inter/serif"],
    ["a null character", "Inter\u0000"],
    ["a separator character", "Inter serif"],
  ])("refuses %s as a forbidden character", (_name, value) => {
    expect(readFontFamily(value)).toEqual({
      ok: false,
      reason: "forbidden-character",
    });
  });

  it.each([
    ["an empty string", ""],
    ["only spaces", "   "],
    ["a trailing comma", "Inter,"],
    ["a leading comma", ", Inter"],
    ["an empty item", "Inter,, serif"],
    ["an unterminated quote", '"Brand Sans'],
    ["a quote in the middle of a name", 'Brand "Sans"'],
    ["mixed quotes", "\"Brand Sans'"],
    ["an empty quoted name", '""'],
    ["a blank quoted name", '" "'],
    ["a name that starts with a digit", "3D Sans"],
    ["a custom property name", "--brand"],
    ["a quote inside a quoted name", '"Brand \'Sans"'],
  ])("refuses %s as malformed", (_name, value) => {
    expect(readFontFamily(value)).toEqual({ ok: false, reason: "malformed" });
  });

  it.each([
    "inherit",
    "initial",
    "unset",
    "revert",
    "revert-layer",
    "default",
    "INHERIT",
    "serif, Initial",
  ])("refuses the reserved keyword in %s", (value) => {
    expect(readFontFamily(value)).toEqual({
      ok: false,
      reason: "reserved-keyword",
    });
  });

  it("accepts a reserved word inside quotes, where it is only a name", () => {
    expect(readFontFamily('"inherit"')).toEqual({
      ok: true,
      value: '"inherit"',
    });
    expect(readFontFamily("Initial Sans")).toEqual({
      ok: true,
      value: "Initial Sans",
    });
  });

  it.each([undefined, null, 12, {}, ["Inter"], true])(
    "refuses %s as not a string",
    (value) => {
      expect(readFontFamily(value)).toEqual({
        ok: false,
        reason: "not-a-string",
      });
    },
  );

  it("refuses a list longer than the limit, and accepts one at it", () => {
    const atLimit = "a".repeat(MAX_FONT_FAMILY_LENGTH);

    expect(readFontFamily(atLimit).ok).toBe(true);
    expect(readFontFamily(`${atLimit}a`)).toEqual({
      ok: false,
      reason: "too-long",
    });
  });
});
