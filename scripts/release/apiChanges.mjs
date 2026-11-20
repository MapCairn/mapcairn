// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { SDK_PACKAGES } from "../sdkPackages.mjs";

/**
 * @typedef {object} ReportEntry
 * @property {string} name The exported name, or the first line when no name is found.
 * @property {string[]} lines The declaration lines, without comments.
 * @property {string[]} tags The `// @tag` comment lines in the entry.
 */

/**
 * @typedef {object} ApiChange
 * @property {"added" | "removed" | "changed" | "union-member-added" | "enum-member-added" | "gained-internal" | "gained-beta" | "required-member-added"} kind
 * @property {string} name
 * @property {boolean} likelyBreaking Whether `docs/guides/public-api.md` calls this a likely breaking change.
 * @property {string} detail One sentence about what changed.
 */

const DECLARATION =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:default\s+)?(?:const\s+)?(?:function|class|interface|type|enum|const|let|var|namespace)\s+([A-Za-z_$][\w$]*)/;
const NAMED_EXPORT = /^export\s*\{\s*[\w$]+\s+as\s+([\w$]+)\s*\}/;
const TAG = /^\/\/\s*@(public|beta|internal|alpha)\b/;

/**
 * The text of the fenced `ts` block an API Extractor report holds.
 *
 * @param {string} report
 * @returns {string}
 */
function reportBody(report) {
  const match = /```ts\r?\n([\s\S]*?)\r?\n```/.exec(report);
  return match === null ? "" : match[1];
}

/**
 * Splits a report into its exported entries. Blocks that share a name (the
 * overloads of a function, declarations that merge) are joined into one entry.
 * API Extractor separates the
 * top-level items with a blank line and prints an alias (`const x_2`) with a
 * following `export { x_2 as x }`, which names the entry.
 *
 * @param {string} report
 * @returns {Map<string, ReportEntry>}
 */
export function parseReport(report) {
  /** @type {Map<string, ReportEntry>} */
  const entries = new Map();
  for (const block of reportBody(report).split(/\r?\n\r?\n/)) {
    const all = block.split(/\r?\n/).filter((line) => line.trim() !== "");
    const lines = all.filter((line) => !line.trim().startsWith("//"));
    if (lines.length === 0) {
      continue;
    }
    const tags = all
      .map((line) => line.trim())
      .filter((line) => TAG.test(line));
    const alias = lines.map((line) => NAMED_EXPORT.exec(line)).find(Boolean);
    const declared = DECLARATION.exec(lines[0]);
    const name = alias?.[1] ?? declared?.[1] ?? lines[0].trim();
    const earlier = entries.get(name);
    entries.set(name, {
      name,
      lines: [
        ...(earlier?.lines ?? []),
        ...lines.map((line) => line.trimEnd()),
      ],
      tags: [...(earlier?.tags ?? []), ...tags],
    });
  }
  return entries;
}

/**
 * Splits a union at its top-level bars, so a bar inside brackets, braces,
 * parentheses or generics stays in its member.
 *
 * @param {string} text
 * @returns {string[]}
 */
