/**
 * The harmony rules. Each rule reads one file and returns violations; the
 * caller decides which files to read and which violations are excused.
 *
 * Rule ids, grouped:
 * - style values (`.css.ts` files and `style={{...}}` props): `colour-literal`,
 *   `radius`, `spacing`, `font-size`, `font-family`, `font-weight`, `z-index`,
 *   `position`, `outline`, `motion`
 * - engine isolation: `engine-selector`, `engine-control`
 * - accessibility and markup: `inline-style`, `tab-index`, `viewport`,
 *   `live-region`, `icon-sizing`, `icon-only-button`
 * - architecture: `service-singleton`
 *
 * Import and global rules live in Biome (`biome.jsonc`) and dependency-cruiser
 * (`.dependency-cruiser.cjs`), because they are exact there.
 */
import {
  ADAPTER_WIRING_DIRS,
  ALLOWED_FONT_WEIGHTS,
  ALLOWED_LINE_WIDTHS_PX,
  ICON_SIZING_DIR,
  LIVE_REGION_DIRS,
  MIN_FONT_SIZE_PX,
  POSITIONED_COMPONENTS,
} from "./config.mjs";
import {
  extractDeclarations,
  findJsxTags,
  skipBalanced,
  stripComments,
  tokenize,
} from "./lex.mjs";

/**
 * @typedef {object} Violation
 * @property {string} file Repository relative path.
 * @property {number} line One-based line.
 * @property {string} rule Rule id.
 * @property {string} message What is wrong and what to use instead.
 */

/** @typedef {(rule: string, line: number, message: string) => void} Report */

/**
 * @typedef {object} DeclarationContext
 * @property {string} file Repository relative path.
 * @property {import("./lex.mjs").Declaration} decl The declaration.
 * @property {string} code Comment-stripped source.
 * @property {boolean} bare Whether the value is a bare number.
 * @property {number} bareValue The bare number, or 0.
 * @property {Report} report
 */

const COLOUR =
  /#[0-9a-fA-F]{3,8}\b|(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
