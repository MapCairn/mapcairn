// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE, type MessageKey } from "@mapcairn/core";

/** Where the product name goes in a tab title: "MapCairn | Page" or "Page | MapCairn". */
export type TitleBrandPosition = "first" | "last";

/** The product name in a tab title, spelt the same in every language. */
const BRAND = "MapCairn";

/** The separator between the product name and the page's name in a tab title. */
const SEPARATOR = " | ";

/**
 * What a route exports as `handle` to have its browser tab title follow the
 * language: the catalogue key of the page's name, and where the product name
 * goes. The route's `meta` keeps the English title for the server render,
 * link previews and crawlers.
 * @remarks The title is composed here rather than held in the catalogue,
 *   because a catalogue string may not contain `|`, which separates plural forms.
 */
export interface PageTitleHandle {
  readonly titleKey: MessageKey;
  readonly brand: TitleBrandPosition;
}

/** The tab title of the map page, "MapCairn | Interactive map" in English. */
export const MAP_TITLE: PageTitleHandle = {
  titleKey: "host.title.map",
  brand: "first",
};

/** The tab title of the privacy page, "Privacy policy | MapCairn" in English. */
export const PRIVACY_TITLE: PageTitleHandle = {
  titleKey: "privacy.title",
  brand: "last",
};

/** Joins the page's name and the product name into a tab title. */
export function composeTitle(page: string, brand: TitleBrandPosition): string {
  return brand === "first"
    ? `${BRAND}${SEPARATOR}${page}`
    : `${page}${SEPARATOR}${BRAND}`;
}

/** The English tab title a route's `meta` gives, for the server render and for crawlers. */
export function englishTitle({ titleKey, brand }: PageTitleHandle): string {
  return composeTitle(EN_GB_CATALOGUE[titleKey], brand);
}

/** Whether `handle` is a {@link PageTitleHandle} naming a key the catalogue holds. */
function isPageTitleHandle(handle: unknown): handle is PageTitleHandle {
  if (typeof handle !== "object" || handle === null) {
    return false;
  }
  const { titleKey, brand } = handle as {
    readonly titleKey?: unknown;
    readonly brand?: unknown;
  };
  return (
    typeof titleKey === "string" &&
    Object.hasOwn(EN_GB_CATALOGUE, titleKey) &&
    (brand === "first" || brand === "last")
  );
}

/**
 * The title handle of the deepest route in `matches` that has one, or
 * `undefined` when none does, so a page with no handle keeps its title.
 */
export function pageTitleHandle(
  matches: ReadonlyArray<{ readonly handle?: unknown }>,
): PageTitleHandle | undefined {
  return matches
    .map(({ handle }) => handle)
    .filter(isPageTitleHandle)
    .at(-1);
}
