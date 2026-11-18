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
  createWith: (language, values) =>
    createMessageCatalogue(language, values, EN_GB_CATALOGUE),
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
