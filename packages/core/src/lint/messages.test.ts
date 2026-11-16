// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { EN_GB_CATALOGUE } from "../messages/en-GB";
import type { MessageKey } from "../ports/messages";

/**
 * The placeholder names each `MessageKey` takes, kept by hand beside
 * `MessageParams` in `ports/messages.ts` (a type, so it carries no runtime
 * information this test can read). A key missing here, or whose set of
 * names does not match this list, fails the test below: that is how an
 * added `MessageKey` without a matching `MessageParams` entry, or a
 * catalogue string whose placeholder has drifted from it, fails the build
 * rather than only a review.
 */
const EXPECTED_PLACEHOLDERS: Record<MessageKey, readonly string[]> = {
  "settings.title": [],
  "settings.theme.label": [],
  "settings.theme.system": [],
  "settings.theme.light": [],
  "settings.theme.dark": [],
  "settings.units.label": [],
  "settings.units.metric": [],
  "settings.units.imperial": [],
  "settings.mapShape.label": [],
  "settings.mapShape.flat": [],
  "settings.mapShape.globe": [],
  "settings.zoomButtons.label": [],
  "settings.zoomButtons.description": [],
  "settings.saveData.label": [],
  "settings.saveData.description": [],
  "settings.notSaved": [],
  "settings.privacy.heading": [],
  "settings.privacy.link": [],
  "common.itemCount": ["count"],
  "settings.language.label": [],
  "settings.language.auto": [],
};

/** Every `{name}` placeholder used in `value`, deduplicated. */
function placeholdersIn(value: string): string[] {
  return [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? ""))];
}

describe("the English message catalogue", () => {
  it("has exactly the keys this test expects", () => {
    expect(Object.keys(EN_GB_CATALOGUE).sort()).toEqual(
      Object.keys(EXPECTED_PLACEHOLDERS).sort(),
    );
  });

  it.each(Object.keys(EXPECTED_PLACEHOLDERS) as MessageKey[])(
    "%s has a non-empty value whose placeholders match MessageParams",
    (key) => {
      const value = EN_GB_CATALOGUE[key];
      expect(value.length).toBeGreaterThan(0);
      const forms = value.split("|");
      const expected = [...EXPECTED_PLACEHOLDERS[key]].sort();
      for (const form of forms) {
        expect(placeholdersIn(form).sort()).toEqual(expected);
      }
    },
  );
});
