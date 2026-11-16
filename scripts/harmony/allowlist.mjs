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
  {
    rule: "logical-property",
    file: "packages/map/src/chrome/MapChrome/MapChrome.css.ts",
    contains: "transform: `translate(",
    reason: "Interim: converted to logical properties later in this change.",
  },
  {
    rule: "logical-property",
    file: "packages/map/src/chrome/MapReadout/MapReadout.css.ts",
    contains: 'transformOrigin: "left center",',
    reason: "Interim: converted to logical properties later in this change.",
  },
  {
    rule: "logical-property",
    file: "packages/map/src/chrome/MapReadout/MapReadout.css.ts",
    contains:
      "transform: `translateX(calc(var(--scale-ratio, 0) * var(--scale-max, 0px) - ",
    reason: "Interim: converted to logical properties later in this change.",
  },
  {
    rule: "logical-property",
    file: "packages/map/src/chrome/Sheet/Sheet.css.ts",
    contains: 'right: "env(safe-area-inset-right, 0px)",',
    reason: "Interim: converted to logical properties later in this change.",
  },
  {
    rule: "logical-property",
    file: "packages/map/src/chrome/Sheet/Sheet.css.ts",
    contains: 'left: "env(safe-area-inset-left, 0px)",',
    reason: "Interim: converted to logical properties later in this change.",
  },
  {
    rule: "logical-property",
    file: "packages/map/src/chrome/Sheet/Sheet.css.ts",
    contains: 'transform: "translateX(0)",',
    reason: "Interim: converted to logical properties later in this change.",
  },
  {
    rule: "logical-property",
    file: "packages/map/src/chrome/Sheet/Sheet.css.ts",
    contains: "transform: `translateX(calc(-1 * ",
    reason: "Interim: converted to logical properties later in this change.",
  },
  {
    rule: "logical-property",
    file: "packages/map/src/host/MapView.css.ts",
    contains: 'from: { transform: "translateX(-100%)" },',
    reason: "Interim: converted to logical properties later in this change.",
  },
  {
    rule: "logical-property",
    file: "packages/map/src/host/MapView.css.ts",
    contains: 'to: { transform: "translateX(250%)" },',
    reason: "Interim: converted to logical properties later in this change.",
  },
  {
    rule: "logical-property",
    file: "packages/map/src/ui/Slider/Slider.css.ts",
    contains: "backgroundImage: `linear-gradient(to right, ",
    reason: "Interim: converted to logical properties later in this change.",
  },
  {
    rule: "logical-property",
    file: "packages/map/src/ui/Switch/Switch.css.ts",
    contains: "transform: `translateX(",
    reason: "Interim: converted to logical properties later in this change.",
  },
];
