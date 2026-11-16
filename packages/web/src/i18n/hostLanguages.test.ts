// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE } from "@mapcairn/core";
import { describe, expect, it, vi } from "vitest";
import { AF_CATALOGUE } from "./af";
import {
  DEFAULT_LANGUAGE,
  HOST_LANGUAGE_CATALOGUE,
  loadLanguage,
  OFFERED_LANGUAGE_TAGS,
  OFFERED_LANGUAGES,
} from "./hostLanguages";

describe("the host's languages", () => {
  it("offers English, named in English, as the default", () => {
    expect(OFFERED_LANGUAGES).toEqual([{ tag: "en-GB", label: "English" }]);
    expect(OFFERED_LANGUAGE_TAGS).toEqual(["en-GB"]);
    expect(HOST_LANGUAGE_CATALOGUE.defaultLanguage).toBe(DEFAULT_LANGUAGE);
  });

  it("loads the default language straight away, from the English catalogue", () => {
    const messages = HOST_LANGUAGE_CATALOGUE.load("en-GB");
    expect(messages).not.toBeInstanceOf(Promise);
    const loaded = messages as Awaited<typeof messages>;
    expect(loaded.language).toBe("en-GB");
    expect(loaded.t("settings.title", {})).toBe(
      EN_GB_CATALOGUE["settings.title"],
    );
  });

  it("loads Afrikaans on demand, falling back to English for a key it lacks", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pending = loadLanguage("af");
    expect(pending).toBeInstanceOf(Promise);
    const messages = await pending;
    expect(messages.language).toBe("af");
    expect(messages.t("settings.title", {})).toBe(
      AF_CATALOGUE["settings.title"] ?? EN_GB_CATALOGUE["settings.title"],
    );
    warn.mockRestore();
  });

  it("refuses a language it has no messages for", () => {
    expect(() => loadLanguage("fr")).toThrow('no messages for "fr"');
  });
});
