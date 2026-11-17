// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { productMarkdown } from "../product/productMarkdown";
import { staticTextResponse } from "./staticTextResponse";

const PRODUCT_MARKDOWN = productMarkdown();

/**
 * React Router resource route: `/index.md`, the product page's text as
 * Markdown, rendered from the same content as the page and linked from it
 * with `<link rel="alternate" type="text/markdown">`.
 */
export function loader(): Response {
  return staticTextResponse(PRODUCT_MARKDOWN, "text/markdown; charset=utf-8");
}
