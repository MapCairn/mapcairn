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
    rule: "outline",
    file: "packages/map/src/ui/Slider/Slider.css.ts",
    contains: '"&:focus-visible": { outline: "none" }',
    reason:
      "The thumb box is the hit area. The visible thumb circle inside it carries the focusRing token (see the `:focus-visible > &` rule below).",
  },
  {
    rule: "spacing",
    file: "packages/map/src/ui/VisuallyHidden/VisuallyHidden.css.ts",
    contains: "margin: -1",
    reason:
      "The standard screen-reader-only clip pattern needs a -1px margin next to its 1px box.",
  },
  {
    rule: "engine-selector",
    file: "packages/web/src/adapters/leaflet/LeafletMapAdapter.ts",
    contains: "leaflet-control-container",
    reason:
      "The adapter finds Leaflet's own control container to hide it from assistive technology. It reads the node, it does not style it.",
  },
];
