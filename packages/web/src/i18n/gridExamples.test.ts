// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EN_GB_CATALOGUE, parseCoordinates } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { AF_CATALOGUE } from "./af";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

/** A UTM example as the help and the guide print it: zone, letter, easting, northing. */
const UTM_EXAMPLE = /\b\d{1,2} ?[A-Z] \d{6} \d{6,7}\b/g;

/** An MGRS example in the spaced form, `31U CT 12345 67890`. */
const MGRS_SPACED_EXAMPLE = /\b\d{1,2}[A-Z] [A-Z]{2} \d{3,5} \d{3,5}\b/g;

/** An MGRS example written together, `11SPA7234911844`. */
const MGRS_COMPACT_EXAMPLE = /\b\d{1,2}[A-Z]{3}\d{4,10}\b/g;

function examplesIn(text: string): string[] {
  return [UTM_EXAMPLE, MGRS_SPACED_EXAMPLE, MGRS_COMPACT_EXAMPLE].flatMap(
    (pattern) => text.match(pattern) ?? [],
  );
}

function expectEveryExampleToRead(source: string, text: string): void {
  const examples = examplesIn(text);
  expect(examples.length, `${source} prints an example`).toBeGreaterThan(0);
  for (const example of examples) {
    expect(parseCoordinates(example), `${source}: ${example}`).not.toBeNull();
  }
}

describe("the grid reference examples that are printed for people", () => {
  it("in the English help text all read", () => {
    expectEveryExampleToRead(
      "en-GB panels.help.searchDescription",
      EN_GB_CATALOGUE["panels.help.searchDescription"],
    );
  });

  it("in the Afrikaans help text all read", () => {
    expectEveryExampleToRead(
      "af panels.help.searchDescription",
      AF_CATALOGUE["panels.help.searchDescription"],
    );
  });

  it("in the reference site guide all read", () => {
    const guide = readFileSync(
      path.join(REPO, "sites/docs/docs/guides/using-the-reference-site.md"),
      "utf8",
    );
    const examples = guide
      .split("\n")
      .filter((line) => /UTM|MGRS/.test(line))
      .flatMap((line) => line.match(/`[^`]+`/g) ?? [])
      .map((span) => span.slice(1, -1));
    const grid = examples.flatMap((example) => examplesIn(example));
    expect(grid.length).toBeGreaterThan(3);
    for (const example of grid) {
      expect(
        parseCoordinates(example),
        `using-the-reference-site.md: ${example}`,
      ).not.toBeNull();
    }
  });
});
