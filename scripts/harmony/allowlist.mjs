// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Justified, one-off exceptions to the harmony rules.
 *
 * Every entry names a rule, a file and a snippet of the offending line, and
 * gives a reason. The snippet (not a line number) keeps the entry valid when
 * code above it moves. An entry that no longer matches anything fails
 * `npm run lint:harmony`, so the list cannot rot.
 *
 * Keep it short. If a pattern appears twice, the rule or the component needs
 * to change instead.
 *
 * @type {ReadonlyArray<{ rule: string, file: string, contains: string, reason: string }>}
 */
export const ALLOW_LIST = [
  {
    rule: "spacing",
    file: "packages/map/src/ui/VisuallyHidden/VisuallyHidden.css.ts",
    contains: "margin: -1",
    reason:
      "The standard screen-reader-only clip pattern needs a -1px margin next to its 1px box.",
  },
  {
    rule: "position",
    file: "packages/web/src/global.css.ts",
    contains: 'position: "fixed"',
    reason:
      "The document itself (html and body) is pinned to the viewport so the full-screen map never scrolls or rubber-bands. It is the page root, not a floating surface.",
  },
];
