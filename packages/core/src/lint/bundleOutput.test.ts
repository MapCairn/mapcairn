// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  mergedStylesheet,
  moduleIdsOf,
  PAGE_RESET,
  withoutLayers,
  withoutSourceMapComment,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/bundleOutput.mjs";

describe("moduleIdsOf", () => {
  it("lists the modules of every chunk once, and none from an asset", () => {
    expect(
      moduleIdsOf({
        "browser.js": { type: "chunk", modules: { "/a.js": {}, "/b.js": {} } },
        "browser-engine.js": {
          type: "chunk",
          modules: { "/b.js": {}, "/c.js": {} },
        },
        "browser.css": { type: "asset", modules: { "/d.css": {} } },
        "empty.js": { type: "chunk" },
      }),
    ).toEqual(["/a.js", "/b.js", "/c.js"]);
  });

  it("lists nothing for an empty bundle", () => {
    expect(moduleIdsOf({})).toEqual([]);
  });
});

describe("mergedStylesheet", () => {
  it("puts the page reset first, then the engine's rules, then the bundle's own with no layer left", () => {
    expect(
      mergedStylesheet(
        ".engine{}",
        { type: "asset", source: ".own{}@layer a{.prim{}}" },
        "x.css",
      ),
    ).toBe(`${PAGE_RESET}\n.engine{}\n.prim{}.own{}`);
  });

  it("fails when the bundle has no stylesheet, or one that is a chunk", () => {
    expect(() => mergedStylesheet(".e{}", undefined, "browser.css")).toThrow(
      "The bundle has no browser.css to merge the engine's stylesheet into.",
    );
    expect(() =>
      mergedStylesheet(".e{}", { type: "chunk" }, "browser.css"),
    ).toThrow(/no browser\.css/);
  });
});

describe("PAGE_RESET", () => {
  it("gives every element under a mounted map, drawings apart, the browser's own defaults, with the specificity of one class", () => {
    expect(PAGE_RESET).toBe(
      "[data-mapcairn] *:where(:not(svg,svg *)){all:revert}[data-mapcairn] svg[fill=currentColor]{fill:currentColor}",
    );
  });
});

describe("withoutLayers", () => {
  it("unwraps each layer block, puts its rules first in their order, and drops layer statements", () => {
    expect(
      withoutLayers(
        "@layer a;.x{color:red}@layer a{.p{b:1}@media (x){.p{c:2}}}.y{d:3}@layer a{.q{e:4}}",
      ),
    ).toBe(".p{b:1}@media (x){.p{c:2}}.q{e:4}.x{color:red}.y{d:3}");
  });

  it("leaves a stylesheet with no layer as it is", () => {
    expect(withoutLayers(".x{a:1}@media (m){.y{b:2}}")).toBe(
      ".x{a:1}@media (m){.y{b:2}}",
    );
  });

  it("is not fooled by a brace, a semicolon or a layer rule inside a string, and a comment before a layer", () => {
    expect(
      withoutLayers(
        ".a{content:\"}@layer x{\"}/* @layer y{ */@layer z{.b{content:'}'}}.c{d:1}",
      ),
    ).toBe(".b{content:'}'}.a{content:\"}@layer x{\"}.c{d:1}");
  });

  it("keeps a layer that sits inside another at-rule where it is", () => {
    expect(withoutLayers("@media (m){@layer a{.p{b:1}}}.x{c:2}")).toBe(
      "@media (m){@layer a{.p{b:1}}}.x{c:2}",
    );
  });
});

describe("withoutSourceMapComment", () => {
  it("drops the closing source map line and keeps the rest", () => {
    expect(
      withoutSourceMapComment(
        "export{};\n//# sourceMappingURL=worker.mjs.map\n",
      ),
    ).toBe("export{};\n");
    expect(withoutSourceMapComment("a\n//# sourceMappingURL=x.map")).toBe(
      "a\n",
    );
  });

  it("leaves a script without one, and a mention in the middle, alone", () => {
    expect(withoutSourceMapComment("a;b;\n")).toBe("a;b;\n");
    const middle = 'var s = "//# sourceMappingURL=x";\nrun();\n';
    expect(withoutSourceMapComment(middle)).toBe(middle);
  });
});
