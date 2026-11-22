// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { HEADER_LINKS } from "./headerLinks";
import { BASE_URL } from "./siteConfig";

it("has the product page's header links, in its order", () => {
  const host = readFileSync(
    new URL(
      "../../../packages/web/src/product/productContent.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const block = /export const HEADER_LINKS[^=]*=\s*\[([\s\S]*?)\];/.exec(host);
  const labels = [...(block?.[1] ?? "").matchAll(/text:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  expect(labels).toEqual(HEADER_LINKS.map(({ text }) => text));
});

it("links the documentation to this site's own base path", () => {
  expect(HEADER_LINKS.find(({ current }) => current)?.href).toBe(BASE_URL);
});
