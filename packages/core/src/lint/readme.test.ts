// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Keeps `README.md` true to the repository: its embedding example must use
 * only what `examples/embed` uses, imported from the same public entry
 * points, with the same components and props, and every relative link must
 * name a file or directory that exists. `examples/embed` is type-checked and
 * built against the SDK's public entry points on every pull request, so an
 * import it makes is one an outside app can make. The README also names no
 * issue or pull request, so it stays true as they close.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const README = readFileSync(path.join(REPO, "README.md"), "utf8");
const EXAMPLE_SOURCE = "examples/embed/src";

/** One name an `import { ... } from "..."` statement brings in. */
interface NamedImport {
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
function fencedBlocks(markdown: string, language: string): string[] {
  const fence = new RegExp(`^\`\`\`${language}\\n([\\s\\S]*?)^\`\`\`$`, "gm");
  return [...markdown.matchAll(fence)].map((match) => match[1] ?? "");
}

/**
 * Every named import in a source text. A default or namespace import is
 * returned with the imported name `*`, so a check that compares names
 * against the example fails on it rather than skip it.
 */
function namedImports(source: string): NamedImport[] {
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
function tagAttributes(source: string, name: string): Set<string>[] {
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

/** The example's shipped source files, read as one list of texts. */
function exampleSources(): string[] {
  return readdirSync(path.join(REPO, EXAMPLE_SOURCE))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => readFileSync(path.join(REPO, EXAMPLE_SOURCE, file), "utf8"));
}

/** Every relative link target in a Markdown text, without its `#fragment`. */
function relativeLinks(markdown: string): string[] {
  const inline = [...markdown.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const definitions = [...markdown.matchAll(/^\[[^\]]+\]:\s+(\S+)/gm)].map(
    (m) => m[1],
  );
  return [...inline, ...definitions]
    .map((target) => target ?? "")
    .filter((target) => !/^(https?:|mailto:|#)/.test(target))
    .map((target) => target.split("#")[0] ?? "");
}

describe("README.md", () => {
  const snippets = fencedBlocks(README, "tsx");

  it("has one embedding example, in a tsx block", () => {
    expect(snippets).toHaveLength(1);
  });

  const snippet = snippets[0] ?? "";
  const examples = exampleSources();
  const exampleImports = examples.flatMap(namedImports);

  it("imports only what examples/embed imports, from the same entry point", () => {
    const imports = namedImports(snippet);
    expect(imports.length).toBeGreaterThan(0);
    const missing = imports
      .filter(
        ({ specifier, imported }) =>
          !exampleImports.some(
            (known) =>
              known.specifier === specifier && known.imported === imported,
          ),
      )
      .map(({ specifier, imported }) => `${imported} from ${specifier}`);
    expect(missing).toEqual([]);
  });

  it("imports the two stylesheets as examples/embed does", () => {
    const stylesheets = [
      ...snippet.matchAll(/^import\s+"([^"]+\.css)";/gm),
    ].map((match) => match[1]);
    const main = readFileSync(
      path.join(REPO, EXAMPLE_SOURCE, "main.tsx"),
      "utf8",
    );
    expect(stylesheets).toEqual([
      "@mapcairn/theme/tokens.css",
      "@mapcairn/map/styles.css",
    ]);
    for (const stylesheet of stylesheets) {
      expect(main).toContain(`import "${stylesheet}";`);
    }
  });

  it("uses each SDK component with props the example also passes it", () => {
    const components = namedImports(snippet).filter(
      ({ specifier, local, typeOnly }) =>
        !typeOnly && specifier.startsWith("@mapcairn/") && /^[A-Z]/.test(local),
    );
    const unknown: string[] = [];
    for (const { local, imported } of components) {
      const known = new Set(
        examples.flatMap((source) =>
          tagAttributes(source, imported).flatMap((props) => [...props]),
        ),
      );
      const used = tagAttributes(snippet, local);
      expect(
        used.length,
        `<${local}> is imported but not used`,
      ).toBeGreaterThan(0);
      for (const prop of used.flatMap((props) => [...props])) {
        if (!known.has(prop)) {
          unknown.push(`<${local} ${prop}>`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("links only to files and directories that exist", () => {
    const links = relativeLinks(README);
    expect(links.length).toBeGreaterThan(0);
    const broken = links.filter(
      (target) => !existsSync(path.join(REPO, target)),
    );
    expect(broken).toEqual([]);
  });

  it("names no issue or pull request, so it stays true as they close", () => {
    const prose = README.replace(/^```[\s\S]*?^```/gm, "");
    const references = prose.match(
      /\/(?:issues|pull)\/\d+|(?<![\w/&])#\d+(?![\w-])/g,
    );
    expect(references).toBeNull();
  });
});
