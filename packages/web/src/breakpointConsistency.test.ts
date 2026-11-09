import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PANEL_MIN_WIDTH } from "@karta/core";
import { describe, expect, it } from "vitest";

/** Every `.css.ts` (vanilla-extract) file under this app's own `src`. */
function findVanillaExtractFiles(): string[] {
  const srcDir = path.join(__dirname);
  return readdirSync(srcDir, { recursive: true })
    .filter(
      (entry): entry is string =>
        typeof entry === "string" && entry.endsWith(".css.ts"),
    )
    .map((entry) => path.join(srcDir, entry));
}

/**
 * The layout switch between the bottom sheet and the side panel is made once,
 * in JavaScript, by `chooseLayout` in `@karta/core` (from `PANEL_MIN_WIDTH`).
 * A width media query in a style file would be a second, drifting copy.
 */
describe("layout breakpoint", () => {
  it("finds style files to check", () => {
    expect(findVanillaExtractFiles().length).toBeGreaterThan(0);
  });

  it("is not repeated as a width media query in any .css.ts file", () => {
    const srcDir = path.join(__dirname);

    for (const file of findVanillaExtractFiles()) {
      const source = readFileSync(file, "utf8");
      expect(
        source,
        `${path.relative(srcDir, file)} should not declare a width breakpoint; use chooseLayout (panel from ${PANEL_MIN_WIDTH}px)`,
      ).not.toMatch(/\((?:max|min)-width:\s*\d+px\)/);
    }
  });
});
