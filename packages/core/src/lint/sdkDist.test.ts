// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

/** The packages that build to `dist`. */
const BUILT_PACKAGES = ["core", "map", "react", "theme"] as const;

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

  it("carries every global augmentation its source declares, since the roll-up drops them", () => {
    // API Extractor rolls declarations up without `declare global`, so a
    // consumer that reads only `dist` would lose the typing. A source that
    // needs one must keep it out of the public declarations instead.
    const source = path.join(folderOf(name), "src");
    const augmenting = readdirSync(source, { recursive: true })
      .map((file) => String(file).replaceAll("\\", "/"))
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) =>
        /\bdeclare global\b/.test(
          readFileSync(path.join(source, file), "utf8"),
        ),
      );
    const carried = distFiles(name)
      .filter((file) => file.endsWith(".d.ts"))
      .some((file) => /\bdeclare global\b/.test(read(name, file)));
    expect(augmenting.length === 0 || carried, augmenting.join(", ")).toBe(
      true,
    );
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
      (target): target is Record<string, string> =>
        typeof target === "object" && Reflect.has(target, "@mapcairn/source"),
    ),
  )("loads its entry point in Node, with no export condition", (target) => {
    // A separate process, so Vitest's own resolve conditions (which pick the
    // source of the other SDK packages) do not decide what loads.
    const entry = pathToFileURL(path.join(folderOf(name), target.default)).href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `const loaded = await import(${JSON.stringify(entry)});
         if (Object.keys(loaded).length === 0) { throw new Error("no exports"); }`,
      ],
      { cwd: REPO, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
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

/** The custom properties a stylesheet sets, such as `--rogqo0r`. */
function definedProperties(stylesheet: string): Set<string> {
  return new Set(
    [...stylesheet.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1] ?? ""),
  );
}

/** The custom properties a stylesheet reads with `var(--name)`. */
function usedProperties(stylesheet: string): Set<string> {
  return new Set(
    [...stylesheet.matchAll(/var\(\s*(--[\w-]+)/g)].map(
      (match) => match[1] ?? "",
    ),
  );
}

describe("@mapcairn/map dist", () => {
  const tokens = read("theme", "tokens.css");
  const styles = read("map", "styles.css");

  it.each([
    ["theme", "tokens"],
    ["map", "styles"],
  ])(
    "@mapcairn/%s ships an empty declaration for its stylesheet, so a TypeScript project resolves the import",
    (name, stylesheet) => {
      expect(read(name, `${stylesheet}.css.d.ts`).trim()).toBe("export {};");
    },
  );

  it("ships its component styles as a stylesheet the host imports", () => {
    expect(styles.length).toBeGreaterThan(0);
    for (const file of distFiles("map").filter((f) => f.endsWith(".js"))) {
      expect(read("map", file), file).not.toMatch(
        /import\s*["'][^"']*\.css["']/,
      );
    }
  });

  it("reads only custom properties that tokens.css or styles.css defines, or readable ones that its JavaScript sets", () => {
    const defined = new Set([
      ...definedProperties(tokens),
      ...definedProperties(styles),
    ]);
    const script = distFiles("map")
      .filter((file) => file.endsWith(".js"))
      .map((file) => read("map", file))
      .join("\n");
    // A property a component sets on an element, such as the sheet's offset, is
    // named as a string in its JavaScript and is defined in no sheet. Only a
    // readable name (two or more lower-case words) may be set that way; a
    // generated name, like the tokens', must be defined in a stylesheet.
    const readable = /^--[a-z]+(-[a-z]+)+$/;
    const unresolved = [...usedProperties(styles)].filter(
      (name) =>
        !(
          defined.has(name) ||
          (readable.test(name) && script.includes(`"${name}"`))
        ),
    );
    expect(unresolved).toEqual([]);
  });

  it("reads the token properties it is built against, not a second set", () => {
    const fromTokens = [...usedProperties(styles)].filter((name) =>
      definedProperties(tokens).has(name),
    );
    expect(fromTokens.length).toBeGreaterThan(0);
  });

  it("does not repeat the token blocks, which tokens.css holds once", () => {
    const repeated = [...definedProperties(styles)].filter((name) =>
      definedProperties(tokens).has(name),
    );
    expect(repeated).toEqual([]);
  });

  it("uses one cascade layer, whose name is declared before any block uses it (primitiveLayer.test.ts checks which classes sit in it)", () => {
    const names = new Set(
      [...styles.matchAll(/@layer\s+([\w-]+)/g)].map((match) => match[1]),
    );
    expect([...names]).toHaveLength(1);
    const [layer] = [...names];
    const declaration = styles.indexOf(`@layer ${layer};`);
    const firstBlock = styles.indexOf(`@layer ${layer} {`);
    expect(declaration).toBeGreaterThanOrEqual(0);
    expect(firstBlock).toBeGreaterThan(declaration);
  });

  it("imports no style runtime but recipes, in code or declarations", () => {
    for (const file of distFiles("map").filter((f) =>
      /\.(js|d\.ts)$/.test(f),
    )) {
      expect(read("map", file), file).not.toMatch(/@vanilla-extract\/css/);
    }
  });
});

describe("@mapcairn/theme createThemeStylesheet", () => {
  it("writes only custom property names that the published tokens.css declares", async () => {
    const entry = pathToFileURL(
      path.join(folderOf("theme"), "dist/index.js"),
    ).href;
    const { createThemeStylesheet } = (await import(entry)) as {
      createThemeStylesheet: (
        override: unknown,
        options: { scope: string },
      ) => { ok: boolean; css?: string };
    };
    const result = createThemeStylesheet(
      {
        colour: {
          light: {
            accent: "#0b5c3a",
            accentTint: "#d9efe4",
            surface: "#ffffffee",
          },
          dark: { accent: "#7fd9aa", accentTint: "#17382a" },
        },
      },
      { scope: ".brand" },
    );
    const written = new Set(result.css?.match(/--[\w-]+(?=:)/g));
    const declared = read("theme", "tokens.css");

    expect(result.ok).toBe(true);
    expect(written.size).toBeGreaterThan(0);
    for (const name of written) {
      expect(declared, name).toContain(`${name}:`);
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
