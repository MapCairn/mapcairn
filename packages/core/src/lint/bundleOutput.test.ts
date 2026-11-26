// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  mergedStylesheet,
  moduleIdsOf,
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
  it("puts the engine's rules in front of the bundle's own", () => {
    expect(
      mergedStylesheet(
        ".engine{}",
        { type: "asset", source: ".own{}" },
        "x.css",
      ),
    ).toBe(".engine{}\n.own{}");
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
