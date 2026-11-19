// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import { runMessageCatalogueContract } from "../contracts/messageCatalogue.contract";
import type { MessageKey } from "../ports/messages";
import { createMessageCatalogue } from "./createMessageCatalogue";
import { EN_GB_CATALOGUE } from "./en-GB";

function withoutKeys(keys: readonly MessageKey[]): Record<MessageKey, string> {
  const active = { ...EN_GB_CATALOGUE };
  for (const key of keys) {
    delete (active as Partial<Record<MessageKey, string>>)[key];
  }
  return active as Record<MessageKey, string>;
}

runMessageCatalogueContract("createMessageCatalogue", {
  create: () =>
    createMessageCatalogue("en-GB", EN_GB_CATALOGUE, EN_GB_CATALOGUE),
  createMissingKey: (key) =>
    createMessageCatalogue("en-GB", withoutKeys([key]), EN_GB_CATALOGUE),
  createWith: (language, values, numberingSystem) =>
    createMessageCatalogue(
      language,
      values,
      EN_GB_CATALOGUE,
      numberingSystem === undefined ? {} : { numberingSystem },
    ),
  createIsolating: (language, options) =>
    createMessageCatalogue(language, EN_GB_CATALOGUE, EN_GB_CATALOGUE, options),
});

describe("createMessageCatalogue numbering", () => {
  const catalogueFor = (numberingSystem?: string) =>
    createMessageCatalogue(
      "fa",
      { "settings.notSaved": "{count} on {date}" } as never,
      EN_GB_CATALOGUE,
      numberingSystem === undefined ? {} : { numberingSystem },
    );
  const params = { count: 1234, date: new Date(Date.UTC(2026, 10, 11)) };

  it("exposes the numbering system and keeps the language", () => {
    const catalogue = catalogueFor("latn");
    expect(catalogue.numberingSystem).toBe("latn");
    expect(catalogue.language).toBe("fa");
    expect(catalogueFor().numberingSystem).toBeUndefined();
  });

  it("uses the language's own digits by default", () => {
    expect(catalogueFor().t("settings.notSaved", params as never)).toContain(
      new Intl.NumberFormat("fa").format(1234),
    );
  });

  it("writes Latin digits in numbers and days when asked", () => {
    const text = catalogueFor("latn").t("settings.notSaved", params as never);
    expect(text).toContain("1,234");
    expect(text).not.toMatch(/[\u06F0-\u06F9]/u);
  });
});

