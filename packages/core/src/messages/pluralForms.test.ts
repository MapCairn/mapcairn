// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { parsePluralForms } from "./pluralForms";

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
});
