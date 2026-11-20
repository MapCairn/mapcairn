// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const MAP = path.join(REPO, "packages", "map");

/**
 * The primitives that take a `className`, with their recipe modules, whose
 * recipes sit in the `primitives` cascade layer (DESIGN.md, "Overriding a
 * primitive").
 */
const PRIMITIVES = [
  "Button/Button",
  "Chip/Chip",
  "IconButton/IconButton",
  "ListRow/ListRow",
  "Surface/Surface",
] as const;

/**
 * Recipes that are a component's own style, not a primitive's, so they stay
 * plain `recipe`. A new recipe module must be added to this list or to
 * {@link PRIMITIVES}, so the choice is made on purpose.
 */
const COMPONENT_RECIPES = [
  "src/panels/BasemapPicker/BasemapPicker.css.ts",
  "src/ui/StatusMessage/StatusMessage.css.ts",
];

function source(file: string): string {
  return readFileSync(path.join(MAP, file), "utf8");
}

/** Every `.css.ts` below `src` that imports vanilla-extract's `recipe`. */
function recipeModules(): string[] {
  return readdirSync(path.join(MAP, "src"), { recursive: true })
    .map((file) => String(file).replaceAll("\\", "/"))
    .filter((file) => file.endsWith(".css.ts"))
    .map((file) => `src/${file}`)
    .filter((file) => source(file).includes("@vanilla-extract/recipes"));
}

/** The text of every block of one cascade layer in a stylesheet. */
function layerBlocks(css: string, layer: string): string[] {
  const opening = `@layer ${layer} {`;
  const blocks: string[] = [];
  let from = css.indexOf(opening);
  while (from !== -1) {
    let depth = 1;
    let end = from + opening.length;
    while (depth > 0 && end < css.length) {
      if (css[end] === "{") {
        depth += 1;
      } else if (css[end] === "}") {
        depth -= 1;
      }
      end += 1;
    }
    blocks.push(css.slice(from, end));
    from = css.indexOf(opening, end);
  }
  return blocks;
}

describe("the primitives' cascade layer", () => {
  it.each(PRIMITIVES)("%s builds its recipe with primitiveRecipe", (module) => {
    const text = source(`src/ui/${module}.css.ts`);
    expect(text).toMatch(/=\s*primitiveRecipe\(/);
    expect(text).not.toContain("@vanilla-extract/recipes");
  });

  it("keeps every other recipe module on the list of component recipes", () => {
    const others = recipeModules().filter(
      (file) => !file.endsWith("primitiveRecipe.ts"),
    );
    expect(others.sort()).toEqual([...COMPONENT_RECIPES].sort());
  });

  it("holds each primitive recipe's base class in the layer, and only there, in the built styles.css", () => {
    const dist = path.join(MAP, "dist");
    expect(existsSync(dist), "run npm run build:sdk first").toBe(true);
    const css = readFileSync(path.join(dist, "styles.css"), "utf8");
    const layer = /@layer\s+([\w-]+)\s*\{/.exec(css)?.[1] ?? "";
    expect(layer).not.toBe("");
    const blocks = layerBlocks(css, layer);
    const layered = blocks.join("\n");
    const unlayered = blocks.reduce(
      (rest, block) => rest.replace(block, ""),
      css,
    );
    for (const module of PRIMITIVES) {
      const folder = path.dirname(module);
      const name = path.basename(module);
      const built = readFileSync(
        path.join(dist, "ui", folder, `${name}.styles.js`),
        "utf8",
      );
      const base = /defaultClassName:\s*"([^"\s]+)/.exec(built)?.[1];
      expect(base, module).toBeDefined();
      expect(layered, module).toMatch(new RegExp(`\\.${base}\\b`));
      expect(unlayered, module).not.toMatch(new RegExp(`\\.${base}\\b`));
    }
  });
});
