// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { checkDefinitionTexts } from "@mapcairn/core";
import { describe, expect, it, vi } from "vitest";
import { LAYER_DEFINITIONS } from "../layers";
import { AF_DEFINITION_TEXTS } from "./afDefinitionTexts";
import { loadLanguage } from "./hostLanguages";

describe("the Afrikaans definition texts", () => {
  it("translate every host text the definitions carry, and nothing else", () => {
    expect(
      checkDefinitionTexts(LAYER_DEFINITIONS, AF_DEFINITION_TEXTS),
    ).toEqual([]);
    expect(Object.keys(AF_DEFINITION_TEXTS).length).toBeGreaterThan(0);
  });

  it("are loaded with Afrikaans and resolve without a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const messages = await loadLanguage("af");
    expect(messages.definitionTexts).toBe(AF_DEFINITION_TEXTS);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
