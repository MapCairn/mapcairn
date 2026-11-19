// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { parseTemplate, resolveLayerTemplate } from "@mapcairn/core";
import { describe, expect, it, vi } from "vitest";
import { AF_DEFINITION_TEXTS } from "./afDefinitionTexts";
import { AF_LAYER_TEMPLATES } from "./afLayerTemplates";
import { loadLanguage } from "./hostLanguages";

const modules = import.meta.glob<unknown>("../layers/definitions/**/*.ts", {
  eager: true,
  import: "default",
});

/** Every `{ key, text }` template a definition carries, found wherever it sits. */
function keyedTemplates(
  value: unknown,
  found: Map<string, string> = new Map(),
): Map<string, string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      keyedTemplates(item, found);
    }
    return found;
  }
  if (typeof value !== "object" || value === null) {
    return found;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.key === "string" && typeof record.text === "string") {
    found.set(record.key, record.text);
    return found;
  }
  for (const child of Object.values(record)) {
    keyedTemplates(child, found);
  }
  return found;
}

/** A host text has the same shape as a template but is translated from `definitionTexts`. */
const SOURCES = new Map(
  [...keyedTemplates(Object.values(modules))].filter(
    ([key]) => !Object.hasOwn(AF_DEFINITION_TEXTS, key),
  ),
);
const signature = (template: string) =>
  parseTemplate(template)
    .map(({ name, formatter }) => `${name}|${formatter ?? ""}`)
    .sort();

describe("the Afrikaans layer templates", () => {
  it("translates every keyed template the definitions carry, and nothing else", () => {
    expect(SOURCES.size).toBeGreaterThan(0);
    expect(Object.keys(AF_LAYER_TEMPLATES).sort()).toEqual(
      [...SOURCES.keys()].sort(),
    );
  });

  it("keeps every field and formatter of the source, and differs from it", () => {
    for (const [key, text] of SOURCES) {
      const translation = AF_LAYER_TEMPLATES[key] as string;
      expect(signature(translation), key).toEqual(signature(text));
      expect(translation, key).not.toBe(text);
    }
  });

  it("is loaded with Afrikaans, resolves each template without a warning, and leaves English alone", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const af = await loadLanguage("af");
    for (const [key, text] of SOURCES) {
      expect(resolveLayerTemplate({ key, text }, af), key).toBe(
        AF_LAYER_TEMPLATES[key],
      );
    }
    const en = await loadLanguage("en-GB");
    for (const [key, text] of SOURCES) {
      expect(resolveLayerTemplate({ key, text }, en), key).toBe(text);
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
