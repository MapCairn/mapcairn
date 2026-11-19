// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { checkMessageCatalogue, EN_GB_CATALOGUE } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import {
  accent,
  expandedPseudoCatalogue,
  mirroredPseudoCatalogue,
} from "../e2e/support/pseudoLocale";

const STRUCTURAL = /^(format\.(word|hemisphere)|units\.(symbol|reading))/;

/** The keys a pseudo-locale leaves as English, with the reason the check needs. */
function unchanged(
  pseudo: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(EN_GB_CATALOGUE)
      .filter(([key, value]) => pseudo[key] === value)
      .map(([key]) => [key, "Read back by the app, or has no text to change."]),
  );
}

describe("the generated pseudo-locales", () => {
  it.each([
    ["expanded", expandedPseudoCatalogue()],
    ["mirrored", mirroredPseudoCatalogue()],
  ])(
    "%s: holds every key, every placeholder and every plural form English does",
    (_name, pseudo) => {
      expect(
        checkMessageCatalogue("en", pseudo, EN_GB_CATALOGUE, {
          sameAsEnglish: unchanged(pseudo),
        }),
      ).toEqual([]);
    },
  );

  it("expanded: leaves only the structural keys and text-free values as English", () => {
    const same = Object.keys(unchanged(expandedPseudoCatalogue()));
    const expected = Object.entries(EN_GB_CATALOGUE)
      .filter(
        ([key, value]) =>
          STRUCTURAL.test(key) || !/\p{L}/u.test(value.replace(/\{\w+\}/g, "")),
      )
      .map(([key]) => key);
    expect(same.sort()).toEqual(expected.sort());
  });

  it("mirrored: leaves only the structural keys as English", () => {
    const same = Object.keys(unchanged(mirroredPseudoCatalogue()));
    const expected = Object.keys(EN_GB_CATALOGUE).filter((key) =>
      STRUCTURAL.test(key),
    );
    expect(same.sort()).toEqual(expected.sort());
  });

  it("expands the text of every prose value by about 40 percent", () => {
    const expanded = expandedPseudoCatalogue();
    const letters = (text: string) =>
      text.replace(/\{\w+\}|[^\p{L}]/gu, "").length;
    const english = Object.values(EN_GB_CATALOGUE).map(letters);
    const longer = Object.values(expanded).map(letters);
    const total = (counts: readonly number[]) =>
      counts.reduce((sum, count) => sum + count, 0);
    expect(total(longer) / total(english)).toBeGreaterThan(1.35);
    expect(total(longer) / total(english)).toBeLessThan(1.5);
  });

  it("accents letters and keeps their case", () => {
    expect(accent("Show Map")).toBe("Šĥöŵ Ɱàþ");
    expect(accent("2 km")).toBe("2 ķɱ");
  });

  it("changes each form of a plural and leaves placeholders and the separator", () => {
    const expanded = expandedPseudoCatalogue({
      ...EN_GB_CATALOGUE,
      "units.metre": "{count} metre|{count} metres",
    });
    const [one, other] = expanded["units.metre"].split("|");
    expect(one).toMatch(/^\{count\} ɱéţŕé ƒîļļ$/);
    expect(other).toMatch(/^\{count\} ɱéţŕéš ƒîļļ$/);
  });

  it("changes the text inside each keyed form and keeps the categories and braces", () => {
    const keyed = {
      ...EN_GB_CATALOGUE,
      "units.metre": "one{{count} metre} other{{count} metres}",
    };
    const mirrored = mirroredPseudoCatalogue(keyed)["units.metre"];
    expect(mirrored).toBe("one{‫{count} metre‬} other{‫{count} metres‬}");
    expect(expandedPseudoCatalogue(keyed)["units.metre"]).toMatch(
      /^one\{\{count\} ɱéţŕé ƒîļļ\} other\{\{count\} ɱéţŕéš ƒîļļ\}$/,
    );
  });

  it("wraps a mirrored form in right-to-left embedding", () => {
    expect(mirroredPseudoCatalogue()["layers.title"]).toBe(
      `‫${EN_GB_CATALOGUE["layers.title"]}‬`,
    );
  });

  it("reads a value that is a category name as text", () => {
    const odd = { ...EN_GB_CATALOGUE, "layers.title": "other" };
    expect(mirroredPseudoCatalogue(odd)["layers.title"]).toBe("‫other‬");
  });
});
