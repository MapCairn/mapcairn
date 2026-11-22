// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDecoderRegistry } from "./decoders";
import { createFormatterRegistry } from "./formatters";
import { validateLayerDefinition } from "./validate";

const FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "legacyDefinitions",
);

/**
 * Layer definitions a host may already have written, one JSON file for each
 * kind, frozen. This folder only grows: a validator change that rejects one
 * of them breaks every host that wrote a definition like it, so it is a
 * breaking change to the public API (`sites/docs/docs/guides/public-api.md`), even when
 * no type changes. Add a file when a kind or a new accepted field ships;
 * remove one only in a release that says so.
 */
const FILES = readdirSync(FOLDER).filter((file) => file.endsWith(".json"));

const DEFINITION_TYPES = readFileSync(
  path.join(FOLDER, "..", "definition.ts"),
  "utf8",
);

function fixture(file: string): unknown {
  return JSON.parse(readFileSync(path.join(FOLDER, file), "utf8"));
}

/** Every string a `kind` property holds, at any depth. */
function kindsIn(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(kindsIn);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, item]) =>
    key === "kind" && typeof item === "string" ? [item] : kindsIn(item),
  );
}

describe("layer definitions a host has already written", () => {
  it("holds a fixture that uses every kind the definition types name", () => {
    const declared = new Set(
      [...DEFINITION_TYPES.matchAll(/readonly kind: "([^"]+)";/g)].map(
        (match) => match[1],
      ),
    );
    const used = new Set(FILES.flatMap((file) => kindsIn(fixture(file))));
    expect([...declared].filter((kind) => !used.has(kind as string))).toEqual(
      [],
    );
  });

  it.each(FILES)("still validates %s", (file) => {
    expect(
      validateLayerDefinition(fixture(file), {
        decoders: createDecoderRegistry(),
        formatters: createFormatterRegistry(),
      }),
    ).toEqual([]);
  });
});
