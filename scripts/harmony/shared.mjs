// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/** What the JSX and style rules share with the Lit template rules. */

/** @typedef {(rule: string, line: number, message: string) => void} Report */

const COLOUR =
  /#[0-9a-fA-F]{3,8}\b|(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;

/** The attributes that give a button or an icon an accessible name. */
export const NAME_ATTRS = ["aria-label", "aria-labelledby", "title"];

/** What to say about a button that nothing names. */
export const ICON_ONLY_BUTTON_MESSAGE =
  "A button with only an icon has no accessible name. Use IconButton with a label, or add aria-label.";

/** What to say about a live region made outside the components that own them. */
export const LIVE_REGION_MESSAGE =
  "Live regions are created only by LiveRegion and StatusMessage in packages/map/src/ui. Announce through the useAnnounce hook.";

/** What to say about a `tabindex` above 0. */
export const TAB_INDEX_MESSAGE =
  "A tabindex above 0 breaks the natural focus order. Use 0 or -1.";

/**
 * Checks colour literals in the string and template tokens of a style region.
 * @param {Array<Pick<import("./lex.mjs").Token, "t" | "v" | "line">>} tokens
 * @param {Report} report
 */
export function checkColours(tokens, report) {
  for (const tok of tokens) {
    const hit =
      tok.t === "str" || tok.t === "tpl" ? COLOUR.exec(tok.v)?.[0] : undefined;
    if (hit !== undefined) {
      report(
        "colour-literal",
        tok.line,
        `Colour literal "${hit}". Use a tokens.color role.`,
      );
    }
  }
}
