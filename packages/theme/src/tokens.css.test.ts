// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, processVanillaFile } from "@vanilla-extract/integration";
import { beforeAll, describe, expect, it } from "vitest";
import {
  focusRing,
  surfaceBlurStyle,
  surfaceBlurSupported,
  tokens,
} from "./tokens.css";
import { zLayerOrder } from "./tokenValues";
import { zLayer } from "./zLayer";

const here = dirname(fileURLToPath(import.meta.url));

/** Flattens a nested contract into its leaf values. */
function leaves(value: unknown): string[] {
  return typeof value === "string"
    ? [value]
    : Object.values(value as Record<string, unknown>).flatMap(leaves);
}

describe("token contract", () => {
  it("resolves every leaf to a var() reference", () => {
    for (const leaf of leaves(tokens)) {
      expect(leaf).toMatch(/^var\(--[\w-]+\)$/);
    }
  });

  it("exposes every token group the design system documents", () => {
    expect(Object.keys(tokens)).toEqual([
      "color",
      "shadow",
      "effect",
      "space",
      "radius",
      "type",
      "size",
      "focus",
      "motion",
      "z",
    ]);
    expect(Object.keys(tokens.shadow)).toEqual(["floating", "sheet"]);
  });

  it("names the z layers in stacking order and resolves them through zLayer", () => {
    expect(Object.keys(tokens.z)).toEqual([...zLayerOrder]);
    for (const name of zLayerOrder) {
      expect(zLayer(name)).toBe(tokens.z[name]);
    }
  });

  it("builds the focus ring from an outline and an inner shadow", () => {
    expect(focusRing.outline).toContain(tokens.color.focusRing);
    expect(focusRing.boxShadow).toContain(tokens.color.focusRingInner);
    expect(focusRing.outlineOffset).toBe(tokens.focus.innerWidth);
  });

  it("prefixes the backdrop filter for Safari", () => {
    expect(surfaceBlurStyle.backdropFilter).toBe(tokens.effect.blur);
    expect(surfaceBlurStyle.WebkitBackdropFilter).toBe(tokens.effect.blur);
    expect(surfaceBlurSupported).toContain("-webkit-backdrop-filter");
  });
});

describe("emitted CSS", () => {
  let css = "";

  beforeAll(async () => {
    const filePath = resolve(here, "tokens.css.ts");
    const compiled = await compile({ filePath, cwd: resolve(here, "..") });
    css = await processVanillaFile({
      source: compiled.source,
      filePath,
      identOption: "debug",
      serializeVirtualCssPath: async ({ source }) => `/*css*/${source}\n`,
    });
  });

  /** Index of the nth occurrence of `needle`, failing the test if it is missing. */
  function indexOfNth(needle: string, nth = 0): number {
    let from = -1;
    for (let count = 0; count <= nth; count += 1) {
      from = css.indexOf(needle, from + 1);
      expect(from, `${needle} #${nth}`).toBeGreaterThanOrEqual(0);
    }
    return from;
  }

  it("declares light on :root and dark behind an attribute", () => {
    expect(css).toContain(':root, [data-theme="light"] {');
    expect(css).toContain('[data-theme="dark"] {');
  });

  it("follows the OS dark preference only when no attribute is set", () => {
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\) \{\s+:root:not\(\[data-theme\]\) \{/,
    );
  });

  it.each([
    [
      "prefers-reduced-transparency: reduce",
      "(prefers-reduced-transparency: reduce)",
    ],
    ["prefers-contrast: more", "(prefers-contrast: more)"],
    ["forced-colors: active", "(forced-colors: active)"],
  ])("overrides %s in the light, dark and OS-dark contexts", (_name, query) => {
    const light = indexOfNth(`@media ${query} {`);
    const osDark = indexOfNth(
      `@media (prefers-color-scheme: dark) and ${query} {`,
    );
    const block = css.slice(light, osDark);
    expect(block).toContain(':root, [data-theme="light"]');
    expect(block).toContain('[data-theme="dark"]');
    expect(css.slice(osDark)).toContain(":root:not([data-theme])");
  });

  it("orders preferences from least to most important", () => {
    const supports = indexOfNth(
      "@supports not ((backdrop-filter: blur(1px))",
      1,
    );
    const transparency = indexOfNth("(prefers-reduced-transparency: reduce)");
    const contrast = indexOfNth("@media (prefers-contrast: more)");
    const forced = indexOfNth("@media (forced-colors: active)");
    expect(supports).toBeLessThan(transparency);
    expect(transparency).toBeLessThan(contrast);
    expect(contrast).toBeLessThan(forced);
  });

  it("falls back to opaque surfaces when backdrop-filter is unsupported", () => {
    expect(css).toContain(
      "@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))",
    );
  });

  it("thickens the focus ring under prefers-contrast: more", () => {
    expect(css).toMatch(/--focus-innerWidth[\w-]*: 3px/);
    expect(css).toMatch(/--focus-outerWidth[\w-]*: 3px/);
  });

  it("collapses every duration under prefers-reduced-motion", () => {
    const block = css.slice(
      indexOfNth("@media (prefers-reduced-motion: reduce)"),
    );
    for (const name of ["fast", "base", "slow"]) {
      expect(block).toMatch(
        new RegExp(String.raw`--motion-duration-${name}[\w-]*: 0\.01ms`),
      );
    }
  });

  it("maps forced colours to system colours", () => {
    const block = css.slice(indexOfNth("@media (forced-colors: active)"));
    for (const systemColour of [
      "CanvasText",
      "Canvas",
      "Highlight",
      "HighlightText",
      "ButtonBorder",
    ]) {
      expect(block).toContain(`: ${systemColour};`);
    }
  });
});
