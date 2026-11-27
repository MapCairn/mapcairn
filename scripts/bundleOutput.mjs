// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The ids of the modules that reached the output of a bundler build, from the
 * chunks of its bundle (a stylesheet or other asset names none).
 *
 * @param {Record<string, { type: string, modules?: Record<string, unknown> }>} bundle
 * @returns {string[]} Each id once.
 */
export function moduleIdsOf(bundle) {
  const ids = new Set();
  for (const file of Object.values(bundle)) {
    if (file.type === "chunk") {
      for (const id of Object.keys(file.modules ?? {})) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

/**
 * What the bundle's stylesheet starts with, for every element of a mounted map
 * (below the container the mount marks with `data-mapcairn`), in four parts.
 *
 * 1. The browser's own defaults in place of any rule the page wrote for that
 *    element, such as `* { margin: 0 }`, `button { height: 2rem }` or a global
 *    `box-sizing` (`all: revert`). The interface's rules come after it and set
 *    what they need, so only a property the interface leaves to the browser
 *    comes back to the default. `all` leaves custom properties and `direction`
 *    alone, so the theme and the reading direction pass through. Drawings are
 *    left out: an icon's or a shape's `fill`, `stroke` and geometry are
 *    presentation attributes, which `all` would discard.
 * 2. What the reference host's base styles give: `box-sizing: border-box` on
 *    every element and pseudo-element, and the default focus ring for anything
 *    a component has not styled (`packages/web/src/global.css.ts`).
 * 3. An icon's `fill` and `stroke` back, because a page's `svg` rule would
 *    otherwise set them on an icon (`fill="currentColor"` and no stroke is
 *    how it is drawn).
 * 4. The container's own text: the host's body font, size, line height,
 *    tracking, weight and colour, which a plain page does not have, and no
 *    text transform or alignment. An inherited property of the page that a
 *    component does not set itself still reaches the interface (a rule on the
 *    container with an id, or from an ancestor that part 4 does not name).
 *
 * The first three have the specificity of a class (`:where` adds none), so a
 * page rule that names an attribute, a class, an id or a state beats them, as
 * it beats any other rule, when it comes later or is more specific.
 *
 * @param {{ tokens: any, focusRing: { outline: string, outlineOffset: string } }} theme `tokens` and `focusRing` of `@mapcairn/theme`, whose values are custom property references.
 * @returns {string}
 */
export function pageReset({ tokens, focusRing }) {
  return [
    "[data-mapcairn] *:where(:not(svg,svg *)){all:revert}",
    "[data-mapcairn],[data-mapcairn] *,[data-mapcairn] *::before,[data-mapcairn] *::after{box-sizing:border-box}",
    `[data-mapcairn] :where(:focus-visible){outline:${focusRing.outline};outline-offset:${focusRing.outlineOffset}}`,
    "[data-mapcairn] svg[fill=currentColor]{fill:currentColor;stroke:none}",
    `[data-mapcairn]{font-family:${tokens.type.family};font-size:${tokens.type.body.size};line-height:${tokens.type.body.lineHeight};letter-spacing:${tokens.type.body.tracking};font-weight:${tokens.type.weight.regular};color:${tokens.color.text};text-transform:none;text-align:start}`,
  ].join("");
}

/** A scan of CSS text outside strings and comments, which is where braces and semicolons count. */
function* structuralCharacters(css) {
  let quote = "";
  for (let at = 0; at < css.length; at += 1) {
    const character = css[at];
    if (quote !== "") {
      if (character === "\\") {
        at += 1;
      } else if (character === quote) {
        quote = "";
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "/" && css[at + 1] === "*") {
      at = css.indexOf("*/", at + 2) + 1 || css.length;
    } else {
      yield [character, at];
    }
  }
}

/**
 * The stylesheet with its cascade layers taken apart: each `@layer` block is
 * replaced by its rules, which are put first, in their order, and each layer
 * statement (`@layer name;`) is dropped. A layer ranks below every rule that is
 * in none, the page's included, whatever the specificity, which is what an app
 * wants for the primitives and not what a page with its own rules should get,
 * so the bundle's rules are all outside any layer and meet the page's by
 * specificity. Putting the layered rules first keeps them below the rest of
 * the interface's rules at equal specificity, as the layer did.
 *
 * @param {string} css
 * @returns {string}
 */
export function withoutLayers(css) {
  const hoisted = [];
  let rest = "";
  let copiedTo = 0;
  let depth = 0;
  let blockStart = -1;
  let ruleStart = 0;
  const startsLayer = (/** @type {number} */ end) =>
    css
      .slice(ruleStart, end)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim()
      .startsWith("@layer");
  for (const [character, at] of structuralCharacters(css)) {
    if (character === "{") {
      if (depth === 0 && startsLayer(at)) {
        blockStart = at;
        rest += css.slice(copiedTo, ruleStart);
      }
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        if (blockStart !== -1) {
          hoisted.push(css.slice(blockStart + 1, at));
          copiedTo = at + 1;
          blockStart = -1;
        }
        ruleStart = at + 1;
      }
    } else if (character === ";" && depth === 0 && startsLayer(at)) {
      rest += css.slice(copiedTo, ruleStart);
      copiedTo = at + 1;
      ruleStart = at + 1;
    } else if (character === ";" && depth === 0) {
      ruleStart = at + 1;
    }
  }
  return `${hoisted.join("")}${rest}${css.slice(copiedTo)}`;
}

/**
 * The bundle's stylesheet: the reset ({@link pageReset}), then the engine's own rules, so
 * the interface's rules, which come after, win where they meet, then the
 * interface's rules with no cascade layer left in them
 * ({@link withoutLayers}).
 *
 * @param {string} engineRules The engine's stylesheet.
 * @param {{ type: string, source?: unknown } | undefined} asset The stylesheet asset of the bundle.
 * @param {string} name The stylesheet's file name, for the message.
 * @param {string} reset What the stylesheet starts with (`pageReset`).
 * @returns {string}
 * @throws {Error} When the bundle has no stylesheet to merge into.
 */
export function mergedStylesheet(engineRules, asset, name, reset) {
  if (asset === undefined || asset.type !== "asset") {
    throw new Error(
      `The bundle has no ${name} to merge the engine's stylesheet into.`,
    );
  }
  return `${reset}\n${engineRules}\n${withoutLayers(String(asset.source))}`;
}

/**
 * A copied script without its closing `//# sourceMappingURL=` line, which
 * names a map the package does not ship.
 *
 * @param {string} text
 * @returns {string}
 */
export function withoutSourceMapComment(text) {
  return text.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, "\n");
}