function unionMembers(text) {
  const members = [];
  let depth = 0;
  let current = "";
  for (const character of text) {
    if ("([{<".includes(character)) {
      depth += 1;
    } else if (")]}>".includes(character) && !current.endsWith("=")) {
      depth -= 1;
    }
    if (character === "|" && depth === 0) {
      members.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  members.push(current.trim());
  return members.filter((member) => member !== "");
}

/**
 * The members of an exported type alias that is a union, or null.
 *
 * @param {ReportEntry} entry
 * @returns {string[] | null}
 */
function unionOf(entry) {
  const text = entry.lines.join(" ");
  const match = /^export\s+type\s+[\w$]+(?:<[^=]*>)?\s*=\s*([\s\S]*?);?$/.exec(
    text,
  );
  if (match === null) {
    return null;
  }
  const members = unionMembers(match[1].replace(/;\s*$/, ""));
  return members.length > 1 ? members : null;
}

/**
 * Lines of `from` that `against` does not hold, counting repeats.
 *
 * @param {string[]} from
 * @param {string[]} against
 * @returns {string[]}
 */
function missingFrom(from, against) {
  const remaining = [...against];
  return from.filter((line) => {
    const index = remaining.indexOf(line);
    if (index === -1) {
      return true;
    }
    remaining.splice(index, 1);
    return false;
  });
}

/** The header of a type whose implementers a host may write: an interface or an abstract class. */
const IMPLEMENTED_TYPE =
  /^export\s+(?:declare\s+)?(?:(abstract)\s+class|interface)\s/;
/** The start of a member line, as opposed to the continuation of a long type. */
const MEMBER_START =
  /^(?:(?:readonly|static|abstract|protected|get|set)\s+)*(?:\[|["(<]|[\w$])/;
/** A member that is optional: its name is followed by `?`. */
const OPTIONAL_MEMBER =
  /^(?:(?:readonly|static)\s+)*(?:\[[^\]]*\]|"[^"]*"|[\w$]+)\?\s*[:(<]/;

/**
 * The members, at the top level of an interface or abstract class, that a
 * host implementing it must now provide: a line that is new and not optional,
 * or for an abstract class a new abstract member.
 *
 * @param {string[]} beforeLines
 * @param {string[]} afterLines
 * @returns {string[]}
 */
function requiredMembersAdded(beforeLines, afterLines) {
  const header = IMPLEMENTED_TYPE.exec(afterLines[0] ?? "");
  if (header === null) {
    return [];
  }
  const remaining = [...beforeLines];
  const required = [];
  let depth = 0;
  for (const line of afterLines) {
    const index = remaining.indexOf(line);
    const text = line.trim();
    if (index !== -1) {
      remaining.splice(index, 1);
    } else if (
      depth === 1 &&
      MEMBER_START.test(text) &&
      !OPTIONAL_MEMBER.test(text) &&
      (header[1] === undefined || /\babstract\b/.test(text.split(/[:(<]/)[0]))
    ) {
      required.push(text);
    }
    depth +=
      (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
  }
  return required;
}

/**
 * A member line without its trailing comma: adding an enum member after the
 * last one adds a comma to the line before it, which is not a change to it.
 *
 * @param {string} line
 * @returns {string}
 */
function withoutTrailingComma(line) {
  return line.replace(/,\s*$/, "");
}

/**
 * @param {ReportEntry} before
 * @param {ReportEntry} after
 * @returns {ApiChange | null}
 */
function compareEntries(before, after) {
  const count = (/** @type {ReportEntry} */ entry, /** @type {string} */ tag) =>
    entry.tags.filter((line) => line.includes(tag)).length;
  const name = after.name;
  // An export that was already @internal is unsupported, so changing it breaks no one.
  const supported = count(before, "@internal") === 0;
  if (count(after, "@internal") > count(before, "@internal")) {
    return {
      kind: "gained-internal",
      name,
      likelyBreaking: true,
      detail: `${name} is now tagged @internal, and a host may use it today.`,
    };
  }
  const beforeLines = before.lines.map(withoutTrailingComma);
  const afterLines = after.lines.map(withoutTrailingComma);
  const removed = missingFrom(beforeLines, afterLines);
  const added = missingFrom(afterLines, beforeLines);
  const oldUnion = unionOf(before);
  const newUnion = unionOf(after);
  if (oldUnion !== null && newUnion !== null) {
    const gone = missingFrom(oldUnion, newUnion);
    const fresh = missingFrom(newUnion, oldUnion);
    if (gone.length === 0 && fresh.length > 0) {
      return {
        kind: "union-member-added",
        name,
        likelyBreaking: supported,
        detail: `${name} gained ${fresh.join(", ")}, so a host's exhaustive switch stops compiling.`,
      };
    }
  }
  if (removed.length === 0 && added.length > 0) {
    if (/^export\s+(?:declare\s+)?(?:const\s+)?enum\s/.test(before.lines[0])) {
      return {
        kind: "enum-member-added",
        name,
        likelyBreaking: supported,
        detail: `${name} gained a member, so a host's exhaustive switch stops compiling.`,
      };
    }
    const required = requiredMembersAdded(beforeLines, afterLines);
    if (required.length > 0) {
      return {
        kind: "required-member-added",
        name,
        likelyBreaking: supported,
        detail: `${name} gained a required member (${required[0]}), so a host that implements it stops compiling.`,
      };
    }
    return {
      kind: "changed",
      name,
      likelyBreaking: false,
      detail: `${name} gained ${added.length} line${added.length === 1 ? "" : "s"} and lost none.`,
    };
  }
  if (removed.length > 0) {
    return {
      kind: "changed",
      name,
      likelyBreaking: supported,
      detail: `${name} changed or lost a line: ${removed[0].trim()}`,
    };
  }
  if (count(after, "@beta") > count(before, "@beta")) {
    return {
      kind: "gained-beta",
      name,
      likelyBreaking: false,
      detail: `${name} is now tagged @beta; name it in the release notes.`,
    };
  }
  return null;
}

/**
 * Compares two API reports of one entry point.
 *
 * @param {string | null} before The report at the last release, null when the entry point is new.
 * @param {string | null} after The report now, null when the entry point is gone.
 * @returns {ApiChange[]} Sorted by name.
 */
export function diffReports(before, after) {
  const old = before === null ? new Map() : parseReport(before);
  const current = after === null ? new Map() : parseReport(after);
  /** @type {ApiChange[]} */
  const changes = [];
  for (const [name, entry] of current) {
    const previous = old.get(name);
    if (previous === undefined) {
      changes.push({
        kind: "added",
        name,
        likelyBreaking: false,
        detail: `${name} is a new export.`,
      });
      continue;
    }
    const change = compareEntries(previous, entry);
    if (change !== null) {
      changes.push(change);
    }
  }
  for (const name of old.keys()) {
    if (!current.has(name)) {
      changes.push({
        kind: "removed",
        name,
        likelyBreaking: !old
          .get(name)
          .tags.some((line) => line.includes("@internal")),
        detail: `${name} is no longer exported.`,
      });
    }
  }
  return changes.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Where reports are read from: a git tag or the working tree.
 *
 * @typedef {object} ReportSource
 * @property {(folder: string) => string[]} list The report file names in a package's `api` folder.
 * @property {(path: string) => string | null} read A report's text, null when it does not exist.
 */

/**
 * Compares the API reports of every SDK package between two sources.
 *
 * @param {ReportSource} before
 * @param {ReportSource} after
 * @returns {Array<ApiChange & { package: string, entry: string }>}
 */
export function compareApiReports(before, after) {
  return SDK_PACKAGES.flatMap((name) => {
    const folder = `packages/${name}/api`;
    const files = [...new Set([...before.list(folder), ...after.list(folder)])];
    return files.sort().flatMap((file) =>
      diffReports(
        before.read(`${folder}/${file}`),
        after.read(`${folder}/${file}`),
      ).map((change) => ({
        ...change,
        package: `@mapcairn/${name}`,
        entry: file.replace(/\.api\.md$/, ""),
      })),
    );
  });
}
