// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProductRoute, { handle } from "./product";

describe("product route", () => {
  it("renders the product page on the server, with no map in it", () => {
    const html = renderToString(<ProductRoute />);
    expect(html).toContain('data-testid="product-page"');
    expect(html).not.toContain("map-placeholder");
    expect(html).not.toContain("data-map-host");
  });

  it("keeps the document in English, whatever the playground speaks", () => {
    expect(handle).toEqual({ language: "en-GB" });
  });
});
