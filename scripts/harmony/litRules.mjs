// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The harmony rules that need a Lit template read as markup: `inline-style`,
 * `colour-literal` and `icon-only-button`. The rules that match text, such as
 * `live-region` and `tab-index`, already read a template as part of its file.
 */
import { branchValues } from "../copy-check/scan.mjs";
import { tokenize } from "./lex.mjs";
import { findLitTemplates, walkLitNodes } from "./litTemplates.mjs";
import {
  checkColours,
  ICON_ONLY_BUTTON_MESSAGE,
  NAME_ATTRS,
} from "./shared.mjs";

/** @typedef {import("./shared.mjs").Report} Report */
/** @typedef {import("./litTemplates.mjs").LitElement} LitElement */
/** @typedef {import("./litTemplates.mjs").LitNode} LitNode */
/** @typedef {import("./litTemplates.mjs").LitTemplate} LitTemplate */
/** @typedef {import("./litTemplates.mjs").LitAttribute} LitAttribute */

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

/** What a hole may give, besides a template, and still draw only icons. */
const DRAWS_NOTHING = new Set(["§", "nothing", '""', "''", "null"]);

/** The properties that name an element, as Lit's `.name=${...}` writes them. */
const NAME_PROPERTIES = new Set(["ariaLabel", "title"]);

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

/**
 * Refuses a colour literal in an attribute that paints, written out or as a
 * string in a hole.
 * @param {LitElement} element
 * @param {Report} report
 */
function checkPaint(element, report) {
  const painted = element.attrs.filter(
    (attr) =>
      (attr.prefix === "" || attr.prefix === ".") &&
      COLOUR_ATTRS.has(attr.name.toLowerCase()),
  );
  for (const attr of painted) {
    const written = {
      t: /** @type {const} */ ("str"),
      v: attr.text,
      line: attr.line,
    };
    const bound = attr.holes.flatMap((hole) =>
      tokenize(hole.expr).map((token) => ({ ...token, line: hole.line })),
    );
    checkColours(
      [written, ...bound].map((token) => ({
        ...token,
        v: token.v.replace(REFERENCE, ""),
      })),
      report,
    );
  }
}

/** Whether a node is white space between others. */
const isBlank = (/** @type {LitNode} */ node) =>
  node.kind === "text" && node.value.trim() === "";

/**
 * Whether a template draws icons and nothing else.
 * @param {LitTemplate} template
 * @returns {boolean}
 */
function isIconTemplate(template) {
  return (
    template.nodes.length > 0 &&
    (template.isSvg || template.nodes.every(isIcon))
  );
}

/**
 * Whether a node is an icon: an `svg` element, or a hole whose every value is a
 * template of icons or nothing. An icon held in a variable is not seen.
 * @param {LitNode} node
 * @returns {boolean}
 */
function isIcon(node) {
  if (node.kind === "element") {
    return node.name === "svg";
  }
  return (
    node.kind === "hole" &&
    node.templates.length > 0 &&
    branchValues(node.expr).every((value) => DRAWS_NOTHING.has(value)) &&
    node.templates.every(isIconTemplate)
  );
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
 * Whether an icon names its button, by an attribute or a `title` element.
 * @param {LitNode[]} nodes
 * @returns {boolean}
 */
function namesButton(nodes) {
  return [...walkLitNodes(nodes)].some((node) => {
    if (node.kind === "element") {
      return node.name === "title" || mayBeNamed(node);
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
  const content = element.children.filter((node) => !isBlank(node));
  if (content.length > 0 && content.every(isIcon) && !namesButton(content)) {
    report("icon-only-button", element.line, ICON_ONLY_BUTTON_MESSAGE);
  }
}

/**
 * Applies the template rules to every Lit template of one script file.
 * @param {string} code Comment-stripped source.
 * @param {Report} report
 */
export function scanLitTemplates(code, report) {
  for (const template of findLitTemplates(code)) {
    for (const node of walkLitNodes(template.nodes)) {
      if (node.kind === "element") {
        checkStyle(node, report);
        checkPaint(node, report);
        checkNamedButton(node, report);
      }
    }
  }
}
