// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function read(file: string): string {
  return readFileSync(path.join(REPO, file), "utf8");
}

/** The reference site's note on its public services, read as text so a guide cannot drift from it. */
function publicServicesNote(): string {
  const source = read("packages/web/src/product/productContent.ts");
  const match = /export const PUBLIC_SERVICES_NOTE =\s*"([^"]+)"/.exec(source);
  expect(
    match,
    "PUBLIC_SERVICES_NOTE is a plain string constant",
  ).not.toBeNull();
  return match?.[1] ?? "";
}

describe("the note on the reference site's public services", () => {
  it("is in the guide to the reference site, word for word", () => {
    expect(
      read("sites/docs/docs/guides/using-the-reference-site.md"),
    ).toContain(publicServicesNote());
  });
});

describe("Get started", () => {
  const guide = read("sites/docs/docs/get-started.md");

  it("points its next steps to writing a real search provider", () => {
    expect(guide).toContain("guides/extending.md#write-a-search-provider");
  });

  it("says the reference site's search is a demo service", () => {
    expect(guide).toContain("using-the-reference-site.md");
  });
});
