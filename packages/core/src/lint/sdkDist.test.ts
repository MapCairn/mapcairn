// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

/** The packages that build to `dist` so far; `map` follows in its own step. */
const BUILT_PACKAGES = ["core", "react", "theme"] as const;

interface Manifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly exports: Readonly<Record<string, unknown>>;
}

function folderOf(name: string): string {
  return path.join(REPO, "packages", name);
}

function manifestOf(name: string): Manifest {
  return JSON.parse(
    readFileSync(path.join(folderOf(name), "package.json"), "utf8"),
  ) as Manifest;
}

/** Every file below `dist`, relative to it, with forward slashes. */
function distFiles(name: string): string[] {
  const dist = path.join(folderOf(name), "dist");
  if (!existsSync(dist)) {
    throw new Error(
      `packages/${name}/dist does not exist: run "npm run build:sdk" first.`,
    );
  }
  return readdirSync(dist, { recursive: true })
    .map((file) => String(file).replaceAll("\\", "/"))
    .filter((file) => !file.endsWith("/") && file.includes("."));
}

function read(name: string, file: string): string {
  return readFileSync(path.join(folderOf(name), "dist", file), "utf8");
}

/** The module specifiers a JavaScript or declaration file imports or re-exports. */
function specifiersOf(source: string): string[] {
  const patterns = [
    /^(?:import|export)\b[^;"]*?\bfrom\s*["']([^"']+)["']/gm,
    /^import\s*["']([^"']+)["']/gm,
    /(?<![\w.])import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1] ?? ""),
  );
}

/** The package a bare specifier names: `@scope/name` or `name`, without a subpath. */
function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : (parts[0] ?? "");
}

/** The paths a manifest's exports point at, however they are conditioned. */
function exportTargets(exportsField: Manifest["exports"]): string[] {
  return Object.values(exportsField).flatMap((target) =>
    typeof target === "string"
      ? [target]
      : Object.values(target as Record<string, string>),
  );
}

describe.each(BUILT_PACKAGES)("@mapcairn/%s dist", (name) => {
  it("holds every file its exports point at", () => {
    const files = new Set(distFiles(name));
    const missing = exportTargets(manifestOf(name).exports)
      .filter((target) => target.startsWith("./dist/"))
      .filter((target) => !files.has(target.slice("./dist/".length)));
    expect(missing).toEqual([]);
  });

  it("imports other files with an extension, and other packages only if declared", () => {
    const manifest = manifestOf(name);
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    const problems: string[] = [];
    for (const file of distFiles(name).filter((f) => f.endsWith(".js"))) {
      for (const specifier of specifiersOf(read(name, file))) {
        if (specifier.startsWith(".")) {
          if (!specifier.endsWith(".js")) {
            problems.push(`${file} imports ${specifier} without .js`);
          }
        } else if (
          !specifier.startsWith("node:") &&
          !declared.has(packageOf(specifier))
        ) {
          problems.push(`${file} imports ${specifier}, which is not declared`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("rolls its declarations up, so no declaration imports a relative path", () => {
    const declarations = distFiles(name).filter((f) => f.endsWith(".d.ts"));
    expect(declarations.length).toBeGreaterThan(0);
    for (const file of declarations) {
      const relative = specifiersOf(read(name, file)).filter((specifier) =>
        specifier.startsWith("."),
      );
      expect(relative, file).toEqual([]);
    }
  });

  it("has an empty build stamp that starts no later than the build output", () => {
    const dist = path.join(folderOf(name), "dist");
    const stamp = statSync(path.join(dist, ".built"));
    expect(stamp.size).toBe(0);
    expect(stamp.mtimeMs).toBeLessThanOrEqual(
      statSync(path.join(dist, "index.js")).mtimeMs,
    );
  });

  it("names no built file `*.css.js`, which a host's vanilla-extract plugin would compile again", () => {
    expect(distFiles(name).filter((f) => /\.css\.[cm]?[jt]s$/.test(f))).toEqual(
      [],
    );
  });

  it("ships no test file", () => {
    expect(distFiles(name).filter((file) => /\.test\./.test(file))).toEqual([]);
  });

  it.each(
    Object.values(manifestOf(name).exports).filter(
      (target): target is Record<string, string> => typeof target === "object",
    ),
  )("loads its entry point in Node", async (target) => {
    const loaded = await import(
      pathToFileURL(path.join(folderOf(name), target.default)).href
    );
    expect(Object.keys(loaded).length).toBeGreaterThan(0);
  });
});

describe("@mapcairn/theme dist", () => {
  it("ships the tokens as a stylesheet the host imports, and no style runtime", () => {
    const stylesheet = read("theme", "tokens.css");
    expect(stylesheet).toMatch(/:root/);
    expect(stylesheet).toMatch(/\[data-theme="dark"\]/);
    for (const file of distFiles("theme").filter((f) => f.endsWith(".js"))) {
      expect(read("theme", file), file).not.toMatch(/@vanilla-extract\/css/);
    }
  });
});

describe("@mapcairn/core contracts.d.ts", () => {
  it("holds nothing that makes its copy of a declaration differ from the one in index.d.ts", () => {
    // The two rolled-up files repeat the declarations they share, so a type
    // is only assignable across them while it is purely structural.
    const declarations = read("core", "contracts.d.ts");
    const nominal = [
      /#private/,
      /\bprivate\s/,
      /\bprotected\s/,
      /\benum\s/,
      /\bunique symbol\b/,
    ].filter((pattern) => pattern.test(declarations));
    expect(
      nominal.map(String),
      "contracts.d.ts repeats declarations that index.d.ts also holds, so a private or protected member, an enum or a unique symbol in one would make the two copies unassignable to each other. Keep the contract suites' signatures structural.",
    ).toEqual([]);
  });
});
