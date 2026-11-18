// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { parsePluralForms, pluralFormsOf } from "./pluralForms";

describe("parsePluralForms", () => {
  it("reads keyed forms with placeholders, whitespace and adjacent categories", () => {
    expect([
      ...(parsePluralForms(" one{{name}: {count}}other{More}\n") ?? []),
    ]).toEqual([
      ["one", "{name}: {count}"],
      ["other", "More"],
    ]);
  });

  it.each([
    "",
    "plain {count}",
    "one{one} other{other} trailing",
    "one{one} one{again} other{other}",
    "one{unclosed",
    "one{nested {invalid space}} other{other}",
  ])("rejects a plain or malformed value: %s", (value) => {
    expect(parsePluralForms(value)).toBeUndefined();
  });

  it("handles long whitespace between forms and before malformed input", () => {
    const whitespace = " ".repeat(100_000);
    expect([
      ...(parsePluralForms(`one{one}${whitespace}other{other}${whitespace}`) ??
        []),
    ]).toEqual([
      ["one", "one"],
      ["other", "other"],
    ]);
    expect(parsePluralForms(`one{one}${whitespace}invalid`)).toBeUndefined();
  });
});

describe("pluralFormsOf", () => {
  it("reads keyed forms, the first two bar forms, and no forms in a plain value", () => {
    expect([...(pluralFormsOf("one{a} other{b}") ?? [])]).toEqual([
      ["one", "a"],
      ["other", "b"],
    ]);
    expect([...(pluralFormsOf("a|b|c") ?? [])]).toEqual([
      ["one", "a"],
      ["other", "b"],
    ]);
    expect(pluralFormsOf("plain {count}")).toBeUndefined();
  });
});
