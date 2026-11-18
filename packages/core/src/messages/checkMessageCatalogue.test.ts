// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { checkMessageCatalogue } from "./checkMessageCatalogue";

const ENGLISH = {
  close: "Close",
  greeting: "Hello, {name}",
  files: "{count} file|{count} files",
  items: "one{{count} item} other{{count} items}",
};

const AFRIKAANS = {
  close: "Sluit",
  greeting: "Hallo, {name}",
  files: "{count} lêer|{count} lêers",
  items: "one{{count} item} other{{count} items}",
};

const ALLOWED = { items: "Item is the Afrikaans word too." };

describe("checkMessageCatalogue", () => {
  it("finds nothing wrong with a complete, translated catalogue", () => {
    expect(
      checkMessageCatalogue("af", AFRIKAANS, ENGLISH, {
        sameAsEnglish: ALLOWED,
      }),
    ).toEqual([]);
  });

  it("reports a key the catalogue leaves out and one English does not have", () => {
    const { close: _close, ...partial } = AFRIKAANS;
    expect(
      checkMessageCatalogue("af", { ...partial, extra: "Ekstra" }, ENGLISH, {
        sameAsEnglish: ALLOWED,
      }),
    ).toEqual([
      { key: "close", problem: "missing" },
      { key: "extra", problem: "unknown" },
    ]);
  });

  it("reports a placeholder renamed, dropped or added in any form", () => {
    expect(
      checkMessageCatalogue(
        "af",
        {
          ...AFRIKAANS,
          greeting: "Hallo, {naam}",
          files: "een lêer|{count} lêers",
          close: "Sluit {name}",
        },
        ENGLISH,
        { sameAsEnglish: ALLOWED },
      ),
    ).toEqual([
      { key: "close", problem: "placeholders" },
      { key: "greeting", problem: "placeholders" },
      { key: "files", problem: "placeholders" },
    ]);
  });

  it("asks every form for every placeholder of the English value, whatever its category", () => {
    const english = { files: "one{one file} other{{count} files}" };
    expect(
      checkMessageCatalogue(
        "ru",
        {
          files:
            "one{{count} файл} few{{count} файла} many{{count} файлов} other{{count} файла}",
        },
        english,
      ),
    ).toEqual([]);
    expect(
      checkMessageCatalogue(
        "ru",
        {
          files:
            "one{файл} few{{count} файла} many{{count} файлов} other{{count} файла}",
        },
        english,
      ),
    ).toEqual([{ key: "files", problem: "placeholders" }]);
    expect(
      checkMessageCatalogue(
        "af",
        { files: "one{een lêer} other{{count} lêers}" },
        english,
      ),
    ).toEqual([{ key: "files", problem: "placeholders" }]);
    expect(
      checkMessageCatalogue(
        "af",
        { files: "one{{count} lêer} other{{count} lêers {name}}" },
        english,
      ),
    ).toEqual([{ key: "files", problem: "placeholders" }]);
    expect(
      checkMessageCatalogue(
        "ru",
        {
          files:
            "one{{count} файл} few{{count} файла} many{{count} файлов} other{{count} файла}",
        },
        { files: "{count} file|{count} files" },
      ),
    ).toEqual([]);
  });

  it("reports plural forms that do not match the language's categories", () => {
    expect(
      checkMessageCatalogue(
        "af",
        {
          ...AFRIKAANS,
          files: "{count} lêers",
          items: "one{{count} item} few{{count} items} other{{count} items}",
        },
        ENGLISH,
        { sameAsEnglish: ALLOWED },
      ),
    ).toEqual([
      { key: "files", problem: "pluralForms" },
      { key: "items", problem: "pluralForms" },
    ]);
    expect(
      checkMessageCatalogue(
        "ru",
        { files: "{count} файл|{count} файлов" },
        {
          files: "{count} file|{count} files",
        },
      ),
    ).toEqual([{ key: "files", problem: "pluralForms" }]);
  });

  it("asks for the language's categories when only the translation has forms", () => {
    const english = { found: "{count} found" };
    expect(
      checkMessageCatalogue("af", { found: "{count} gevind" }, english),
    ).toEqual([]);
    expect(
      checkMessageCatalogue(
        "af",
        { found: "one{{count} gevind} other{{count} gevind}" },
        english,
      ),
    ).toEqual([]);
    expect(
      checkMessageCatalogue("af", { found: "other{{count} gevind}" }, english),
    ).toEqual([{ key: "found", problem: "pluralForms" }]);
    expect(
      checkMessageCatalogue(
        "ru",
        { found: "{count} найдено|{count} найдено" },
        english,
      ),
    ).toEqual([{ key: "found", problem: "pluralForms" }]);
  });

  it("reads a key listed as not plural as text, bars and all", () => {
    const english = { toggle: "on|off", close: "Close" };
    expect(
      checkMessageCatalogue(
        "af",
        { toggle: "aan en af", close: "Sluit" },
        english,
      ),
    ).toEqual([{ key: "toggle", problem: "pluralForms" }]);
    expect(
      checkMessageCatalogue(
        "af",
        { toggle: "aan en af", close: "Sluit" },
        english,
        { notPlural: ["toggle"] },
      ),
    ).toEqual([]);
    expect(
      checkMessageCatalogue(
        "ru",
        { toggle: "вкл|выкл", close: "Закрыть" },
        english,
        { notPlural: ["toggle"] },
      ),
    ).toEqual([]);
    expect(
      checkMessageCatalogue(
        "af",
        { toggle: "on|off", close: "Sluit" },
        english,
        { notPlural: ["toggle"] },
      ),
    ).toEqual([{ key: "toggle", problem: "copiedEnglish" }]);
    expect(
      checkMessageCatalogue("ru", { label: "вкл|выкл" }, { label: "On, off" }),
    ).toEqual([{ key: "label", problem: "pluralForms" }]);
    expect(
      checkMessageCatalogue(
        "ru",
        { label: "вкл|выкл" },
        { label: "On, off" },
        { notPlural: ["label"] },
      ),
    ).toEqual([]);
  });

  it("reports a not-plural entry that is not needed", () => {
    expect(
      checkMessageCatalogue(
        "af",
        { close: "Sluit" },
        { close: "Close" },
        { notPlural: ["close", "gone"] },
      ),
    ).toEqual([
      { key: "close", problem: "unusedAllowance" },
      { key: "gone", problem: "unusedAllowance" },
    ]);
  });

  it("reports a plural value whose braces cannot be read", () => {
    const english = { files: "{count} file|{count} files" };
    for (const [language, value] of [
      ["ja", "othre{{count} 件}"],
      ["ja", "{count} 件}"],
      ["ja", "{count 件"],
      ["ja", "other{{count} 件"],
      ["af", "{count} lêer|{count lêers"],
    ] as const) {
      expect(
        checkMessageCatalogue(language, { files: value }, english),
        value,
      ).toContainEqual({ key: "files", problem: "pluralForms" });
    }
    expect(
      checkMessageCatalogue("ja", { files: "other{{count} 件}" }, english),
    ).toEqual([]);
  });

  it("accepts a plain value for a language with one plural category", () => {
    expect(
      checkMessageCatalogue(
        "ja",
        { files: "{count} 件のファイル" },
        {
          files: "{count} file|{count} files",
        },
      ),
    ).toEqual([]);
  });

  it("reports a value with three bar forms or keyed forms it cannot read", () => {
    expect(
      checkMessageCatalogue(
        "af",
        {
          files: "{count} lêer|{count} lêers|{count} lêers",
          items: "one{{count} item} other{{count} items} trailing",
        },
        { files: ENGLISH.files, items: ENGLISH.items },
      ),
    ).toEqual([
      { key: "files", problem: "pluralForms" },
      { key: "items", problem: "pluralForms" },
    ]);
  });

  it("reports an empty value or an empty form", () => {
    expect(
      checkMessageCatalogue(
        "af",
        { ...AFRIKAANS, close: " ", files: "{count} lêer|" },
        ENGLISH,
        { sameAsEnglish: ALLOWED },
      ),
    ).toEqual([
      { key: "close", problem: "emptyForm" },
      { key: "files", problem: "emptyForm" },
      { key: "files", problem: "placeholders" },
    ]);
  });

  it("reports a value, or any one form, copied from English", () => {
    expect(
      checkMessageCatalogue(
        "af",
        { ...AFRIKAANS, close: " close ", files: "{count} lêer|{count} files" },
        ENGLISH,
        { sameAsEnglish: ALLOWED },
      ),
    ).toEqual([
      { key: "close", problem: "copiedEnglish" },
      { key: "files", problem: "copiedEnglish" },
    ]);
  });

  it("compares each form with the English form of its own category", () => {
    expect(
      checkMessageCatalogue(
        "af",
        { minutes: "{count} minuut|{count} minute" },
        { minutes: "{count} minute|{count} minutes" },
      ),
    ).toEqual([]);
  });

  it("counts an allowance only with a reason, and reports one no longer needed", () => {
    expect(
      checkMessageCatalogue("af", AFRIKAANS, ENGLISH, {
        sameAsEnglish: {
          items: " ",
          close: "Not needed any more.",
          gone: "A key English no longer has.",
        },
      }),
    ).toEqual([
      { key: "items", problem: "copiedEnglish" },
      { key: "items", problem: "unusedAllowance" },
      { key: "close", problem: "unusedAllowance" },
      { key: "gone", problem: "unusedAllowance" },
    ]);
  });

  it("reports an allowance with a blank reason even when the value is translated", () => {
    expect(
      checkMessageCatalogue(
        "af",
        { close: "Sluit" },
        { close: "Close" },
        { sameAsEnglish: { close: " " } },
      ),
    ).toEqual([{ key: "close", problem: "unusedAllowance" }]);
  });

  it("reports an allowance for a key the catalogue leaves out", () => {
    expect(
      checkMessageCatalogue(
        "af",
        {},
        { close: "Close" },
        { sameAsEnglish: { close: "A word." } },
      ),
    ).toEqual([
      { key: "close", problem: "missing" },
      { key: "close", problem: "unusedAllowance" },
    ]);
  });

  it("reads only a catalogue's own keys, so a prototype name is a key like any other", () => {
    const english = { constructor: "Close", toString: "Open" };
    expect(checkMessageCatalogue("af", {}, english)).toEqual([
      { key: "constructor", problem: "missing" },
      { key: "toString", problem: "missing" },
    ]);
    expect(
      checkMessageCatalogue(
        "af",
        { constructor: "Sluit", toString: "Open" },
        english,
      ),
    ).toEqual([{ key: "toString", problem: "copiedEnglish" }]);
  });

  it("does not take an allowance from an object's prototype", () => {
    const inherited = Object.create({ close: "Inherited, not own." });
    expect(
      checkMessageCatalogue(
        "af",
        { close: "Close" },
        { close: "Close" },
        { sameAsEnglish: inherited },
      ),
    ).toEqual([{ key: "close", problem: "copiedEnglish" }]);
    expect(
      checkMessageCatalogue(
        "af",
        { constructor: "Close" },
        { constructor: "Close" },
        { sameAsEnglish: { constructor: "The same word." } },
      ),
    ).toEqual([]);
  });
});