const LENGTH = /(?<![\w.#§-])(-?\d*\.?\d+)(px|rem|em|pt|%)(?![\w%])/g;
const TIME = /(?<![\w.#§-])(-?\d*\.?\d+)(ms|s)(?![\w%])/g;

const SPACING_PROP =
  /^(?:(?:padding|margin|inset|scrollPadding|scrollMargin)(?:[A-Z]\w*)?|gap|rowGap|columnGap|gridGap|top|right|bottom|left)$/;
const LINE_PROP =
  /^(?:border|outline)(?:Top|Right|Bottom|Left|Block|Inline)?(?:Start|End)?(?:Width|Offset)?$/;
const MOTION_PROP =
  /^(?:transition|transitionDuration|transitionDelay|animation|animationDuration|animationDelay)$/;
const RESET_KEYWORDS = /^(?:inherit|unset|initial|revert)$/;

/** Whether the value is a bare number, which vanilla-extract writes as px. */
const isBareNumber = (text) => /^-?\s*\d+(?:\.\d+)?$/.test(text.trim());

/**
 * Length literals in a value.
 * @param {string} text
 * @returns {Array<{ value: number, unit: string }>}
 */
function lengthsIn(text) {
  return [...text.matchAll(LENGTH)].map((m) => ({
    value: Number.parseFloat(m[1]),
    unit: m[2],
  }));
}

/** A length in CSS pixels, or `undefined` for relative units. */
function toPx({ value, unit }) {
  switch (unit) {
    case "px":
      return value;
    case "rem":
    case "em":
      return value * 16;
    case "pt":
      return (value * 4) / 3;
    default:
      return undefined;
  }
}

/** Whether `file` is inside a directory (or is a file) of the list. */
const insideAny = (file, prefixes) =>
  prefixes.some((prefix) => file.startsWith(prefix));

/** @param {DeclarationContext} c */
function checkRadius({ decl, bare, bareValue, report }) {
  if (!decl.prop.endsWith("Radius")) {
    return;
  }
  const bad =
    (bare && bareValue !== 0) ||
    lengthsIn(decl.text).some(
      ({ value, unit }) => value !== 0 && !(value === 50 && unit === "%"),
    );
  if (bad) {
    report(
      "radius",
      decl.line,
      `Off-scale radius "${decl.text}". Use a tokens.radius value, 50% for a circle, or 0.`,
    );
  }
}

/** @param {DeclarationContext} c */
function checkSpacing({ decl, bare, bareValue, report }) {
  if (SPACING_PROP.test(decl.prop)) {
    const bad =
      (bare && bareValue !== 0) ||
      lengthsIn(decl.text).some(
        ({ value, unit }) => unit !== "%" && value !== 0,
      );
    if (bad) {
      report(
        "spacing",
        decl.line,
        `Off-scale ${decl.prop} "${decl.text}". Use a tokens.space value, 0, or calc() over tokens.`,
      );
    }
  } else if (LINE_PROP.test(decl.prop)) {
    const lengths = lengthsIn(decl.text).filter(({ unit }) => unit !== "%");
    const offScale = ({ value, unit }) =>
      value !== 0 &&
      !(unit === "px" && ALLOWED_LINE_WIDTHS_PX.has(Math.abs(value)));
    const bad =
      (bare && !ALLOWED_LINE_WIDTHS_PX.has(Math.abs(bareValue))) ||
      lengths.some(offScale);
    if (bad) {
      report(
        "spacing",
        decl.line,
        `Off-scale ${decl.prop} "${decl.text}". Line widths are 0, 1px or 2px.`,
      );
    }
  }
}

/** @param {DeclarationContext} c */
function checkFontSize({ decl, bare, bareValue, report }) {
  if (decl.prop !== "fontSize") {
    return;
  }
  const lengths = lengthsIn(decl.text);
  const isHundredPercent =
    lengths.length === 1 && lengths[0].unit === "%" && lengths[0].value === 100;
  if ((!bare && lengths.length === 0) || isHundredPercent) {
    return;
  }
  const px = bare
    ? bareValue
    : Math.min(...lengths.map(toPx).filter((v) => v !== undefined));
  const small = Number.isFinite(px) && px < MIN_FONT_SIZE_PX;
  report(
    "font-size",
    decl.line,
    small
      ? `Font size "${decl.text}" is below the ${MIN_FONT_SIZE_PX}px minimum. Use a tokens.type size.`
      : `Off-scale font size "${decl.text}". Use a tokens.type size.`,
  );
}

/** @param {DeclarationContext} c */
function checkFontFace({ decl, report }) {
  if (!["fontFamily", "font", "fontFeatureSettings"].includes(decl.prop)) {
    return;
  }
  const literal = decl.text.replace(/[§\s,()]/g, "");
  if (literal !== "" && !RESET_KEYWORDS.test(literal)) {
    report(
      "font-family",
      decl.line,
      `${decl.prop} "${decl.text}" is set outside the tokens file. Use tokens.type.family; feature settings belong in the tokens file.`,
    );
  }
}

/** @param {DeclarationContext} c */
function checkFontWeight({ decl, bare, report }) {
  if (decl.prop !== "fontWeight") {
    return;
  }
  const value = decl.text.trim();
  const keyword = /^(?:normal|bold|bolder|lighter)$/.test(value);
  const literal =
    bare || keyword || /\d/.test(value.replace(/§\s*\([^)]*\)/g, ""));
  if (!literal) {
    return;
  }
  const name = value === "400" ? "regular" : "semibold";
  report(
    "font-weight",
    decl.line,
    ALLOWED_FONT_WEIGHTS.has(value)
      ? `Write font weight ${value} as tokens.type.weight.${name}.`
      : `Font weight "${value}" is not in the type scale. Use tokens.type.weight (400 or 600).`,
  );
}

/** @param {DeclarationContext} c */
function checkZIndex({ decl, bare, report }) {
  if (decl.prop !== "zIndex") {
    return;
  }
  const withoutCalls = decl.text.replace(/§\s*\([^)]*\)/g, "§");
  if (bare || /\d/.test(withoutCalls)) {
    report(
      "z-index",
      decl.line,
      `Raw z-index "${decl.text}". Name a layer with zLayer("chrome") from @mapcairn/theme.`,
    );
  }
}

/** @param {DeclarationContext} c */
function checkPosition({ file, decl, report }) {
  const floats = /^(?:absolute|fixed)$/.test(decl.text.trim());
  const allowed = insideAny(
    file,
    POSITIONED_COMPONENTS.map((c) => c.prefix),
  );
  if (decl.prop === "position" && floats && !allowed) {
    report(
      "position",
      decl.line,
      `position: ${decl.text.trim()} outside a component that owns a floating surface. Lay it out in flow inside a MapChrome slot, or add the component to POSITIONED_COMPONENTS in scripts/harmony/config.mjs.`,
    );
  }
}

/** @param {DeclarationContext} c */
function checkOutline({ decl, code, report }) {
  const value = decl.text.trim();
  const removes =
    (decl.prop === "outline" && /^(?:none|0|0px)(?:\s|$)/.test(value)) ||
    (decl.prop === "outlineStyle" && value === "none");
  const replaced =
    /\bfocusRing\b/.test(code.slice(decl.ruleStart, decl.ruleEnd)) ||
    ringDelegated(code, decl.ruleStart);
  if (removes && !replaced) {
    report(
      "outline",
      decl.line,
      `${decl.prop}: ${value} removes the focus indicator. Keep the outline, or replace it with the focusRing token in the same style rule.`,
    );
  }
}

/**
 * Whether the style whose rule opens at `ruleStart` hands its focus ring to
 * the visible part inside it: a hit area larger than what it draws (a slider
 * thumb, a switch) whose child style carries the `focusRing` token under a
 * `${name}:focus-visible > &` selector in the same file.
 *
 * @param {string} code
 * @param {number} ruleStart
 * @returns {boolean}
 */
function ringDelegated(code, ruleStart) {
  const name = /\bconst\s+(\w+)\s*=\s*style\(\s*$/.exec(
    code.slice(0, ruleStart),
  )?.[1];
  if (name === undefined) {
    return false;
  }
  const selector = `\\[\\s*\`\\$\\{${name}\\}:focus-visible\\s*>\\s*&\`\\s*\\]`;
  return new RegExp(`${selector}\\s*:\\s*focusRing\\b`).test(code);
}

/** @param {DeclarationContext} c */
function checkMotion({ decl, report }) {
  if (!MOTION_PROP.test(decl.prop)) {
    return;
  }
  const literal = [...decl.text.matchAll(TIME)].some(
    (m) => Number.parseFloat(m[1]) !== 0,
  );
  if (literal) {
    report(
      "motion",
      decl.line,
      `${decl.prop} "${decl.text}" uses a literal duration. Use tokens.motion.duration so reduced motion applies.`,
    );
  }
}

const DECLARATION_CHECKS = [
  checkRadius,
  checkSpacing,
  checkFontSize,
  checkFontFace,
  checkFontWeight,
  checkZIndex,
  checkPosition,
  checkOutline,
  checkMotion,
];

/**
 * Checks one declaration against the value rules.
 * @param {string} file
 * @param {import("./lex.mjs").Declaration} decl
 * @param {string} code
 * @param {Report} report
 */
function checkDeclaration(file, decl, code, report) {
  if (decl.prop.startsWith("--")) {
    return;
  }
  const bare = isBareNumber(decl.text);
  const bareValue = bare ? Number.parseFloat(decl.text.replace(/\s/g, "")) : 0;
  for (const check of DECLARATION_CHECKS) {
    check({ file, decl, code, bare, bareValue, report });
  }
}

/**
 * Checks colour literals in the string and template tokens of a style region.
 * @param {import("./lex.mjs").Token[]} tokens
 * @param {Report} report
 */
function checkColours(tokens, report) {
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

/**
 * Names imported from `lucide-react`.
 * @param {string} code
 * @returns {Set<string>}
 */
function lucideImportNames(code) {
  const names = new Set();
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']lucide-react["']/g;
  for (const m of code.matchAll(re)) {
    for (const part of m[1].split(",")) {
      const local = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .pop();
      if (local) {
        names.add(local.trim());
      }
    }
  }
  return names;
}

const NAME_ATTRS = ["aria-label", "aria-labelledby", "title"];

/**
 * Removes icon children from the inside of a button and reports whether
 * nothing but icons was there.
 * @param {string} inner
 * @param {Set<string>} icons
 * @returns {{ onlyIcons: boolean, named: boolean }}
 */
function analyseButtonChildren(inner, icons) {
  const isIcon = (name) => icons.has(name) || name === "Icon" || name === "svg";
  let remaining = inner.replace(/\{\s*\}/g, "");
  let removed = 0;
  let named = false;
  const tags = findJsxTags(inner)
    .filter((tag) => isIcon(tag.name))
    .sort((a, b) => b.start - a.start);
  for (const tag of tags) {
    const close = tag.selfClosing
      ? tag.end
      : inner.indexOf(`</${tag.name}>`, tag.end);
    if (close === -1) {
      continue;
    }
    const end = tag.selfClosing ? tag.end : close + tag.name.length + 3;
    named ||= tag.attrs.some((a) => ["label", ...NAME_ATTRS].includes(a.name));
    remaining = `${remaining.slice(0, tag.start)} ${remaining.slice(end)}`;
    removed += 1;
  }
  return { onlyIcons: removed > 0 && remaining.trim() === "", named };
}

/** The text from the start of the statement (a line at column 0) to `index`. */
function statementBefore(code, index) {
  let start = index;
  while (start > 0) {
    const lineStart = code.lastIndexOf("\n", start - 1) + 1;
    if (/^[A-Za-z]/.test(code[lineStart] ?? "")) {
      return code.slice(lineStart, index);
    }
    start = lineStart - 1;
  }
  return code.slice(0, index);
}

/**
 * Offsets of `createServices(` calls at module scope: outside every block and
 * outside a function or arrow body that starts in the same statement.
 * @param {string} code
 * @returns {number[]}
 */
function moduleScopeCalls(code) {
  const tokens = tokenize(code);
  const hits = [];
  let depth = 0;
  for (const [k, tok] of tokens.entries()) {
    if (tok.t === "p") {
      depth += tok.v === "{" ? 1 : tok.v === "}" ? -1 : 0;
      continue;
    }
    const isCall =
      tok.t === "id" &&
      tok.v === "createServices" &&
      tokens[k + 1]?.v === "(" &&
      depth === 0 &&
      tokens[k - 1]?.v !== "function" &&
      tokens[k - 1]?.v !== ".";
    if (isCall && !/=>|\bfunction\b/.test(statementBefore(code, tok.i))) {
      hits.push(tok.i);
    }
  }
  return hits;
}

/**
 * Builds a function that maps an offset in `code` to a line number.
 * @param {string} code
 * @returns {(index: number) => number}
 */
function lineFinder(code) {
  const starts = [0];
  for (const [i, c] of [...code].entries()) {
    if (c === "\n") {
      starts.push(i + 1);
    }
  }
  return (index) => {
    let line = 0;
    while (line + 1 < starts.length && starts[line + 1] <= index) {
      line += 1;
    }
    return line + 1;
  };
}

/**
 * Text-pattern rules that read every file kind.
 * @param {string} file
 * @param {string} code
 * @param {Report} report
 */
function scanText(file, code, report) {
  const lineAt = lineFinder(code);
  const eachMatch = (re, rule, message) => {
    for (const m of code.matchAll(re)) {
      report(rule, lineAt(m.index ?? 0), message(m));
    }
  };
  const isHtml = file.endsWith(".html");

  eachMatch(
    /user-scalable\s*=\s*(?:no|0)\b|maximum-scale/gi,
    "viewport",
    (m) =>
      `Viewport "${m[0]}" blocks pinch zoom. Remove it so users can scale the page.`,
  );
  if (!isHtml) {
    eachMatch(
      /\.(?:maplibregl|maplibre)-[A-Za-z]/g,
      "engine-selector",
      (m) =>
        `Engine selector "${m[0]}…" belongs in packages/web/src/adapters/mapEngine.css.ts.`,
    );
  }
  if (file.endsWith(".css")) {
    return;
  }
  eachMatch(
    /\btab[Ii]ndex\s*(?:=|:)\s*\{?\s*["']?\s*[1-9]|setAttribute\(\s*["']tabindex["']\s*,\s*["']?[1-9]|\.tabIndex\s*=\s*[1-9]/g,
    "tab-index",
    () => "A tabindex above 0 breaks the natural focus order. Use 0 or -1.",
  );
  if (!insideAny(file, LIVE_REGION_DIRS)) {
    eachMatch(
      /aria-live(?!\s*[=:]\s*\{?\s*["']off["'])|\brole\s*[=:]\s*\{?\s*["'](?:status|alert|log)["']|setAttribute\(\s*["']role["']\s*,\s*["'](?:status|alert|log)["']/g,
      "live-region",
      () =>
        "Live regions are created only by LiveRegion and StatusMessage in packages/map/src/ui. Announce through the useAnnounce hook.",
    );
  }
  if (!isHtml) {
    scanScriptText(file, code, report, eachMatch, lineAt);
  }
}

/**
 * Text-pattern rules for script files.
 * @param {string} file
 * @param {string} code
 * @param {Report} report
 * @param {(re: RegExp, rule: string, message: (m: RegExpMatchArray) => string) => void} eachMatch
 * @param {(index: number) => number} lineAt
 */
function scanScriptText(file, code, report, eachMatch, lineAt) {
  eachMatch(
    /\bL\.control\b|\.addControl\s*\(|\b(?:Navigation|Scale|Attribution|Geolocate|Fullscreen|Terrain|Globe)Control\b/g,
    "engine-control",
    (m) =>
      `"${m[0].trim()}" adds an engine-drawn control. Every control is a MapCairn component inside MapChrome.`,
  );
  if (insideAny(file, ADAPTER_WIRING_DIRS)) {
    return;
  }
  eachMatch(
    /\bnew\s+(?:Browser|LocalStorage|Nominatim)[A-Z]\w*\s*\(/g,
    "service-singleton",
    (m) =>
      `"${m[0]}" constructs an adapter outside the adapters and the composition root. Read it through a service hook.`,
  );
  for (const index of moduleScopeCalls(code)) {
    report(
      "service-singleton",
      lineAt(index),
      "createServices() runs at module scope, which makes the services a singleton shared across requests. Call it inside a component or a factory.",
    );
  }
}

/**
 * Checks the `style` prop of a JSX tag. Returns the token region of an object
 * literal so its declarations can be checked too.
 * @param {import("./lex.mjs").JsxTag} tag
 * @param {string} code
 * @param {Report} report
 * @returns {{ tokens: import("./lex.mjs").Token[] } | undefined}
 */
function checkStyleProp(tag, code, report) {
  const style = tag.attrs.find((a) => a.name === "style");
  if (!style) {
    return undefined;
  }
  const literal = style.kind === "expr" ? style.value.trim() : "";
  let region;
  let customOnly = false;
  if (literal.startsWith("{")) {
    const from = code.indexOf(style.value, style.index);
    const end = skipBalanced(literal, 0);
    const tokens = tokenize(code, from, from + end + 1);
    const keys = extractDeclarations(tokens, code);
    customOnly = keys.length > 0 && keys.every((d) => d.key.startsWith("--"));
    region = { tokens };
  }
  if (!customOnly) {
    report(
      "inline-style",
      style.line,
      "Inline style attribute. The production CSP is style-src 'self'. Use a vanilla-extract class, or pass only CSS custom properties.",
    );
  }
  return region;
}

/**
 * Checks a lucide icon or `Icon` tag for hand-set size or stroke.
 * @param {import("./lex.mjs").JsxTag} tag
 * @param {string} file
 * @param {Set<string>} icons
 * @param {Report} report
 */
function checkIconSizing(tag, file, icons, report) {
  const isIcon = icons.has(tag.name) || tag.name === "Icon";
  if (!isIcon || file.startsWith(ICON_SIZING_DIR)) {
    return;
  }
  for (const attr of tag.attrs) {
    if (["size", "strokeWidth", "absoluteStrokeWidth"].includes(attr.name)) {
      report(
        "icon-sizing",
        attr.line,
        `<${tag.name} ${attr.name}=…> sizes an icon by hand. Icons take their size and stroke from packages/map/src/ui/Icon.`,
      );
    }
  }
}

/**
 * Checks that a `<button>` holding only an icon has an accessible name.
 * @param {import("./lex.mjs").JsxTag} tag
 * @param {string} code
 * @param {Set<string>} icons
 * @param {Report} report
 */
function checkIconOnlyButton(tag, code, icons, report) {
  if (tag.name !== "button" || tag.selfClosing) {
    return;
  }
  const close = code.indexOf("</button>", tag.end);
  if (close === -1) {
    return;
  }
  const { onlyIcons, named } = analyseButtonChildren(
    code.slice(tag.end, close),
    icons,
  );
  // A spread may carry the name, so it gets the benefit of the doubt.
  const hasName =
    named ||
    tag.attrs.some((a) => NAME_ATTRS.includes(a.name) || a.kind === "spread");
  if (onlyIcons && !hasName) {
    report(
      "icon-only-button",
      tag.line,
      "A button with only an icon has no accessible name. Use IconButton with a label, or add aria-label.",
    );
  }
}

/**
 * Scans one file.
 * @param {string} file Repository relative path with forward slashes.
 * @param {string} source File text.
 * @returns {Violation[]}
 */
export function scanSource(file, source) {
  /** @type {Violation[]} */
  const violations = [];
  /** @type {Report} */
  const report = (rule, line, message) =>
    violations.push({ file, line, rule, message });

  const code = file.endsWith(".html")
    ? source.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "))
    : stripComments(source);
  scanText(file, code, report);

  const regions = [];
  if (file.endsWith(".css.ts")) {
    regions.push({ tokens: tokenize(code) });
  }
  if (file.endsWith(".tsx")) {
    const icons = lucideImportNames(code);
    for (const tag of findJsxTags(code)) {
      const region = checkStyleProp(tag, code, report);
      if (region) {
        regions.push(region);
      }
      checkIconSizing(tag, file, icons, report);
      checkIconOnlyButton(tag, code, icons, report);
    }
  }
  for (const { tokens } of regions) {
    for (const decl of extractDeclarations(tokens, code)) {
      checkDeclaration(file, decl, code, report);
    }
    checkColours(tokens, report);
  }
  return violations;
}
