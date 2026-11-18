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
});

describe("createMessageCatalogue", () => {
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