describe("createMessageCatalogue", () => {
  it.each([
    [0, "zero"],
    [1, "one"],
    [2, "two"],
    [3, "few"],
    [11, "many"],
    [100, "other"],
  ])("selects the Arabic %s category as %s", (count, category) => {
    const catalogue = createMessageCatalogue(
      "ar",
      {
        "common.itemCount":
          "zero{zero {count}} one{one {count}} two{two {count}} few{few {count}} many{many {count}} other{other {count}}",
      },
      EN_GB_CATALOGUE,
    );
    expect(catalogue.plural("common.itemCount", { count })).toBe(
      `${category} ${new Intl.NumberFormat("ar").format(count)}`,
    );
  });

  it("uses a single active form when the English value has plurals", () => {
    const catalogue = createMessageCatalogue(
      "ar",
      { "common.itemCount": "items: {count}" },
      EN_GB_CATALOGUE,
    );
    expect(catalogue.plural("common.itemCount", { count: 2 })).toBe(
      `items: ${new Intl.NumberFormat("ar").format(2)}`,
    );
  });

  it("uses the fallback language's plural rules for a missing value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const catalogue = createMessageCatalogue("ru", {}, EN_GB_CATALOGUE);

    expect(catalogue.plural("common.itemCount", { count: 21 })).toBe(
      `${new Intl.NumberFormat("ru").format(21)} items`,
    );
    expect(catalogue.plural("common.itemCount", { count: 1001 })).toBe(
      `${new Intl.NumberFormat("ru").format(1001)} items`,
    );
    warn.mockRestore();
  });

  it("uses a host-supplied fallback language's plural rules", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const catalogue = createMessageCatalogue(
      "en-GB",
      {},
      {
        ...EN_GB_CATALOGUE,
        "common.itemCount":
          "one{{count} предмет} few{{count} предмета} many{{count} предметов} other{{count} предмета}",
      },
      { fallbackLanguage: "ru" },
    );

    expect(catalogue.plural("common.itemCount", { count: 21 })).toBe(
      "21 предмет",
    );
    expect(catalogue.plural("common.itemCount", { count: 1001 })).toBe(
      `${new Intl.NumberFormat("en-GB").format(1001)} предмет`,
    );
    warn.mockRestore();
  });

  it("uses other for an absent category in an incomplete active value", () => {
    const catalogue = createMessageCatalogue(
      "ar",
      { "common.itemCount": "one{one} other{other}" },
      EN_GB_CATALOGUE,
    );
    expect(catalogue.plural("common.itemCount", { count: 2 })).toBe("other");
  });

  it("leaves an incomplete keyed value without other intact", () => {
    const catalogue = createMessageCatalogue(
      "ar",
      { "common.itemCount": "one{one}" },
      EN_GB_CATALOGUE,
    );
    expect(catalogue.plural("common.itemCount", { count: 2 })).toBe("one{one}");
  });

  it("substitutes a placeholder from params", () => {
    const catalogue = createMessageCatalogue(
      "en-GB",
      { ...EN_GB_CATALOGUE, "settings.title": "Hello {name}" },
      EN_GB_CATALOGUE,
    );
    expect(catalogue.t("settings.title", {})).toBe("Hello {name}");
  });

  it("leaves an unmatched placeholder untouched rather than throwing", () => {
    const catalogue = createMessageCatalogue(
      "en-GB",
      { ...EN_GB_CATALOGUE, "settings.notSaved": "Has a {missing} token." },
      EN_GB_CATALOGUE,
    );
    expect(catalogue.t("settings.notSaved", {})).toBe("Has a {missing} token.");
  });

  it("carries the given language", () => {
    expect(
      createMessageCatalogue("af", EN_GB_CATALOGUE, EN_GB_CATALOGUE).language,
    ).toBe("af");
  });

  it("carries host-defined layer template translations", () => {
    const layerTemplates = { "sample.area": "Area {name}" };
    const catalogue = createMessageCatalogue(
      "af",
      EN_GB_CATALOGUE,
      EN_GB_CATALOGUE,
      { layerTemplates },
    );

    expect(catalogue.layerTemplates).toBe(layerTemplates);
  });

  it("carries host-defined definition text translations, and none by default", () => {
    const definitionTexts = { "host.layer.name": "Riviere" };
    const catalogue = createMessageCatalogue(
      "af",
      EN_GB_CATALOGUE,
      EN_GB_CATALOGUE,
      { definitionTexts },
    );

    expect(catalogue.definitionTexts).toBe(definitionTexts);
    expect(
      createMessageCatalogue("af", EN_GB_CATALOGUE, EN_GB_CATALOGUE)
        .definitionTexts,
    ).toBeUndefined();
  });

  it("warns with a message naming the language and the missing key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const catalogue = createMessageCatalogue(
      "af",
      withoutKeys(["settings.title"]),
      EN_GB_CATALOGUE,
    );
    catalogue.t("settings.title", {});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("af"));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("settings.title"),
    );
    warn.mockRestore();
  });
});

describe("createMessageCatalogue parameter isolation", () => {
  const FSI = "\u2068";
  const PDI = "\u2069";
  const build = (language: string, options?: { isolateParameters?: boolean }) =>
    createMessageCatalogue(language, EN_GB_CATALOGUE, EN_GB_CATALOGUE, options);

  it("leaves text parameters as they are in a left-to-right language", () => {
    expect(
      build("en-GB").t("announce.pinDropped", { position: "-26.2, 28.0" }),
    ).toBe("Pin dropped at -26.2, 28.0");
  });

  it("isolates text parameters in a right-to-left language, so a name or a coordinate cannot reorder the sentence", () => {
    expect(
      build("ar").t("announce.pinDropped", { position: "-26.2, 28.0" }),
    ).toBe(`Pin dropped at ${FSI}-26.2, 28.0${PDI}`);
  });

  it("does not isolate numbers, which already follow their own digits", () => {
    expect(build("ar").plural("units.metre", { count: 5 })).not.toContain(FSI);
  });

  it("isolates each item of a list, then joins them", () => {
    const text = build("ar").t("announce.layersDidNotAnswer", {
      names: ["Rain", "Fire"],
    });
    expect(text.split(FSI).length - 1).toBe(2);
    expect(text).toContain(`${FSI}Rain${PDI}`);
  });

  it("follows the option over the language's direction", () => {
    expect(
      build("en-GB", { isolateParameters: true }).t("announce.pinDropped", {
        position: "x",
      }),
    ).toBe(`Pin dropped at ${FSI}x${PDI}`);
    expect(
      build("ar", { isolateParameters: false }).t("announce.pinDropped", {
        position: "x",
      }),
    ).toBe("Pin dropped at x");
  });

  it("isolates in plural forms too", () => {
    const records = {
      ...EN_GB_CATALOGUE,
      "units.metre": "{count} metre of {name}|{count} metres of {name}",
    };
    const catalogue = createMessageCatalogue("ar", records, records);
    expect(
      catalogue.plural("units.metre", { count: 2, name: "p" } as never),
    ).toContain(`${FSI}p${PDI}`);
  });
});
