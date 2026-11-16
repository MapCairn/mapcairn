// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { FakeMessageCatalogue } from "../fakes/FakeMessageCatalogue";
import { createLanguageCatalogue } from "./languageCatalogue";

const ENGLISH = { tag: "en-GB", label: "English" };
const AFRIKAANS = { tag: "af", label: "Afrikaans" };
const load = (tag: string) => new FakeMessageCatalogue({ language: tag });

describe("createLanguageCatalogue", () => {
  it("holds the languages in order, the default and the loader", () => {
    const catalogue = createLanguageCatalogue(
      [ENGLISH, AFRIKAANS],
      "en-GB",
      load,
    );
    expect(catalogue.languages).toEqual([ENGLISH, AFRIKAANS]);
    expect(catalogue.defaultLanguage).toBe("en-GB");
    expect(catalogue.load("af")).toMatchObject({ language: "af" });
  });

  it("rejects an empty list, a repeated tag and a default that is not offered", () => {
    expect(() => createLanguageCatalogue([], "en-GB", load)).toThrow(
      "at least one language",
    );
    expect(() =>
      createLanguageCatalogue([ENGLISH, ENGLISH], "en-GB", load),
    ).toThrow('"en-GB" is used twice');
    expect(() => createLanguageCatalogue([ENGLISH], "af", load)).toThrow(
      'default language "af" is not in the catalogue',
    );
  });
});
