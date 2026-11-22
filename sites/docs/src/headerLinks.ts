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
