// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The harmony rules that need a Lit template read as markup: `inline-style`,
 * `colour-literal`, `icon-only-button`, and the bound forms of `live-region`
 * and `tab-index`. The rules that match text already read what a template
 * writes out. A template that never closes is `unreadable-template`.
 */
import { branchValues, literalValue } from "../copy-check/scan.mjs";
import { LIVE_REGION_DIRS } from "./config.mjs";
import { tokenize } from "./lex.mjs";
import { findLitTemplates, walkLitNodes } from "./litTemplates.mjs";
import {
  checkColours,
  ICON_ONLY_BUTTON_MESSAGE,
  LIVE_REGION_MESSAGE,
  NAME_ATTRS,
  TAB_INDEX_MESSAGE,
} from "./shared.mjs";

/** @typedef {import("./shared.mjs").Report} Report */
/** @typedef {import("./litTemplates.mjs").LitElement} LitElement */
/** @typedef {import("./litTemplates.mjs").LitNode} LitNode */
/** @typedef {import("./litTemplates.mjs").LitTemplate} LitTemplate */
/** @typedef {import("./litTemplates.mjs").LitAttribute} LitAttribute */

/** @typedef {"icon" | "nothing" | "other"} Drawing What content draws. */

/** The attributes, and the properties of the same names, that paint. */
const COLOUR_ATTRS = new Set([
  "bgcolor",
  "color",
  "fill",
  "flood-color",
  "lighting-color",
  "stop-color",
  "stroke",
]);

/** A reference such as `url(#gradient)`, whose name may look like a colour. */
const REFERENCE = /url\([^)]*\)/g;

/**
 * What paint written as a literal may say, once references are gone: a
 * keyword that names no colour, or one custom property with no fallback.
 */
const PAINT_WITHOUT_COLOUR =
  /^(?:currentcolor|none|transparent|inherit|context-fill|context-stroke|var\(\s*--[^,()]*\))?$/i;

/** The roles that make an element a live region. */
const LIVE_ROLES = new Set(["status", "alert", "log"]);

/** What a hole may give, besides a template, and draw nothing. */
const DRAWS_NOTHING = new Set([
  "§",
  "nothing",
  "undefined",
  "null",
  "false",
  '""',
  "''",
  "``",
]);

/** The properties that name an element, as Lit's `.name=${...}` writes them. */
const NAME_PROPERTIES = new Set([
  "ariaLabel",
  "ariaLabelledByElements",
  "title",
]);

/** The elements whose content names the icon that holds them. */
const NAMING_ELEMENTS = new Set(["title", "text"]);

const STYLE_FIX =
  "Use a vanilla-extract class, or set each computed value with element.style.setProperty.";

const REFUSED_BY_POLICY = `in a Lit template. The production CSP is style-src 'self', which refuses it. ${STYLE_FIX}`;

const PROPERTY_MESSAGE = `A .style binding in a Lit template sets the element's whole style from one value. ${STYLE_FIX}`;

/** @param {LitAttribute} attr @returns {string} */
function styleMessage(attr) {
  return attr.prefix === "."
    ? PROPERTY_MESSAGE
    : `A ${attr.prefix}style attribute ${REFUSED_BY_POLICY}`;
}

/**
 * Refuses a `style` attribute, bound or not, and a `style` element. Lit writes
 * an attribute binding with `setAttribute`, which the policy blocks, even for a
 * custom property. A `.style` binding is refused too, so a computed style is
 * set one way only.
 * @param {LitElement} element
 * @param {Report} report
 */
function checkStyle(element, report) {
  if (element.name === "style") {
    report(
      "inline-style",
      element.line,
      `A style element ${REFUSED_BY_POLICY}`,
    );
  }
  for (const attr of element.attrs) {
    if (attr.prefix !== "@" && attr.name.toLowerCase() === "style") {
      report("inline-style", attr.line, styleMessage(attr));
    }
  }
}

/** Whether a binding sets a value: an attribute or a property. */
const setsValue = (/** @type {LitAttribute} */ attr) =>
  attr.prefix === "" || attr.prefix === ".";

/** What the holes of an attribute may give, each as written. */
const boundValues = (/** @type {LitAttribute} */ attr) =>
  attr.holes.flatMap((hole) => branchValues(hole.expr));

/** The string literals among what the holes of an attribute may give. */
const boundStrings = (/** @type {LitAttribute} */ attr) =>
  boundValues(attr).flatMap((value) => literalValue(value) ?? []);

/**
 * Refuses a colour in an attribute that paints: a colour literal anywhere in
 * it, or a literal value, such as a colour's name, that is not one of the
 * paints that name no colour. A computed value passes.
 * @param {LitAttribute} attr
 * @param {Report} report
 */
function checkPaintValue(attr, report) {
  const written = {
    t: /** @type {const} */ ("str"),
    v: attr.text,
    line: attr.line,
  };
  const inHoles = attr.holes.flatMap((hole) =>
    tokenize(hole.expr).map((token) => ({ ...token, line: hole.line })),
  );
  let found = false;
  checkColours(
    [written, ...inHoles].map((token) => ({
      ...token,
      v: token.v.replace(REFERENCE, ""),
    })),
    (...violation) => {
      found = true;
      report(...violation);
    },
  );
  const named = [attr.text, ...boundStrings(attr)]
    .map((value) => value.replace(REFERENCE, "").trim())
    .find((value) => !PAINT_WITHOUT_COLOUR.test(value));
  if (!found && named !== undefined) {
    report(
      "colour-literal",
      attr.line,
      `Colour "${named}" in ${attr.prefix}${attr.name}. Use a tokens.color role, currentColor or a custom property.`,
    );
  }
}

