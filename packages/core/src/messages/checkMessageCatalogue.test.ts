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
    expect(checkMessageCatalogue("af", AFRIKAANS, ENGLISH, ALLOWED)).toEqual(
      [],
    );
  });

  it("reports a key the catalogue leaves out and one English does not have", () => {
    const { close: _close, ...partial } = AFRIKAANS;
    expect(
      checkMessageCatalogue(
        "af",
        { ...partial, extra: "Ekstra" },
        ENGLISH,
        ALLOWED,
      ),
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
        ALLOWED,
      ),
    ).toEqual([
      { key: "close", problem: "placeholders" },
      { key: "greeting", problem: "placeholders" },
      { key: "files", problem: "placeholders" },
    ]);
  });

  it("compares a form's placeholders with the English form of its category", () => {
    expect(
      checkMessageCatalogue(
        "af",
        { files: "one{een lêer} other{{count} lêers}" },
        { files: "one{one file}" },
      ),
    ).toEqual([{ key: "files", problem: "placeholders" }]);
    const english = { files: "one{one file} other{{count} files}" };
    expect(
      checkMessageCatalogue(
        "af",
        { files: "one{een lêer} other{{count} lêers}" },
        english,
      ),
    ).toEqual([]);
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
        ALLOWED,
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
        ALLOWED,
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
        ALLOWED,
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
        items: " ",
        close: "Not needed any more.",
        gone: "A key English no longer has.",
      }),
    ).toEqual([
      { key: "close", problem: "unusedAllowance" },
      { key: "items", problem: "copiedEnglish" },
      { key: "gone", problem: "unusedAllowance" },
    ]);
  });
});
