// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../docusaurus.config";

/** The icon link the site puts in every page's head. */
function iconHref(): string {
  const link = (config.headTags ?? []).find(
    (tag) => typeof tag === "object" && tag.attributes?.rel === "icon",
  );
  return (link as { attributes: { href: string } }).attributes.href;
}

describe("the site's icon", () => {
  it("is a file the site serves, so no page asks for one that is not there", () => {
    expect(() =>
      readFileSync(new URL(`../static${iconHref()}`, import.meta.url)),
    ).not.toThrow();
  });

  it("is the reference site's own icon, byte for byte", () => {
    const own = readFileSync(
      new URL(`../static${iconHref()}`, import.meta.url),
    );
    const reference = readFileSync(
      new URL(`../../../packages/web/public${iconHref()}`, import.meta.url),
    );
    expect(own.equals(reference)).toBe(true);
  });
});
