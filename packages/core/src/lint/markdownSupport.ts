// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Readers of Markdown and of the TypeScript in its code blocks, shared by the
 * tests that keep the README files true to the repository.
 */

/** One name an `import { ... } from "..."` statement brings in. */
export interface NamedImport {
  /** The package or path after `from`. */
  readonly specifier: string;
  /** The name the module exports. */
  readonly imported: string;
  /** The name the importing file uses, after any `as`. */
  readonly local: string;
  /** True for `import type { ... }` and for a name marked `type` inside braces. */
  readonly typeOnly: boolean;
}

/** The code inside every fenced block of the given language. */
export function fencedBlocks(markdown: string, language: string): string[] {
  const fence = new RegExp(`^\`\`\`${language}\\n([\\s\\S]*?)^\`\`\`$`, "gm");
  return [...markdown.matchAll(fence)].map((match) => match[1] ?? "");
}

/**
 * Every named import in a source text. A default or namespace import is
 * returned with the imported name `*`, so a check that compares names
 * against the example fails on it rather than skip it.
 */
export function namedImports(source: string): NamedImport[] {
  const found: NamedImport[] = [];
  for (const match of source.matchAll(
    /^import\s+(type\s+)?([^;"]*?)\s+from\s+"([^"]+)";/gm,
  )) {
    const statementTypeOnly = match[1] !== undefined;
    const clause = (match[2] ?? "").trim();
    const specifier = match[3] ?? "";
    const braced = /^\{([\s\S]*)\}$/.exec(clause);
    if (!braced) {
      found.push({
        specifier,
        imported: "*",
        local: clause,
        typeOnly: statementTypeOnly,
      });
      continue;
    }
    for (const part of (braced[1] ?? "").split(",")) {
      const name = part.trim();
      const typeOnly = statementTypeOnly || name.startsWith("type ");
      const [imported = "", local = imported] = name
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/);
      if (imported !== "") {
        found.push({ specifier, imported, local, typeOnly });
      }
    }
  }
  return found;
}

/**
 * The attribute names of every opening tag `<name ...>` in a source text,
 * one set per tag. Only text at the tag's own level is read: what sits
 * inside `{...}` or a quoted value is skipped, so a nested element's props
 * are counted for that element and not for the one around it.
 */
export function tagAttributes(source: string, name: string): Set<string>[] {
  const tags: Set<string>[] = [];
  const start = new RegExp(`<${name}(?=[\\s/>])`, "g");
  for (const match of source.matchAll(start)) {
    tags.push(attributesOfTagAt(source, match.index + match[0].length));
  }
  return tags;
}

/** The attribute names of the opening tag whose name ends at `from`. */
function attributesOfTagAt(source: string, from: number): Set<string> {
  let depth = 0;
  let quoted = false;
  let ownLevel = "";
  for (const char of source.slice(from)) {
    if (quoted) {
      quoted = char !== '"';
      continue;
    }
    if (depth === 0 && char === ">") {
      break;
    }
    if (char === "{" || char === "(") {
      depth += 1;
    } else if (char === "}" || char === ")") {
      depth -= 1;
    } else if (depth === 0) {
      quoted = char === '"';
      ownLevel += char;
    }
  }
  return new Set(
    [...ownLevel.matchAll(/([A-Za-z_][\w-]*)\s*=/g)].map((m) => m[1] ?? ""),
  );
}

/** Every relative link target in a Markdown text, without its `#fragment`. */
export function relativeLinks(markdown: string): string[] {
  const inline = [...markdown.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const definitions = [...markdown.matchAll(/^\[[^\]]+\]:\s+(\S+)/gm)].map(
    (m) => m[1],
  );
  return [...inline, ...definitions]
    .map((target) => target ?? "")
    .filter((target) => !/^(https?:|mailto:|#)/.test(target))
    .map((target) => target.split("#")[0] ?? "");
}

/** The package an outside app installs to get every other `@mapcairn` package from one import. */
const UMBRELLA = "@mapcairn/sdk";

/**
 * Whether a README may import `imported` from `specifier`, given the imports
 * of `examples/embed`, which uses the four packages directly. The umbrella
 * counts as the packages it re-exports: its root stands for any of the four,
 * and `@mapcairn/sdk/<name>` for `@mapcairn/<name>`.
 */
export function isUsedByExample(
  example: readonly NamedImport[],
  specifier: string,
  imported: string,
): boolean {
  const mirrored = specifier.startsWith(`${UMBRELLA}/`)
    ? `@mapcairn/${specifier.slice(UMBRELLA.length + 1)}`
    : specifier;
  return example.some(
    (known) =>
      known.imported === imported &&
      known.specifier !== UMBRELLA &&
      (known.specifier === mirrored ||
        (specifier === UMBRELLA && known.specifier.startsWith("@mapcairn/"))),
  );
}

/**
 * The anchors GitHub gives the headings of a Markdown text: the heading
 * lower-cased, everything but letters, digits, spaces, hyphens and
 * underscores dropped, spaces joined with hyphens. A line inside a fenced
 * code block is not a heading.
 */
export function headingAnchors(markdown: string): string[] {
  const prose = markdown.replace(/^```[\s\S]*?^```/gm, "");
  return prose
    .split("\n")
    .filter((line) => /^#{1,6} /.test(line))
    .map((line) =>
      line
        .replace(/^#+ /, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N} _-]/gu, "")
        .replace(/ /g, "-"),
    );
}

/**
 * What every README and the product page say a person must do when the SDK
 * is part of what they ship, in the same words. The product page keeps its
 * own wording of the last sentence (its tests refuse the word "offer").
 */
export const LICENCE_DUTY =
  "If you distribute an app that includes the SDK, including by serving it to people's browsers, you must offer them the corresponding source of the code you combine with the SDK and serve with it, under the same licence. If you modify the SDK and let people interact with your modified version over a network, you must offer them its corresponding source. A licence for closed-source use is not on offer yet.";
