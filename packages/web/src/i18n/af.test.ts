// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE, type MessageKey } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { AF_CATALOGUE } from "./af";

const KEYS = Object.keys(EN_GB_CATALOGUE) as MessageKey[];

/** Every `{name}` placeholder in `form`, sorted and deduplicated. */
function placeholdersIn(form: string): string[] {
  return [
    ...new Set([...form.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "")),
  ].sort();
}

describe("the Afrikaans catalogue", () => {
  it("has exactly the keys of the English catalogue", () => {
    expect(Object.keys(AF_CATALOGUE).sort()).toEqual([...KEYS].sort());
  });

  it.each(KEYS)("%s has the English placeholders and plural forms", (key) => {
    const english = EN_GB_CATALOGUE[key].split("|");
    const afrikaans = AF_CATALOGUE[key].split("|");
    expect(afrikaans).toHaveLength(english.length);
    afrikaans.forEach((form, index) => {
      expect(form.trim().length).toBeGreaterThan(0);
      expect(placeholdersIn(form)).toEqual(
        placeholdersIn(english[index] ?? ""),
      );
    });
  });

  it("speaks to the visitor as jy, never with the formal u", () => {
    const formal = KEYS.filter((key) =>
      /(^|[^\p{L}'])u($|[^\p{L}])/iu.test(AF_CATALOGUE[key]),
    );
    expect(formal).toEqual([]);
  });

  it("keeps UTC wherever the English says a time is in UTC", () => {
    const dropped = KEYS.filter(
      (key) =>
        EN_GB_CATALOGUE[key].includes("UTC") &&
        !AF_CATALOGUE[key].includes("UTC"),
    );
    expect(dropped).toEqual([]);
  });

  it("writes east as O, for oos, and keeps N, S and W", () => {
    expect([
      AF_CATALOGUE["format.hemisphereNorth"],
      AF_CATALOGUE["format.hemisphereSouth"],
      AF_CATALOGUE["format.hemisphereEast"],
      AF_CATALOGUE["format.hemisphereWest"],
    ]).toEqual(["N", "S", "O", "W"]);
  });
});