/** @param {LitElement} element @param {Report} report */
function checkPaint(element, report) {
  for (const attr of element.attrs) {
    if (setsValue(attr) && COLOUR_ATTRS.has(attr.name.toLowerCase())) {
      checkPaintValue(attr, report);
    }
  }
}

/**
 * Whether a binding makes a live region that the rule matching text does not
 * see: a bound role, or the `ariaLive` property.
 * @param {LitAttribute} attr
 * @returns {boolean}
 */
function bindsLiveRegion(attr) {
  if (attr.name === "role") {
    return boundStrings(attr).some((value) => LIVE_ROLES.has(value));
  }
  if (attr.prefix !== "." || attr.name !== "ariaLive") {
    return false;
  }
  return [attr.text.trim(), ...boundStrings(attr)].some(
    (value) => value !== "" && value !== "off",
  );
}

/** Whether a hole may set a `tabindex` above 0. */
const bindsTabIndex = (/** @type {LitAttribute} */ attr) =>
  attr.name.toLowerCase() === "tabindex" &&
  boundValues(attr).some((value) => Number(literalValue(value) ?? value) > 0);

/**
 * @param {string} file
 * @param {LitElement} element
 * @param {Report} report
 */
function checkBindings(file, element, report) {
  const mayAnnounce = LIVE_REGION_DIRS.some((dir) => file.startsWith(dir));
  for (const attr of element.attrs.filter(setsValue)) {
    if (!mayAnnounce && bindsLiveRegion(attr)) {
      report("live-region", attr.line, LIVE_REGION_MESSAGE);
    }
    if (bindsTabIndex(attr)) {
      report("tab-index", attr.line, TAB_INDEX_MESSAGE);
    }
  }
}

/**
 * What several pieces of content draw together: icons only when at least one
 * is an icon and none is anything else.
 * @param {Drawing[]} drawings
 * @returns {Drawing}
 */
function together(drawings) {
  if (drawings.includes("other")) {
    return "other";
  }
  return drawings.includes("icon") ? "icon" : "nothing";
}

/** @param {LitTemplate} template @returns {Drawing} */
function templateDrawing(template) {
  if (template.nodes.length === 0) {
    return "nothing";
  }
  return template.isSvg ? "icon" : together(template.nodes.map(drawing));
}

/**
 * What a node draws. An `svg` element is an icon, and so is an element that
 * holds only icons; any other element is something else, even an empty one. A
 * hole draws what its values do. An icon held in a variable is not seen.
 * @param {LitNode} node
 * @returns {Drawing}
 */
function drawing(node) {
  if (node.kind === "text") {
    return node.value.trim() === "" ? "nothing" : "other";
  }
  if (node.kind === "element") {
    const isIcon =
      node.name === "svg" || together(node.children.map(drawing)) === "icon";
    return isIcon ? "icon" : "other";
  }
  const values = branchValues(node.expr);
  return values.every((value) => DRAWS_NOTHING.has(value))
    ? together(node.templates.map(templateDrawing))
    : "other";
}

/** @param {LitAttribute} attr @returns {boolean} */
function isName(attr) {
  if (attr.prefix === ".") {
    return NAME_PROPERTIES.has(attr.name);
  }
  return attr.prefix === "" && NAME_ATTRS.includes(attr.name.toLowerCase());
}

/**
 * Whether an element may have a name of its own. A directive among its
 * attributes may set one, so it gets the benefit of the doubt.
 * @param {LitElement} element
 * @returns {boolean}
 */
function mayBeNamed(element) {
  return element.directives.length > 0 || element.attrs.some(isName);
}

/**
 * Whether the icons of a button name it, by an attribute, or by the content of
 * a `title` or `text` element.
 * @param {LitNode[]} nodes
 * @returns {boolean}
 */
function namesButton(nodes) {
  return [...walkLitNodes(nodes)].some((node) => {
    if (node.kind === "element") {
      const hasNamingContent =
        NAMING_ELEMENTS.has(node.name) && node.children.length > 0;
      return hasNamingContent || mayBeNamed(node);
    }
    return (
      node.kind === "hole" &&
      node.templates.some((template) => namesButton(template.nodes))
    );
  });
}

/**
 * Checks that a `<button>` holding only an icon has an accessible name.
 * @param {LitElement} element
 * @param {Report} report
 */
function checkNamedButton(element, report) {
  if (element.name !== "button" || mayBeNamed(element)) {
    return;
  }
  const content = element.children;
  if (together(content.map(drawing)) === "icon" && !namesButton(content)) {
    report("icon-only-button", element.line, ICON_ONLY_BUTTON_MESSAGE);
  }
}

/**
 * Applies the template rules to every Lit template of one script file.
 * @param {string} file Repository relative path with forward slashes.
 * @param {string} code Comment-stripped source.
 * @param {Report} report
 */
export function scanLitTemplates(file, code, report) {
  const { templates, unreadable } = findLitTemplates(code);
  for (const line of unreadable) {
    report(
      "unreadable-template",
      line,
      "A template literal or hole never closes, so what follows cannot be checked. If the code compiles, the scanner has misread it: fix scripts/harmony/lex.mjs.",
    );
  }
  for (const template of templates) {
    for (const node of walkLitNodes(template.nodes)) {
      if (node.kind === "element") {
        checkStyle(node, report);
        checkPaint(node, report);
        checkBindings(file, node, report);
        checkNamedButton(node, report);
      }
    }
  }
}
