// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ADAPTERS = path.dirname(fileURLToPath(import.meta.url));

/**
 * The ways a body is read that this check looks for: the four `Response`
 * readers, `formData`, and a hand-rolled read of the stream. A provider's
 * body is read through `readJsonWithin` and nothing else, so it stops at a
 * byte limit.
 */
const BODY_READ = /\.(?:json|text|arrayBuffer|blob|formData|getReader)\s*\(/;

/**
 * The files that may read a body without `readJsonWithin`, each with the
 * reason. An entry that no longer matches anything fails the check, so the
 * list cannot go stale.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  "shared/readJson.ts":
    "It is the bounded reader: it reads the stream a chunk at a time and stops at the limit.",
  "files/BrowserFileOpener.ts":
    "It reads a file the person chose on their own device, not a provider's answer, after refusing one larger than the limit the caller gave.",
};

/** One body read found in a source: the line number and the line. */
interface BodyRead {
  readonly line: number;
  readonly text: string;
}

/** Whether a line is only a comment, so a body read named in prose is not one. */
function isCommentLine(line: string): boolean {
  return /^\s*(?:\/\/|\/\*|\*(?:\s|\/|$))/.test(line);
}

/**
 * The body reads in `source`, skipping lines that are only a comment. A read
 * after code on the same line as a comment is still reported, because the
 * check fails closed: a false finding is cleared by a change or an entry in
 * the list above, a missed read is not found at all.
 */
function findBodyReads(source: string): BodyRead[] {
  return source.split("\n").flatMap((text, index) => {
    if (isCommentLine(text) || !BODY_READ.test(text)) {
      return [];
    }
    return [{ line: index + 1, text: text.trim() }];
  });
}

/** Every adapter source file under `directory`, as paths relative to the adapters. */
function adapterSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return adapterSources(full);
    }
    const isSource =
      /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name);
    return isSource
      ? [path.relative(ADAPTERS, full).split(path.sep).join("/")]
      : [];
  });
}

describe("the body read scanner", () => {
  it.each([
    ["json", "const body = await response.json();"],
    ["text", "const text = await res.text();"],
    ["arrayBuffer", "const bytes = await response.arrayBuffer();"],
    ["blob", "const blob = await response.blob();"],
    ["formData", "const form = await response.formData();"],
    ["a stream reader", "const reader = response.body?.getReader();"],
    ["a call split from its dot", "await response\n  .json();"],
    ["a space before the call", "await response.json ();"],
    ["code before a trailing comment", "await r.json(); // read it"],
  ])("finds %s", (_name, source) => {
    expect(findBodyReads(source)).toHaveLength(1);
  });

  it.each([
    ["a line comment", "// the body is read with .json() here"],
    ["a block comment", "/* then .text() */"],
    ["a doc comment line", " * Reads it with `File.text()`."],
    ["the end of a block comment", " */"],
    ["the bounded reader", "const body = await readJsonWithin(response, max);"],
    ["a property that only shares a name", "const json = response.jsonBody;"],
  ])("leaves %s alone", (_name, source) => {
    expect(findBodyReads(source)).toEqual([]);
  });

  it("reports the line of each read", () => {
    const source =
      "const a = 1;\nawait r.json();\n// r.text()\nawait r.blob();";
    expect(findBodyReads(source).map((read) => read.line)).toEqual([2, 4]);
  });
});

describe("the adapters' body reads", () => {
  const sources = adapterSources(ADAPTERS);

  it("finds the adapters it is meant to hold", () => {
    expect(sources).toEqual(
      expect.arrayContaining([
        "search/NominatimSearchProvider.ts",
        "search/PhotonSuggestionProvider.ts",
        "routing/ValhallaRoutingProvider.ts",
        "layers/FetchLayerSource.ts",
        "shared/readJson.ts",
      ]),
    );
  });

  it("reads no provider body except through readJsonWithin", () => {
    const unbounded = sources
      .filter((file) => !(file in EXEMPT))
      .flatMap((file) =>
        findBodyReads(readFileSync(path.join(ADAPTERS, file), "utf8")).map(
          (read) => `${file}:${read.line}: ${read.text}`,
        ),
      );
    expect(unbounded).toEqual([]);
  });

  it("keeps every exemption in use and explained", () => {
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(sources, `${file} is exempt but is not an adapter file`).toContain(
        file,
      );
      expect(
        findBodyReads(readFileSync(path.join(ADAPTERS, file), "utf8")).length,
        `${file} is exempt but reads no body`,
      ).toBeGreaterThan(0);
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(20);
    }
  });

  it("reads each provider answer through readJsonWithin", () => {
    for (const file of [
      "search/NominatimSearchProvider.ts",
      "search/PhotonSuggestionProvider.ts",
      "routing/ValhallaRoutingProvider.ts",
      "layers/FetchLayerSource.ts",
    ]) {
      expect(readFileSync(path.join(ADAPTERS, file), "utf8"), file).toContain(
        "readJsonWithin(",
      );
    }
  });
});
