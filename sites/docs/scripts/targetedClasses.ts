// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The framework's class names, and the start of its hashed module class names
 * (`docRoot_` and so on), that `src/css/custom.css` selects. They are the
 * framework's, not the site's, so a release can rename one; `verifyBuild.ts`
 * fails the build when a built page no longer carries a name listed here, and
 * the stylesheet then needs the new one.
 */
export const TARGETED_CLASSES: readonly string[] = [
  "navbar__inner",
  "navbar__items--right",
  "navbar__link",
  "navbar__brand",
  "navbar__title",
  "footer__link-item",
  "footer__copyright",
  "footer__bottom",
  "menu__link",
  "table-of-contents__link",
  "breadcrumbs__link",
  "theme-code-block",
  "theme-doc-footer-edit-meta-row",
  "docRoot_",
  "toggleButton",
  "tocCollapsibleButton",
];
