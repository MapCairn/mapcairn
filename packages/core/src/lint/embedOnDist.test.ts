// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `examples/embed` is the proof that an outside app needs no vanilla-extract
 * plugin: it builds against the packages' `dist` and imports the two compiled
 * stylesheets. These tests keep it that way, and keep `map`'s declarations
 * coming from `theme`'s `dist` as well.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function read(file: string): string {
  return readFileSync(path.join(REPO, file), "utf8");
}

/** The two stylesheets a host imports, in the order the README and the example do. */
const STYLESHEETS = [
  "@mapcairn/theme/tokens.css",
  "@mapcairn/map/styles.css",
] as const;

describe("examples/embed", () => {
  it("imports the two compiled stylesheets", () => {
    const main = read("examples/embed/src/main.tsx");
    for (const stylesheet of STYLESHEETS) {
      expect(main).toContain(`import "${stylesheet}";`);
    }
  });

  it("has no vanilla-extract step: no plugin, no .css.ts file, no dependency", () => {
    expect(read("examples/embed/vite.config.ts")).not.toMatch(
      /vanillaExtract|vanilla-extract/,
    );
    expect(existsSync(path.join(REPO, "examples/embed/src/page.css.ts"))).toBe(
      false,
    );
    const manifest = read("examples/embed/package.json");
    expect(manifest).not.toMatch(/vanilla-extract/);
  });

  it("serves its generated theme stylesheet as a file, never as an inline style", () => {
    expect(read("examples/embed/vite.config.ts")).toContain(
      "themeStylesheetPlugin(createExampleThemeStylesheet)",
    );
    expect(read("examples/embed/index.html")).not.toMatch(/<style/);
    expect(read("examples/embed/src/main.tsx")).not.toMatch(
      /createElement\("style"\)/,
    );
  });

  it("resolves the packages' dist, with no source condition", () => {
    expect(read("examples/embed/vite.config.ts")).not.toContain(
      "@mapcairn/source",
    );
    expect(read("examples/embed/tsconfig.json")).toMatch(
      /"customConditions":\s*\[\s*\]/,
    );
  });
});

describe("@mapcairn/map declarations", () => {
  it("come from theme's dist, so tsc does not inherit the source condition", () => {
    expect(read("packages/map/tsconfig.json")).toMatch(
      /"customConditions":\s*\[\s*\]/,
    );
  });
});
