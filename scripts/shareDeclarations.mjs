// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/** The entry point whose declarations the others import instead of repeat. */
export const MAIN_ENTRY = "index";

/**
 * The specifier the rewritten imports use until the roll-up is done. The real
 * name would resolve, inside the package, to the main entry's own file, and
 * API Extractor would roll that file in again as a local module; this one
 * resolves to nothing, so the roll-up leaves it as an import.
 */
export const MAIN_ENTRY_PLACEHOLDER = "mapcairn-main-entry";

/**
 * The declaration files below a folder, as absolute paths.
 *
 * @param {string} folder
 * @returns {string[]}
 */
function declarationFilesOf(folder) {
  return readdirSync(folder, { recursive: true })
    .map((file) => path.join(folder, String(file)))
    .filter((file) => file.endsWith(".d.ts"));
}

/**
 * Maps each symbol the main entry exports to the name it exports it under.
 *
 * @param {any} ts
 * @param {any} program
 * @param {string} mainFile The main entry's declaration file.
 * @returns {Map<any, string>}
 */
function mainExports(ts, program, mainFile) {
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(mainFile);
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  /** @type {Map<any, string>} */
  const exported = new Map();
  for (const symbol of moduleSymbol
    ? checker.getExportsOfModule(moduleSymbol)
    : []) {
    const target =
      symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol;
    exported.set(target, symbol.name);
  }
  return exported;
}

/**
 * The text that replaces one import declaration: the names the main entry
 * exports now come from the package, and the rest stay as they were.
 *
 * @param {any} ts
 * @param {any} declaration
 * @param {any} checker
 * @param {Map<any, string>} exported
 * @returns {string | undefined} `undefined` when no name is shared.
 */
function rewriteImport(ts, declaration, checker, exported) {
  const bindings = declaration.importClause?.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) {
    return undefined;
  }
  /** @type {string[]} */
  const shared = [];
  /** @type {string[]} */
  const kept = [];
  for (const element of bindings.elements) {
    const symbol = checker.getSymbolAtLocation(element.name);
    const target = symbol && checker.getAliasedSymbol(symbol);
    const name = target && exported.get(target);
    if (name === undefined) {
      kept.push(element.getText());
      continue;
    }
    const type = element.isTypeOnly ? "type " : "";
    const local = element.name.text;
    shared.push(`${type}${name === local ? name : `${name} as ${local}`}`);
  }
  if (shared.length === 0) {
    return undefined;
  }
  const clause = declaration.importClause;
  if (clause?.name) {
    throw new Error(
      `${declaration.getSourceFile().fileName} has a default import, which the declaration sharing does not handle.`,
    );
  }
  const type = clause?.isTypeOnly ? "type " : "";
  const statements = [
    `import ${type}{ ${shared.join(", ")} } from ${JSON.stringify(MAIN_ENTRY_PLACEHOLDER)};`,
  ];
  if (kept.length > 0) {
    statements.push(
      `import ${type}{ ${kept.join(", ")} } from ${declaration.moduleSpecifier.getText()};`,
    );
  }
  return statements.join("\n");
}

/**
 * Makes the declarations of another entry point import, from the package
 * itself, every name the main entry exports, instead of repeating them. Rolled
 * up on its own, an entry point inlines a copy of each type it names, so a
 * host that imports a class from both entries gets two declarations, and API
 * Extractor reports the copies as forgotten exports. The rewrite runs on the
 * declarations `tsc` emitted, before the other entry is rolled up, and names
 * the main entry by {@link MAIN_ENTRY_PLACEHOLDER}; {@link nameMainEntry}
 * swaps in the package name afterwards.
 *
 * @param {string} declarationFolder Where `tsc` left the declarations.
 * @param {string} mainDeclaration The main entry's declaration file.
 * @param {string} otherDeclaration The other entry's declaration file.
 */
export function shareMainDeclarations(
  declarationFolder,
  mainDeclaration,
  otherDeclaration,
) {
  // The project's own `typescript` is the native compiler, which has no script
  // API, so this reads declarations with the copy API Extractor brings.
  const fromExtractor = createRequire(
    createRequire(import.meta.url).resolve("@microsoft/api-extractor"),
  );
  const ts = fromExtractor("typescript");
  if (typeof ts.createProgram !== "function") {
    throw new Error(
      "API Extractor's copy of TypeScript has no script API (createProgram); it must be a 6.x release, which shareDeclarations.mjs needs to read the declarations.",
    );
  }
  const program = ts.createProgram({
    rootNames: [mainDeclaration, otherDeclaration],
    options: {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      skipLibCheck: true,
      noEmit: true,
    },
  });
  const checker = program.getTypeChecker();
  const exported = mainExports(ts, program, mainDeclaration);
  for (const file of declarationFilesOf(declarationFolder)) {
    const source = program.getSourceFile(file);
    if (!source || path.resolve(file) === path.resolve(mainDeclaration)) {
      continue;
    }
    let text = readFileSync(file, "utf8");
    const edits = source.statements
      .filter(ts.isImportDeclaration)
      .flatMap((declaration) => {
        const replacement = rewriteImport(ts, declaration, checker, exported);
        return replacement === undefined
          ? []
          : [
              {
                start: declaration.getStart(),
                end: declaration.end,
                replacement,
              },
            ];
      })
      .sort((a, b) => b.start - a.start);
    for (const { start, end, replacement } of edits) {
      text = text.slice(0, start) + replacement + text.slice(end);
    }
    if (edits.length > 0) {
      writeFileSync(file, text);
    }
  }
}

/**
 * Replaces {@link MAIN_ENTRY_PLACEHOLDER} in a rolled-up declaration file with
 * the package name, which a host resolves to the main entry.
 *
 * @param {string} file The rolled-up declaration file.
 * @param {string} packageName The name the main entry is imported by.
 */
export function nameMainEntry(file, packageName) {
  writeFileSync(
    file,
    readFileSync(file, "utf8").replaceAll(
      `'${MAIN_ENTRY_PLACEHOLDER}'`,
      `'${packageName}'`,
    ),
  );
}
