// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { REPOSITORY_URL } from "./siteConfig";

/** One link of the header: its label and where it goes. */
export interface HeaderLink {
  readonly text: string;
  readonly href: string;
  /** True for the page of this site, which is marked as the current one. */
  readonly current?: boolean;
}

/**
 * The header's three links, in the order the product page's header has them
 * (`HEADER_LINKS` in `packages/web/src/product/productContent.ts`): the
 * playground, the documentation and the repository. `headerLinks.test.ts`
 * keeps the labels and the order equal to the product page's.
 */
export const HEADER_LINKS: readonly HeaderLink[] = [
  { text: "Playground", href: "/map" },
  { text: "Docs", href: "/docs/", current: true },
  { text: "GitHub", href: REPOSITORY_URL },
];

/**
 * The `aria-current` value for a header link. The Docs link stands for a whole
 * section, so on any page inside it the value is `true` (the current section)
 * and only on its own front page is it `page`, which says this very page.
 * @param link - The header link.
 * @param pathname - The path of the page being read.
 */
export function ariaCurrentFor(
  link: HeaderLink,
  pathname: string,
): "page" | "true" | undefined {
  if (!link.current) {
    return undefined;
  }
  return pathname === link.href ? "page" : "true";
}
