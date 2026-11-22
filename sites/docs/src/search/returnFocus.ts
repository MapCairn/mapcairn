// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * Whether focus has nowhere useful to be after the search dialog closes. A
 * modal dialog hands focus back to the element that had it when it opened, so
 * a dialog opened with `/` from the bare page hands it back to the body, and a
 * keyboard user starts again from the top of the page. The page's body, the
 * root and nothing at all count as nowhere; any other element is a place the
 * reader chose, and keeps focus.
 * @param active - The element that has focus once the dialog has closed.
 * @param page - The page's body and root element.
 */
export function focusIsLost(
  active: unknown,
  page: { readonly body: unknown; readonly documentElement: unknown },
): boolean {
  return (
    active === null ||
    active === undefined ||
    active === page.body ||
    active === page.documentElement
  );
}

/**
 * The id of the heading a search result points at, when the result is on the
 * page being read. Following such a link only scrolls, so focus has to be sent
 * to the heading by hand; a link to another page loads it and needs nothing.
 * @param href - The result's address, with its hash.
 * @param current - The page being read.
 */
export function sameDocumentTarget(
  href: string,
  current: { readonly pathname: string },
): string | null {
  const url = new URL(href, "https://docs.invalid");
  if (url.pathname !== current.pathname || url.hash.length <= 1) {
    return null;
  }
  return decodeURIComponent(url.hash.slice(1));
}
