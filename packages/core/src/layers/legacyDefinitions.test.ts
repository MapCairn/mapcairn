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
 * breaking change to the public API (`docs/guides/public-api.md`), even when
 * no type changes. Add a file when a kind or a new accepted field ships;
 * remove one only in a release that says so.
 */
const FILES = readdirSync(FOLDER).filter((file) => file.endsWith(".json"));

describe("layer definitions a host has already written", () => {
  it("holds a fixture for every kind of definition", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(7);
  });

  it.each(FILES)("still validates %s", (file) => {
    const definition: unknown = JSON.parse(
      readFileSync(path.join(FOLDER, file), "utf8"),
    );
    expect(
      validateLayerDefinition(definition, {
        decoders: createDecoderRegistry(),
        formatters: createFormatterRegistry(),
      }),
    ).toEqual([]);
  });
});
