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
  it("offers English, the default, then Afrikaans, each named in its own language", () => {
    expect(OFFERED_LANGUAGES).toEqual([
      { tag: "en-GB", label: "English" },
      { tag: "af", label: "Afrikaans" },
    ]);
    expect(OFFERED_LANGUAGE_TAGS).toEqual(["en-GB", "af"]);
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

  it("loads Afrikaans on demand, with no key falling back to English", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pending = loadLanguage("af");
    expect(pending).toBeInstanceOf(Promise);
    const messages = await pending;
    expect(messages.language).toBe("af");
    expect(messages.t("settings.title", {})).toBe("Instellings");
    expect(messages.plural("announce.searchResults", { count: 2 })).toBe(
      "2 resultate",
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("offers Afrikaans through the catalogue the services get", async () => {
    const messages = await HOST_LANGUAGE_CATALOGUE.load("af");
    expect(messages.t("tools.search.places", {})).toBe(
      AF_CATALOGUE["tools.search.places"],
    );
  });

  it("refuses a language it has no messages for", () => {
    expect(() => loadLanguage("fr")).toThrow('no messages for "fr"');
  });
});
